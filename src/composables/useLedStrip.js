import { ref, computed, toRaw } from "vue";
import FC from "@/js/fc.js";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper, countColorOnlyLedsAtOrigin } from "@/js/msp/MSPHelper";
import semver from "semver";
import CONFIGURATOR, { API_VERSION_1_46 } from "@/js/data_storage";

export const LED_PROFILE_RACE = 0;
export const LED_PROFILE_BEACON = 1;
export const LED_PROFILE_STATUS = 2;

export const LED_BLINK_PATTERN_ALTERNATE = 1;
export const LED_BLINK_PATTERN_BEACON = 3;
export const LED_BLINK_PATTERN_DOUBLE_DEPRECATED = 2;
export const LED_BLINK_FLASH_MS_MIN = 20;
export const LED_BLINK_PAUSE_MS_MIN = 200;
export const LED_BLINK_PAUSE_MS_MIN_ALTERNATE = 100;

const PROFILE_I18N_KEYS = ["ledStripProfileRace", "ledStripProfileBeacon", "ledStripProfileStatus"];
const DEFAULT_PROFILE_NAMES = ["RACE", "BEACON", "STATUS"];

const dirtyState = {
    profiles: [false, false, false],
    profileNames: false,
    activeProfile: false,
};

const hasChanges = ref(false);
const hasUnsavedLedEdits = ref(false);

let savedSnapshot = null;
let changeTrackingContext = null;

function createEmptyProfile() {
    return {
        strip: [],
        colors: [],
        modeColors: [],
        brightness: 0,
        larsonFreq: 0,
        rainbowDelta: 0,
        rainbowFreq: 0,
        blinkPeriod: 0,
        blinkOnMs: 0,
        blinkPattern: 0,
        blinkFlashMs: 0,
        blinkGapMs: 0,
        blinkPauseMs: 0,
    };
}

function cloneLedData(data) {
    return structuredClone(toRaw(data ?? []));
}

function cloneProfile(profile) {
    return {
        strip: cloneLedData(profile?.strip),
        colors: cloneLedData(profile?.colors),
        modeColors: cloneLedData(profile?.modeColors),
        brightness: profile?.brightness ?? 0,
        larsonFreq: profile?.larsonFreq ?? 0,
        rainbowDelta: profile?.rainbowDelta ?? 0,
        rainbowFreq: profile?.rainbowFreq ?? 0,
        blinkPeriod: profile?.blinkPeriod ?? 0,
        blinkOnMs: profile?.blinkOnMs ?? 0,
        blinkPattern: profile?.blinkPattern ?? 0,
        blinkFlashMs: profile?.blinkFlashMs ?? 0,
        blinkGapMs: profile?.blinkGapMs ?? 0,
        blinkPauseMs: profile?.blinkPauseMs ?? 0,
    };
}

function syncLegacyFromProfile(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex] ?? createEmptyProfile();
    FC.LED_STRIP = cloneLedData(profile.strip);
    FC.LED_COLORS = cloneLedData(profile.colors);
    FC.LED_MODE_COLORS = cloneLedData(profile.modeColors);
    FC.LED_EDIT_PROFILE = profileIndex;
}

function normalizeStripLed(led) {
    if (!led) {
        return { x: 0, y: 0, directions: "", functions: "", color: 0 };
    }

    const directions = Array.isArray(led.directions) ? led.directions.join("") : (led.directions ?? "");
    const functions = Array.isArray(led.functions) ? led.functions.join("") : (led.functions ?? "");

    return {
        x: led.x ?? 0,
        y: led.y ?? 0,
        directions,
        functions,
        color: led.color ?? 0,
    };
}

function normalizeProfileForCompare(profile) {
    return {
        strip: (profile?.strip ?? []).map(normalizeStripLed),
        colors: profile?.colors ?? [],
        modeColors: profile?.modeColors ?? [],
        brightness: profile?.brightness ?? 0,
        larsonFreq: profile?.larsonFreq ?? 0,
        rainbowDelta: profile?.rainbowDelta ?? 0,
        rainbowFreq: profile?.rainbowFreq ?? 0,
        blinkPeriod: profile?.blinkPeriod ?? 0,
        blinkOnMs: profile?.blinkOnMs ?? 0,
        blinkPattern: profile?.blinkPattern ?? 0,
        blinkFlashMs: profile?.blinkFlashMs ?? 0,
        blinkGapMs: profile?.blinkGapMs ?? 0,
        blinkPauseMs: profile?.blinkPauseMs ?? 0,
    };
}

