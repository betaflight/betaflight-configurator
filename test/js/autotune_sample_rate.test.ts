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

import { describe, expect, it } from "vitest";
import { parseChirpLog, type SysConfig } from "../../src/js/blackbox/chirp_bbl_parser";
import { computeSampleRate } from "../../src/composables/useAutotune";
import { getDebugModeIndex } from "../../src/js/utils/debugModes";

/*
 * The sample rate the autotune assigns to a log's frames.
 *
 * A log recorded below the I-frame cadence carries `P interval:0`: firmware
 * disables P frames in that state (blackbox.c: "log only I frames if logging
 * frequency is too low") and an I frame is written every 32ms. The chirp parser
 * keeps the header value as it is, so the rate has to come from the I interval:
 * it is the divider between the frames that were actually logged. Refs #5514, #5614.
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

const headerBytes = (...extra: string[]) => {
    const text = [
        "H Product:Blackbox flight data recorder by Nicholas Sherlock",
        "H Data version:2",
        `H Firmware API version:${CHIRP_API}`,
        `H debug_mode:${chirpIndex}`,
        "H looptime:125", // 8 kHz gyro
        "H pid_process_denom:2", // 4 kHz PID loop
        ...FIELD_DEFS,
        ...extra,
        "",
    ].join("\n");
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.codePointAt(i) ?? 0;
    }
    return bytes;
};

const sysConfigOf = (...extra: string[]): SysConfig => {
    const bytes = headerBytes(...extra);
    return parseChirpLog(bytes, 0, bytes.length).sysConfig;
};

describe("the sample rate of a log's frames", () => {
    it("uses the I interval when the log is I-frame-only (P interval:0)", () => {
        // An I frame is written every 32ms, which is 128 loops of the 4 kHz PID
        // loop, so the log's frames are 31.25 Hz apart, not a full PID rate
        // apart. The header keeps saying P interval:0; the rate is resolved
        // from the I interval.
        const sysConfig = sysConfigOf("H I interval:128", "H P interval:0");

        expect(sysConfig.frameIntervalPDenom).toBe(0);
        expect(computeSampleRate(sysConfig)).toBeCloseTo(31.25, 5);
    });

    it("still divides by the P interval when the log has P frames", () => {
        // P interval:8 logs every 8th loop of the 4 kHz PID loop = 500 Hz.
        const sysConfig = sysConfigOf("H I interval:128", "H P interval:8");

        expect(computeSampleRate(sysConfig)).toBeCloseTo(500, 5);
    });
});
