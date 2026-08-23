import { beforeEach, describe, expect, it } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";
import FC from "../../../src/js/fc";

/**
 * The app names a subset of the firmware's serial function bits and must round-trip the rest
 * untouched, because it cannot always tell which layout the FC uses: c18421eb moved
 * OSD_CUSTOM_TEXT into bit 19 without bumping API_VERSION_MINOR, so a released 2026.6.1 board
 * (bit 19 = LIDAR_NL) and a pre-1.49 master build (bit 19 = OSD_CUSTOM_TEXT) both answer
 * "1.48". Writing a bit whose meaning cannot be resolved would reassign a user's rangefinder.
 */

const mspHelper = new MspHelper();

// serialPortFunction_e in src/main/io/serial.h, firmware master (API 1.49), keyed by the
// configurator's name for each bit. A superset on purpose: the app names only some of these,
// and what matters is that the ones it does name carry the firmware's value.
const FIRMWARE_BITS = {
    MSP: 0,
    GPS: 1,
    TELEMETRY_FRSKY: 2, // FUNCTION_TELEMETRY_FRSKY_HUB
    TELEMETRY_HOTT: 3,
    TELEMETRY_LTM: 4,
    TELEMETRY_SMARTPORT: 5,
    RX_SERIAL: 6,
    BLACKBOX: 7,
    TELEMETRY_MAVLINK: 9,
    ESC_SENSOR: 10,
    TBS_SMARTAUDIO: 11, // FUNCTION_VTX_SMARTAUDIO
    TELEMETRY_IBUS: 12,
    IRC_TRAMP: 13, // FUNCTION_VTX_TRAMP
    RUNCAM_DEVICE_CONTROL: 14, // FUNCTION_RCDEVICE
    LIDAR_TF: 15, // FUNCTION_LIDAR, the unified serial rangefinder bit
    FRSKY_OSD: 16,
    VTX_MSP: 17,
    GIMBAL: 18,
    OSD_CUSTOM_TEXT: 19,
};

// Bits no firmware defines yet, standing in for whatever it adds next. The live instance today
// is bit 19 on a board that reports API 1.48, which this build cannot name for the reason above.
const RESERVED_BIT = 1 << 25;
const OTHER_RESERVED_BIT = 1 << 30;

function serialConfigBuffer(ports) {
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

/** Decode a MSP2_COMMON_SERIAL_CONFIG reply into FC.SERIAL_CONFIG.ports. */
function readSerialConfig(ports) {
    mspHelper.process_data({
        code: MSPCodes.MSP2_COMMON_SERIAL_CONFIG,
        dataView: new DataView(new Uint8Array(serialConfigBuffer(ports)).buffer),
        crcError: false,
        callbacks: [],
    });
}

/** Re-encode FC.SERIAL_CONFIG.ports and pull each port's function mask back out. */
function writtenMasks() {
    const buffer = mspHelper.crunch(MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG);
    const view = new DataView(new Uint8Array(buffer).buffer);
    const masks = [];

    const count = view.getUint8(0);
    for (let i = 0; i < count; i++) {
        masks.push(view.getUint32(1 + i * 9 + 1, true));
    }
    return masks;
}

describe("serial port function bits", () => {
    beforeEach(() => {
        FC.resetState();
    });

    describe("SERIAL_PORT_FUNCTIONS layout", () => {
        it("gives every named function the bit the firmware gives it", () => {
            for (const [name, bit] of Object.entries(mspHelper.SERIAL_PORT_FUNCTIONS)) {
                expect(FIRMWARE_BITS, `${name} is not a firmware serial function`).toHaveProperty(name);
                expect(bit, `${name} is on the wrong bit`).toEqual(FIRMWARE_BITS[name]);
            }
        });

        it("assigns each bit to exactly one function", () => {
            const bits = Object.values(mspHelper.SERIAL_PORT_FUNCTIONS);
            expect(new Set(bits).size).toEqual(bits.length);
        });

        it("reports exactly the named bits in the known mask", () => {
            const known = mspHelper.serialPortKnownFunctionMask();
            let expected = 0;
            for (const bit of Object.values(mspHelper.SERIAL_PORT_FUNCTIONS)) {
                expected |= 1 << bit;
            }
            expect(known).toEqual(expected >>> 0);
        });
    });

    describe("serialPortUnknownFunctionMask", () => {
        it("returns only the bits this build cannot name", () => {
            const mask = (1 << 1) | RESERVED_BIT | OTHER_RESERVED_BIT;
            expect(mspHelper.serialPortUnknownFunctionMask(mask)).toEqual(RESERVED_BIT | OTHER_RESERVED_BIT);
        });

        it("returns zero for a fully known mask", () => {
            expect(mspHelper.serialPortUnknownFunctionMask((1 << 0) | (1 << 1))).toEqual(0);
        });

        it("treats a missing mask as nothing to preserve", () => {
            expect(mspHelper.serialPortUnknownFunctionMask(undefined)).toEqual(0);
        });
    });

    describe("decoding a serial config", () => {
        it("retains the raw mask alongside the names it could decode", () => {
            const mask = (1 << 1) | RESERVED_BIT;
            readSerialConfig([{ identifier: 3, functionMask: mask }]);

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual(mask);
            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual(["GPS"]);
        });
    });

    describe("decode -> encode round-trip", () => {
        it("preserves unnamed bits through an unchanged save", () => {
            const masks = [(1 << 0) | RESERVED_BIT, (1 << 1) | OTHER_RESERVED_BIT];

            readSerialConfig([
                { identifier: 0, functionMask: masks[0] },
                { identifier: 1, functionMask: masks[1] },
            ]);

            expect(writtenMasks()).toEqual(masks);
        });

        it("preserves unnamed bits on a port the user edited", () => {
            readSerialConfig([{ identifier: 3, functionMask: (1 << 1) | RESERVED_BIT }]);

            // user swaps GPS for ESC_SENSOR on this port
            FC.SERIAL_CONFIG.ports[0].functions = ["ESC_SENSOR"];

            expect(writtenMasks()).toEqual([(1 << 10) | RESERVED_BIT]);
        });

        it("preserves unnamed bits on a port whose functions were all cleared", () => {
            readSerialConfig([{ identifier: 5, functionMask: (1 << 7) | RESERVED_BIT }]);

            FC.SERIAL_CONFIG.ports[0].functions = [];

            expect(writtenMasks()).toEqual([RESERVED_BIT]);
        });

        it("preserves an unnamed bit on one port while another port is edited", () => {
            readSerialConfig([
                { identifier: 0, functionMask: 1 << 0 },
                { identifier: 4, functionMask: RESERVED_BIT },
            ]);

            FC.SERIAL_CONFIG.ports[0].functions = ["MSP", "TELEMETRY_MAVLINK"];

            expect(writtenMasks()).toEqual([(1 << 0) | (1 << 9), RESERVED_BIT]);
        });

        it("encodes nothing extra when the FC port carries no mask (virtual mode)", () => {
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
});