function profileDataEquals(a, b) {
    if (!a || !b) {
        return false;
    }

    return (
        JSON.stringify(normalizeProfileForCompare(a)) === JSON.stringify(normalizeProfileForCompare(b))
    );
}

function profileNamesEqual(a, b) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function normalizeEditProfile(profileIndex) {
    const index = Number(profileIndex);
    if (!Number.isInteger(index) || index < LED_PROFILE_RACE || index > LED_PROFILE_STATUS) {
        return LED_PROFILE_STATUS;
    }
    return index;
}

function updateProfileCacheFromLegacy(profileIndex) {
    const existingProfile = FC.LED_STRIP_PROFILES[profileIndex] ?? createEmptyProfile();
    FC.LED_STRIP_PROFILES[profileIndex] = {
        strip: cloneLedData(FC.LED_STRIP),
        colors: cloneLedData(FC.LED_COLORS),
        modeColors: cloneLedData(FC.LED_MODE_COLORS),
        brightness: existingProfile.brightness ?? 0,
        larsonFreq: existingProfile.larsonFreq ?? 0,
        rainbowDelta: existingProfile.rainbowDelta ?? 0,
        rainbowFreq: existingProfile.rainbowFreq ?? 0,
        blinkPeriod: existingProfile.blinkPeriod ?? 0,
        blinkOnMs: existingProfile.blinkOnMs ?? 0,
        blinkPattern: existingProfile.blinkPattern ?? 0,
        blinkFlashMs: existingProfile.blinkFlashMs ?? 0,
        blinkGapMs: existingProfile.blinkGapMs ?? 0,
        blinkPauseMs: existingProfile.blinkPauseMs ?? 0,
    };
}

function syncProfileFromLegacy(profileIndex) {
    updateProfileCacheFromLegacy(profileIndex);
    checkForChanges();
}

function updateHasChangesFromDirtyState() {
    hasUnsavedLedEdits.value = dirtyState.profiles.some(Boolean) || dirtyState.profileNames;
    hasChanges.value = hasUnsavedLedEdits.value || dirtyState.activeProfile;
}

function resetDirtyState() {
    dirtyState.profiles = [false, false, false];
    dirtyState.profileNames = false;
    dirtyState.activeProfile = false;
    updateHasChangesFromDirtyState();
}

function storeOriginals() {
    if (!changeTrackingContext) {
        return;
    }

    const { profileNames, activeFlightProfile, editProfile } = changeTrackingContext;
    const editProfileIndex = editProfile?.value ?? FC.LED_EDIT_PROFILE ?? LED_PROFILE_STATUS;

    updateProfileCacheFromLegacy(editProfileIndex);

    const profileCount = FC.LED_STRIP_PROFILE_COUNT ?? FC.LED_STRIP_PROFILES?.length ?? 0;
    savedSnapshot = {
        profiles: Array.from({ length: profileCount }, (_, profileIndex) =>
            cloneProfile(FC.LED_STRIP_PROFILES[profileIndex] ?? createEmptyProfile()),
        ),
        profileNames: [...profileNames.value],
        activeFlightProfile: activeFlightProfile.value,
    };

    resetDirtyState();
}

function checkForChanges() {
    if (!changeTrackingContext || !savedSnapshot) {
        resetDirtyState();
        return;
    }

    const { profileNames, activeFlightProfile, editProfile } = changeTrackingContext;
    const editProfileIndex = editProfile?.value ?? FC.LED_EDIT_PROFILE ?? LED_PROFILE_STATUS;

    updateProfileCacheFromLegacy(editProfileIndex);

    const profileCount = FC.LED_STRIP_PROFILE_COUNT ?? savedSnapshot.profiles.length;
    dirtyState.profiles = [false, false, false];

    for (let profileIndex = 0; profileIndex < profileCount; profileIndex++) {
        const current = FC.LED_STRIP_PROFILES[profileIndex] ?? createEmptyProfile();
        const original = savedSnapshot.profiles[profileIndex] ?? createEmptyProfile();
        dirtyState.profiles[profileIndex] = !profileDataEquals(current, original);
    }

    dirtyState.profileNames = !profileNamesEqual(profileNames.value, savedSnapshot.profileNames);
    dirtyState.activeProfile = activeFlightProfile.value !== savedSnapshot.activeFlightProfile;

    updateHasChangesFromDirtyState();
}

function getProfileEffectiveBrightness(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBrightness = profile?.brightness ?? 0;
    if (profileBrightness >= 5) {
        return profileBrightness;
    }
    return FC.LED_CONFIG_VALUES?.brightness ?? 100;
}

