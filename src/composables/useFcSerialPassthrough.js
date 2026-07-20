import { readonly, ref } from "vue";
import MSP from "../js/msp.js";
import MSPCodes from "../js/msp/MSPCodes.js";
import { serial } from "../js/serial.js";

/** Values from Betaflight's serialPortFunction_e (the bit index, not the mask). */
export const FcSerialPortFunction = Object.freeze({
    RX_SERIAL: 6,
});

function responseAccepted(response) {
    return !response?.unsupported && response?.data?.getUint8(0) === 1;
}

/**
 * Opens a raw serial session through a connected Betaflight FC.
 *
 * USB/serial ownership deliberately stays with the existing `serial` singleton. Once
 * the FC acknowledges MSP_SET_PASSTHROUGH, every byte received from that one transport
 * is exposed as `data`. Ending a session disconnects the FC transport: Betaflight turns
 * itself into a byte proxy, so there is no safe in-band way to return to MSP.
 */
export function useFcSerialPassthrough() {
    const active = ref(false);
    const target = ref(null);
    const error = ref(null);
    const dataListeners = new Set();

    const receive = (event) => {
        const bytes = event.detail?.data ?? event.detail;
        for (const listener of dataListeners) {
            listener(bytes);
        }
    };

    const finish = () => {
        serial.removeEventListener("receive", receive);
        active.value = false;
        target.value = null;
    };

    const start = async ({ portFunction, name }) => {
        if (active.value) {
            throw new Error("A Betaflight serial passthrough session is already active.");
        }
        if (!serial.connected) {
            throw new Error("Connect to a Betaflight flight controller before opening passthrough.");
        }
        if (!Number.isInteger(portFunction) || portFunction < 0 || portFunction > 255) {
            throw new Error("The selected Betaflight serial-port function is invalid.");
        }

        error.value = null;
        try {
            const response = await MSP.promise(MSPCodes.MSP_SET_PASSTHROUGH, [0xfe, portFunction]);
            if (!responseAccepted(response)) {
                throw new Error("Betaflight could not open passthrough for the selected serial port.");
            }

            // The FC now proxies raw peripheral bytes. Stop the MSP decoder before raw
            // bytes arrive, but retain the same serial singleton and its reader/writer.
            MSP.callbacks_cleanup();
            MSP.clearListeners();
            target.value = { name, portFunction };
            active.value = true;
            serial.addEventListener("receive", receive);
        } catch (startError) {
            error.value = startError instanceof Error ? startError.message : String(startError);
            throw startError;
        }
    };

    const write = async (bytes) => {
        if (!active.value) {
            throw new Error("Open a Betaflight serial passthrough session before writing data.");
        }
        const result = await serial.send(bytes);
        if (result.bytesSent !== bytes.byteLength) {
            throw new Error("The passthrough write was incomplete.");
        }
    };

    const onData = (listener) => {
        dataListeners.add(listener);
        return () => dataListeners.delete(listener);
    };

    const stop = async () => {
        finish();
        if (serial.connected) {
            await serial.disconnect();
        }
    };

    return {
        active: readonly(active),
        target: readonly(target),
        error: readonly(error),
        start,
        stop,
        write,
        onData,
    };
}

export { responseAccepted };
