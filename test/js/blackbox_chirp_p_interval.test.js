import { describe, expect, it } from "vitest";
import { parseChirpLog } from "../../src/js/blackbox/chirp_bbl_parser";
import { getDebugModeIndex } from "../../src/js/utils/debugModes";
import { FlightLogParser } from "../../src/blackbox-viewer/flightlog_parser.js";

/*
 * The "P interval" header, as it reaches the chirp parser.
 *
 * Firmware writes it as a bare integer: blackbox.c records
 * `blackboxPInterval = 1 << sample_rate` and prints it with "%d", so a log at
 * half the PID rate carries `H P interval:2`. Both parsers in the app have to
 * hand that interval to their consumers the same way: the denominator is the
 * divider (P interval:2 reads as 1/2), and useAutotune takes its sample rate
 * from frameIntervalPDenom. Refs #5514.
 */

const CHIRP_API = "1.48.0";
const chirpIndex = getDebugModeIndex("CHIRP", CHIRP_API);

const FIELD_DEFS = [
    "H Field I name:loopIteration,time,setpoint[0],setpoint[1],setpoint[2],gyroADC[0],gyroADC[1],gyroADC[2],debug[0],debug[1],debug[2],debug[3]",
    "H Field I signed:0,0,1,1,1,1,1,1,1,1,1,1",
    "H Field I predictor:0,0,0,0,0,0,0,0,0,0,0,0",
    "H Field I encoding:1,1,0,0,0,0,0,0,0,0,0,0",
    "H Field P predictor:6,2,0,0,0,0,0,0,0,0,0,0",
    "H Field P encoding:9,0,0,0,0,0,0,0,0,0,0,0",
];

const headerBytes = (...extra) => {
    const text = [
        "H Product:Blackbox flight data recorder by Nicholas Sherlock",
        "H Data version:2",
        `H Firmware API version:${CHIRP_API}`,
        `H debug_mode:${chirpIndex}`,
        "H looptime:125",
        "H pid_process_denom:2",
        ...FIELD_DEFS,
        ...extra,
        "",
    ].join("\n");
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.codePointAt(i);
    }
    return bytes;
};

const parseChirp = (...extra) => parseChirpLog(headerBytes(...extra), 0, headerBytes(...extra).length).sysConfig;

const parseLegacy = (...extra) => {
    const bytes = headerBytes(...extra);
    const parser = new FlightLogParser(bytes);
    parser.parseHeader(0, bytes.length);
    return parser.sysConfig;
};

describe("the P interval a chirp log carries", () => {
    it("keeps a bare integer interval in the denominator (2 means 1/2)", () => {
        const sysConfig = parseChirp("H P interval:2");

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(2);
    });

    it("leaves the explicit num/denom form alone", () => {
        const sysConfig = parseChirp("H P interval:1/2");

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(2);
    });

    it("reads a full-rate interval as 1/1", () => {
        const sysConfig = parseChirp("H P interval:1");

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(1);
    });

    it("keeps an explicit full-rate interval when a P ratio line follows", () => {
        // Current firmware prints the integer P interval and a P ratio line in
        // the same header. The explicit interval has to win; letting the ratio
        // fallback overwrite it turns a full-rate log into a wrong sample rate.
        const sysConfig = parseChirp("H P interval:1", "H P ratio:32");

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(1);
    });

    it("agrees with the legacy blackbox parser on the same header", () => {
        const chirp = parseChirp("H P interval:2");
        const legacy = parseLegacy("H P interval:2");

        expect(legacy.frameIntervalPDenom).toBe(2);
        expect([chirp.frameIntervalPNum, chirp.frameIntervalPDenom]).toEqual([
            legacy.frameIntervalPNum,
            legacy.frameIntervalPDenom,
        ]);
    });
});
