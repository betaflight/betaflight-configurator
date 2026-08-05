import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Regression test for STM32C5xx (STM32C562) USB-DFU flashing.
//
// The STM32C5 on-chip ROM bootloader (VID 0x0483 / PID 0xDF11):
//   1. reports ONLY an "@Internal Flash" memory region (no "@Option Bytes"
//      DFU alternate setting), and
//   2. never answers a standalone GET_DESCRIPTOR for the DFU functional
//      descriptor.
//
// Before the fix, (2) made the flash hang forever right after "Claimed
// interface: 0" (getFunctionalDescriptor awaited a control transfer that never
// resolved), and (1) would have thrown when the read-protection step tried to
// dereference the missing option-bytes region.
//
// These tests drive the real UsbDfuProtocol against a mock transport that
// emulates that bootloader and assert the whole flow COMPLETES (no hang) and
// reports a successful programming result.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/gui", () => ({ default: { connect_lock: false } }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
// Prevent the module-bottom `new WebUsbDfuTransport()` from touching navigator.usb.
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

const { UsbDfuProtocol } = await import("../../src/js/protocols/usbdfu");
const RealWebUsbDfuTransport = (await vi.importActual("../../src/js/protocols/WebUsbDfuTransport")).default;

const FLASH_MESSAGE_TYPES = {
    NEUTRAL: "NEUTRAL",
    VALID: "VALID",
    INVALID: "INVALID",
    ACTION: "ACTION",
    ERASING: "ERASING",
    FLASHING: "FLASHING",
    VERIFYING: "VERIFYING",
};

// DFU states / requests (subset used by the state machine).
const STATE = { dfuIDLE: 2, dfuDNBUSY: 4, dfuDNLOAD_IDLE: 5, dfuUPLOAD_IDLE: 9 };
const REQ = { DNLOAD: 1, UPLOAD: 2, GETSTATUS: 3, CLRSTATUS: 4, ABORT: 6 };

/**
 * Mock transport emulating an STM32C5 ROM bootloader well enough to run a full
 * DFU program+verify cycle. Captures the bytes written via DNLOAD and replays
 * them on UPLOAD so verification passes.
 */
class MockC5Transport extends EventTarget {
    /** @param {string[]} descriptorStrings - Memory-layout descriptor strings to report. */
    constructor(descriptorStrings) {
        super();
        this.descriptorStrings = descriptorStrings;
        this.currentState = STATE.dfuIDLE;
        this.busy = false;
        this.postBusyState = STATE.dfuDNLOAD_IDLE;
        this.written = [];
        this.readCursor = 0;
        this.getFunctionalDescriptorCalls = 0;
    }

    getDevices() {
        return Promise.resolve([{ path: "usb_c5", port: {} }]);
    }
    getConnectedDevice() {
        return "usb_c5";
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
        return Promise.resolve(this.descriptorStrings);
    }

    getFunctionalDescriptor() {
        // Emulates reading it from the config blob: returns the real transfer size
        // without hanging (the C5 standalone request would never resolve). Real C562
        // hardware reports 1024, so exercise the non-default transfer-size path.
        this.getFunctionalDescriptorCalls++;
        return Promise.resolve({ wTransferSize: 1024, bcdDFUVersion: 0x011a });
    }

    controlTransferOut(setup, data) {
        if (setup.request === REQ.CLRSTATUS) {
            // Faithful to the STM32C5 ROM: DFU_CLRSTATUS is only legal in dfuERROR;
            // issued in any other state the ROM STALLs the request (the reported bug).
            if (this.currentState !== 10 /* dfuERROR */) {
                return Promise.reject(new Error("USB controlTransferOut failed: stall"));
            }
            this.currentState = STATE.dfuIDLE;
            this.busy = false;
        } else if (setup.request === REQ.ABORT) {
            this.currentState = STATE.dfuIDLE;
            this.busy = false;
        } else if (setup.request === REQ.DNLOAD) {
            // wBlockNum >= 2 carries firmware payload; 0/1 carry commands (erase/loadAddress/leave).
            if (setup.value >= 2 && data && data.length) {
                for (const b of data) {
                    this.written.push(b);
                }
            }
            this.busy = true;
            this.postBusyState = STATE.dfuDNLOAD_IDLE;
        }
        return Promise.resolve({ status: "ok" });
    }

