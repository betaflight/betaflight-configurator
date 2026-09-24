/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { OSD } from "../components/tabs/osd/osd";
import { FONT, SYM } from "../js/utils/osdFont";
import MSP from "../js/msp";
import VirtualFC from "../js/VirtualFC";
import MSPCodes from "../js/msp/MSPCodes";
import { OSD_CONSTANTS } from "../components/tabs/osd/osd_constants";
import semver from "semver";
import { useFlightControllerStore } from "./fc";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../js/data_storage";
import { bit_set } from "../js/bit";
import { useDirtyState } from "../composables/useDirtyState";
import { MspBuffer } from "../js/msp/mspBytes";
import type { MspResponse } from "../js/msp";

/** An alarm threshold as `OSD.msp.decode` builds it; only `value` is written back. */
export interface OsdAlarm {
    display_name: string;
    value: number;
    min?: number;
    max?: number;
}

// Each item type lists the fields this store reads; osd.js attaches more (name, text, preview, ...).
export interface OsdStatItem {
    index: number;
    enabled: boolean;
}

export interface OsdWarning {
    index: number;
    enabled: boolean;
}

export interface OsdTimer {
    index: number;
    src: number;
    precision: number;
    alarm: number;
}

export interface OsdDisplayItem {
    index: number;
    position: number;
    variant: number;
    isVisible: boolean[];
}

export interface OsdParameters {
    cameraFrameWidth: number;
    cameraFrameHeight: number;
    overlayRadioMode: number;
}

export interface OsdProfiles {
    number: number;
    selected: number;
}

/** Written by VirtualFC.setupVirtualOSD; stands in for the FC in virtual mode. */
interface VirtualOsdMode {
    itemPositions: (number | undefined)[];
    statisticsState: boolean[];
    warningFlags: number;
    timerData: Partial<OsdTimer>[];
}

/** `OSD.data` as the decoder leaves it, which is the only point this store reads it. */
interface LegacyOsdData {
    video_system: number | null;
    unit_mode: number | null;
    alarms: Record<string, OsdAlarm>;
    statItems: OsdStatItem[];
    warnings: OsdWarning[];
    displayItems: OsdDisplayItem[];
    timers: OsdTimer[];
    osd_profiles: OsdProfiles;
    parameters?: OsdParameters;
    state?: object;
    displaySize?: object;
    VIDEO_COLS: Record<string, number | undefined>;
    VIDEO_ROWS: Record<string, number | undefined>;
}

// osd.js assigns OSD.data / OSD.virtualMode and FONT.data inside functions, so inference never sees them.
const legacyOsd = OSD as typeof OSD & { data: LegacyOsdData; virtualMode?: VirtualOsdMode };
const legacyFont = FONT as typeof FONT & { data?: { characters?: unknown[] } };

type FlightControllerStore = ReturnType<typeof useFlightControllerStore>;

function encodeStatisticsPayload(
    statItem: OsdStatItem,
    isVirtualMode: boolean,
    virtualMode: VirtualOsdMode | undefined,
) {
    if (isVirtualMode && virtualMode) {
        virtualMode.statisticsState[statItem.index] = statItem.enabled;
    }

    const buffer = new MspBuffer();
    buffer.push8(statItem.index);
    buffer.push16(statItem.enabled ? 1 : 0);
    buffer.push8(0);
    return buffer;
}

async function fetchOsdInfo(fcStore: FlightControllerStore) {
    if (CONFIGURATOR.virtualMode) {
        return undefined;
    }

    if (fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
        await MSP.promise(MSPCodes.MSP_OSD_CANVAS);
    }

    return MSP.promise(MSPCodes.MSP_OSD_CONFIG);
}

async function decodeOsdData(info: MspResponse | undefined) {
    if (!CONFIGURATOR.virtualMode) {
        await MSP.promise(MSPCodes.MSP_RX_CONFIG);
    }

    OSD.loadDisplayFields();
    OSD.chooseFields();

    if (CONFIGURATOR.virtualMode) {
        VirtualFC.setupVirtualOSD();

        if (legacyOsd.msp.decodeVirtual) {
            legacyOsd.msp.decodeVirtual();
        }
        return;
    }

    legacyOsd.msp.decode(info);
}