function setProfileBrightness(profileIndex, brightness) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedBrightness = FC.LED_STRIP_PROFILES[profileIndex].brightness ?? 0;
    if (storedBrightness === brightness) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].brightness = brightness;
    checkForChanges();
}

function getProfileEffectiveLarsonFreq(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileLarsonFreq = profile?.larsonFreq ?? 0;
    if (profileLarsonFreq > 0) {
        return profileLarsonFreq;
    }
    return FC.LED_CONFIG_VALUES?.larson_freq ?? 15;
}

function getProfileEffectiveRainbowDelta(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileRainbowDelta = profile?.rainbowDelta ?? 0;
    if (profileRainbowDelta > 0) {
        return profileRainbowDelta;
    }
    return FC.LED_CONFIG_VALUES?.rainbow_delta ?? 0;
}

function getProfileEffectiveRainbowFreq(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileRainbowFreq = profile?.rainbowFreq ?? 0;
    if (profileRainbowFreq > 0) {
        return profileRainbowFreq;
    }
    return FC.LED_CONFIG_VALUES?.rainbow_freq ?? 120;
}

function getProfileEffectiveBlinkPeriod(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBlinkPeriod = profile?.blinkPeriod ?? 0;
    if (profileBlinkPeriod > 0) {
        return profileBlinkPeriod;
    }
    return FC.LED_CONFIG_VALUES?.blink_period_ms ?? 500;
}

function getProfileEffectiveBlinkOnMs(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBlinkOnMs = profile?.blinkOnMs ?? 0;
    if (profileBlinkOnMs > 0) {
        return profileBlinkOnMs;
    }
    return FC.LED_CONFIG_VALUES?.blink_on_ms ?? 250;
}

function migrateBlinkPattern(blinkPattern) {
    if (blinkPattern === LED_BLINK_PATTERN_DOUBLE_DEPRECATED) {
        return LED_BLINK_PATTERN_BEACON;
    }
    return blinkPattern;
}

function getProfileEffectiveBlinkPattern(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBlinkPattern = profile?.blinkPattern ?? 0;
    if (profileBlinkPattern > 0) {
        return migrateBlinkPattern(profileBlinkPattern);
    }
    return migrateBlinkPattern(FC.LED_CONFIG_VALUES?.blink_pattern ?? LED_BLINK_PATTERN_ALTERNATE);
}

function getProfileEffectiveBlinkFlashMs(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBlinkFlashMs = profile?.blinkFlashMs ?? 0;
    if (profileBlinkFlashMs >= LED_BLINK_FLASH_MS_MIN) {
        return profileBlinkFlashMs;
    }
    return FC.LED_CONFIG_VALUES?.blink_flash_ms ?? 120;
}

function clampBlinkPauseMsForPattern(pauseMs, blinkPattern) {
    const minPauseMs =
        migrateBlinkPattern(blinkPattern) === LED_BLINK_PATTERN_ALTERNATE
            ? LED_BLINK_PAUSE_MS_MIN_ALTERNATE
            : LED_BLINK_PAUSE_MS_MIN;
    return Math.max(pauseMs, minPauseMs);
}

function getProfileEffectiveBlinkGapMs(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBlinkGapMs = profile?.blinkGapMs ?? 0;
    if (profileBlinkGapMs >= 20) {
        return profileBlinkGapMs;
    }
    return FC.LED_CONFIG_VALUES?.blink_gap_ms ?? 120;
}

function getProfileEffectiveBlinkPauseMs(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex];
    const profileBlinkPauseMs = profile?.blinkPauseMs ?? 0;
    const rawPauseMs =
        profileBlinkPauseMs >= LED_BLINK_PAUSE_MS_MIN_ALTERNATE
            ? profileBlinkPauseMs
            : FC.LED_CONFIG_VALUES?.blink_pause_ms ?? 2000;
    return clampBlinkPauseMsForPattern(rawPauseMs, getProfileEffectiveBlinkPattern(profileIndex));
}

function setProfileLarsonFreq(profileIndex, larsonFreq) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedLarsonFreq = FC.LED_STRIP_PROFILES[profileIndex].larsonFreq ?? 0;
    if (storedLarsonFreq === larsonFreq) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].larsonFreq = larsonFreq;
    checkForChanges();
}

function setProfileRainbowDelta(profileIndex, rainbowDelta) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedRainbowDelta = FC.LED_STRIP_PROFILES[profileIndex].rainbowDelta ?? 0;
    if (storedRainbowDelta === rainbowDelta) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].rainbowDelta = rainbowDelta;
    checkForChanges();
}