    controlTransferIn(setup, length) {
        if (setup.request === REQ.GETSTATUS) {
            let bytes;
            if (this.busy) {
                this.busy = false;
                this.currentState = this.postBusyState;
                bytes = [0, 1, 0, 0, STATE.dfuDNBUSY, 0]; // status OK, 1ms poll, DNBUSY
            } else {
                bytes = [0, 0, 0, 0, this.currentState, 0];
            }
            return Promise.resolve({ status: "ok", data: new Uint8Array(bytes) });
        }
        if (setup.request === REQ.UPLOAD) {
            const chunk = this.written.slice(this.readCursor, this.readCursor + length);
            this.readCursor += length;
            this.currentState = STATE.dfuUPLOAD_IDLE;
            return Promise.resolve({ status: "ok", data: new Uint8Array(chunk) });
        }
        return Promise.resolve({ status: "ok", data: new Uint8Array(length) });
    }
}

/**
 * Build a minimal parsed-hex object for the flasher (one block at the flash base).
 * @param {number} byteCount - Size of the firmware image in bytes.
 * @returns {{bytes_total:number, data:{address:number,bytes:number,data:Uint8Array}[]}}
 */
function makeHex(byteCount) {
    const data = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i++) {
        data[i] = i & 0xff;
    }
    return {
        bytes_total: byteCount,
        data: [{ address: 0x08000000, bytes: byteCount, data }],
    };
}

/**
 * Run a DFU flash and resolve when connect() invokes its completion callback, or
 * reject if it never fires within `ms` (i.e. the flow hung).
 * @param {import("../../src/js/protocols/usbdfu").UsbDfuProtocol} dfu
 * @param {ReturnType<typeof makeHex>} hex
 * @param {object} options - Flashing options (flashingMessage, flashProgress, flashMessageTypes).
 * @param {number} [ms=8000] - Hang timeout in milliseconds.
 * @returns {Promise<void>}
 */
