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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// The DFU upload steps (chip detection, read-protection check, erase, write,
// verify) driven end to end against a fake STM32 ROM bootloader. The C5 and H7
// suites cover a plain program+verify and the wedged-erase recovery; these
// cover the option-bytes check, read unprotect, local page selection and a
// failed verify.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
// Keep the module-bottom `new WebUsbDfuTransport()` away from navigator.usb.
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

import { UsbDfuProtocol, type DfuTransport } from "../../src/js/protocols/usbdfu";
import type { ParsedHex } from "../../src/js/workers/hex_parser";

const STATE = { dfuIDLE: 2, dfuDNBUSY: 4, dfuDNLOAD_IDLE: 5, dfuUPLOAD_IDLE: 9, dfuERROR: 10 };
const REQ = { DNLOAD: 1, UPLOAD: 2, GETSTATUS: 3, CLRSTATUS: 4, ABORT: 6 };
const ERR_VENDOR = 0x0b;
const FLASH_BASE = 0x08000000;
const OPTION_BYTES = 0x1fff7800;
const PAGE_SIZE = 16 * 1024;

const FLASH_MESSAGE_TYPES = {
    NEUTRAL: "NEUTRAL",
    VALID: "VALID",
    INVALID: "INVALID",
    ACTION: "ACTION",
    ERASING: "ERASING",
    FLASHING: "FLASHING",
    VERIFYING: "VERIFYING",
};

interface Setup {
    request: number;
    value: number;
}

/** An STM32 ROM bootloader with internal flash (4 x 16K pages) and an option-bytes region. */
class FakeBootloader extends EventTarget {
    readProtected = false;
    /** Flip one byte on read-back so verification fails. */
    corruptReadback = false;

    state = STATE.dfuIDLE;
    statusCode = 0;
    busy = false;
    postBusyState = STATE.dfuDNLOAD_IDLE;
    postBusyStatus = 0;
    unprotectStarted = false;

    erasedPages: number[] = [];
    written: number[] = [];
    readCursor = 0;

