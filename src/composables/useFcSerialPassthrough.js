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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function eventBytes(event) {
    return event.detail?.data ?? event.detail;
}

function encodeText(text) {
    return new TextEncoder().encode(text);
}

async function writeBytes(bytes) {
    const result = await serial.send(bytes);
    if (result.bytesSent !== bytes.byteLength) {
        throw new Error("The passthrough write was incomplete.");
    }
}

function createCliReader() {
    const decoder = new TextDecoder();
    let buffer = "";
    let notify = null;

    const receiveCli = (event) => {
        const bytes = eventBytes(event);
        buffer += decoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { stream: true });
        notify?.();
    };

    const findPattern = (patterns) => {
        let best = null;
        for (const pattern of patterns) {
            const index = buffer.indexOf(pattern);
            if (index === -1) {
                continue;
            }
            const end = index + pattern.length;
            if (!best || end < best.end) {
                best = { end, pattern };
            }
        }
        return best;
    };

    const readUntil = async (patterns, timeoutMs = 1000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const match = findPattern(patterns);
            if (match) {
                const output = buffer.slice(0, match.end);
                buffer = buffer.slice(match.end);
                return output;
            }

            await new Promise((resolve) => {
                const remaining = Math.max(0, deadline - Date.now());
                const timer = setTimeout(resolve, remaining);
                notify = () => {
                    clearTimeout(timer);
                    notify = null;
                    resolve();
                };
            });
        }

        const output = buffer;
        buffer = "";
        return output;
    };

    serial.addEventListener("receive", receiveCli);

    return {
        readUntil,
        stop() {
            serial.removeEventListener("receive", receiveCli);
            notify?.();
            notify = null;
        },
    };
}

function findSerialRxPort(serialOutput) {
    for (const line of serialOutput.split(/\r?\n/)) {
        const match = line.match(/serial\s+(?<port>(UART)?[0-9]+)\s+(?<portConfig>[0-9]+)\s+/i);
        if (match?.groups && (Number.parseInt(match.groups.portConfig, 10) & 64) === 64) {
            return match.groups.port;
        }
    }
    return null;
}

/**
 * Opens a raw serial session through a connected Betaflight FC.
 *
 * USB/serial ownership deliberately stays with the existing `serial` singleton. Once
 * the FC enables serial passthrough, every byte received from that one transport
 * is exposed as `data`. Ending a session disconnects the FC transport: Betaflight turns
 * itself into a byte proxy, so there is no safe in-band way to return to MSP.
 */
export function useFcSerialPassthrough() {
    const active = ref(false);
    const target = ref(null);
    const error = ref(null);
    const dataListeners = new Set();

    const receive = (event) => {
        const bytes = eventBytes(event);
        for (const listener of dataListeners) {
            listener(bytes);
        }
    };

    const finish = () => {
        serial.removeEventListener("receive", receive);
        active.value = false;
        target.value = null;
    };

    const startWithMsp = async (portFunction) => {
        const response = await MSP.promise(MSPCodes.MSP_SET_PASSTHROUGH, [0xfe, portFunction]);
        if (!responseAccepted(response)) {
            throw new Error("Betaflight could not open passthrough for the selected serial port.");
        }
        return { method: "msp" };
    };

    const startWithCli = async (baudrate) => {
        const cli = createCliReader();
        try {
            await writeBytes(encodeText("#"));
            const prompt = await cli.readUntil(["# ", "CCC"], 1000);
            if (prompt.includes("CCC")) {
                return { alreadyActive: true, method: "cli" };
            }
            if (!prompt.trim().endsWith("#")) {
                return { alreadyActive: true, method: "cli" };
            }

            await writeBytes(encodeText("serial\r\n"));
            const serialOutput = await cli.readUntil(["# "], 2000);
            const serialRxPort = findSerialRxPort(serialOutput);
            if (!serialRxPort) {
                throw new Error("Could not detect the Betaflight Serial RX UART for passthrough.");
            }

            await writeBytes(encodeText(`serialpassthrough ${serialRxPort} ${baudrate}\r\n`));
            await sleep(200);
            for (let i = 0; i < 10; i++) {
                await cli.readUntil(["\n"], 200);
            }
            return { method: "cli", serialRxPort };
        } finally {
            cli.stop();
        }
    };

    const start = async ({ portFunction, name, baudrate = 420000, method = "msp" }) => {
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
            let passthroughInfo;
            if (method === "cli") {
                passthroughInfo = await startWithCli(baudrate);
            } else {
                passthroughInfo = await startWithMsp(portFunction);
            }

            // The FC now proxies raw peripheral bytes. Stop the MSP decoder before ESP
            // bytes arrive, but retain the same serial singleton and its reader/writer.
            MSP.callbacks_cleanup();
            MSP.clearListeners();
            target.value = { baudrate, method, name, portFunction, ...passthroughInfo };
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
