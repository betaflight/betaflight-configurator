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
// UnicMicro UM324xF DFU boot loader (396A:DF00). A betaflight hex built with QSPI XIP
// holds blocks for the internal flash and for the in-package QSPI flash, so both have
// to be erased, written and verified in one session. The boot loader rejects a set
// address or erase outside the selected alternate setting's memories with errADDRESS,
// and has no mass erase.
//
// Two memory layouts are covered:
// - one alternate setting per memory: internal flash on alt 0, QSPI flash on alt 1,
//   so the protocol switches alternate setting for the QSPI blocks and back to leave DFU;
// - both flashes in one alt 0 string, as a BF_UM3241F_V01 board reports it:
//   "@Internal Flash   /0x08000000/64*8Kg  @External Flash   /0x38000000/128*4Kg",
//   so no switch is needed.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

import { UsbDfuProtocol, type DfuTransport } from "../../src/js/protocols/usbdfu";
import type { ParsedHex } from "../../src/js/workers/hex_parser";
import { DFU_REQUEST, DFU_STATE, FakeDfuDevice } from "./fakeDfuDevice";

const STATE = DFU_STATE;
const REQ = DFU_REQUEST;
const ERR_ADDRESS = 0x08;
const FLASH_BASE = 0x08000000;
const QSPI_BASE = 0x38000000;
const TRANSFER_SIZE = 4096;

const MEMORIES = [
    { start: FLASH_BASE, size: 512 * 1024, page: 8 * 1024 },
    { start: QSPI_BASE, size: 512 * 1024, page: 4 * 1024 },
    { start: 0x5200201c, size: 128, page: 128 }, // option bytes
];

interface Layout {
    name: string;
    descriptors: string[];
    /** Indexes into MEMORIES reachable from each alternate setting. */
    altMemories: number[][];
    /** Whether a hex with QSPI blocks makes the protocol switch alternate setting. */
    switchesForQspi: boolean;
}

const LAYOUTS: Layout[] = [
    {
        name: "one alternate setting per memory",
        descriptors: [
            "@Internal Flash   /0x08000000/64*008Kg",
            "@QSPI Flash       /0x38000000/128*004Kg",
            "@User Option Area /0x04000000/01*008Ka",
            "@OTP Area         /0x04002000/01*008Ka",
            "@Boot Loader      /0x04004000/01*016Ka",
            "@Unique ID        /0x04008048/01*016Ba",
        ],
        altMemories: [[0], [1], [], [], [], []],
        switchesForQspi: true,
    },
    {
        name: "both flashes in one alternate setting (BF_UM3241F_V01)",
        descriptors: [
            "@Internal Flash   /0x08000000/64*8Kg  @External Flash   /0x38000000/128*4Kg",
            "@Option Bytes /0x5200201C/01*128 e",
        ],
        // The read-protection check reads the option bytes without switching alternate
        // setting, which the board accepts: an internal-flash-only hex flashes on it.
        altMemories: [[0, 1, 2], [2]],
        switchesForQspi: false,
    },
];

interface Setup {
    request: number;
    value: number;
}

class FakeUm324xfBootloader extends FakeDfuDevice {
    alt = 0;
    pointer = 0;
    state = STATE.dfuIDLE;
    statusCode = 0;
    busy = false;
    pending: (() => number) | null = null;
    left = false;
    leftAlt = -1;

    memory = new Map<number, number>();
    erased: { memory: number; address: number }[] = [];
    altSwitches: number[] = [];

    constructor(private readonly layout: Layout) {
        super("usb_fake", layout.descriptors, TRANSFER_SIZE);
    }

    selectAlternateInterface(_interfaceNumber: number, alt: number) {
        this.alt = alt;
        this.altSwitches.push(alt);
        return Promise.resolve();
    }

    /** Whether the selected alternate setting reaches every byte of [address, address + length). */
    private reaches(address: number, length: number): boolean {
        const memory = this.memoryInAlt(address);
        return memory !== undefined && memory === this.memoryInAlt(address + length - 1);
    }

