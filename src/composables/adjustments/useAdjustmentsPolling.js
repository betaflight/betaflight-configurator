import { reactive, onUnmounted } from "vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useFlightControllerStore } from "@/stores/fc";

export function useAdjustmentsPolling() {
    const fcStore = useFlightControllerStore();
    const rcChannelData = reactive({});

    let rcDataInterval = null;

    const updateRcData = () => {
        const auxCount = fcStore.rc.active_channels - 4;
        for (let auxChannelIndex = 0; auxChannelIndex < auxCount; auxChannelIndex++) {
            rcChannelData[auxChannelIndex] = fcStore.rc.channels[auxChannelIndex + 4];
        }
    };

    const startRcDataPolling = () => {
        if (rcDataInterval) {
            updateRcData();
            return;
        }
        updateRcData();
        rcDataInterval = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RC, false, false, updateRcData);
        }, 50);
    };

    const stopRcDataPolling = () => {
        if (rcDataInterval) {
            clearInterval(rcDataInterval);
            rcDataInterval = null;
        }
    };

    onUnmounted(() => {
        stopRcDataPolling();
    });

    return { rcChannelData, startRcDataPolling, stopRcDataPolling };
}
