import { ref, reactive, computed } from "vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_48 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const PIP_VALUES = [1000, 1200, 1500, 1800, 2000];

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
        pipValues,
        channelPercent,
        onEnableChange,
        loadMSPData,
        initializeAdjustments,
    };
}
