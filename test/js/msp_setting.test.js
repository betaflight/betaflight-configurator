import { describe, expect, it, vi, beforeEach } from "vitest";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { getSetting, getSettingInfo, setSetting } from "../../src/composables/useMspSetting";

const { promise } = vi.hoisted(() => ({ promise: vi.fn() }));
vi.mock("../../src/js/msp", () => ({ default: { promise } }));

const encoder = new TextEncoder();

/** Build the reply shape MSP.promise resolves with. */
function reply(bytes, { unsupported = 0 } = {}) {
    const buffer = Uint8Array.from(bytes);
    return {
        command: 0,
        data: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        length: buffer.byteLength,
        crcError: false,
        unsupported,
    };
}

const textReply = (text) => reply([...encoder.encode(text)]);

/** MSP2_CLI_SETTING_INFO prefixes its window with the total length of the whole block. */
function infoReply(text, { total = null, from = 0 } = {}) {
    const all = encoder.encode(text);
    const window = all.slice(from);
    const length = total ?? all.byteLength;
    return reply([length & 0xff, (length >> 8) & 0xff, ...window]);
}

/** Decode a request payload back to the string the firmware would see. */
const sentText = (call) => new TextDecoder().decode(Uint8Array.from(call[1]));

describe("useMspSetting", () => {
    beforeEach(() => promise.mockReset());

    describe("getSetting", () => {
        it("asks for the setting by name and returns its value", async () => {
            promise.mockResolvedValue(textReply("dronecan_enabled = OFF"));

            await expect(getSetting("dronecan_enabled")).resolves.toBe("OFF");

            const [code, payload] = promise.mock.calls[0];
            expect(code).toBe(MSPCodes.MSP2_CLI_SETTING);
            expect(new TextDecoder().decode(Uint8Array.from(payload))).toBe("dronecan_enabled");
        });

        it("returns null when the build has no such setting", async () => {
            promise.mockResolvedValue(reply([], { unsupported: 1 }));

            await expect(getSetting("dronecan_enabled")).resolves.toBeNull();
        });

        // `get` matches on substring, so a reply can name more than the setting asked for.
        it("picks the line naming the setting exactly", async () => {
            promise.mockResolvedValue(textReply("dronecan_enabled = ON\ndronecan_enabled_extra = 7"));

            await expect(getSetting("dronecan_enabled")).resolves.toBe("ON");
        });
    });

    describe("setSetting", () => {
        it("sends name and value, and returns what the firmware echoed", async () => {
            promise.mockResolvedValue(textReply("dronecan_enabled = ON"));

            await expect(setSetting("dronecan_enabled", "ON")).resolves.toBe("ON");
            expect(sentText(promise.mock.calls[0])).toBe("dronecan_enabled = ON");
        });

        it("throws when the firmware refuses the write", async () => {
            promise.mockResolvedValue(reply([], { unsupported: 1 }));

            await expect(setSetting("dronecan_device", 9)).rejects.toThrow(/refused dronecan_device = 9/);
        });

        // The firmware acknowledges a write whose confirmation it could not fit, so an empty body
        // means "written", not "ignored".
        it("treats an empty echo as success", async () => {
            promise.mockResolvedValue(textReply(""));

            await expect(setSetting("dronecan_device", 2)).resolves.toBe("2");
        });
    });

    describe("getSettingInfo", () => {
        it("parses the bounds of a numeric setting", async () => {
            promise.mockResolvedValue(infoReply("pgn=63\ntype=uint8\nmin=1\nmax=3\n"));

            await expect(getSettingInfo("dronecan_device")).resolves.toEqual({
                type: "uint8",
                min: 1,
                max: 3,
                values: null,
            });
        });

        it("parses the accepted names of a lookup setting", async () => {
            promise.mockResolvedValue(infoReply("pgn=63\ntype=lookup\nvalues=OFF,ON\n"));

            const info = await getSettingInfo("dronecan_enabled");

            expect(info.type).toBe("lookup");
            expect(info.values).toEqual(["OFF", "ON"]);
            expect(info.max).toBeNull();
        });

        it("sends the name NUL-terminated with a little-endian offset", async () => {
            promise.mockResolvedValue(infoReply("type=uint8\nmin=1\nmax=3\n"));

            await getSettingInfo("dronecan_device");

            const [code, payload] = promise.mock.calls[0];
            expect(code).toBe(MSPCodes.MSP2_CLI_SETTING_INFO);
            expect(payload).toEqual([...encoder.encode("dronecan_device"), 0, 0, 0]);
        });

        it("pages until the whole block is in", async () => {
            const text = "pgn=63\ntype=uint8\nmin=1\nmax=3\n";
            const split = 10;
            promise
                .mockResolvedValueOnce(infoReply(text.slice(0, split), { total: text.length }))
                .mockResolvedValueOnce(infoReply(text, { total: text.length, from: split }));

            await expect(getSettingInfo("dronecan_device")).resolves.toEqual({
                type: "uint8",
                min: 1,
                max: 3,
                values: null,
            });

            expect(promise).toHaveBeenCalledTimes(2);
            // The second request resumes at the byte after the first window.
            const [, second] = promise.mock.calls[1];
            expect(second.slice(-2)).toEqual([split, 0]);
        });

        it("returns null when the firmware does not know the message", async () => {
            promise.mockResolvedValue(reply([], { unsupported: 1 }));

            await expect(getSettingInfo("dronecan_device")).resolves.toBeNull();
        });
    });
});