    /** Index into MEMORIES of the memory holding address, if the selected alternate setting reaches it. */
    private memoryInAlt(address: number): number | undefined {
        return this.layout.altMemories[this.alt].find((i) => {
            const m = MEMORIES[i];
            return address >= m.start && address < m.start + m.size;
        });
    }

    controlTransferOut(setup: Setup, data: number[] | Uint8Array | 0) {
        if (setup.request === REQ.CLRSTATUS || setup.request === REQ.ABORT) {
            this.state = STATE.dfuIDLE;
            this.statusCode = 0;
            this.busy = false;
        } else if (setup.request === REQ.DNLOAD) {
            const bytes = data ? Array.from(data) : [];
            if (bytes.length === 0) {
                this.left = true;
                this.leftAlt = this.alt;
            } else {
                this.download(setup.value, bytes);
            }
        }
        return Promise.resolve({ status: "ok" });
    }

    private download(value: number, bytes: number[]) {
        this.busy = true;
        if (value >= 2) {
            const address = this.pointer + (value - 2) * TRANSFER_SIZE;
            this.pending = () => {
                if (!this.reaches(address, bytes.length)) {
                    return ERR_ADDRESS;
                }
                bytes.forEach((b, i) => this.memory.set(address + i, b));
                return 0;
            };
            return;
        }
        const address = (bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24)) >>> 0;
        this.pending = () => {
            const memory = this.memoryInAlt(address);
            if (memory === undefined) {
                return ERR_ADDRESS;
            }
            this.pointer = address;
            if (bytes[0] === 0x41) {
                const page = MEMORIES[memory].page;
                const start = address - (address % page);
                this.erased.push({ memory, address: start });
                for (let a = start; a < start + page; a++) {
                    this.memory.delete(a);
                }
            }
            return 0;
        };
    }

    controlTransferIn(setup: Setup, length: number) {
        if (setup.request === REQ.GETSTATUS) {
            if (this.busy) {
                this.busy = false;
                this.statusCode = this.pending!();
                this.state = this.statusCode ? STATE.dfuERROR : STATE.dfuDNLOAD_IDLE;
                return Promise.resolve({ status: "ok", data: new Uint8Array([0, 1, 0, 0, STATE.dfuDNBUSY, 0]) });
            }
            return Promise.resolve({ status: "ok", data: new Uint8Array([this.statusCode, 0, 0, 0, this.state, 0]) });
        }
        if (setup.request === REQ.UPLOAD) {
            const address = this.pointer + (setup.value - 2) * TRANSFER_SIZE;
            if (!this.reaches(address, length)) {
                return Promise.reject(new Error("stall: read outside the selected alternate setting"));
            }
            this.state = STATE.dfuUPLOAD_IDLE;
            const chunk = Array.from({ length }, (_, i) => this.memory.get(address + i) ?? 0xff);
            return Promise.resolve({ status: "ok", data: new Uint8Array(chunk) });
        }
        return Promise.resolve({ status: "ok", data: new Uint8Array(length) });
    }
}

function block(address: number, byteCount: number, seed: number) {
    const data = Array.from({ length: byteCount }, (_, i) => (i * 7 + seed) & 0xff);
    return { address, bytes: byteCount, data };
}

function makeHex(blocks: ReturnType<typeof block>[]): ParsedHex {
    return {
        bytes_total: blocks.reduce((n, b) => n + b.bytes, 0),
        data: blocks,
        end_of_file: true,
        start_linear_address: FLASH_BASE,
    };
}

