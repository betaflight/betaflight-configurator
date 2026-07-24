import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/js/injected_methods";
import MSP from "../../../src/js/msp";
import { serial } from "../../../src/js/serial";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import CONFIGURATOR from "../../../src/js/data_storage";
import { getSetting, setSetting, getSettingInfo } from "../../../src/composables/useNamedSetting";

function stringToBytes(str) {
    return Array.from(str, (c) => c.charCodeAt(0));
}

// Mirrors MSP.encode_message_v2, but for a FC->Configurator response frame (direction '>',
// or '!' for the MSP2_CLI_SETTING(_INFO) "name not found" NACK).
function v2ResponseFrame(code, payload = [], { unsupported = false } = {}) {
    const direction = unsupported ? MSP.symbols.UNSUPPORTED : MSP.symbols.FROM_MWC;
    const length = payload.length;
    const bytes = [
        MSP.symbols.BEGIN,
        MSP.symbols.PROTO_V2,
        direction,
        0, // flag
        code & 0xff,
        (code >> 8) & 0xff,
        length & 0xff,
        (length >> 8) & 0xff,
        ...payload,
    ];
    const crc = MSP.crc8_dvb_s2_data(bytes, 3, bytes.length);
    return [...bytes, crc];
}

function readFrame(bytes) {
    MSP.read({ data: new Uint8Array(bytes).buffer });
}

describe("useNamedSetting", () => {
    const mspHelper = new MspHelper();

    beforeEach(() => {
        serial._protocol = { connected: true };
        CONFIGURATOR.virtualMode = false;

        MSP.callbacks = [];
        MSP.parked.clear();
        MSP.state = MSP.decoder_states.IDLE;

        MSP.listeners = [];
        MSP.listen(mspHelper.process_data.bind(mspHelper));

        vi.spyOn(serial, "send").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getSetting", () => {
        it("requests the raw setting name and parses the 'name = value' reply", async () => {
            const promise = getSetting("adrc_wc_roll");

            expect(serial.send).toHaveBeenCalledTimes(1);
            const [sentBuffer] = serial.send.mock.calls[0];
            const sentView = new Uint8Array(sentBuffer);
            // header (9 bytes: $ X > flag codeLo codeHi lenLo lenHi) + payload + crc
            expect(sentView.slice(8, sentView.length - 1)).toEqual(new Uint8Array(stringToBytes("adrc_wc_roll")));

            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING, stringToBytes("adrc_wc_roll = 60")));

            await expect(promise).resolves.toBe("60");
        });

        it("throws when the firmware NACKs an unknown setting name", async () => {
            const promise = getSetting("not_a_real_setting");

            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING, [], { unsupported: true }));

            await expect(promise).rejects.toThrow(/not found/);
        });
    });

    describe("setSetting", () => {
        it("sends 'name = value' and returns the firmware-echoed value", async () => {
            const promise = setSetting("adrc_wc_roll", 75);

            const [sentBuffer] = serial.send.mock.calls[0];
            const sentView = new Uint8Array(sentBuffer);
            expect(sentView.slice(8, sentView.length - 1)).toEqual(new Uint8Array(stringToBytes("adrc_wc_roll = 75")));

            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING, stringToBytes("adrc_wc_roll = 75")));

            await expect(promise).resolves.toBe("75");
        });

        it("throws when the set is rejected (out of range / unknown name)", async () => {
            const promise = setSetting("adrc_wc_roll", 99999);

            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING, [], { unsupported: true }));

            await expect(promise).rejects.toThrow(/Failed to set/);
        });
    });

    describe("getSettingInfo", () => {
        it("parses a direct-type (min/max) reply in a single frame", async () => {
            const infoText = "pgn=15\ntype=uint16\nmin=5\nmax=300\ndefault=60\n";
            const payload = [infoText.length & 0xff, (infoText.length >> 8) & 0xff, ...stringToBytes(infoText)];

            const promise = getSettingInfo("adrc_wc_roll");
            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING_INFO, payload));

            await expect(promise).resolves.toEqual({
                pgn: 15,
                type: "uint16",
                min: 5,
                max: 300,
                default: "60",
            });
        });

        it("parses a lookup-type reply into a values array", async () => {
            const infoText = "pgn=15\ntype=lookup\nvalues=CLASSIC,ADRC\ndefault=CLASSIC\n";
            const payload = [infoText.length & 0xff, (infoText.length >> 8) & 0xff, ...stringToBytes(infoText)];

            const promise = getSettingInfo("pid_type");
            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING_INFO, payload));

            await expect(promise).resolves.toEqual({
                pgn: 15,
                type: "lookup",
                values: ["CLASSIC", "ADRC"],
                default: "CLASSIC",
            });
        });

        it("loops requesting successive offsets when the info text spans more than one frame", async () => {
            const infoText = "pgn=15\ntype=uint16\nmin=5\nmax=300\ndefault=60\n";
            const firstChunk = infoText.slice(0, 10);
            const secondChunk = infoText.slice(10);

            const promise = getSettingInfo("adrc_wc_roll");

            // first request: bare name, offset 0
            readFrame(
                v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING_INFO, [
                    infoText.length & 0xff,
                    (infoText.length >> 8) & 0xff,
                    ...stringToBytes(firstChunk),
                ]),
            );

            // second request should be name + \0 + offset(LE u16) = firstChunk.length
            // let the pending MSP.promise() continuation (which issues the follow-up
            // request synchronously once resumed) drain through the microtask queue
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(serial.send).toHaveBeenCalledTimes(2);
            const [secondBuffer] = serial.send.mock.calls[1];
            const secondView = new Uint8Array(secondBuffer);
            const secondPayload = secondView.slice(8, secondView.length - 1);
            expect(secondPayload).toEqual(new Uint8Array([...stringToBytes("adrc_wc_roll"), 0, firstChunk.length, 0]));

            readFrame(
                v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING_INFO, [
                    infoText.length & 0xff,
                    (infoText.length >> 8) & 0xff,
                    ...stringToBytes(secondChunk),
                ]),
            );

            await expect(promise).resolves.toEqual({
                pgn: 15,
                type: "uint16",
                min: 5,
                max: 300,
                default: "60",
            });
        });

        it("throws when the firmware NACKs an unknown setting name", async () => {
            const promise = getSettingInfo("not_a_real_setting");

            readFrame(v2ResponseFrame(MSPCodes.MSP2_CLI_SETTING_INFO, [], { unsupported: true }));

            await expect(promise).rejects.toThrow(/not found/);
        });
    });
});
