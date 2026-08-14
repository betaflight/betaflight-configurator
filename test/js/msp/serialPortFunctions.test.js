import { beforeEach, describe, expect, it } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";
import FC from "../../../src/js/fc";

/**
 * Guards the serial function bit layout.
 *
 * Firmware reshuffled these bits in c18421eb without bumping API_VERSION_MINOR, so a released
 * 2026.6.1 board and a current master board both answer "1.48" while disagreeing about what
 * bit 19 means (LIDAR_NL vs OSD_CUSTOM_TEXT). Writing a bit whose meaning cannot be resolved
 * would silently reassign a user's rangefinder, so unnamed bits must be round-tripped verbatim
 * rather than decoded.
 */

const mspHelper = new MspHelper();

// The bit layout that is stable across every firmware the app supports (4.5 / API 1.46 up to
// master). Bits 19 and 20 are deliberately absent - see AMBIGUOUS_BITS.
const STABLE_BITS = {
    MSP: 0,
    GPS: 1,
    TELEMETRY_FRSKY: 2,
    TELEMETRY_HOTT: 3,
    TELEMETRY_LTM: 4,
    TELEMETRY_SMARTPORT: 5,
    RX_SERIAL: 6,
    BLACKBOX: 7,
    TELEMETRY_MAVLINK: 9,
    ESC_SENSOR: 10,
    TBS_SMARTAUDIO: 11,
    TELEMETRY_IBUS: 12,
    IRC_TRAMP: 13,
    RUNCAM_DEVICE_CONTROL: 14,
    LIDAR_TF: 15,
    FRSKY_OSD: 16,
    VTX_MSP: 17,
    GIMBAL: 18,
};

// Bits whose meaning differs between two shipping firmwares that both report API 1.48.
// They must never be named, because naming a bit is what makes the app write it.
const AMBIGUOUS_BITS = [19, 20];

function serialConfigV2Buffer(ports) {
    const buffer = [];
    buffer.push8(ports.length);
    for (const port of ports) {
        buffer
            .push8(port.identifier)
            .push32(port.functionMask)
            .push8(mspHelper.BAUD_RATES.indexOf("115200"))
            .push8(mspHelper.BAUD_RATES.indexOf("57600"))
            .push8(mspHelper.BAUD_RATES.indexOf("AUTO"))
            .push8(mspHelper.BAUD_RATES.indexOf("115200"));
    }
    return buffer;
}

function readSerialConfig(ports, code = MSPCodes.MSP2_COMMON_SERIAL_CONFIG) {
    const buffer =
        code === MSPCodes.MSP2_COMMON_SERIAL_CONFIG
            ? serialConfigV2Buffer(ports)
            : ports.flatMap((port) =>
                []
                    .push8(port.identifier)
                    .push16(port.functionMask)
                    .push8(mspHelper.BAUD_RATES.indexOf("115200"))
                    .push8(mspHelper.BAUD_RATES.indexOf("57600"))
                    .push8(mspHelper.BAUD_RATES.indexOf("AUTO"))
                    .push8(mspHelper.BAUD_RATES.indexOf("115200")),
            );

    mspHelper.process_data({
        code,
        dataView: new DataView(new Uint8Array(buffer).buffer),
        crcError: false,
        callbacks: [],
    });
}

/** Re-encode FC.SERIAL_CONFIG.ports and pull each port's function mask back out of the buffer. */
function writtenMasks(code = MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG) {
    const buffer = mspHelper.crunch(code);
    const view = new DataView(new Uint8Array(buffer).buffer);
    const masks = [];

    if (code === MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG) {
        const count = view.getUint8(0);
        for (let i = 0; i < count; i++) {
            const base = 1 + i * 9;
            masks.push(view.getUint32(base + 1, true));
        }
    } else {
        const count = buffer.length / 7;
        for (let i = 0; i < count; i++) {
            masks.push(view.getUint16(i * 7 + 1, true));
        }
    }
    return masks;
}