describe.each(LAYOUTS)("DFU flashing on the UM324xF boot loader: $name", (layout) => {
    let messages: { msg: string | null; type?: string }[];
    let bootloader: FakeUm324xfBootloader;
    let dfu: UsbDfuProtocol;
    let done: ReturnType<typeof vi.fn<() => void>>;

    function flash(hex: ParsedHex, erase_chip = false) {
        void dfu.connect(
            "usb_fake",
            hex,
            {
                erase_chip,
                flashingMessage: (msg: string | null, type?: string) => messages.push({ msg, type }),
                flashProgress: vi.fn(),
                flashMessageTypes: { VALID: "VALID", INVALID: "INVALID" },
            },
            done,
        );
    }

    function contents(b: ReturnType<typeof block>) {
        return Array.from({ length: b.bytes }, (_, i) => bootloader.memory.get(b.address + i));
    }

    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        messages = [];
        done = vi.fn<() => void>();
        bootloader = new FakeUm324xfBootloader(layout);
        dfu = new UsbDfuProtocol(bootloader as unknown as DfuTransport);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("writes the internal flash and the QSPI flash blocks of one hex", async () => {
        // Like a betaflight hex: vector table page, code after the config page, code in QSPI
        const vectors = block(FLASH_BASE, 1024, 1);
        const code = block(FLASH_BASE + 0x4000, 9000, 2);
        const qspi = block(QSPI_BASE, 5000, 3);

        flash(makeHex([vectors, code, qspi]));
        await vi.advanceTimersByTimeAsync(10000);

        expect(messages.at(-1)).toEqual({ msg: "stm32ProgrammingSuccessful", type: "VALID" });
        expect(contents(vectors)).toEqual(vectors.data);
        expect(contents(code)).toEqual(code.data);
        expect(contents(qspi)).toEqual(qspi.data);
        // Only the pages the hex covers: the config page at 0x08002000 is kept
        expect(bootloader.erased).toEqual([
            { memory: 0, address: FLASH_BASE },
            { memory: 0, address: FLASH_BASE + 0x4000 },
            { memory: 0, address: FLASH_BASE + 0x6000 },
            { memory: 1, address: QSPI_BASE },
            { memory: 1, address: QSPI_BASE + 0x1000 },
        ]);
        expect(bootloader.altSwitches.length > 0).toBe(layout.switchesForQspi);
        // Leaves DFU from the internal flash's alternate setting, alt 0 in both layouts
        expect(bootloader.left).toBe(true);
        expect(bootloader.leftAlt).toBe(0);
        expect(done).toHaveBeenCalledOnce();
    });

    it("erases every page of both memories for a full chip erase", async () => {
        flash(makeHex([block(FLASH_BASE, 2048, 1), block(QSPI_BASE, 2048, 2)]), true);
        await vi.advanceTimersByTimeAsync(20000);

        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
        expect(bootloader.erased.filter((e) => e.memory === 0)).toHaveLength(64);
        expect(bootloader.erased.filter((e) => e.memory === 1)).toHaveLength(128);
    });

    it("does not switch alternate setting for a hex with internal flash blocks only", async () => {
        flash(makeHex([block(FLASH_BASE, 4096, 1)]));
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
        expect(bootloader.altSwitches).toEqual([]);
    });

    it("refuses a hex with a block outside every writable flash", async () => {
        flash(makeHex([block(FLASH_BASE, 1024, 1), block(0x04004000, 256, 2)]));
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages.map((m) => m.msg)).toContain("dfu_hex_address_errors");
        expect(bootloader.erased).toEqual([]);
    });
});

