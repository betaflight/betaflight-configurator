import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Regression test for STM32H7 USB-DFU flashing (e.g. KAKUTEH7).
//
// Some H7 bootloaders never leave dfuDNBUSY after erasing a page (typically the
// first page of the second flash bank) and only recover via the CLRSTATUS pair
// STM32CubeProgrammer uses. clearStatus() used to send CLRSTATUS from any
// non-idle state, implementing that workaround by accident; making it
// spec-correct for the STM32C5 ROM turned dfuDNBUSY into a poll-only state, so a
// wedging H7 exhausted the retry budget and aborted mid-erase with
// "clearStatus: device did not reach dfuIDLE after 100 attempts (state: 4)".
// ---------------------------------------------------------------------------

vi.mock("../../src/js/gui", () => ({ default: { connect_lock: false } }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
// Prevent the module-bottom `new WebUsbDfuTransport()` from touching navigator.usb.
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

const { UsbDfuProtocol } = await import("../../src/js/protocols/usbdfu");

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
const STATE = { dfuIDLE: 2, dfuDNBUSY: 4, dfuDNLOAD_IDLE: 5, dfuUPLOAD_IDLE: 9, dfuERROR: 10 };
const REQ = { DNLOAD: 1, UPLOAD: 2, GETSTATUS: 3, CLRSTATUS: 4, ABORT: 6 };

const ERASE_CMD = 0x41;
const FLASH_BASE = 0x08000000;
const PAGE_SIZE = 16 * 1024;

/**
 * Mock transport emulating an STM32H7 bootloader: well-mannered except on the pages
 * listed in `wedgePages`, where an erase sticks in dfuDNBUSY forever and only recovers
 * via the CLRSTATUS pair (dfuERROR, then dfuIDLE).
 */
class MockH7Transport extends EventTarget {
    /**
     * @param {string[]} descriptorStrings - Memory-layout descriptor strings to report.
     * @param {number[]} wedgePages - Page indices whose erase wedges in dfuDNBUSY.
     */
    constructor(descriptorStrings, wedgePages = []) {
        super();
        this.descriptorStrings = descriptorStrings;
        this.wedgePages = new Set(wedgePages);
        this.currentState = STATE.dfuIDLE;
        this.busy = false;
        this.wedged = false;
        this.postBusyState = STATE.dfuDNLOAD_IDLE;
        this.written = [];
        this.readCursor = 0;
        this.erasedPages = [];
        this.clrStatusCount = 0;
    }

    getDevices() {
        return Promise.resolve([{ path: "usb_h7", port: {} }]);
    }
    getConnectedDevice() {
        return "usb_h7";
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
        return Promise.resolve({ wTransferSize: 2048, bcdDFUVersion: 0x011a });
    }

    controlTransferOut(setup, data) {
        if (setup.request === REQ.CLRSTATUS) {
            this.clrStatusCount++;
            this.busy = false;
            if (this.wedged) {
                // First of the pair: reports errUNKNOWN/dfuERROR, erase already done.
                this.wedged = false;
                this.currentState = STATE.dfuERROR;
            } else {
                this.currentState = STATE.dfuIDLE;
            }
        } else if (setup.request === REQ.ABORT) {
            this.currentState = STATE.dfuIDLE;
            this.busy = false;
        } else if (setup.request === REQ.DNLOAD) {
            // wBlockNum >= 2 carries firmware payload; 0/1 carry commands (erase/loadAddress/leave).
            if (setup.value >= 2 && data && data.length) {
                for (const b of data) {
                    this.written.push(b);
                }
            } else if (data && data[0] === ERASE_CMD) {
                const addr = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
                const page = (addr - FLASH_BASE) / PAGE_SIZE;
                this.erasedPages.push(page);
                if (this.wedgePages.has(page)) {
                    this.wedged = true;
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
            if (this.wedged) {
                // Never settles by itself, however long or often we poll.
                bytes = [0, 1, 0, 0, STATE.dfuDNBUSY, 0];
            } else if (this.busy) {
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
        data: [{ address: FLASH_BASE, bytes: byteCount, data }],
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
        dfu.connect("usb_h7", hex, options, () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

describe("STM32H7 DFU flashing", () => {
    // 4 pages of 16 KiB, matching PAGE_SIZE/FLASH_BASE above.
    const LAYOUT = ["@Internal Flash /0x08000000/04*016Kg"];
    let options;
    let messages;

    beforeEach(() => {
        messages = [];
        options = {
            erase_chip: true,
            flashingMessage: (msg, type) => messages.push({ msg, type }),
            flashProgress: vi.fn(),
            flashMessageTypes: FLASH_MESSAGE_TYPES,
        };
    });

    it("completes a full chip erase when the bootloader wedges in dfuDNBUSY on a page", async () => {
        // Wedge from the bank boundary on, as a real H743 Rev.V does.
        const transport = new MockH7Transport(LAYOUT, [2, 3]);
        const dfu = new UsbDfuProtocol(transport);

        await flashWithTimeout(dfu, makeHex(4096), options);

        const last = messages.at(-1);
        expect(last.type).toBe(FLASH_MESSAGE_TYPES.VALID);
        expect(last.msg).toBe("stm32ProgrammingSuccessful");
        // Including the wedging pages, where the flash used to abort.
        expect(transport.erasedPages).toEqual([0, 1, 2, 3]);
        expect(transport.written).toHaveLength(4096);
        // Two CLRSTATUS per wedged page — the only way out of the wedge.
        expect(transport.clrStatusCount).toBeGreaterThanOrEqual(4);
    });

    it("never sends CLRSTATUS to a bootloader that leaves dfuDNBUSY on its own", async () => {
        // No wedging pages: the spec-correct path must not fall back to CLRSTATUS,
        // which strict bootloaders (STM32C5 ROM) STALL outside dfuERROR.
        const transport = new MockH7Transport(LAYOUT, []);
        const dfu = new UsbDfuProtocol(transport);

        await flashWithTimeout(dfu, makeHex(4096), options);

        expect(messages.at(-1).msg).toBe("stm32ProgrammingSuccessful");
        expect(transport.erasedPages).toEqual([0, 1, 2, 3]);
        expect(transport.clrStatusCount).toBe(0);
    });
});

/**
 * Minimal transport for driving clearStatus() directly: answers GETSTATUS with dfuDNBUSY
 * for `busyReads` polls, or forever when `wedged` until the CLRSTATUS pair unsticks it.
 */
class MockStatusTransport extends EventTarget {
    constructor({ busyReads = 0, wedged = false } = {}) {
        super();
        this.busyReads = busyReads;
        this.wedged = wedged;
        this.state = STATE.dfuIDLE;
        this.clrStatusCount = 0;
    }

    controlTransferIn(setup, length) {
        if (setup.request !== REQ.GETSTATUS) {
            return Promise.resolve({ status: "ok", data: new Uint8Array(length) });
        }
        let state = this.state;
        if (this.wedged) {
            state = STATE.dfuDNBUSY;
        } else if (this.busyReads > 0) {
            this.busyReads--;
            state = STATE.dfuDNBUSY;
        }
        return Promise.resolve({ status: "ok", data: new Uint8Array([0, 1, 0, 0, state, 0]) });
    }

    controlTransferOut(setup) {
        if (setup.request === REQ.CLRSTATUS) {
            this.clrStatusCount++;
            if (this.wedged) {
                this.wedged = false;
                this.state = STATE.dfuERROR;
            } else {
                this.state = STATE.dfuIDLE;
            }
        }
        return Promise.resolve({ status: "ok" });
    }
}

/**
 * @param {MockStatusTransport} transport
 * @param {boolean} busyIsStuck - Passed straight through to clearStatus().
 * @returns {Promise<number>} The state reported when clearStatus() invoked its callback.
 */
function clearStatusWithTimeout(transport, busyIsStuck, ms = 2000) {
    const dfu = new UsbDfuProtocol(transport);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("clearStatus never reached dfuIDLE")), ms);
        dfu.clearStatus((data) => {
            clearTimeout(timer);
            resolve(data[4]);
        }, busyIsStuck);
    });
}

describe("UsbDfuProtocol.clearStatus", () => {
    it("polls a device that stays dfuDNBUSY for several reads without sending CLRSTATUS", async () => {
        // The default path must ride out a slow-but-honest erase/write rather than poke a
        // bootloader that would STALL an out-of-state CLRSTATUS.
        const transport = new MockStatusTransport({ busyReads: 5 });

        await expect(clearStatusWithTimeout(transport, false)).resolves.toBe(STATE.dfuIDLE);
        expect(transport.clrStatusCount).toBe(0);
    });

    it("sends the CLRSTATUS pair for a wedged device only when told the busy state is stuck", async () => {
        const transport = new MockStatusTransport({ wedged: true });

        await expect(clearStatusWithTimeout(transport, true)).resolves.toBe(STATE.dfuIDLE);
        expect(transport.clrStatusCount).toBe(2);
    });
});