function setProfileRainbowFreq(profileIndex, rainbowFreq) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedRainbowFreq = FC.LED_STRIP_PROFILES[profileIndex].rainbowFreq ?? 0;
    if (storedRainbowFreq === rainbowFreq) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].rainbowFreq = rainbowFreq;
    checkForChanges();
}

function setProfileBlinkPeriod(profileIndex, blinkPeriod) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedBlinkPeriod = FC.LED_STRIP_PROFILES[profileIndex].blinkPeriod ?? 0;
    if (storedBlinkPeriod === blinkPeriod) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].blinkPeriod = blinkPeriod;
    checkForChanges();
}

function setProfileBlinkOnMs(profileIndex, blinkOnMs) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedBlinkOnMs = FC.LED_STRIP_PROFILES[profileIndex].blinkOnMs ?? 0;
    if (storedBlinkOnMs === blinkOnMs) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].blinkOnMs = blinkOnMs;
    checkForChanges();
}

function setProfileBlinkPattern(profileIndex, blinkPattern) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedBlinkPattern = FC.LED_STRIP_PROFILES[profileIndex].blinkPattern ?? 0;
    if (storedBlinkPattern === blinkPattern) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].blinkPattern = blinkPattern;
    checkForChanges();
}

function setProfileBlinkFlashMs(profileIndex, blinkFlashMs) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedBlinkFlashMs = FC.LED_STRIP_PROFILES[profileIndex].blinkFlashMs ?? 0;
    if (storedBlinkFlashMs === blinkFlashMs) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].blinkFlashMs = blinkFlashMs;
    checkForChanges();
}

function setProfileBlinkGapMs(profileIndex, blinkGapMs) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const storedBlinkGapMs = FC.LED_STRIP_PROFILES[profileIndex].blinkGapMs ?? 0;
    if (storedBlinkGapMs === blinkGapMs) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].blinkGapMs = blinkGapMs;
    checkForChanges();
}

function setProfileBlinkPauseMs(profileIndex, blinkPauseMs) {
    if (!FC.LED_STRIP_PROFILES[profileIndex]) {
        FC.LED_STRIP_PROFILES[profileIndex] = createEmptyProfile();
    }

    const clampedBlinkPauseMs = clampBlinkPauseMsForPattern(
        blinkPauseMs,
        getProfileEffectiveBlinkPattern(profileIndex),
    );

    const storedBlinkPauseMs = FC.LED_STRIP_PROFILES[profileIndex].blinkPauseMs ?? 0;
    if (storedBlinkPauseMs === clampedBlinkPauseMs) {
        return;
    }

    FC.LED_STRIP_PROFILES[profileIndex].blinkPauseMs = clampedBlinkPauseMs;
    checkForChanges();
}

function getGridPosition(index) {
    const gridNumber = index + 1;
    const row = Math.ceil(gridNumber / 16) - 1;
    let col = ((gridNumber / 16) % 1) * 16 - 1;
    if (col < 0) {
        col = 15;
    }
    return { x: col, y: row };
}

function buildUsedWireNumbers(gridState) {
    const usedWireNumbers = [];
    gridState.forEach((led) => {
        const wireNumber = Number.parseInt(led.wireNumber, 10);
        if (wireNumber >= 0 && !Number.isNaN(wireNumber)) {
            usedWireNumbers.push(wireNumber);
        }
    });
    usedWireNumbers.sort((a, b) => a - b);
    return usedWireNumbers;
}

function hsvToColor(input) {
    if (!input) {
        return "";
    }

    let HSV = { h: Number(input.h), s: Number(input.s), v: Number(input.v) };

    if (HSV.s === 0 && HSV.v === 0) {
        return "";
    }

    HSV = { h: HSV.h, s: 1 - HSV.s / 255, v: HSV.v / 255 };

    const HSL = { h: 0, s: 0, l: 0 };
    HSL.h = HSV.h;
    HSL.l = ((2 - HSV.s) * HSV.v) / 2;

    if (HSL.l && HSL.l < 1) {
        if (HSL.l < 0.5) {
            HSL.s = (HSV.s * HSV.v) / (HSL.l * 2);
        } else {
            HSL.s = (HSV.s * HSV.v) / (2 - HSL.l * 2);
        }
    }

    return `hsl(${HSL.h},${HSL.s * 100}%,${HSL.l * 100}%)`;
}

function areModifiersActive(activeFunction) {
    return ["function-c", "function-a", "function-f"].includes(activeFunction);
}

