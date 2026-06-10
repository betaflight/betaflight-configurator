import { ref, reactive, computed } from "vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_48 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const PIP_VALUES = [1000, 1200, 1500, 1800, 2000];

// Wire u8 values whose firmware dispatch entry is ADJUSTMENT_MODE_SELECT
// (i.e. no center/scale).
//
// IMPORTANT: these indices are NOT positions in the adjustmentFunction_e enum.
// Firmware looks up the configured u8 via:
//   defaultAdjustmentConfigs[adjustmentConfig - 1]   (rc_adjustments.c)
// and that table was never extended to include the per-axis RC rates / expo
// (enum values 25-28: ROLL_RC_RATE, PITCH_RC_RATE, ROLL_RC_EXPO, PITCH_RC_EXPO),
// so dispatch table indices shift up by 4 from enum value 25 onward. The
// configurator's adjustmentsFunctionN locale labels reflect the dispatch
// behaviour, not the enum, which is what users actually experience on hardware.
//
// What this set means in terms of what the FC actually fires for each u8:
//   12: RATE_PROFILE
//   24: HORIZON_STRENGTH
//   25: PID_AUDIO
//   29: OSD_PROFILE
//   30: LED_PROFILE
//   31: LED_DIMMER
//   32: SIMPLIFIED_MASTER_MULTIPLIER
//   33: BATTERY_PROFILE
const SELECT_MODE_FUNCTIONS = new Set([12, 24, 25, 29, 30, 31, 32, 33]);

export function getAdjustmentMode(adjustmentFunction, adjustmentCenter) {
    if (SELECT_MODE_FUNCTIONS.has(adjustmentFunction)) {
        return "selection";
    }
    return adjustmentCenter > 0 ? "absolute" : "step";
}

export function useAdjustmentsData(adjustments, t) {
    const fcStore = useFlightControllerStore();

    const auxChannelCount = ref(0);
    const pipValues = PIP_VALUES;

    const auxChannelOptions = computed(() => {
        const options = [];
        for (let i = 0; i < auxChannelCount.value; i++) {
            options.push({ value: i, label: `AUX ${i + 1}` });
        }
        return options;
    });

    const adjustmentFunctionCount = computed(() => {
        return fcStore.isApiVersionSupported(API_VERSION_1_48) ? 34 : 33;
    });

    const functionOptions = computed(() => {
        const options = [];
        for (let i = 0; i < adjustmentFunctionCount.value; i++) {
            options.push({
                value: i,
                label: t(`adjustmentsFunction${i}`),
            });
        }
        return options;
    });

    const sortedFunctions = computed(() => {
        const opts = [...functionOptions.value];
        const first = opts[0];
        const rest = opts.slice(1).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
        return [first, ...rest];
    });

    const stepModeOptions = computed(() => [
        { value: "step", label: t("adjustmentsModeStep") },
        { value: "absolute", label: t("adjustmentsModeAbsolute") },
    ]);

    const channelPercent = (value) => {
        if (value === undefined || value === null || Number.isNaN(value)) {
            return 50;
        }
        const clamped = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, value));
        return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
    };

    const onEnableChange = (adjustment) => {
        if (adjustment.enabled) {
            if (adjustment.range.start === adjustment.range.end) {
                adjustment.range.start = 1300;
                adjustment.range.end = 1700;
            }
        } else {
            adjustment.range.start = 900;
            adjustment.range.end = 900;
        }
    };

    const onModeChange = (adjustment, newMode) => {
        if (newMode === "step") {
            adjustment.adjustmentCenter = 0;
            adjustment.adjustmentScale = 0;
        } else if (newMode === "absolute") {
            if (adjustment.adjustmentCenter === 0) {
                adjustment.adjustmentCenter = 50;
            }
        }
    };

    const onFunctionChange = (adjustment) => {
        if (SELECT_MODE_FUNCTIONS.has(adjustment.adjustmentFunction)) {
            adjustment.adjustmentCenter = 0;
            adjustment.adjustmentScale = 0;
        }
    };

    const sendMsp = (code) =>
        new Promise((resolve) => {
            MSP.send_message(code, false, false, resolve);
        });

    const loadMSPData = async () => {
        await sendMsp(MSPCodes.MSP_BOXNAMES);
        await sendMsp(MSPCodes.MSP_ADJUSTMENT_RANGES);
        await sendMsp(MSPCodes.MSP_BOXIDS);
        await sendMsp(MSPCodes.MSP_RC);
    };

    const initializeAdjustments = () => {
        auxChannelCount.value = Math.max(0, fcStore.rc.active_channels - 4);

        adjustments.splice(0, adjustments.length);

        fcStore.adjustmentRanges.forEach((range) => {
            const isEnabled = range.range?.start !== range.range?.end;
            const adj = reactive({
                slotIndex: range.slotIndex ?? 0,
                auxChannelIndex: range.auxChannelIndex ?? 0,
                range: {
                    start: range.range?.start ?? 900,
                    end: range.range?.end ?? 900,
                },
                adjustmentFunction: range.adjustmentFunction ?? 0,
                auxSwitchChannelIndex: range.auxSwitchChannelIndex ?? 0,
                adjustmentCenter: range.adjustmentCenter ?? 0,
                adjustmentScale: range.adjustmentScale ?? 0,
                enabled: isEnabled,
                get mode() {
                    return getAdjustmentMode(this.adjustmentFunction, this.adjustmentCenter);
                },
                get rangeArray() {
                    return [this.range.start, this.range.end];
                },
                set rangeArray([start, end]) {
                    this.range.start = start;
                    this.range.end = end;
                },
            });
            adjustments.push(adj);
        });
    };

    return {
        auxChannelCount,
        auxChannelOptions,
        sortedFunctions,
        stepModeOptions,
        pipValues,
        channelPercent,
        onEnableChange,
        onModeChange,
        onFunctionChange,
        loadMSPData,
        initializeAdjustments,
    };
}
