import { describe, expect, it } from "vitest";
import { FlightLogParser } from "../../src/blackbox-viewer/flightlog_parser.js";

/*
 * The `debug_mode_name` and `debug_field[n]` headers, read off a log.
 *
 * These are what make a log self-describing: without them the app has to index
 * its generated table by an API version guessed from the revision string, so
 * firmware it has never seen mislabels every debug field in silence.
 */

const FRAME_DEFS = [
    "H Product:Blackbox flight data recorder by Nicholas Sherlock",
    "H Data version:2",
    "H Firmware type:Cleanflight",
    "H Firmware revision:Betaflight 2026.12.0 (f5fb2717b) MATEKH743",
    "H Field I name:loopIteration,time,debug[0],debug[1],debug[2],debug[3]",
    "H Field I signed:0,0,1,1,1,1",
    "H Field I predictor:0,0,0,0,0,0",
    "H Field I encoding:1,1,0,0,0,0",
    "H Field P predictor:6,2,0,0,0,0",
    "H Field P encoding:9,0,0,0,0,0",
];

const parseLog = (...headers) => {
    const text = `${[...FRAME_DEFS, ...headers].join("\n")}\n`;
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.codePointAt(i);
    }

    const parser = new FlightLogParser(bytes);
    parser.parseHeader(0, bytes.length);
    return parser;
};

describe("the debug map a log carries in its header", () => {
    it("keeps the firmware's own name for the mode", () => {
        const { sysConfig } = parseLog("H debug_mode:104", "H debug_mode_name:GPS_RESCUE_HEADING");

        expect(sysConfig.debug_mode).toBe(104);
        expect(sysConfig.debug_mode_name).toBe("GPS_RESCUE_HEADING");
    });

    /*
     * parseHeaderLine splits on the FIRST colon only, so a shape's own colon has
     * to survive into the value. If it did not, every enum and flags field would
     * arrive truncated.
     */
    it("reads a shape whose value contains a colon", () => {
        const { sysConfig } = parseLog("H debug_field[2]:Failsafe Phase [enum:failsafePhase_e]");

        expect(sysConfig.debugFields[2]).toEqual({
            label: "Failsafe Phase",
            unit: null,
            scale: 1,
            enumTag: "failsafePhase_e",
        });
        expect(sysConfig.debugFieldsRaw[2]).toBe("Failsafe Phase [enum:failsafePhase_e]");
    });

    it("reads a flag list whole, separators and all", () => {
        const { sysConfig } = parseLog(
            "H debug_field[3]:Frame Flags [flags:Channel 17|Channel 18|Signal Loss|Failsafe]",
        );

        expect(sysConfig.debugFields[3].flags).toEqual(["Channel 17", "Channel 18", "Signal Loss", "Failsafe"]);
    });

    it("reads a unit and its factor", () => {
        const { sysConfig } = parseLog(
            "H debug_field[0]:Cycle Time [unit:us]",
            "H debug_field[1]:Heading [unit:0.1deg]",
        );

        expect(sysConfig.debugFields[0]).toEqual({ label: "Cycle Time", unit: "us", scale: 1 });
        expect(sysConfig.debugFields[1]).toEqual({ label: "Heading", unit: "deg", scale: 0.1 });
    });

    it("reports a malformed header instead of throwing, and leaves the slot unlabelled", () => {
        const { sysConfig } = parseLog("H debug_field[0]:Cycle Time [unit:us]", "H debug_field[5]:[unit:us]");

        expect(sysConfig.debugFields[0].label).toBe("Cycle Time");
        expect(sysConfig.debugFields[5]).toBeUndefined();
        expect(sysConfig.debugFieldProblems).toHaveLength(1);
        expect(sysConfig.debugFieldProblems[0]).toMatchObject({ index: 5, raw: "[unit:us]" });
        expect(sysConfig.debugFieldProblems[0].error).toBeDefined();
    });

    it("refuses a garbled mode name rather than keying every lookup on it", () => {
        expect(parseLog("H debug_mode_name:not a mode name").sysConfig.debug_mode_name).toBeNull();
        expect(parseLog("H debug_mode_name:GPS_RESCUE_HEADING ").sysConfig.debug_mode_name).toBe("GPS_RESCUE_HEADING");
    });

    it("treats a slot the firmware does not have as an unknown header", () => {
        const { sysConfig } = parseLog("H debug_field[9]:Nonexistent Slot");

        expect(sysConfig.debugFields).toBeNull();
        expect(sysConfig.unknownHeaders).toEqual([{ name: "debug_field[9]", value: "Nonexistent Slot" }]);
    });

    it("leaves a log without these headers exactly as it was", () => {
        const { sysConfig } = parseLog("H debug_mode:0");

        expect(sysConfig.debug_mode_name).toBeNull();
        expect(sysConfig.debugFields).toBeNull();
        expect(sysConfig.debugFieldsRaw).toBeNull();
        expect(sysConfig.debugFieldProblems).toBeNull();
        // The API version still comes from the revision string, as it always has.
        expect(sysConfig.apiVersion).toBe("1.49.0");
    });

    /*
     * A dataflash log holds one header per arm, so one parser parses many. The
     * defaults live on a shared prototype, so a mutable literal default would be
     * one object every log appends to.
     */
    it("does not carry one log's debug map into the next", () => {
        const first = `${[...FRAME_DEFS, "H debug_mode_name:GPS_RESCUE_HEADING", "H debug_field[0]:Cycle Time [unit:us]"].join("\n")}\n`;
        const second = `${[...FRAME_DEFS, "H debug_mode_name:RPM_FILTER"].join("\n")}\n`;
        const text = first + second;
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            bytes[i] = text.codePointAt(i);
        }

        const parser = new FlightLogParser(bytes);
        parser.parseHeader(0, first.length);
        expect(parser.sysConfig.debugFields[0].label).toBe("Cycle Time");

        parser.parseHeader(first.length, text.length);
        expect(parser.sysConfig.debug_mode_name).toBe("RPM_FILTER");
        expect(parser.sysConfig.debugFields).toBeNull();
        expect(parser.sysConfig.debugFieldsRaw).toBeNull();
    });
});
