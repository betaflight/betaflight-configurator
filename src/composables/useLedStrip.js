import { ref, computed, toRaw } from "vue";
import FC from "@/js/fc.js";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import semver from "semver";
import CONFIGURATOR, { API_VERSION_1_46 } from "@/js/data_storage";

export const LED_PROFILE_RACE = 0;
export const LED_PROFILE_BEACON = 1;
export const LED_PROFILE_STATUS = 2;

const PROFILE_I18N_KEYS = ["ledStripProfileRace", "ledStripProfileBeacon", "ledStripProfileStatus"];
const DEFAULT_PROFILE_NAMES = ["RACE", "BEACON", "STATUS"];

const dirtyState = {
    profiles: [false, false, false],
    profileNames: false,
    activeProfile: false,
};

function resetDirtyState() {
    dirtyState.profiles = [false, false, false];
    dirtyState.profileNames = false;
    dirtyState.activeProfile = false;
}

function markProfileDirty(profileIndex) {
    if (profileIndex >= 0 && profileIndex < dirtyState.profiles.length) {
        dirtyState.profiles[profileIndex] = true;
    }
}

function createEmptyProfile() {
    return {
        strip: [],
        colors: [],
        modeColors: [],
    };
}

function cloneLedData(data) {
    return structuredClone(toRaw(data ?? []));
}

function cloneProfile(profile) {
    return {
        strip: cloneLedData(profile.strip),
        colors: cloneLedData(profile.colors),
        modeColors: cloneLedData(profile.modeColors),
    };
}

function syncLegacyFromProfile(profileIndex) {
    const profile = FC.LED_STRIP_PROFILES[profileIndex] ?? createEmptyProfile();
    FC.LED_STRIP = cloneLedData(profile.strip);
    FC.LED_COLORS = cloneLedData(profile.colors);
    FC.LED_MODE_COLORS = cloneLedData(profile.modeColors);
    FC.LED_EDIT_PROFILE = profileIndex;
}

function syncProfileFromLegacy(profileIndex) {
    FC.LED_STRIP_PROFILES[profileIndex] = {
        strip: cloneLedData(FC.LED_STRIP),
        colors: cloneLedData(FC.LED_COLORS),
        modeColors: cloneLedData(FC.LED_MODE_COLORS),
    };
    markProfileDirty(profileIndex);
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

    if (CONFIGURATOR.virtualMode) {
        resetDirtyState();
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
        resetDirtyState();
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
            mspHelper.writeConfiguration(false, resolve);
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
        dirtyState.profileNames = true;
    }

    function getProfileName(profileIndex) {
        return profileNames.value[profileIndex] ?? "";
    }

    function loadVirtualLedData() {
        FC.LED_STRIP_PROFILES = FC.LED_STRIP_PROFILES ?? [];
        FC.LED_STRIP_PROFILE_COUNT = FC.LED_STRIP_PROFILE_COUNT ?? 3;
        FC.LED_MULTI_PROFILE_SUPPORTED = true;

        editProfile.value = LED_PROFILE_STATUS;
        activeFlightProfile.value = FC.LED_ACTIVE_PROFILE ?? LED_PROFILE_STATUS;
        profileNames.value = ["RACE", "BEACON", "STATUS"];
        syncLegacyFromProfile(editProfile.value);
        resetDirtyState();
    }

    async function loadData() {
        if (CONFIGURATOR.virtualMode) {
            loadVirtualLedData();
            return;
        }

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

            editProfile.value = LED_PROFILE_STATUS;
            syncLegacyFromProfile(editProfile.value);
            resetDirtyState();
        } else {
            await MSP.promise(MSPCodes.MSP_LED_COLORS);
            await MSP.promise(MSPCodes.MSP_LED_STRIP_MODECOLOR);

            FC.LED_STRIP_PROFILES[LED_PROFILE_STATUS] = cloneProfile({
                strip: FC.LED_STRIP,
                colors: FC.LED_COLORS,
                modeColors: FC.LED_MODE_COLORS,
            });
            editProfile.value = LED_PROFILE_STATUS;
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            await MSP.promise(MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES);
        }
    }

    function setActiveFlightProfile(newProfileIndex) {
        const profileIndex = Number(newProfileIndex);
        if (
            !Number.isInteger(profileIndex) ||
            profileIndex < LED_PROFILE_RACE ||
            profileIndex > LED_PROFILE_STATUS
        ) {
            return;
        }

        activeFlightProfile.value = profileIndex;
        FC.LED_ACTIVE_PROFILE = profileIndex;
        dirtyState.activeProfile = true;
    }

    function switchEditProfile(newProfileIndex) {
        const profileIndex = Number(newProfileIndex);
        if (
            !Number.isInteger(profileIndex) ||
            profileIndex < LED_PROFILE_RACE ||
            profileIndex > LED_PROFILE_STATUS
        ) {
            return;
        }

        if (profileIndex === FC.LED_EDIT_PROFILE) {
            return;
        }

        syncProfileFromLegacy(FC.LED_EDIT_PROFILE);
        editProfile.value = profileIndex;
        syncLegacyFromProfile(profileIndex);
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

        for (let i = 0; i < ledStripLength; i++) {
            if (!newLedStrip[i]) {
                newLedStrip[i] = { ...defaultLed };
            }
        }

        FC.LED_STRIP = newLedStrip;
        syncProfileFromLegacy(FC.LED_EDIT_PROFILE);
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
                mc.color = color;
                markProfileDirty(FC.LED_EDIT_PROFILE);
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

    async function saveCurrentProfile(editProfileIndex) {
        await saveConfig(editProfileIndex, activeFlightProfile.value, profileNames);
    }

    return {
        wireMode,
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
    };
}
