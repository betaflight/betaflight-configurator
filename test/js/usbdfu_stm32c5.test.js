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
        // Emulates reading it from the config blob: returns a real transfer size
        // without hanging (the C5 standalone request would never resolve).
        this.getFunctionalDescriptorCalls++;
        return Promise.resolve({ wTransferSize: 2048, bcdDFUVersion: 0x011a });
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

    it("does not hang when an extra, unparseable memory region is reported", async () => {
        const transport = new MockC5Transport([
            "@Internal Flash /0x08000000/64*08Kg",
            "@Weird Region /0x1FFF0000/garbage", // would throw in the old reduce
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
});
