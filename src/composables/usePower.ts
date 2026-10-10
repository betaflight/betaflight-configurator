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

import { reactive, ref, computed, watch } from "vue";
import semver from "semver";
import { i18n } from "../js/localization";
import { getTracking } from "../js/Analytics";
import { mspHelper } from "../js/msp/MSPHelper";
import { API_VERSION_1_44, API_VERSION_1_48 } from "../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";
import MSP from "../js/msp";
import MSPCodes, { MSP2TextType } from "../js/msp/MSPCodes";
import { useConnectionStore } from "../stores/connection";
import { gui_log } from "../js/gui_log";
import { isMspCancelled } from "../js/msp/mspErrors";
import { useDirtyState } from "./useDirtyState";
import { useReboot } from "./useReboot";
import type { CurrentMeter, CurrentMeterConfig, VoltageMeter, VoltageMeterConfig } from "../stores/fc.types";
import { pauseInterval, resumeInterval } from "../js/timers";

export function usePower() {
    const fcStore = useFlightControllerStore();

    const supported = computed(() => {
        return fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_44);
    });
    const hasBatteryProfiles = computed(() => {
        if (!fcStore.config?.apiVersion || !semver.gte(fcStore.config.apiVersion, API_VERSION_1_48)) {
            return false;
        }
        // Custom firmware builds may omit multi-profile support while still reporting API 1.48+; hide UI when the FC reports no profiles.
        return (fcStore.config.numberOfBatteryProfiles || 0) > 0;
    });
    const activeBatteryProfile = ref(0);
    const batteryProfileName = ref("");
    // Guards for the TX-driven battery-profile sync (see watcher below).
    const isLoading = ref(false);
    let syncingFromFc = false;
    const analyticsChanges = reactive<Record<string, unknown>>({});
    const batteryState = reactive({
        cellCount: 0,
        voltage: 0,
        mAhDrawn: 0,
        amperage: 0,
    });
    const voltageMeters = reactive<VoltageMeter[]>([]);
    const currentMeters = reactive<CurrentMeter[]>([]);
    const batteryConfig = reactive({
        voltageMeterSource: 0,
        currentMeterSource: 0,
        vbatmincellvoltage: 0,
        vbatmaxcellvoltage: 0,
        vbatwarningcellvoltage: 0,
        capacity: 0,
    });
    const voltageConfigs = reactive<VoltageMeterConfig[]>([]);
    const currentConfigs = reactive<CurrentMeterConfig[]>([]);

    const buildPowerConfigSnapshot = () => ({
        voltageMeterSource: batteryConfig.voltageMeterSource,
        currentMeterSource: batteryConfig.currentMeterSource,
        vbatmincellvoltage: batteryConfig.vbatmincellvoltage,
        vbatmaxcellvoltage: batteryConfig.vbatmaxcellvoltage,
        vbatwarningcellvoltage: batteryConfig.vbatwarningcellvoltage,
        capacity: batteryConfig.capacity,
        batteryProfileName: batteryProfileName.value,
        voltageConfigs: voltageConfigs.map((c) => ({
            vbatscale: c.vbatscale,
            vbatresdivval: c.vbatresdivval,
            vbatresdivmultiplier: c.vbatresdivmultiplier,
        })),
        currentConfigs: currentConfigs.map((c) => ({
            scale: c.scale,
            offset: c.offset,
        })),
    });

    /** Serialized tab state for dirty comparison. */
    const serializePowerConfig = (): string => JSON.stringify(buildPowerConfigSnapshot());

    const { dirty, markClean, takeSnapshot } = useDirtyState(serializePowerConfig);

    // Calibration state
    const sourceschanged = ref(false);
    const vbatscalechanged = ref(false);
    const amperagescalechanged = ref(false);
    const vbatnewscale = ref(0);
    const amperagenewscale = ref(0);
    const vbatcalibrationValue = ref(0);
    const amperagecalibrationValue = ref(0);

    // Visibility computed properties
    const powerDraw = computed(() => batteryState.voltage * batteryState.amperage);
    const voltageDrop = computed(() => {
        if (batteryState.cellCount <= 0) {
            return 0;
        }
        return batteryConfig.vbatmaxcellvoltage * batteryState.cellCount - batteryState.voltage;
    });

    const showVoltageConfiguration = computed(() => batteryConfig.voltageMeterSource !== 0);
    const showAmperageConfiguration = computed(() => batteryConfig.currentMeterSource !== 0);
    const showCalibration = computed(() => {
        return (
            batteryConfig.voltageMeterSource === 1 ||
            batteryConfig.currentMeterSource === 1 ||
            batteryConfig.currentMeterSource === 2
        );
    });

    // Battery meter types
    const batteryMeterTypes = computed(() => {
        const haveFc = fcStore.config.boardType === 0 || fcStore.config.boardType === 2;
        const types = [
            i18n.getMessage("powerBatteryVoltageMeterTypeNone"),
            i18n.getMessage("powerBatteryVoltageMeterTypeAdc"),
        ];
        if (haveFc) {
            types.push(i18n.getMessage("powerBatteryVoltageMeterTypeEsc"));
        }
        return types;
    });

    // Current meter types
    const currentMeterTypes = computed(() => {
        const haveFc = fcStore.config.boardType === 0 || fcStore.config.boardType === 2;
        const types = [
            i18n.getMessage("powerBatteryCurrentMeterTypeNone"),
            i18n.getMessage("powerBatteryCurrentMeterTypeAdc"),
        ];
        if (haveFc) {
            types.push(
                i18n.getMessage("powerBatteryCurrentMeterTypeVirtual"),
                i18n.getMessage("powerBatteryCurrentMeterTypeEsc"),
                i18n.getMessage("powerBatteryCurrentMeterTypeMsp"),
            );
        }
        return types;
    });

    // Get voltage meter label
    const getVoltageMeterLabel = (id: number) => {
        return i18n.getMessage(`powerVoltageId${id}`);
    };

    // Get amperage meter label
    const getAmperageMeterLabel = (id: number) => {
        return i18n.getMessage(`powerAmperageId${id}`);
    };

    // Check if voltage meter should be visible
    const isVoltageMeterVisible = (meter: VoltageMeter) => {
        return (
            (batteryConfig.voltageMeterSource === 1 && meter.id === 10) ||
            (batteryConfig.voltageMeterSource === 2 && meter.id >= 50)
        );
    };

    // Check if current meter should be visible
    const isCurrentMeterVisible = (meter: CurrentMeter) => {
        return (
            (batteryConfig.currentMeterSource === 1 && meter.id === 10) ||
            (batteryConfig.currentMeterSource === 2 && meter.id === 80) ||
            (batteryConfig.currentMeterSource === 3 && meter.id >= 50 && meter.id < 80)
        );
    };

    // Load battery profile name for the active profile from the flight controller
    const loadBatteryProfileName = async () => {
        if (!hasBatteryProfiles.value) {
            return;
        }

        await MSP.promise(
            MSPCodes.MSP2_GET_TEXT,
            mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.BATTERY_PROFILE_NAME),
        );

        activeBatteryProfile.value = fcStore.config.batteryProfile;
        batteryProfileName.value = fcStore.config.batteryProfileNames[fcStore.config.batteryProfile] || "";
    };

    // Change active battery profile
    const changeBatteryProfile = async (profileIndex: number) => {
        const connectionStore = useConnectionStore();
        const previousProfile = activeBatteryProfile.value;
        const previousProfileName = batteryProfileName.value;

        try {
            // Suppress the TX-driven sync watcher while we apply our own change
            isLoading.value = true;
            // Pause global and local polling to prevent MSP_STATUS_EX from
            // overwriting fcStore.config.batteryProfile with stale data during the switch
            connectionStore.pauseLiveData();
            pauseInterval("power_data_pull_slow");

            if (connectionStore.virtualMode) {
                fcStore.config.batteryProfile = profileIndex;
                activeBatteryProfile.value = profileIndex;
                await loadBatteryProfileName();
                updateStateFromFC();
                return;
            }

            const BATTERYPROFILE_MASK = 0x40;
            await MSP.promise(MSPCodes.MSP_SELECT_SETTING, [profileIndex | BATTERYPROFILE_MASK]);
            await MSP.promise(MSPCodes.MSP_STATUS_EX);
            activeBatteryProfile.value = fcStore.config.batteryProfile;
            await loadBatteryProfileName();
            await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);
            updateStateFromFC();
        } catch (error) {
            // Best-effort: resync UI with actual FC state in case the
            // profile switch partially succeeded on the FC side
            if (connectionStore.virtualMode) {
                fcStore.config.batteryProfile = previousProfile;
                activeBatteryProfile.value = previousProfile;
                batteryProfileName.value = previousProfileName;
                throw error;
            }

            try {
                await MSP.promise(MSPCodes.MSP_STATUS_EX);
                activeBatteryProfile.value = fcStore.config.batteryProfile;
                await loadBatteryProfileName();
                await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);
                updateStateFromFC();
            } catch {
                // If resync also fails, restore previous local values
                activeBatteryProfile.value = previousProfile;
                batteryProfileName.value = previousProfileName;
            }
            throw error;
        } finally {
            isLoading.value = false;
            connectionStore.resumeLiveData();
            resumeInterval("power_data_pull_slow");
        }
    };

    // Reflect TX-driven battery-profile changes in the UI. The global live-status poller
    // (serial_backend.js) refreshes fcStore.config.batteryProfile via MSP_STATUS_EX every 250ms;
    // an adjustment switch on the TX can change the active profile out from under the UI.
    // Reload when that happens — but never during our own change (isLoading), an in-flight
    // load, virtual mode, or while the form has unsaved edits. Mirrors the PID-tuning fix (issue #5230).
    const syncBatteryProfileFromFc = async () => {
        if (
            useConnectionStore().virtualMode ||
            !hasBatteryProfiles.value ||
            isLoading.value ||
            syncingFromFc ||
            dirty.value
        ) {
            return;
        }

        syncingFromFc = true;
        try {
            // Only announce the profile the FC actually sent. The load resolves either way,
            // so without this a cancelled or failed read still logged a successful sync.
            if (await loadData()) {
                gui_log(i18n.getMessage("powerReceivedBatteryProfile", [fcStore.config.batteryProfile + 1]));
            }
        } finally {
            syncingFromFc = false;
        }
    };

    watch(
        () => fcStore.config.batteryProfile,
        (newValue) => {
            if (newValue !== activeBatteryProfile.value) {
                void syncBatteryProfileFromFc();
            }
        },
    );

    /** Read the power configuration from the FC into reactive state; true when the data actually arrived. */
    const loadData = async (): Promise<boolean> => {
        isLoading.value = true;
        try {
            await MSP.promise(MSPCodes.MSP_STATUS_EX);
            await MSP.promise(MSPCodes.MSP_VOLTAGE_METERS);
            await MSP.promise(MSPCodes.MSP_CURRENT_METERS);
            await MSP.promise(MSPCodes.MSP_CURRENT_METER_CONFIG);
            await MSP.promise(MSPCodes.MSP_VOLTAGE_METER_CONFIG);
            await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
            await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);

            // Load battery profiles if supported
            await loadBatteryProfileName();

            // Update reactive state
            updateStateFromFC();
            return true;
        } catch (error) {
            // Switching away mid-load clears the MSP queue and cancels the chain. Expected —
            // the tab is being torn down — so don't report it, same as the live poller below.
            if (!isMspCancelled(error)) {
                console.error("Error loading power data:", error);
            }
            return false;
        } finally {
            isLoading.value = false;
        }
    };

    // Update reactive state from FC data
    const updateStateFromFC = () => {
        // Battery config
        Object.assign(batteryConfig, {
            voltageMeterSource: fcStore.batteryConfig.voltageMeterSource,
            currentMeterSource: fcStore.batteryConfig.currentMeterSource,
            vbatmincellvoltage: fcStore.batteryConfig.vbatmincellvoltage,
            vbatmaxcellvoltage: fcStore.batteryConfig.vbatmaxcellvoltage,
            vbatwarningcellvoltage: fcStore.batteryConfig.vbatwarningcellvoltage,
            capacity: fcStore.batteryConfig.capacity,
        });

        // Battery state
        Object.assign(batteryState, {
            cellCount: fcStore.batteryState.cellCount,
            voltage: fcStore.batteryState.voltage,
            mAhDrawn: fcStore.batteryState.mAhDrawn,
            amperage: fcStore.batteryState.amperage,
        });

        // Voltage meters
        voltageMeters.length = 0;
        fcStore.voltageMeters.forEach((meter) => {
            voltageMeters.push({ ...meter });
        });

        // Current meters
        currentMeters.length = 0;
        fcStore.currentMeters.forEach((meter) => {
            currentMeters.push({ ...meter });
        });

        // Voltage configs
        voltageConfigs.length = 0;
        fcStore.voltageMeterConfigs.forEach((config) => {
            voltageConfigs.push({ ...config });
        });

        // Current configs
        currentConfigs.length = 0;
        fcStore.currentMeterConfigs.forEach((config) => {
            currentConfigs.push({ ...config });
        });

        markClean();
    };

    // Update live data (polling)
    const updateLiveData = async () => {
        try {
            await MSP.promise(MSPCodes.MSP_VOLTAGE_METERS);
            fcStore.voltageMeters.forEach((meter, i) => {
                if (voltageMeters[i]) {
                    voltageMeters[i].voltage = meter.voltage;
                }
            });

            await MSP.promise(MSPCodes.MSP_CURRENT_METERS);
            fcStore.currentMeters.forEach((meter, i) => {
                if (currentMeters[i]) {
                    currentMeters[i].amperage = meter.amperage;
                }
            });

            await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
            Object.assign(batteryState, {
                cellCount: fcStore.batteryState.cellCount,
                voltage: fcStore.batteryState.voltage,
                mAhDrawn: fcStore.batteryState.mAhDrawn,
                amperage: fcStore.batteryState.amperage,
            });
        } catch (error) {
            // Same lifecycle race as the main live-data poller: switching away from the Power tab
            // (or a disconnect) clears the MSP queue and cancels the in-flight poll. Expected — the
            // interval is torn down on tab switch anyway — so don't log the cancellation.
            if (isMspCancelled(error)) {
                return;
            }
            console.error("Error updating live data:", error);
        }
    };

    // Handle voltage meter source change
    const onVoltageMeterSourceChange = (value: string | number) => {
        batteryConfig.voltageMeterSource = Number.parseInt(String(value), 10);
        fcStore.batteryConfig.voltageMeterSource = batteryConfig.voltageMeterSource;
        sourceschanged.value = true;
    };

    // Handle current meter source change
    const onCurrentMeterSourceChange = (value: string | number) => {
        batteryConfig.currentMeterSource = Number.parseInt(String(value), 10);
        fcStore.batteryConfig.currentMeterSource = batteryConfig.currentMeterSource;
        sourceschanged.value = true;
    };

    // Handle voltage scale change
    const onVoltageScaleChange = (index: number, value: number) => {
        const originalValue = fcStore.voltageMeterConfigs[index].vbatscale;
        if (value !== originalValue) {
            analyticsChanges["PowerVBatUpdated"] = value;
        }
    };

    // Handle amperage scale change
    const onAmperageScaleChange = (index: number, value: number) => {
        const originalValue = fcStore.currentMeterConfigs[index].scale;
        if (value !== originalValue) {
            analyticsChanges["PowerAmperageUpdated"] = value;
        }
    };

    // Check calibration visibility
    const getCalibrationVisibility = () => {
        const showVbat = batteryConfig.voltageMeterSource === 1 && batteryState.voltage > 0.1;
        const showAmperage =
            (batteryConfig.currentMeterSource === 1 || batteryConfig.currentMeterSource === 2) &&
            batteryState.amperage > 0.1;
        const showCalibrate = batteryState.cellCount > 0;
        const showNoCalib = batteryState.cellCount === 0;
        const showSrcChange = sourceschanged.value;

        return {
            showVbat: showVbat && !showSrcChange,
            showAmperage: showAmperage && !showSrcChange,
            showCalibrate: showCalibrate && !showSrcChange,
            showNoCalib: showNoCalib && !showSrcChange,
            showSrcChange,
        };
    };

    // Helper function to calibrate voltage
    const calibrateVoltage = () => {
        if (batteryConfig.voltageMeterSource !== 1) {
            return false;
        }

        const vbatcalibration = Number.parseFloat(String(vbatcalibrationValue.value));
        if (vbatcalibration === 0) {
            return false;
        }

        const newScale = Math.round(voltageConfigs[0].vbatscale * (vbatcalibration / voltageMeters[0].voltage));
        if (newScale < 10 || newScale > 255) {
            return false;
        }

        vbatnewscale.value = newScale;
        voltageConfigs[0].vbatscale = newScale;
        fcStore.voltageMeterConfigs[0].vbatscale = newScale;
        return true;
    };

    // Helper function to calibrate amperage
    const calibrateAmperage = () => {
        const ampsource = batteryConfig.currentMeterSource;
        if (ampsource !== 1 && ampsource !== 2) {
            return false;
        }

        const amperagecalibration = Number.parseFloat(String(amperagecalibrationValue.value));
        const amperageoffset = currentConfigs[ampsource - 1].offset / 1000;

        if (amperagecalibration === 0) {
            return false;
        }

        if (currentMeters[ampsource - 1].amperage === amperageoffset || amperagecalibration === amperageoffset) {
            return false;
        }

        const newScale = Math.round(
            currentConfigs[ampsource - 1].scale *
                ((currentMeters[ampsource - 1].amperage - amperageoffset) / (amperagecalibration - amperageoffset)),
        );

        if (newScale <= -16000 || newScale >= 16000 || newScale === 0) {
            return false;
        }

        amperagenewscale.value = newScale;
        currentConfigs[ampsource - 1].scale = newScale;
        fcStore.currentMeterConfigs[ampsource - 1].scale = newScale;
        return true;
    };

    // Calibrate
    const calibrate = () => {
        vbatscalechanged.value = false;
        amperagescalechanged.value = false;

        vbatscalechanged.value = calibrateVoltage();
        amperagescalechanged.value = calibrateAmperage();
    };

    // Apply calibration
    const applyCalibration = () => {
        if (vbatscalechanged.value) {
            analyticsChanges["PowerVBatUpdated"] = "Calibrated";
        }

        if (amperagescalechanged.value) {
            analyticsChanges["PowerAmperageUpdated"] = "Calibrated";
        }
    };

    // Discard calibration
    const discardCalibration = () => {
        // Reset calibration changes
        vbatscalechanged.value = false;
        amperagescalechanged.value = false;
    };

    // Save configuration. Error/cancellation handling and the isSaving state are owned by the
    // caller's runSave() (useSaving); this only marshals data and issues the MSP writes.
    const saveConfig = async () => {
        const { saveToEeprom } = useReboot();

        const savedSnapshot = takeSnapshot();

        // Update FC data from reactive state
        fcStore.batteryConfig.voltageMeterSource = batteryConfig.voltageMeterSource;
        fcStore.batteryConfig.currentMeterSource = batteryConfig.currentMeterSource;
        fcStore.batteryConfig.vbatmincellvoltage = batteryConfig.vbatmincellvoltage;
        fcStore.batteryConfig.vbatmaxcellvoltage = batteryConfig.vbatmaxcellvoltage;
        fcStore.batteryConfig.vbatwarningcellvoltage = batteryConfig.vbatwarningcellvoltage;
        fcStore.batteryConfig.capacity = batteryConfig.capacity;

        voltageConfigs.forEach((config, index) => {
            fcStore.voltageMeterConfigs[index].vbatscale = config.vbatscale;
            fcStore.voltageMeterConfigs[index].vbatresdivval = config.vbatresdivval;
            fcStore.voltageMeterConfigs[index].vbatresdivmultiplier = config.vbatresdivmultiplier;
        });

        currentConfigs.forEach((config, index) => {
            fcStore.currentMeterConfigs[index].scale = config.scale;
            fcStore.currentMeterConfigs[index].offset = config.offset;
        });

        await MSP.promise(MSPCodes.MSP_SET_BATTERY_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BATTERY_CONFIG));

        // Save battery profile name if supported
        if (hasBatteryProfiles.value) {
            fcStore.config.batteryProfileNames[fcStore.config.batteryProfile] = batteryProfileName.value;
            await MSP.promise(
                MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.BATTERY_PROFILE_NAME),
            );
        }

        await mspHelper.sendVoltageConfig();
        await mspHelper.sendCurrentConfig();

        await saveToEeprom();

        // Only after a successful persist: record analytics and refresh the dirty baseline.
        const tracking = getTracking();
        tracking?.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, analyticsChanges, "power");
        for (const key in analyticsChanges) {
            delete analyticsChanges[key];
        }
        markClean(savedSnapshot);
    };

    return {
        supported,
        hasBatteryProfiles,
        activeBatteryProfile,
        batteryProfileName,
        batteryState,
        powerDraw,
        voltageDrop,
        voltageMeters,
        currentMeters,
        batteryConfig,
        voltageConfigs,
        currentConfigs,
        showVoltageConfiguration,
        showAmperageConfiguration,
        showCalibration,
        batteryMeterTypes,
        currentMeterTypes,
        getVoltageMeterLabel,
        getAmperageMeterLabel,
        isVoltageMeterVisible,
        isCurrentMeterVisible,
        loadData,
        loadBatteryProfileName,
        changeBatteryProfile,
        updateLiveData,
        onVoltageMeterSourceChange,
        onCurrentMeterSourceChange,
        onVoltageScaleChange,
        onAmperageScaleChange,
        getCalibrationVisibility,
        calibrate,
        applyCalibration,
        discardCalibration,
        saveConfig,
        vbatcalibrationValue,
        amperagecalibrationValue,
        vbatscalechanged,
        amperagescalechanged,
        vbatnewscale,
        amperagenewscale,
        sourceschanged,
        dirty,
    };
}