describe("DFU flashing on the UM324xF boot loader: edge cases", () => {
    const [separateAlts, combinedAlt0] = LAYOUTS;
    let messages: { msg: string | null; type?: string }[];
    let bootloader: FakeUm324xfBootloader;

    async function flashWith(layout: Layout, hex: ParsedHex, { canSwitchAlt = true, erase_chip = false } = {}) {
        setActivePinia(createPinia());
        messages = [];
        bootloader = new FakeUm324xfBootloader(layout);
        if (!canSwitchAlt) {
            // Like the Android transport, which has no SET_INTERFACE
            Object.defineProperty(bootloader, "selectAlternateInterface", { value: undefined });
        }
        const dfu = new UsbDfuProtocol(bootloader as unknown as DfuTransport);
        void dfu.connect(
            "usb_fake",
            hex,
            {
                erase_chip,
                flashingMessage: (msg: string | null, type?: string) => messages.push({ msg, type }),
                flashProgress: vi.fn(),
                flashMessageTypes: { VALID: "VALID", INVALID: "INVALID" },
            },
            vi.fn(),
        );
        await vi.advanceTimersByTimeAsync(20000);
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("refuses a hex that needs another alternate setting when the transport cannot switch", async () => {
        await flashWith(separateAlts, makeHex([block(FLASH_BASE, 1024, 1), block(QSPI_BASE, 1024, 2)]), {
            canSwitchAlt: false,
        });

        expect(messages.map((m) => m.msg)).toContain("dfu_hex_alt_switch_unsupported");
        expect(bootloader.erased).toEqual([]);
    });

    it("flashes both flashes without switching when they share alternate setting 0", async () => {
        await flashWith(combinedAlt0, makeHex([block(FLASH_BASE, 1024, 1), block(QSPI_BASE, 1024, 2)]), {
            canSwitchAlt: false,
        });

        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
    });

    it("only writes to the writable sectors of a second flash", async () => {
        const layout: Layout = {
            ...separateAlts,
            descriptors: ["@Internal Flash   /0x08000000/64*008Kg", "@QSPI Flash       /0x38000000/64*004Kg,64*004Ka"],
        };

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1), block(QSPI_BASE + 0x40000, 1024, 2)]));
        expect(messages.map((m) => m.msg)).toContain("dfu_hex_address_errors");
        expect(bootloader.erased).toEqual([]);

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1), block(QSPI_BASE, 1024, 2)]));
        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
    });

    it("skips the read-only sectors of a second flash in a full chip erase", async () => {
        const layout: Layout = {
            ...separateAlts,
            descriptors: ["@Internal Flash   /0x08000000/64*008Kg", "@QSPI Flash       /0x38000000/64*004Kg,64*004Ka"],
        };

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1), block(QSPI_BASE, 1024, 2)]), { erase_chip: true });

        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
        expect(bootloader.erased.filter((e) => e.memory === 0)).toHaveLength(64);
        const qspiErased = bootloader.erased.filter((e) => e.memory === 1);
        expect(qspiErased).toHaveLength(64);
        expect(qspiErased.every((e) => e.address < QSPI_BASE + 64 * 0x1000)).toBe(true);
    });

    // The primary flash's attributes are not trusted: the AT32 F437 boot loader reports its
    // first pages read-only ("@Internal Flash /0x08000000/08*04Ka,..."), yet every betaflight
    // hex starts there and flashes. Pin that a hex in a read-only primary run still flashes.
    it("writes and erases read-only sectors of the primary flash", async () => {
        const layout: Layout = {
            ...separateAlts,
            descriptors: ["@Internal Flash   /0x08000000/02*008Ka,62*008Kg", "@QSPI Flash       /0x38000000/128*004Kg"],
        };

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1)]));
        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
        expect(bootloader.erased).toEqual([{ memory: 0, address: FLASH_BASE }]);

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1)]), { erase_chip: true });
        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
        expect(bootloader.erased.filter((e) => e.memory === 0)).toHaveLength(64);
    });

    it("ignores a second flash whose descriptor has no attribute letter", async () => {
        const layout: Layout = {
            ...separateAlts,
            descriptors: ["@Internal Flash   /0x08000000/64*008Kg", "@External Flash /0x38000000/128*4K"],
        };

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1), block(QSPI_BASE, 1024, 2)]));
        expect(messages.map((m) => m.msg)).toContain("dfu_hex_address_errors");

        await flashWith(layout, makeHex([block(FLASH_BASE, 1024, 1)]));
        expect(messages.at(-1)?.msg).toBe("stm32ProgrammingSuccessful");
    });
});

describe("isBlockUsable", () => {
    const layout = {
        start_address: 0,
        total_size: 0x2000,
        sectors: [
            { num_pages: 1, start_address: 0, page_size: 0x1000, total_size: 0x1000 },
            { num_pages: 1, start_address: 0x1000, page_size: 0x1000, total_size: 0x1000 },
        ],
    };
    const dfu = new UsbDfuProtocol(new FakeUm324xfBootloader(LAYOUTS[0]) as unknown as DfuTransport);

    it("accepts a block that starts mid-run and ends at the end of memory", () => {
        expect(dfu.isBlockUsable(0xf00, 0x1100, layout)).toBe(true);
    });

    it("refuses a block that starts mid-run and overruns the end of memory", () => {
        expect(dfu.isBlockUsable(0xf00, 0x1200, layout)).toBe(false);
    });
});