async function ensureDefaultFontLoaded() {
    if ((legacyFont.data?.characters?.length ?? 0) > 0) {
        return;
    }

    try {
        const response = await fetch("./resources/osd/2/default.mcm");
        const data = await response.text();
        FONT.parseMCMFontFile(data);
    } catch (fontError) {
        console.warn("Failed to load default OSD font:", fontError);
    }
}

export const useOsdStore = defineStore("osd", () => {
    // Core OSD data state
    const videoSystem = ref<number | null>(null);
    const unitMode = ref<number | null>(null);
    const alarms = ref<Record<string, OsdAlarm>>({});
    const statItems = ref<OsdStatItem[]>([]);
    const warnings = ref<OsdWarning[]>([]);
    const displayItems = ref<OsdDisplayItem[]>([]);
    const timers = ref<OsdTimer[]>([]);
    const osdProfiles = ref<OsdProfiles>({
        number: 1,
        selected: 0,
    });

    // OSD state flags
    const state = reactive({
        haveSomeOsd: false,
        haveMax7456Video: false,
        haveMax7456Configured: false,
        haveMax7456FontDeviceConfigured: false,
        isMax7456FontDeviceDetected: false,
        haveOsdFeature: false,
        isMspDevice: false,
        haveAirbotTheiaOsdDevice: false,
    });

    // Display size based on video system
    const displaySize = reactive({
        x: 30,
        y: 16,
        total: 480,
    });

    // OSD parameters
    const parameters = reactive<OsdParameters>({
        cameraFrameWidth: 24,
        cameraFrameHeight: 11,
        overlayRadioMode: 0,
    });

    // Currently selected preview profile
    const selectedPreviewProfile = ref(0);

    // Dirty state tracking
    function serializeOsdState(): string {
        return JSON.stringify({
            videoSystem: videoSystem.value,
            unitMode: unitMode.value,
            parameters: {
                cameraFrameWidth: parameters.cameraFrameWidth,
                cameraFrameHeight: parameters.cameraFrameHeight,
                overlayRadioMode: parameters.overlayRadioMode,
            },
            alarms: Object.fromEntries(
                Object.entries(alarms.value).map(([key, alarm]) => [key, { value: alarm.value }]),
            ),
            statItems: statItems.value.map(({ index, enabled }) => ({ index, enabled })),
            warnings: warnings.value.map(({ index, enabled }) => ({ index, enabled })),
            displayItems: displayItems.value.map(({ index, position, variant, isVisible }) => ({
                index,
                position,
                variant,
                isVisible: [...isVisible],
            })),
            timers: timers.value.map(({ index, src, precision, alarm }) => ({ index, src, precision, alarm })),
            osdProfiles: {
                number: osdProfiles.value.number,
                selected: osdProfiles.value.selected,
            },
        });
    }

    const { dirty, markClean: captureSnapshot, takeSnapshot } = useDirtyState(serializeOsdState);

    // Getters
    const numberOfProfiles = computed(() => osdProfiles.value.number || 1);

    const currentPreviewProfile = computed(() => selectedPreviewProfile.value);

    const isSupported = computed(() => Boolean(state.haveSomeOsd));

    // Actions
    function initData() {
        videoSystem.value = null;
        unitMode.value = null;
        alarms.value = {};
        statItems.value = [];
        warnings.value = [];
        displayItems.value = [];
        timers.value = [];
        osdProfiles.value = { number: 1, selected: 0 };
    }

    function updateDisplaySize() {
        const videoTypes: readonly (string | undefined)[] = OSD.constants.VIDEO_TYPES;
        let videoType = videoSystem.value === null ? undefined : videoTypes[videoSystem.value];
        if (videoType === "AUTO") {
            videoType = "PAL";
        }
        if (videoType) {
            // Read from OSD.data so the canvas size reported by the firmware via
            // MSP_OSD_CANVAS (e.g. DJI WTFOS/MSP-OSD custom sizes) is honoured,
            // rather than the built-in HD defaults.
            displaySize.x = legacyOsd.data.VIDEO_COLS[videoType] || 30;
            displaySize.y = legacyOsd.data.VIDEO_ROWS[videoType] || 16;
            displaySize.total = displaySize.x * displaySize.y;
        }
    }

    function setSelectedPreviewProfile(profile: number) {
        selectedPreviewProfile.value = profile;
    }

    // Update display item visibility for a specific profile
    function updateDisplayItemVisibility(itemIndex: number, profileIndex: number, visible: boolean) {
        if (displayItems.value[itemIndex]) {
            displayItems.value[itemIndex].isVisible[profileIndex] = visible;
        }
    }

    function refreshDisplayItemPreview(displayItem: OsdDisplayItem) {
        syncToLegacy();
        OSD.refreshDisplayItemPreview(legacyOsd.data, displayItem);
    }

    // Sync state to legacy OSD.data object for compatibility
    function syncToLegacy() {
        legacyOsd.data.video_system = videoSystem.value;
        legacyOsd.data.unit_mode = unitMode.value;
        legacyOsd.data.alarms = alarms.value;
        legacyOsd.data.statItems = statItems.value;
        legacyOsd.data.warnings = warnings.value;
        legacyOsd.data.displayItems = displayItems.value;
        legacyOsd.data.timers = timers.value;
        legacyOsd.data.osd_profiles = osdProfiles.value;
        legacyOsd.data.displaySize = displaySize;
        legacyOsd.data.state = state;
        legacyOsd.data.parameters = parameters;
    }

    function syncStoreFromDecodedOsdData() {
        videoSystem.value = legacyOsd.data.video_system;
        unitMode.value = legacyOsd.data.unit_mode;
        alarms.value = legacyOsd.data.alarms ? structuredClone(legacyOsd.data.alarms) : {};
        statItems.value = structuredClone(legacyOsd.data.statItems);
        warnings.value = structuredClone(legacyOsd.data.warnings);
        timers.value = structuredClone(legacyOsd.data.timers);
        displayItems.value = structuredClone(legacyOsd.data.displayItems);

        if (legacyOsd.data.parameters) {
            parameters.cameraFrameWidth = legacyOsd.data.parameters.cameraFrameWidth;
            parameters.cameraFrameHeight = legacyOsd.data.parameters.cameraFrameHeight;
            parameters.overlayRadioMode = legacyOsd.data.parameters.overlayRadioMode;
        }

        if (legacyOsd.data.osd_profiles) {
            osdProfiles.value = {
                number: legacyOsd.data.osd_profiles.number,
                selected: legacyOsd.data.osd_profiles.selected,
            };
        }

        if (legacyOsd.data.state) {
            Object.assign(state, legacyOsd.data.state);
        }

        updateDisplaySize();
    }

    const fetchOsdConfig = async () => {
        const fcStore = useFlightControllerStore();

        try {
            SYM.loadSymbols();
            FONT.initData();

            const info = await fetchOsdInfo(fcStore);
            await decodeOsdData(info);
            syncStoreFromDecodedOsdData();
            await ensureDefaultFontLoaded();
            captureSnapshot();
        } catch (e) {
            console.error("Failed to fetch OSD config", e);
            throw e;
        }
    };

    // MSP Helper methods
    const helpers = {
        pack: {
            position(displayItem: OsdDisplayItem) {
                const isVisible = displayItem.isVisible;
                const position = displayItem.position;
                const variant = displayItem.variant;

                let packed_visible = 0;
                for (let osd_profile = 0; osd_profile < numberOfProfiles.value; osd_profile++) {
                    packed_visible |= isVisible[osd_profile] ? OSD_CONSTANTS.VISIBLE << osd_profile : 0;
                }
                const variantSelected = variant << 14;
                const xpos = position % displaySize.x;
                const ypos = (position - xpos) / displaySize.x;

                return (
                    packed_visible | variantSelected | ((ypos & 0x001f) << 5) | ((xpos & 0x0020) << 5) | (xpos & 0x001f)
                );
            },
            timer(timer: OsdTimer) {
                return (timer.src & 0x0f) | ((timer.precision & 0x0f) << 4) | ((timer.alarm & 0xff) << 8);
            },
        },
    };

    function getAlarmValue(key: string) {
        return alarms.value[key]?.value ?? 0;
    }

    function pushAlarm8(result: MspBuffer, key: string) {
        result.push8(getAlarmValue(key));
    }

    function pushAlarm16(result: MspBuffer, key: string) {
        result.push16(getAlarmValue(key));
    }

    function encodeOther() {
        const fcStore = useFlightControllerStore();
        const apiVersion = fcStore.config.apiVersion;

        // Array.of constructs through `this`, so this is an MspBuffer; TS types the inherited static as T[].
        const result = MspBuffer.of(-1, videoSystem.value) as MspBuffer;
        if (state.haveOsdFeature) {
            // push8(null) already sent 0; spelled out for the type.
            result.push8(unitMode.value ?? 0);
            pushAlarm8(result, "rssi");
            pushAlarm16(result, "cap");

            result.push16(0); // This value is unused by the firmware with configurable timers
            pushAlarm16(result, "alt");

            let warningFlags = 0;
            // warnings is array of objects { enabled: bool }
            for (let i = 0; i < warnings.value.length; i++) {
                if (warnings.value[i].enabled) {
                    warningFlags = bit_set(warningFlags, i);
                }
            }

            if (CONFIGURATOR.virtualMode && legacyOsd.virtualMode) {
                legacyOsd.virtualMode.warningFlags = warningFlags;
            }

            result.push16(warningFlags);
            result.push32(warningFlags);

            result.push8(osdProfiles.value.selected + 1);

            result.push8(parameters.overlayRadioMode);

            result.push8(parameters.cameraFrameWidth);
            result.push8(parameters.cameraFrameHeight);

            if (semver.gte(apiVersion, API_VERSION_1_46)) {
                pushAlarm16(result, "link_quality");
            }

            if (semver.gte(apiVersion, API_VERSION_1_47)) {
                pushAlarm16(result, "rssi_dbm");
            }
        }
        return result;
    }

    function encodeLayout(displayItem: OsdDisplayItem) {
        if (CONFIGURATOR.virtualMode && legacyOsd.virtualMode) {
            legacyOsd.virtualMode.itemPositions[displayItem.index] = helpers.pack.position(displayItem);
        }

        const buffer = new MspBuffer();
        buffer.push8(displayItem.index);
        buffer.push16(helpers.pack.position(displayItem));
        return buffer;
    }

    function encodeTimer(timer: OsdTimer) {
        const virtualMode = legacyOsd.virtualMode;
        if (CONFIGURATOR.virtualMode && virtualMode) {
            if (!virtualMode.timerData[timer.index]) {
                virtualMode.timerData[timer.index] = {};
            }
            virtualMode.timerData[timer.index].src = timer.src;
            virtualMode.timerData[timer.index].precision = timer.precision;
            virtualMode.timerData[timer.index].alarm = timer.alarm;
        }

        const buffer = MspBuffer.of(-2, timer.index) as MspBuffer;
        buffer.push16(helpers.pack.timer(timer));
        return buffer;
    }

    /**
     * @param beforePersist runs after the config is written and before the EEPROM write that
     *   serialises it, which is where a CLI `set` has to sit
     */
    const saveAllConfig = async (beforePersist?: () => Promise<void>) => {
        const savedSnapshot = takeSnapshot();

        await MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeOther());

        for (const item of displayItems.value) {
            await MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeLayout(item));
        }

        for (const timer of timers.value) {
            await MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeTimer(timer));
        }

        for (const stat of statItems.value) {
            await MSP.promise(
                MSPCodes.MSP_SET_OSD_CONFIG,
                encodeStatisticsPayload(stat, CONFIGURATOR.virtualMode, legacyOsd.virtualMode),
            );
        }

        await beforePersist?.();

        await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
        captureSnapshot(savedSnapshot);
    };

    return {
        // State
        videoSystem,
        unitMode,
        alarms,
        statItems,
        warnings,
        displayItems,
        timers,
        osdProfiles,
        state,
        displaySize,
        parameters,
        selectedPreviewProfile,

        // Getters
        numberOfProfiles,
        currentPreviewProfile,
        isSupported,
        dirty,

        // Actions
        initData,
        updateDisplaySize,
        setSelectedPreviewProfile,
        updateDisplayItemVisibility,
        refreshDisplayItemPreview,
        syncToLegacy,
        fetchOsdConfig,
        saveAllConfig,
    };
});