describe("serial port function bits", () => {
    beforeEach(() => {
        FC.resetState();
    });

    describe("SERIAL_PORT_FUNCTIONS layout", () => {
        it("names only bits whose meaning is identical on every supported firmware", () => {
            expect(mspHelper.SERIAL_PORT_FUNCTIONS).toEqual(STABLE_BITS);
        });

        it("never names a bit that two supported firmwares define differently", () => {
            // 2026.6.1: 19 = LIDAR_NL, 20 = OSD_CUSTOM_TEXT.
            // master:   19 = OSD_CUSTOM_TEXT, 20 free. Both report API 1.48.
            const named = Object.values(mspHelper.SERIAL_PORT_FUNCTIONS);
            for (const bit of AMBIGUOUS_BITS) {
                expect(named).not.toContain(bit);
            }
        });

        it("assigns each bit to exactly one function", () => {
            const bits = Object.values(mspHelper.SERIAL_PORT_FUNCTIONS);
            expect(new Set(bits).size).toEqual(bits.length);
        });

        it("reports every named bit in the known mask", () => {
            const known = mspHelper.serialPortKnownFunctionMask();
            for (const bit of Object.values(mspHelper.SERIAL_PORT_FUNCTIONS)) {
                expect(known & (1 << bit)).not.toEqual(0);
            }
            for (const bit of AMBIGUOUS_BITS) {
                expect(known & (1 << bit)).toEqual(0);
            }
        });
    });

    describe("serialPortUnknownFunctionMask", () => {
        it("returns only the bits this build cannot name", () => {
            const mask = (1 << 1) | (1 << 19) | (1 << 20); // GPS + two unnamed bits
            expect(mspHelper.serialPortUnknownFunctionMask(mask)).toEqual((1 << 19) | (1 << 20));
        });

        it("returns zero for a fully known mask", () => {
            expect(mspHelper.serialPortUnknownFunctionMask((1 << 0) | (1 << 18))).toEqual(0);
        });

        it("is unsigned even when the top bit is set", () => {
            expect(mspHelper.serialPortUnknownFunctionMask(0xffffffff)).toBeGreaterThan(0);
        });

        it("treats a missing mask as no reserved bits", () => {
            expect(mspHelper.serialPortUnknownFunctionMask(undefined)).toEqual(0);
        });
    });

    describe("decode", () => {
        it("drops no information: an unnamed bit is retained on the port as functionMask", () => {
            const mask = (1 << 1) | (1 << 19); // GPS + LIDAR_NL-or-OSD_CUSTOM_TEXT
            readSerialConfig([{ identifier: 3, functionMask: mask }]);

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual(mask);
            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual(["GPS"]);
        });

        it("decodes GIMBAL on bit 18", () => {
            readSerialConfig([{ identifier: 4, functionMask: 1 << 18 }]);
            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual(["GIMBAL"]);
        });

        it("retains the mask on the legacy 16-bit command too", () => {
            readSerialConfig([{ identifier: 2, functionMask: (1 << 7) | (1 << 15) }], MSPCodes.MSP_CF_SERIAL_CONFIG);
            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual((1 << 7) | (1 << 15));
        });
    });

    describe("decode -> encode round-trip", () => {
        it("preserves unnamed bits through an unchanged save", () => {
            const nooploopRangefinder = 1 << 19;
            const osdCustomText = 1 << 20;
            const masks = [(1 << 0) | nooploopRangefinder, (1 << 1) | osdCustomText];

            readSerialConfig([
                { identifier: 0, functionMask: masks[0] },
                { identifier: 1, functionMask: masks[1] },
            ]);

            expect(writtenMasks()).toEqual(masks);
        });

        it("preserves unnamed bits on a port the user edited", () => {
            const mask = (1 << 1) | (1 << 19); // GPS + an unnamed bit
            readSerialConfig([{ identifier: 3, functionMask: mask }]);

            // user swaps GPS for ESC_SENSOR on this port
            FC.SERIAL_CONFIG.ports[0].functions = ["ESC_SENSOR"];

            expect(writtenMasks()).toEqual([(1 << 10) | (1 << 19)]);
        });

        it("preserves unnamed bits on a port whose functions were all cleared", () => {
            const mask = (1 << 7) | (1 << 20);
            readSerialConfig([{ identifier: 5, functionMask: mask }]);

            FC.SERIAL_CONFIG.ports[0].functions = [];

            expect(writtenMasks()).toEqual([1 << 20]);
        });

        it("preserves an unnamed bit on one port while another port is edited", () => {
            readSerialConfig([
                { identifier: 0, functionMask: 1 << 0 },
                { identifier: 4, functionMask: 1 << 19 },
            ]);

            FC.SERIAL_CONFIG.ports[0].functions = ["MSP", "TELEMETRY_MAVLINK"];

            expect(writtenMasks()).toEqual([(1 << 0) | (1 << 9), 1 << 19]);
        });

        it("round-trips GIMBAL, which is named rather than reserved", () => {
            readSerialConfig([{ identifier: 4, functionMask: 1 << 18 }]);
            expect(writtenMasks()).toEqual([1 << 18]);
        });

        it("does not leak a reserved bit above 15 into the legacy 16-bit command", () => {
            readSerialConfig([{ identifier: 3, functionMask: (1 << 1) | (1 << 19) }]);

            // The legacy command has no room for bit 19; it must be dropped, not wrapped
            // into an unrelated low bit.
            expect(writtenMasks(MSPCodes.MSP_SET_CF_SERIAL_CONFIG)).toEqual([1 << 1]);
        });

        it("encodes nothing extra when the FC port carries no mask (virtual/legacy state)", () => {
            FC.SERIAL_CONFIG.ports = [
                {
                    identifier: 0,
                    functions: ["MSP"],
                    msp_baudrate: "115200",
                    gps_baudrate: "57600",
                    telemetry_baudrate: "AUTO",
                    blackbox_baudrate: "115200",
                },
            ];

            expect(writtenMasks()).toEqual([1 << 0]);
        });
    });

    describe("serialPortFunctionsToMask", () => {
        it("defaults to no reserved bits", () => {
            expect(mspHelper.serialPortFunctionsToMask(["GPS"])).toEqual(1 << 1);
        });

        it("ors the reserved mask over the named bits", () => {
            expect(mspHelper.serialPortFunctionsToMask(["GPS"], 1 << 19)).toEqual((1 << 1) | (1 << 19));
        });

        it("ignores function names it does not know", () => {
            expect(mspHelper.serialPortFunctionsToMask(["GPS", "NOT_A_FUNCTION"])).toEqual(1 << 1);
        });
    });
});