function flashWithTimeout(dfu, hex, options, ms = 8000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("DFU flash hung: connect() callback never fired")), ms);
        dfu.connect("usb_c5", hex, options, () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

describe("STM32C5 DFU flashing", () => {
    let messages;
    let options;

    beforeEach(() => {
        messages = [];
        options = {
            flashingMessage: (msg, type) => messages.push({ msg, type }),
            flashProgress: vi.fn(),
            flashMessageTypes: FLASH_MESSAGE_TYPES,
        };
    });

    it("completes a full program+verify cycle for a C562 that reports no option-bytes region", async () => {
        const transport = new MockC5Transport(["@Internal Flash /0x08000000/64*08Kg"]);
        const dfu = new UsbDfuProtocol(transport);

        await flashWithTimeout(dfu, makeHex(4096), options);

        // The final user-visible message must be a successful programming result.
        const last = messages.at(-1);
        expect(last.type).toBe(FLASH_MESSAGE_TYPES.VALID);
        expect(last.msg).toBe("stm32ProgrammingSuccessful");
        // The captured firmware must round-trip through verify exactly.
        expect(transport.written.length).toBe(4096);
    });

    it("does not hang when extra unparseable / truncated memory regions are reported", async () => {
        const transport = new MockC5Transport([
            "@Internal Flash /0x08000000/64*08Kg",
            "@Weird Region /0x1FFF0000/garbage", // sector token has no "*" -> parseDescriptor returns null
            "@Truncated /0x1FFF0000", // only two "/"-parts -> would dereference tmp1[2] and throw
        ]);
        const dfu = new UsbDfuProtocol(transport);

        await flashWithTimeout(dfu, makeHex(2048), options);

        expect(messages.at(-1).msg).toBe("stm32ProgrammingSuccessful");
    });
});

describe("WebUsbDfuTransport.getFunctionalDescriptor", () => {
    it("reads the DFU functional descriptor from the config blob without the hanging standalone request", async () => {
        // Config descriptor: 9-byte config header + 9-byte interface + 9-byte DFU functional (0x21).
        const blob = new Uint8Array([
            // configuration descriptor header (bLength=9, bType=2, wTotalLength=27)
            9, 2, 27, 0, 1, 1, 0, 0xc0, 0,
            // interface descriptor (bLength=9, bType=4, class 0xFE/1/2, iInterface=4)
            9, 4, 0, 0, 0, 0xfe, 1, 2, 4,
            // DFU functional descriptor (bLength=9, bType=0x21, wTransferSize=2048=0x0800 LE)
            9, 0x21, 0x0b, 0xff, 0x00, 0x00, 0x08, 0x1a, 0x01,
        ]);

        const view = (start, len) => new DataView(blob.buffer, start, len);
        const transport = new RealWebUsbDfuTransport();
        let standaloneRequested = false;
        transport.usbDevice = {
            controlTransferIn: vi.fn((setup, length) => {
                if (setup.value === 0x2100) {
                    // The standalone functional-descriptor request — the C5 ROM never answers this.
                    standaloneRequested = true;
                    return new Promise(() => {}); // never resolves
                }
                if (setup.value === 0x200) {
                    // config descriptor: header read, then full read
                    return Promise.resolve({ status: "ok", data: view(0, length) });
                }
                return Promise.resolve({ status: "ok", data: view(0, length) });
            }),
        };

        const descriptor = await transport.getFunctionalDescriptor();

        expect(descriptor.bDescriptorType).toBe(0x21);
        expect(descriptor.wTransferSize).toBe(2048);
        expect(standaloneRequested).toBe(false);
    });

    it("ignores a HID descriptor (also type 0x21) on a composite device and picks the DFU one", async () => {
        // A composite device: a HID interface (class 0x03) with a HID descriptor (also 0x21),
        // followed by the real DFU interface (class 0xFE/subclass 0x01) + DFU functional descriptor.
        const blob = new Uint8Array([
            // configuration header (bLength=9, bType=2, wTotalLength=45)
            9, 2, 45, 0, 2, 1, 0, 0xc0, 0,
            // HID interface (class 0x03)
            9, 4, 0, 0, 1, 0x03, 0, 0, 0,
            // HID descriptor (bType=0x21) — must be ignored because it is under a HID interface,
            // not a DFU one; decoding it as a DFU functional descriptor would give a bogus size.
            9, 0x21, 0x11, 0x01, 0x00, 0x22, 0x00, 0x1b, 0x00,
            // DFU interface (class 0xFE / subclass 0x01)
            9, 4, 1, 0, 0, 0xfe, 0x01, 0x02, 4,
            // DFU functional descriptor (wTransferSize=1024=0x0400 LE)
            9, 0x21, 0x0b, 0xff, 0x00, 0x00, 0x04, 0x1a, 0x01,
        ]);
        const view = (start, len) => new DataView(blob.buffer, start, len);
        const transport = new RealWebUsbDfuTransport();
        transport.usbDevice = {
            controlTransferIn: vi.fn((setup, length) => Promise.resolve({ status: "ok", data: view(0, length) })),
        };

        const descriptor = await transport.getFunctionalDescriptor();

        // Must be the DFU functional descriptor's transfer size, not the HID descriptor's 0x2200.
        expect(descriptor.wTransferSize).toBe(1024);
    });

    it("rejects with a timeout error when a descriptor read never resolves", async () => {
        const transport = new RealWebUsbDfuTransport();
        const guarded = transport._withTimeout(new Promise(() => {}), 10, "slowOp");
        await expect(guarded).rejects.toThrow(/timed out/);
    });

    it("rejects a truncated standalone functional-descriptor response instead of using it", async () => {
        // No DFU functional descriptor in the config blob, forcing the standalone fallback,
        // which returns a truncated 4-byte response (would decode to wTransferSize 0).
        const configBlob = new Uint8Array([
            9,
            2,
            18,
            0,
            1,
            1,
            0,
            0xc0,
            0, // config header, wTotalLength=18
            9,
            4,
            0,
            0,
            0,
            0xfe,
            0x01,
            0x02,
            4, // DFU interface, no functional descriptor follows
        ]);
        const truncated = new Uint8Array([4, 0x21, 0x0b, 0xff]);
        const view = (buf, len) => new DataView(buf.buffer, 0, Math.min(len, buf.length));
        const transport = new RealWebUsbDfuTransport();
        transport.usbDevice = {
            controlTransferIn: vi.fn((setup, length) => {
                if (setup.value === 0x2100) {
                    return Promise.resolve({ status: "ok", data: view(truncated, length) });
                }
                return Promise.resolve({ status: "ok", data: view(configBlob, length) });
            }),
        };

        await expect(transport.getFunctionalDescriptor()).rejects.toThrow(/functional descriptor/i);
    });
});
