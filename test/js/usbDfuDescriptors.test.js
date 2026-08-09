import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import UsbDfuDescriptors from "../../src/js/protocols/UsbDfuDescriptors.js";

// The descriptor layer is pure parsing over control transfers, so it can be driven
// entirely through a scripted _rawControlTransferIn with no USB backend at all.

const CONFIG = 0x200;
const STRING = 0x300;

/** @returns {number[]} a 9-byte configuration descriptor header */
const configHeader = (totalLength) => [9, 2, totalLength & 0xff, totalLength >> 8, 1, 1, 0, 0x80, 50];

/** @returns {number[]} a 9-byte interface descriptor */
const interfaceDescriptor = ({ number = 0, alternate = 0, cls = 0xfe, subclass = 0x01, iInterface = 0 } = {}) => [
    9,
    4,
    number,
    alternate,
    0,
    cls,
    subclass,
    0x02,
    iInterface,
];

/** @returns {number[]} a 9-byte DFU functional descriptor */
const functionalDescriptor = (transferSize) => [
    9,
    0x21,
    0x0b,
    0xff,
    0x00,
    transferSize & 0xff,
    transferSize >> 8,
    0x1a,
    0x01,
];

/** @returns {number[]} a USB string descriptor holding `text` as UTF-16LE */
function stringDescriptor(text) {
    const bytes = [0, 3];
    for (const char of text) {
        const code = char.codePointAt(0);
        bytes.push(code & 0xff, code >> 8);
    }
    bytes[0] = bytes.length;
    return bytes;
}

function buildConfig(parts) {
    const body = parts.flat();
    const total = 9 + body.length;
    return [...configHeader(total), ...body];
}

class ScriptedTransport extends UsbDfuDescriptors {
    constructor({ config = [], strings = {}, langId = [4, 3, 0x09, 0x04], standalone } = {}) {
        super();
        this.logHead = "[test]";
        this.config = config;
        this.strings = strings;
        this.langId = langId;
        this.standalone = standalone;
        this.calls = [];
    }

    async _rawControlTransferIn(setup, length) {
        this.calls.push({ value: setup.value, length });

        if (setup.value === STRING) {
            return this.respond(this.langId, length);
        }
        if ((setup.value & 0xff00) === STRING) {
            const text = this.strings[setup.value & 0xff];
            return text === undefined
                ? { status: "stall", data: new Uint8Array(0) }
                : this.respond(stringDescriptor(text), length);
        }
        if (setup.value === CONFIG) {
            return this.respond(this.config, length);
        }
        if (setup.value === 0x2100) {
            if (!this.standalone) {
                throw new Error("device never answers the standalone request");
            }
            return this.respond(this.standalone, length);
        }
        return { status: "stall", data: new Uint8Array(0) };
    }

    respond(bytes, length) {
        return { status: "ok", data: new Uint8Array(bytes.slice(0, length)) };
    }
}

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("getLangId", () => {
    it("reads the first supported LANGID and caches it", async () => {
        const transport = new ScriptedTransport();
        expect(await transport.getLangId()).toBe(0x0409);

        await transport.getLangId();
        expect(transport.calls.filter((c) => c.value === STRING)).toHaveLength(1);
    });

    it("falls back to English US when the descriptor is short", async () => {
        const transport = new ScriptedTransport({ langId: [2, 3] });
        expect(await transport.getLangId()).toBe(0x0409);
    });
});

describe("getString", () => {
    it("decodes UTF-16LE", async () => {
        const transport = new ScriptedTransport({ strings: { 4: "@Internal Flash /0x08000000" } });
        expect(await transport.getString(4)).toBe("@Internal Flash /0x08000000");
    });

    it("returns empty for index 0 without a transfer", async () => {
        const transport = new ScriptedTransport();
        expect(await transport.getString(0)).toBe("");
        expect(transport.calls).toHaveLength(0);
    });
});

describe("getConfigDescriptor", () => {
    it("reads the header first, then the whole blob, then caches", async () => {
        const config = buildConfig([interfaceDescriptor(), functionalDescriptor(2048)]);
        const transport = new ScriptedTransport({ config });

        const blob = await transport.getConfigDescriptor();
        expect(blob).toHaveLength(config.length);

        const lengths = transport.calls.filter((c) => c.value === CONFIG).map((c) => c.length);
        expect(lengths).toEqual([9, config.length]);

        await transport.getConfigDescriptor();
        expect(transport.calls.filter((c) => c.value === CONFIG)).toHaveLength(2);
    });

    it("rejects a header too short to hold the length", async () => {
        // An "ok" transfer can still come back short; reading past the end would yield
        // a zero length and cache an empty blob as if it were the configuration.
        const transport = new ScriptedTransport({ config: [9, 2] });
        await expect(transport.getConfigDescriptor()).rejects.toThrow(/2-byte header/);
    });

    it("rejects an implausible total length", async () => {
        const transport = new ScriptedTransport({ config: [9, 2, 4, 0, 1, 1, 0, 0x80, 50] });
        await expect(transport.getConfigDescriptor()).rejects.toThrow(/implausible length of 4/);
    });

    it("rejects a device-supplied length large enough to stall the flasher", async () => {
        // wTotalLength 0xffff from a bogus device must not trigger a 64 KiB read.
        const transport = new ScriptedTransport({ config: [9, 2, 0xff, 0xff, 1, 1, 0, 0x80, 50] });
        await expect(transport.getConfigDescriptor()).rejects.toThrow(/implausible length of 65535/);
    });

    it("rejects a body shorter than the advertised length", async () => {
        // Claims 64 bytes but only ever returns the 18 it has.
        const short = [9, 2, 64, 0, 1, 1, 0, 0x80, 50, ...interfaceDescriptor()];
        const transport = new ScriptedTransport({ config: short });
        await expect(transport.getConfigDescriptor()).rejects.toThrow(/returned 18 of 64 bytes/);
    });
});