function areOverlaysActive(activeFunction) {
    const activeFunctions = [
        "",
        "function-c",
        "function-a",
        "function-f",
        "function-p",
        "function-e",
        "function-u",
        "function-s",
        "function-l",
        "function-r",
        "function-y",
        "function-o",
        "function-b",
        "function-g",
    ];
    return activeFunctions.includes(activeFunction);
}

function isWarningActive(activeFunction) {
    const inactiveFunctions = ["function-l", "function-s", "function-g"];
    return !inactiveFunctions.includes(activeFunction);
}

function isVtxActive(activeFunction) {
    const activeFunctions = ["function-v", "function-c", "function-a", "function-f"];
    return activeFunctions.includes(activeFunction);
}

async function sendLedStripProfileWithTimeout(profileIndex, profile) {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`MSP2_SET_LED_STRIP_PROFILE_CONFIG timeout (profile ${profileIndex})`));
        }, 5000);

        mspHelper.sendLedStripProfileConfig(profileIndex, profile, () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function sendDirtyLedStripProfiles() {
    for (let profileIndex = 0; profileIndex < FC.LED_STRIP_PROFILE_COUNT; profileIndex++) {
        if (!dirtyState.profiles[profileIndex]) {
            continue;
        }

        const profile = FC.LED_STRIP_PROFILES[profileIndex];
        if (!profile) {
            continue;
        }

        await sendLedStripProfileWithTimeout(profileIndex, profile);
    }
}

async function sendDirtyLedStripProfileNames(profileNamesRef) {
    const names = profileNamesRef?.value ?? FC.LED_STRIP_PROFILE_NAMES ?? [];
    FC.LED_STRIP_PROFILE_NAMES = [...names];

    for (let profileIndex = 0; profileIndex < FC.LED_STRIP_PROFILE_COUNT; profileIndex++) {
        const name = FC.LED_STRIP_PROFILE_NAMES[profileIndex] ?? "";
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`MSP2_SET_TEXT led strip profile name timeout (profile ${profileIndex})`));
            }, 5000);

            mspHelper.sendLedStripProfileName(profileIndex, name, () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
}

async function loadLedStripProfileNames(profileNamesRef) {
    FC.LED_STRIP_PROFILE_NAMES = FC.LED_STRIP_PROFILE_NAMES ?? ["", "", ""];

    for (let profileIndex = 0; profileIndex < FC.LED_STRIP_PROFILE_COUNT; profileIndex++) {
        FC.LED_STRIP_PROFILE_NAME_REQUEST = profileIndex;
        await MSP.promise(
            MSPCodes.MSP2_GET_TEXT,
            mspHelper.crunchLedStripProfileNameGet(profileIndex),
        );
    }

    if (profileNamesRef) {
        profileNamesRef.value = FC.LED_STRIP_PROFILE_NAMES.map((name, profileIndex) => {
            const trimmed = (name ?? "").trim();
            if (!trimmed || trimmed === DEFAULT_PROFILE_NAMES[profileIndex]) {
                return "";
            }
            return trimmed;
        });
    }
}

async function saveLegacyStatusProfile(activeProfileIndex) {
    syncLegacyFromProfile(LED_PROFILE_STATUS);

    return new Promise((resolve) => {
        const saveColors = () => {
            mspHelper.sendLedStripColors(saveModeColors);
        };

        const saveModeColors = () => {
            mspHelper.sendLedStripModeColors(writeConfig);
        };

        const writeConfig = () => {
            mspHelper.writeConfiguration(false, resolve);
        };

        mspHelper.sendLedStripConfig(saveColors, activeProfileIndex);
    });
}

async function writeConfiguration() {
    return new Promise((resolve) => {
        mspHelper.writeConfiguration(false, resolve);
    });
}

