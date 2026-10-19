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
import type { ESPLoader, Transport } from "esptool-js";

type FlashMessageType = "NEUTRAL" | "VALID" | "INVALID" | "ACTION" | "FLASHING";

/** The firmware flasher's callbacks, as useFirmwareFlashing passes them. */
export interface Esp32FlashOptions {
    flashingMessage?(message: string | null, type?: string): unknown;
    flashProgress?(progress: number): unknown;
    flashMessageTypes?: Partial<Record<FlashMessageType, string>>;
}

const logHead = "[ESP32]";

class ESP32Protocol {
    transport: Transport | null = null;
    loader: ESPLoader | null = null;

    /**
     * Flash a merged ESP32 image at offset 0x0.
     *
     * @param port - selected serial port path (e.g. "serial")
     * @param baud - post-stub baud rate
     * @param image - merged firmware image
     * @returns true on success
     */
    async connect(port: string, baud: number, image: Uint8Array, options: Esp32FlashOptions = {}): Promise<boolean> {
        const { flashingMessage, flashProgress, flashMessageTypes: TYPES } = options;

        const message = (key: string, type: string | undefined, ...args: string[]) =>
            flashingMessage?.(args.length ? i18n.getMessage(key, args) : i18n.getMessage(key), type);

        // esptool-js requires a W3C SerialPort with DTR/RTS control — browser Web Serial only.
        if (
            isTauri() ||
            isAndroid() ||
            !(globalThis.navigator as (Navigator & { serial?: unknown }) | undefined)?.serial
        ) {
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
        // A port exists only behind a protocol, so this also rules out a missing protocol.
        if (!serialProtocol || !nativePort) {
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
            write: (data: string) => console.log(`${logHead} ${data}`),
            writeLine: (data: string) => console.log(`${logHead} ${data}`),
        };

        let success = false;
        try {
            // esptool-js types the port as the W3C SerialPort, which this project has no typings for.
            this.transport = new Transport(nativePort as ConstructorParameters<typeof Transport>[0], false);
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
            flashingMessage?.(
                i18n.getMessage("firmwareFlasherEsp32Failed", [(error as Error).message || String(error)]),
                TYPES?.INVALID,
            );
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
