import { ref, reactive, computed } from "vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_48 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const PIP_VALUES = [1000, 1200, 1500, 1800, 2000];

// Functions the firmware marks as ADJUSTMENT_MODE_SELECT (no center/scale).
// Indices match the adjustmentFunction enum in rc_adjustments.h, cross-checked
// against defaultAdjustmentConfigs[] in rc_adjustments.c:
//   12: ADJUSTMENT_RATE_PROFILE
//   24: ADJUSTMENT_HORIZON_STRENGTH
//   29: ADJUSTMENT_PID_AUDIO
//   33: ADJUSTMENT_OSD_PROFILE
//   34: ADJUSTMENT_LED_PROFILE
//   35: ADJUSTMENT_LED_DIMMER
//   36: ADJUSTMENT_SIMPLIFIED_MASTER_MULTIPLIER
//   37: ADJUSTMENT_BATTERY_PROFILE
// 34-37 are not currently reachable through the function dropdown
// (adjustmentFunctionCount caps at 34) but are listed for correctness when a
// future API version raises that cap.
const SELECT_MODE_FUNCTIONS = new Set([12, 24, 29, 33, 34, 35, 36, 37]);

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