async function saveConfig(editProfileIndex, activeProfileIndex, profileNamesRef) {
    syncProfileFromLegacy(editProfileIndex);
    FC.LED_ACTIVE_PROFILE = activeProfileIndex;

    if (profileNamesRef) {
        FC.LED_STRIP_PROFILE_NAMES = [...profileNamesRef.value];
    }

    checkForChanges();

    if (CONFIGURATOR.virtualMode) {
        storeOriginals();
        return;
    }

    if (FC.LED_MULTI_PROFILE_SUPPORTED) {
        await sendDirtyLedStripProfiles();

        if (dirtyState.profileNames) {
            await sendDirtyLedStripProfileNames(profileNamesRef);
        }

        const statusProfileDirty = dirtyState.profiles[LED_PROFILE_STATUS];

        if (statusProfileDirty) {
            await saveLegacyStatusProfile(activeProfileIndex);
        } else if (dirtyState.activeProfile) {
            await new Promise((resolve) => {
                mspHelper.sendLedStripActiveProfile(activeProfileIndex, () => {
                    writeConfiguration().then(resolve);
                });
            });
        } else if (
            dirtyState.profiles.some(Boolean) ||
            dirtyState.profileNames
        ) {
            await writeConfiguration();
        }

        syncLegacyFromProfile(editProfileIndex);
        storeOriginals();
        return;
    }

    return new Promise((resolve) => {
        const saveColors = () => {
            mspHelper.sendLedStripColors(saveModeColors);
        };

        const saveModeColors = () => {
            mspHelper.sendLedStripModeColors(writeConfig);
        };

        const writeConfig = () => {
            mspHelper.writeConfiguration(false, () => {
                storeOriginals();
                resolve();
            });
        };

        mspHelper.sendLedStripConfig(saveColors, activeProfileIndex);
    });
}