    getDevices() {
        return Promise.resolve([{ path: "usb_fake", displayName: "fake", port: {} }]);
    }
    getConnectedDevice() {
        return "usb_fake";
    }
    open() {
        return Promise.resolve();
    }
    claimInterface() {
        return Promise.resolve();
    }
    releaseInterface() {
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
    reset() {
        return Promise.resolve();
    }
    getInterfaceDescriptors() {
        return Promise.resolve(["@Internal Flash  /0x08000000/04*016Kg", "@Option Bytes  /0x1FFF7800/01*016 e"]);
    }
    getFunctionalDescriptor() {
        return Promise.resolve({ wTransferSize: 2048, bcdDFUVersion: 0x011a });
    }

    controlTransferOut(setup: Setup, data: number[] | Uint8Array | 0) {
        if (setup.request === REQ.CLRSTATUS || setup.request === REQ.ABORT) {
            this.state = STATE.dfuIDLE;
            this.statusCode = 0;
            this.busy = false;
        } else if (setup.request === REQ.DNLOAD) {
            this.download(setup.value, data ? Array.from(data) : []);
        }
        return Promise.resolve({ status: "ok" });
    }

    private download(value: number, bytes: number[]) {
        this.busy = true;
        this.postBusyState = STATE.dfuDNLOAD_IDLE;
        this.postBusyStatus = 0;

        if (value >= 2) {
            this.written.push(...bytes);
            return;
        }
        const address = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
        if (bytes[0] === 0x21 && address === OPTION_BYTES && this.readProtected) {
            // A read-protected chip refuses the option-bytes address load with errVENDOR.
            this.postBusyState = STATE.dfuERROR;
            this.postBusyStatus = ERR_VENDOR;
        } else if (bytes[0] === 0x41) {
            this.erasedPages.push(address >>> 0);
        } else if (bytes[0] === 0x92) {
            this.unprotectStarted = true;
        }
    }

    controlTransferIn(setup: Setup, length: number) {
        if (setup.request === REQ.GETSTATUS) {
            if (this.unprotectStarted && !this.busy) {
                // The unprotect mass-erase resets the chip, so the follow-up status read stalls.
                return Promise.reject(new Error("stall"));
            }
            if (this.busy) {
                this.busy = false;
                this.state = this.postBusyState;
                this.statusCode = this.postBusyStatus;
                return Promise.resolve({ status: "ok", data: new Uint8Array([0, 1, 0, 0, STATE.dfuDNBUSY, 0]) });
            }
            return Promise.resolve({ status: "ok", data: new Uint8Array([this.statusCode, 0, 0, 0, this.state, 0]) });
        }
        if (setup.request === REQ.UPLOAD) {
            this.state = STATE.dfuUPLOAD_IDLE;
            if (this.written.length === 0) {
                // The option-bytes read, before anything is written.
                return Promise.resolve({ status: "ok", data: new Uint8Array(length) });
            }
            const chunk = this.written.slice(this.readCursor, this.readCursor + length);
            if (this.corruptReadback && this.readCursor === 0) {
                chunk[0] ^= 0xff;
            }
            this.readCursor += length;
            return Promise.resolve({ status: "ok", data: new Uint8Array(chunk) });
        }
        return Promise.resolve({ status: "ok", data: new Uint8Array(length) });
    }
}

function makeHex(address: number, byteCount: number): ParsedHex {
    const data = Array.from({ length: byteCount }, (_, i) => i & 0xff);
    return {
        bytes_total: byteCount,
        data: [{ address, bytes: byteCount, data }],
        end_of_file: true,
        start_linear_address: FLASH_BASE,
    };
}

describe("DFU upload steps", () => {
    let messages: { msg: string | null; type?: string }[];
    let bootloader: FakeBootloader;
    let dfu: UsbDfuProtocol;
    let done: ReturnType<typeof vi.fn<() => void>>;

    function flash(hex: ParsedHex) {
        void dfu.connect(
            "usb_fake",
            hex,
            {
                flashingMessage: (msg: string | null, type?: string) => messages.push({ msg, type }),
                flashProgress: vi.fn(),
                flashMessageTypes: FLASH_MESSAGE_TYPES,
            },
            done,
        );
    }

    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        messages = [];
        done = vi.fn<() => void>();
        bootloader = new FakeBootloader();
        dfu = new UsbDfuProtocol(bootloader as unknown as DfuTransport);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reads the option bytes on an unprotected chip, then programs and verifies", async () => {
        flash(makeHex(FLASH_BASE, 4096));
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages.at(-1)).toEqual({ msg: "stm32ProgrammingSuccessful", type: "VALID" });
        expect(bootloader.unprotectStarted).toBe(false);
        expect(done).toHaveBeenCalledOnce();
    });

    it("erases only the pages the firmware covers, including one it spills into", async () => {
        // Starts 1K before the end of page 1 and runs 2K, so pages 1 and 2 but not 0 or 3.
        flash(makeHex(FLASH_BASE + 2 * PAGE_SIZE - 1024, 2048));
        await vi.advanceTimersByTimeAsync(5000);

        expect(bootloader.erasedPages).toEqual([FLASH_BASE + PAGE_SIZE, FLASH_BASE + 2 * PAGE_SIZE]);
        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
    });

    it("unprotects a read-protected chip and tells the user to replug it", async () => {
        bootloader.readProtected = true;

        flash(makeHex(FLASH_BASE, 4096));
        // The unprotect wait is the device's delay plus at least 20 s, then 2 s for the stall.
        await vi.advanceTimersByTimeAsync(30000);

        expect(bootloader.unprotectStarted).toBe(true);
        expect(bootloader.erasedPages).toEqual([]);
        expect(messages.map((m) => m.msg)).toContain("stm32ReadProtected");
        expect(messages.at(-1)).toEqual({ msg: "stm32UnprotectUnplug", type: "ACTION" });
    });

    it("reports a failed verify and does not leave DFU as if it had succeeded", async () => {
        bootloader.corruptReadback = true;

        flash(makeHex(FLASH_BASE, 4096));
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages.at(-1)).toEqual({ msg: "stm32ProgrammingFailed", type: "INVALID" });
        expect(messages.map((m) => m.msg)).not.toContain("stm32ProgrammingSuccessful");
    });
});
