/*
    ESP32 firmware flashing over the serial ROM bootloader.

    Wraps the espressif `esptool-js` library (SLIP framing, per-chip stub loaders,
    chip auto-detection and the DTR/RTS reset sequence). A merged image
    (bootloader + partition table + application) is flashed at offset 0x0; the
    chip type is auto-detected so a single .bin works across esp32/s2/s3/c3.

    Scope: the browser Web Serial path only. esptool-js needs a W3C SerialPort
    with setSignals() for the reset-to-bootloader sequence, which the Tauri and
    Capacitor serial layers do not expose yet.
*/
import { i18n } from "../localization";
import { serial } from "../serial";
import { isAndroid, isTauri } from "../utils/checkCompatibility";

const logHead = "[ESP32]";

class ESP32Protocol {
    transport = null;
    loader = null;

    /**
     * Flash a merged ESP32 image at offset 0x0.
     *
     * @param {string} port - selected serial port path (e.g. "serial")
     * @param {number} baud - post-stub baud rate
     * @param {Uint8Array} image - merged firmware image
     * @param {object} options - { flashingMessage, flashProgress, flashMessageTypes }
     * @returns {Promise<boolean>} true on success
     */
    async connect(port, baud, image, options = {}) {
        const { flashingMessage, flashProgress, flashMessageTypes: TYPES } = options;

        const message = (key, type, ...args) =>
            flashingMessage?.(args.length ? i18n.getMessage(key, args) : i18n.getMessage(key), type);

        // esptool-js requires a W3C SerialPort with DTR/RTS control — browser Web Serial only.
        if (isTauri() || isAndroid() || !globalThis.navigator?.serial) {
            console.warn(`${logHead} ESP32 flashing requires the browser Web Serial path`);
            message("firmwareFlasherEsp32NotSupported", TYPES?.INVALID);
            flashProgress?.(0);
            return false;
        }

        if (!image || image.byteLength === 0) {
            message("firmwareFlasherFirmwareNotLoaded", TYPES?.INVALID);
            return false;
        }

        const serialProtocol = serial.selectProtocol(port);
        const nativePort = serialProtocol?.getNativePort?.(port);
        if (!nativePort) {
            console.error(`${logHead} No native serial port for path:`, port);
            message("firmwareFlasherEsp32NoPort", TYPES?.INVALID);
            return false;
        }

        // esptool-js owns the port (open/close, readable/writable, signals) for the
        // duration of flashing, so the wrapper must not be holding it.
        if (serialProtocol.connected) {
            await serialProtocol.disconnect();
        }

        // Keep esptool-js out of the main bundle — only needed when flashing ESP32.
        const { ESPLoader, Transport } = await import("esptool-js");

        const terminal = {
            clean: () => {},
            write: (data) => console.log(`${logHead} ${data}`),
            writeLine: (data) => console.log(`${logHead} ${data}`),
        };

        let success = false;
        try {
            this.transport = new Transport(nativePort, false);
            this.loader = new ESPLoader({
                transport: this.transport,
                baudrate: baud || 115200,
                terminal,
            });

            message("firmwareFlasherEsp32Connecting", TYPES?.ACTION);
            flashProgress?.(0);

            const chip = await this.loader.main(); // reset -> sync -> detect -> stub
            console.log(`${logHead} Detected chip: ${chip}`);
            flashingMessage?.(i18n.getMessage("firmwareFlasherEsp32Detected", [chip]), TYPES?.NEUTRAL);

            message("firmwareFlasherEsp32Flashing", TYPES?.FLASHING);
            await this.loader.writeFlash({
                fileArray: [{ data: image, address: 0 }],
                flashSize: "keep",
                flashMode: "keep",
                flashFreq: "keep",
                eraseAll: false,
                compress: true,
                reportProgress: (_fileIndex, written, total) => {
                    if (total > 0) {
                        flashProgress?.(Math.round((written / total) * 100));
                    }
                },
            });

            message("firmwareFlasherEsp32Rebooting", TYPES?.NEUTRAL);
            await this.loader.after("hard_reset");

            success = true;
            flashProgress?.(100);
            message("firmwareFlasherEsp32Complete", TYPES?.VALID);
        } catch (error) {
            console.error(`${logHead} Flashing failed:`, error);
            flashingMessage?.(i18n.getMessage("firmwareFlasherEsp32Failed", [error.message || error]), TYPES?.INVALID);
            flashProgress?.(100);
        } finally {
            try {
                await this.transport?.disconnect();
            } catch (e) {
                console.warn(`${logHead} Transport disconnect error (can be ignored):`, e);
            }
            this.transport = null;
            this.loader = null;
        }

        return success;
    }
}

const ESP32 = new ESP32Protocol();

export default ESP32;