export function useLedStrip() {
    const wireMode = ref(false);
    const selectedColorIndex = ref(null);
    const selectedModeColor = ref(null);
    const selectedLeds = ref(new Set());
    const editProfile = ref(LED_PROFILE_STATUS);
    const activeFlightProfile = ref(LED_PROFILE_STATUS);
    const profileNames = ref(["", "", ""]);

    changeTrackingContext = { profileNames, activeFlightProfile, editProfile };

    const directions = ["n", "e", "s", "w", "u", "d"];
    const functions = ["i", "w", "f", "a", "t", "r", "c", "g", "s", "b", "l", "o", "y"];
    const baseFuncs = ["c", "f", "a", "l", "s", "g", "r", "p", "e", "u"];

    let overlays = ["t", "y", "o", "b", "v", "i", "w"];
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        overlays = overlays.filter((x) => x !== "y");
    }

    const ledStrip = computed(() => FC.LED_STRIP);
    const ledColors = computed(() => FC.LED_COLORS);
    const ledModeColors = computed(() => FC.LED_MODE_COLORS);
    const ledConfigValues = computed(() => FC.LED_CONFIG_VALUES);
    const multiProfileSupported = computed(() => FC.LED_MULTI_PROFILE_SUPPORTED);

    function getProfileDisplayLabel(profileIndex, translate) {
        const customName = profileNames.value[profileIndex]?.trim();
        if (customName) {
            return customName;
        }

        if (translate) {
            return translate(PROFILE_I18N_KEYS[profileIndex] ?? "ledStripProfileStatus");
        }

        return DEFAULT_PROFILE_NAMES[profileIndex] ?? "STATUS";
    }

    function getActiveProfileLabel(profileIndex) {
        return PROFILE_I18N_KEYS[profileIndex] ?? "ledStripProfileStatus";
    }

    function setProfileName(profileIndex, name) {
        profileNames.value[profileIndex] = (name ?? "").trim().slice(0, 8);
        FC.LED_STRIP_PROFILE_NAMES = [...profileNames.value];
        checkForChanges();
    }

    function getProfileName(profileIndex) {
        return profileNames.value[profileIndex] ?? "";
    }

    function loadVirtualLedData(editProfileIndex = LED_PROFILE_STATUS) {
        FC.LED_STRIP_PROFILES = FC.LED_STRIP_PROFILES ?? [];
        FC.LED_STRIP_PROFILE_COUNT = FC.LED_STRIP_PROFILE_COUNT ?? 3;
        FC.LED_MULTI_PROFILE_SUPPORTED = true;

        editProfile.value = normalizeEditProfile(editProfileIndex);
        activeFlightProfile.value = FC.LED_ACTIVE_PROFILE ?? LED_PROFILE_STATUS;
        profileNames.value = ["RACE", "BEACON", "STATUS"];
        syncLegacyFromProfile(editProfile.value);
        storeOriginals();
    }

    async function loadData(options = {}) {
        const editProfileToLoad = normalizeEditProfile(
            options.preserveEditProfile ?? LED_PROFILE_STATUS,
        );

        if (CONFIGURATOR.virtualMode) {
            loadVirtualLedData(editProfileToLoad);
            return;
        }

        savedSnapshot = null;
        resetDirtyState();

        await MSP.promise(MSPCodes.MSP_LED_STRIP_CONFIG);

        activeFlightProfile.value = FC.LED_ACTIVE_PROFILE ?? LED_PROFILE_STATUS;

        FC.LED_STRIP_PROFILES = [];
        FC.LED_STRIP_PROFILE_NAMES = ["RACE", "BEACON", "STATUS"];

        try {
            await MSP.promise(MSPCodes.MSP2_GET_LED_STRIP_PROFILE_COUNT);
        } catch (error) {
            FC.LED_STRIP_PROFILE_COUNT = 1;
            FC.LED_MULTI_PROFILE_SUPPORTED = false;
        }

        if (FC.LED_MULTI_PROFILE_SUPPORTED) {
            for (let profileIndex = 0; profileIndex < FC.LED_STRIP_PROFILE_COUNT; profileIndex++) {
                await MSP.promise(MSPCodes.MSP2_GET_LED_STRIP_PROFILE_CONFIG, [profileIndex]);
            }

            try {
                await loadLedStripProfileNames(profileNames);
            } catch (error) {
                console.warn("Failed to load LED strip profile names:", error);
            }

            editProfile.value = editProfileToLoad;
            syncLegacyFromProfile(editProfile.value);
        } else {
            await MSP.promise(MSPCodes.MSP_LED_COLORS);
            await MSP.promise(MSPCodes.MSP_LED_STRIP_MODECOLOR);

            FC.LED_STRIP_PROFILES[LED_PROFILE_STATUS] = cloneProfile({
                strip: FC.LED_STRIP,
                colors: FC.LED_COLORS,
                modeColors: FC.LED_MODE_COLORS,
            });
            editProfile.value = LED_PROFILE_STATUS;
            FC.LED_EDIT_PROFILE = LED_PROFILE_STATUS;
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            await MSP.promise(MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES);
        }

        storeOriginals();
    }

    function setActiveFlightProfile(newProfileIndex) {
        if (hasUnsavedLedEdits.value) {
            return false;
        }

        const profileIndex = Number(newProfileIndex);
        if (
            !Number.isInteger(profileIndex) ||
            profileIndex < LED_PROFILE_RACE ||
            profileIndex > LED_PROFILE_STATUS
        ) {
            return false;
        }

        if (profileIndex === activeFlightProfile.value) {
            return true;
        }

        activeFlightProfile.value = profileIndex;
        FC.LED_ACTIVE_PROFILE = profileIndex;
        checkForChanges();
        return true;
    }

    function switchEditProfile(newProfileIndex) {
        if (hasUnsavedLedEdits.value) {
            return false;
        }

        const profileIndex = Number(newProfileIndex);
        if (
            !Number.isInteger(profileIndex) ||
            profileIndex < LED_PROFILE_RACE ||
            profileIndex > LED_PROFILE_STATUS
        ) {
            return false;
        }

        if (profileIndex === FC.LED_EDIT_PROFILE) {
            return true;
        }

        updateProfileCacheFromLegacy(FC.LED_EDIT_PROFILE);
        editProfile.value = profileIndex;
        syncLegacyFromProfile(profileIndex);
        checkForChanges();
        return true;
    }

    function findLed(x, y) {
        for (let ledIndex = 0; ledIndex < FC.LED_STRIP.length; ledIndex++) {
            const led = FC.LED_STRIP[ledIndex];
            if (led.x === x && led.y === y) {
                return { index: ledIndex, led };
            }
        }
        return undefined;
    }

    function buildLedStripFromGrid(gridState) {
        const ledStripLength = FC.LED_STRIP.length;
        const previousStrip = cloneLedData(FC.LED_STRIP);
        const cachedBefore = cloneProfile(FC.LED_STRIP_PROFILES[FC.LED_EDIT_PROFILE] ?? createEmptyProfile());
        const newLedStrip = [];

        gridState.forEach((led, index) => {
            if (led.functions.length > 0 && led.wireNumber !== "") {
                const wireIndex = Number.parseInt(led.wireNumber, 10);
                if (Number.isNaN(wireIndex) || wireIndex < 0 || wireIndex >= ledStripLength) {
                    return;
                }

                const { x, y } = getGridPosition(index);
                newLedStrip[wireIndex] = {
                    x,
                    y,
                    directions: led.directions.join(""),
                    functions: led.functions.join(""),
                    color: led.colorIndex,
                };
            }
        });

        const defaultLed = {
            x: 0,
            y: 0,
            directions: "",
            functions: "",
            color: 0,
        };

        const preserveColorOnlyAtOrigin = countColorOnlyLedsAtOrigin(previousStrip) > 1;

        if (preserveColorOnlyAtOrigin) {
            const mergedStrip = cloneLedData(previousStrip);
            for (let i = 0; i < ledStripLength; i++) {
                if (newLedStrip[i]) {
                    mergedStrip[i] = newLedStrip[i];
                }
            }
            FC.LED_STRIP = mergedStrip;
        } else {
            for (let i = 0; i < ledStripLength; i++) {
                if (!newLedStrip[i]) {
                    newLedStrip[i] = { ...defaultLed };
                }
            }
            FC.LED_STRIP = newLedStrip;
        }

        updateProfileCacheFromLegacy(FC.LED_EDIT_PROFILE);
        if (!profileDataEquals(cachedBefore, FC.LED_STRIP_PROFILES[FC.LED_EDIT_PROFILE])) {
            checkForChanges();
        }
    }

    function getNextWireNumber(gridState) {
        const usedWireNumbers = buildUsedWireNumbers(gridState);
        let nextWireNumber = 0;
        for (; nextWireNumber < usedWireNumbers.length; nextWireNumber++) {
            if (usedWireNumbers[nextWireNumber] !== nextWireNumber) {
                break;
            }
        }
        return nextWireNumber;
    }

    function getModeColor(mode, dir) {
        for (const mc of FC.LED_MODE_COLORS) {
            if (mc.mode === mode && mc.direction === dir) {
                return mc.color;
            }
        }
        return 3;
    }

    function setModeColor(mode, dir, color) {
        for (const mc of FC.LED_MODE_COLORS) {
            if (mc.mode === mode && mc.direction === dir) {
                if (mc.color === color) {
                    return true;
                }
                mc.color = color;
                updateProfileCacheFromLegacy(FC.LED_EDIT_PROFILE);
                checkForChanges();
                return true;
            }
        }
        return false;
    }

    function isRainbowActive(activeFunction) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            return ["function-c", "function-a", "function-f"].includes(activeFunction);
        }
        return false;
    }

    async function updateLedConfigValue(key, value) {
        FC.LED_CONFIG_VALUES[key] = value;
        await mspHelper.sendLedStripConfigValues();
    }

    function updateProfileBrightness(profileIndex, brightness) {
        setProfileBrightness(profileIndex, brightness);
    }

    function getProfileBrightnessForDisplay(profileIndex) {
        return getProfileEffectiveBrightness(profileIndex);
    }

    async function saveCurrentProfile(editProfileIndex) {
        await saveConfig(editProfileIndex, activeFlightProfile.value, profileNames);
    }

    async function refreshData() {
        await loadData({ preserveEditProfile: editProfile.value });
    }

    function finalizeLoadedState() {
        storeOriginals();
    }

    return {
        wireMode,
        hasChanges,
        hasUnsavedLedEdits,
        selectedColorIndex,
        selectedModeColor,
        selectedLeds,
        editProfile,
        activeFlightProfile,
        profileNames,
        directions,
        functions,
        baseFuncs,
        overlays,
        ledStrip,
        ledColors,
        ledModeColors,
        ledConfigValues,
        multiProfileSupported,
        loadData,
        refreshData,
        finalizeLoadedState,
        saveConfig: saveCurrentProfile,
        switchEditProfile,
        setActiveFlightProfile,
        getActiveProfileLabel,
        getProfileDisplayLabel,
        getProfileName,
        setProfileName,
        findLed,
        getGridPosition,
        buildLedStripFromGrid,
        buildUsedWireNumbers,
        getNextWireNumber,
        hsvToColor,
        getModeColor,
        setModeColor,
        areModifiersActive,
        areOverlaysActive,
        isRainbowActive,
        isWarningActive,
        isVtxActive,
        updateLedConfigValue,
        updateProfileBrightness,
        getProfileBrightnessForDisplay,
        getProfileEffectiveLarsonFreq,
        getProfileEffectiveRainbowDelta,
        getProfileEffectiveRainbowFreq,
        getProfileEffectiveBlinkPeriod,
        getProfileEffectiveBlinkOnMs,
        getProfileEffectiveBlinkPattern,
        migrateBlinkPattern,
        getProfileEffectiveBlinkFlashMs,
        getProfileEffectiveBlinkGapMs,
        getProfileEffectiveBlinkPauseMs,
        setProfileLarsonFreq,
        setProfileRainbowDelta,
        setProfileRainbowFreq,
        setProfileBlinkPeriod,
        setProfileBlinkOnMs,
        setProfileBlinkPattern,
        setProfileBlinkFlashMs,
        setProfileBlinkGapMs,
        setProfileBlinkPauseMs,
        LED_BLINK_PATTERN_ALTERNATE,
        LED_BLINK_PATTERN_BEACON,
        LED_BLINK_PAUSE_MS_MIN_ALTERNATE,
    };
}