describe("getInterfaceDescriptors", () => {
    it("counts interface descriptors from the blob and returns strings for the requested interface", async () => {
        const config = buildConfig([
            interfaceDescriptor({ number: 0, alternate: 0, iInterface: 4 }),
            interfaceDescriptor({ number: 0, alternate: 1, iInterface: 5 }),
            interfaceDescriptor({ number: 1, alternate: 0, iInterface: 6 }),
        ]);
        const transport = new ScriptedTransport({
            config,
            strings: { 4: "@Internal Flash", 5: "@Option Bytes", 6: "@OTP" },
        });

        expect(await transport.getInterfaceDescriptors(0)).toEqual(["@Internal Flash", "@Option Bytes"]);
        expect(await transport.getInterfaceDescriptors(1)).toEqual(["@OTP"]);
    });

    it("returns nothing when the configuration exposes no interfaces", async () => {
        const transport = new ScriptedTransport({ config: buildConfig([]) });
        expect(await transport.getInterfaceDescriptors(0)).toEqual([]);
    });
});

describe("getFunctionalDescriptor", () => {
    it("parses it out of the configuration blob without a standalone request", async () => {
        const config = buildConfig([interfaceDescriptor(), functionalDescriptor(2048)]);
        const transport = new ScriptedTransport({ config });

        const descriptor = await transport.getFunctionalDescriptor();
        expect(descriptor.wTransferSize).toBe(2048);
        expect(descriptor.bcdDFUVersion).toBe(0x011a);
        // The STM32C5 ROM never answers this, so it must not be attempted.
        expect(transport.calls.some((c) => c.value === 0x2100)).toBe(false);
    });

    it("ignores a HID descriptor that shares type 0x21 outside a DFU interface", async () => {
        // Interface class 3 is HID, so its 0x21 descriptor must not be mistaken for DFU.
        const config = buildConfig([
            interfaceDescriptor({ cls: 0x03, subclass: 0x00 }),
            functionalDescriptor(64),
            interfaceDescriptor({ number: 1 }),
            functionalDescriptor(1024),
        ]);
        const transport = new ScriptedTransport({ config });

        expect((await transport.getFunctionalDescriptor()).wTransferSize).toBe(1024);
    });

    it("falls back to the standalone request when the blob has no functional descriptor", async () => {
        const transport = new ScriptedTransport({
            config: buildConfig([interfaceDescriptor()]),
            standalone: functionalDescriptor(4096),
        });

        expect((await transport.getFunctionalDescriptor()).wTransferSize).toBe(4096);
        expect(transport.calls.some((c) => c.value === 0x2100)).toBe(true);
    });

    it("rejects a standalone response that is not a usable descriptor", async () => {
        const transport = new ScriptedTransport({
            config: buildConfig([interfaceDescriptor()]),
            standalone: functionalDescriptor(0),
        });

        await expect(transport.getFunctionalDescriptor()).rejects.toThrow(/Invalid DFU functional descriptor/);
    });
});

describe("_invalidateDescriptorCache", () => {
    it("drops the cached LANGID and configuration blob", async () => {
        const transport = new ScriptedTransport({ config: buildConfig([interfaceDescriptor()]) });

        await transport.getLangId();
        await transport.getConfigDescriptor();
        const before = transport.calls.length;

        transport._invalidateDescriptorCache();
        await transport.getLangId();
        await transport.getConfigDescriptor();

        expect(transport.calls.length).toBeGreaterThan(before);
    });

    it("keeps an in-flight read from caching against the new device", async () => {
        const transport = new ScriptedTransport({ config: buildConfig([interfaceDescriptor()]) });
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        const scripted = transport._rawControlTransferIn.bind(transport);
        transport._rawControlTransferIn = async (setup, length) => {
            await gate;
            return scripted(setup, length);
        };

        const read = transport.getLangId();
        transport._invalidateDescriptorCache();
        release();

        expect(await read).toBe(0x0409);
        expect(transport._langId).toBeUndefined();
    });
});

describe("_withTimeout", () => {
    it("rejects an operation that never settles", async () => {
        const transport = new ScriptedTransport();

        await expect(transport._withTimeout(new Promise(() => {}), 10, "stuck")).rejects.toThrow(
            "USB stuck timed out after 10ms",
        );
    });

    it("passes the result through when the operation settles in time", async () => {
        const transport = new ScriptedTransport();

        await expect(transport._withTimeout(Promise.resolve(42), 1000, "fast")).resolves.toBe(42);
    });
});
