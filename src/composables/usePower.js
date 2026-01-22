import { reactive, ref, computed } from "vue";
import semver from "semver";
import { i18n } from "../js/localization";
import { tracking } from "../js/Analytics";
import { mspHelper } from "../js/msp/MSPHelper";
import { API_VERSION_1_44 } from "../js/data_storage";
import FC from "../js/fc";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";

export function usePower() {
    const supported = computed(() => {
        return FC.CONFIG?.apiVersion && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44);
    });
    const analyticsChanges = reactive({});
    const batteryState = reactive({
        cellCount: 0,
        voltage: 0,
        mAhDrawn: 0,
        amperage: 0,
    });
    const voltageMeters = reactive([]);
    const currentMeters = reactive([]);
    const batteryConfig = reactive({
        voltageMeterSource: 0,
        currentMeterSource: 0,
        vbatmincellvoltage: 0,
        vbatmaxcellvoltage: 0,
        vbatwarningcellvoltage: 0,
        capacity: 0,
    });
    const voltageConfigs = reactive([]);
    const currentConfigs = reactive([]);

    // Calibration state
    const sourceschanged = ref(false);
    const vbatscalechanged = ref(false);
    const amperagescalechanged = ref(false);
    const vbatnewscale = ref(0);
    const amperagenewscale = ref(0);
    const vbatcalibrationValue = ref(0);
    const amperagecalibrationValue = ref(0);

    // Visibility computed properties
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
        const haveFc = FC.CONFIG.boardType === 0 || FC.CONFIG.boardType === 2;
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
        const haveFc = FC.CONFIG.boardType === 0 || FC.CONFIG.boardType === 2;
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
    const getVoltageMeterLabel = (id) => {
        return i18n.getMessage(`powerVoltageId${id}`);
    };

    // Get amperage meter label
    const getAmperageMeterLabel = (id) => {
        return i18n.getMessage(`powerAmperageId${id}`);
    };

    // Check if voltage meter should be visible
    const isVoltageMeterVisible = (meter) => {
        return (
            (batteryConfig.voltageMeterSource === 1 && meter.id === 10) ||
            (batteryConfig.voltageMeterSource === 2 && meter.id >= 50)
        );
    };

    // Check if current meter should be visible
    const isCurrentMeterVisible = (meter) => {
        return (
            (batteryConfig.currentMeterSource === 1 && meter.id === 10) ||
            (batteryConfig.currentMeterSource === 2 && meter.id === 80) ||
            (batteryConfig.currentMeterSource === 3 && meter.id >= 50 && meter.id < 80)
        );
    };

    // Load data from flight controller
    const loadData = async () => {
        try {
            await MSP.promise(MSPCodes.MSP_STATUS);
            await MSP.promise(MSPCodes.MSP_VOLTAGE_METERS);
            await MSP.promise(MSPCodes.MSP_CURRENT_METERS);
            await MSP.promise(MSPCodes.MSP_CURRENT_METER_CONFIG);
            await MSP.promise(MSPCodes.MSP_VOLTAGE_METER_CONFIG);
            await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
            await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);

            // Update reactive state
            updateStateFromFC();
        } catch (error) {
            console.error("Error loading power data:", error);
        }
    };

    // Update reactive state from FC data
    const updateStateFromFC = () => {
        // Battery config
        Object.assign(batteryConfig, {
            voltageMeterSource: FC.BATTERY_CONFIG.voltageMeterSource,
            currentMeterSource: FC.BATTERY_CONFIG.currentMeterSource,
            vbatmincellvoltage: FC.BATTERY_CONFIG.vbatmincellvoltage,
            vbatmaxcellvoltage: FC.BATTERY_CONFIG.vbatmaxcellvoltage,
            vbatwarningcellvoltage: FC.BATTERY_CONFIG.vbatwarningcellvoltage,
            capacity: FC.BATTERY_CONFIG.capacity,
        });

        // Battery state
        Object.assign(batteryState, {
            cellCount: FC.BATTERY_STATE.cellCount,
            voltage: FC.BATTERY_STATE.voltage,
            mAhDrawn: FC.BATTERY_STATE.mAhDrawn,
            amperage: FC.BATTERY_STATE.amperage,
        });

        // Voltage meters
        voltageMeters.length = 0;
        FC.VOLTAGE_METERS.forEach((meter) => {
            voltageMeters.push({ ...meter });
        });

        // Current meters
        currentMeters.length = 0;
        FC.CURRENT_METERS.forEach((meter) => {
            currentMeters.push({ ...meter });
        });

        // Voltage configs
        voltageConfigs.length = 0;
        FC.VOLTAGE_METER_CONFIGS.forEach((config) => {
            voltageConfigs.push({ ...config });
        });

        // Current configs
        currentConfigs.length = 0;
        FC.CURRENT_METER_CONFIGS.forEach((config) => {
            currentConfigs.push({ ...config });
        });
    };

    // Update live data (polling)
    const updateLiveData = async () => {
        try {
            await MSP.promise(MSPCodes.MSP_VOLTAGE_METERS);
            FC.VOLTAGE_METERS.forEach((meter, i) => {
                if (voltageMeters[i]) {
                    voltageMeters[i].voltage = meter.voltage;
                }
            });

            await MSP.promise(MSPCodes.MSP_CURRENT_METERS);
            FC.CURRENT_METERS.forEach((meter, i) => {
                if (currentMeters[i]) {
                    currentMeters[i].amperage = meter.amperage;
                }
            });

            await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
            Object.assign(batteryState, {
                cellCount: FC.BATTERY_STATE.cellCount,
                voltage: FC.BATTERY_STATE.voltage,
                mAhDrawn: FC.BATTERY_STATE.mAhDrawn,
                amperage: FC.BATTERY_STATE.amperage,
            });
        } catch (error) {
            console.error("Error updating live data:", error);
        }
    };

    // Handle voltage meter source change
    const onVoltageMeterSourceChange = (value) => {
        batteryConfig.voltageMeterSource = Number.parseInt(value, 10);
        FC.BATTERY_CONFIG.voltageMeterSource = batteryConfig.voltageMeterSource;
        sourceschanged.value = true;
    };

    // Handle current meter source change
    const onCurrentMeterSourceChange = (value) => {
        batteryConfig.currentMeterSource = Number.parseInt(value, 10);
        FC.BATTERY_CONFIG.currentMeterSource = batteryConfig.currentMeterSource;
        sourceschanged.value = true;
    };

    // Handle voltage scale change
    const onVoltageScaleChange = (index, value) => {
        const originalValue = FC.VOLTAGE_METER_CONFIGS[index].vbatscale;
        if (value !== originalValue) {
            analyticsChanges["PowerVBatUpdated"] = value;
        }
    };

    // Handle amperage scale change
    const onAmperageScaleChange = (index, value) => {
        const originalValue = FC.CURRENT_METER_CONFIGS[index].scale;
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

        const vbatcalibration = Number.parseFloat(vbatcalibrationValue.value);
        if (vbatcalibration === 0) {
            return false;
        }

        const newScale = Math.round(voltageConfigs[0].vbatscale * (vbatcalibration / voltageMeters[0].voltage));
        if (newScale < 10 || newScale > 255) {
            return false;
        }

        vbatnewscale.value = newScale;
        voltageConfigs[0].vbatscale = newScale;
        FC.VOLTAGE_METER_CONFIGS[0].vbatscale = newScale;
        return true;
    };

    // Helper function to calibrate amperage
    const calibrateAmperage = () => {
        const ampsource = batteryConfig.currentMeterSource;
        if (ampsource !== 1 && ampsource !== 2) {
            return false;
        }

        const amperagecalibration = Number.parseFloat(amperagecalibrationValue.value);
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
        FC.CURRENT_METER_CONFIGS[ampsource - 1].scale = newScale;
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

    // Save configuration
    const saveConfig = async (callback) => {
        // Update FC data from reactive state
        FC.BATTERY_CONFIG.voltageMeterSource = batteryConfig.voltageMeterSource;
        FC.BATTERY_CONFIG.currentMeterSource = batteryConfig.currentMeterSource;
        FC.BATTERY_CONFIG.vbatmincellvoltage = batteryConfig.vbatmincellvoltage;
        FC.BATTERY_CONFIG.vbatmaxcellvoltage = batteryConfig.vbatmaxcellvoltage;
        FC.BATTERY_CONFIG.vbatwarningcellvoltage = batteryConfig.vbatwarningcellvoltage;
        FC.BATTERY_CONFIG.capacity = batteryConfig.capacity;

        voltageConfigs.forEach((config, index) => {
            FC.VOLTAGE_METER_CONFIGS[index].vbatscale = config.vbatscale;
            FC.VOLTAGE_METER_CONFIGS[index].vbatresdivval = config.vbatresdivval;
            FC.VOLTAGE_METER_CONFIGS[index].vbatresdivmultiplier = config.vbatresdivmultiplier;
        });

        currentConfigs.forEach((config, index) => {
            FC.CURRENT_METER_CONFIGS[index].scale = config.scale;
            FC.CURRENT_METER_CONFIGS[index].offset = config.offset;
        });

        tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, analyticsChanges, "power");

        // Clear analytics changes
        for (const key in analyticsChanges) {
            delete analyticsChanges[key];
        }

        try {
            await MSP.promise(MSPCodes.MSP_SET_BATTERY_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BATTERY_CONFIG));
            await mspHelper.sendVoltageConfig();
            await mspHelper.sendCurrentConfig();
            await mspHelper.writeConfiguration(false);

            if (callback) {
                callback();
            }
        } catch (error) {
            console.error("Error saving power configuration:", error);
        }
    };

    return {
        supported,
        batteryState,
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
    };
}
