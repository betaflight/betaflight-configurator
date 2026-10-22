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
import { FlightLog } from "../../src/blackbox-viewer/flightlog";
import { FIRMWARE_TYPE_BETAFLIGHT } from "../../src/blackbox-viewer/flightlog_fielddefs";
import { HEADER, headerBytes, mixedLog } from "./syntheticLog";

function open(groups = 6, extraHeader: string[] = []) {
    const { bytes, frames } = mixedLog(groups, extraHeader);
    const flightLog = new FlightLog(new Uint8Array(bytes));
    expect(flightLog.openLog(0)).toBe(true);
    return { flightLog, frames };
}

const MAIN = ["loopIteration", "time", "motor[0]", "motor[1]", "rcCommand[0]"];

describe("FlightLog", () => {
    it("refuses a log the index found no data in", () => {
        const flightLog = new FlightLog(new Uint8Array(headerBytes(HEADER)));

        expect(flightLog.getLogCount()).toBe(1);
        expect(flightLog.getLogError(0)).toBe("Log truncated, no data");
        expect(flightLog.openLog(0)).toBe(false);
    });

    it("serves the main fields followed by the computed ones", () => {
        const { flightLog } = open();

        expect(flightLog.getMainFieldNames().slice(0, MAIN.length)).toEqual(MAIN);
        expect(flightLog.getMainFieldNames().slice(MAIN.length, MAIN.length + 3)).toEqual([
            "axisSum[0]",
            "axisSum[1]",
            "axisSum[2]",
        ]);
        expect(flightLog.getMainFieldIndexByName("motor[1]")).toBe(3);
        expect(flightLog.getMainFieldIndexByName("gyroADC[0]")).toBeUndefined();
        expect(flightLog.getNumMotors()).toBe(2);
        expect(flightLog.getSysConfig().firmwareType).toBe(FIRMWARE_TYPE_BETAFLIGHT);
    });

    it("decodes every I- and P-frame into the chunks, in order", () => {
        const { flightLog, frames } = open();

        const decoded = flightLog
            .getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())
            .flatMap((chunk) => chunk.frames.map((frame) => frame.slice(0, MAIN.length)));

        expect(decoded).toEqual(frames.map((f) => [f.iteration, f.time, ...f.motors, f.rc]));
        expect(flightLog.getMinTime()).toBe(frames[0].time);
        expect(flightLog.getMaxTime()).toBe(frames.at(-1)!.time);
    });

    it("merges the I- and P-frame field ranges into the stats", () => {
        const { flightLog, frames } = open();

        const motor0 = frames.map((f) => f.motors[0]);
        expect(flightLog.getStats().field[2]).toEqual({ min: Math.min(...motor0), max: Math.max(...motor0) });
        expect(flightLog.getMinMaxForFieldDuringAllTime("motor[0]")).toEqual({
            min: Math.min(...motor0),
            max: Math.max(...motor0),
        });
        expect(flightLog.getCurrentLogRowsCount()).toBe(frames.length);
    });

    it("finds the frame at or before a time, and its neighbours", () => {
        const { flightLog, frames } = open();
        const t = frames[9].time + 500;

        expect((flightLog.getFrameAtTime(t) as number[])[0]).toBe(frames[9].iteration);
        const around = flightLog.getCurrentFrameAtTime(t);
        expect(around && [around.previous?.[0], around.current?.[0], around.next?.[0]]).toEqual([8, 9, 10]);
    });

    it("finds the range of a field within a window, starting one frame before it", () => {
        const { flightLog, frames } = open();
        // rc runs -50, 0, 50: frame 6 (-50) is only in range as the frame before the window.
        expect(frames.slice(6, 9).map((f) => f.rc)).toEqual([-50, 0, 50]);

        expect(flightLog.getMinMaxForFieldDuringTimeInterval("rcCommand[0]", frames[7].time, frames[8].time)).toEqual({
            min: -50,
            max: 50,
        });
        expect(flightLog.getMinMaxForFieldDuringTimeInterval("nope", frames[7].time, frames[8].time)).toBeUndefined();
    });

    it("smooths a field by the mean over its window", () => {
        const { flightLog, frames } = open(12);
        const motor0 = flightLog.getMainFieldIndexByName("motor[0]")!;
        // A 1 ms radius takes the frame either side: frames are 1 ms apart.
        flightLog.setFieldSmoothing({ [motor0]: 1000 });

        const target = frames[20];
        const smoothed = flightLog.getSmoothedFrameAtTime(target.time) as number[];
        const mean = (frames[19].motors[0] + target.motors[0] + frames[21].motors[0]) / 3;

        expect(smoothed[motor0]).toBe(Math.round(mean));
        // The raw chunks keep the logged value.
        expect((flightLog.getFrameAtTime(target.time) as number[])[motor0]).toBe(target.motors[0]);
    });

    it("compares the logged rate against the one the header asks for", () => {
        const { flightLog } = open(6, ["H looptime:1000", "H pid_process_denom:1"]);

        // 1 kHz loop, every iteration logged; the frames are 1 ms apart, so they agree.
        expect(flightLog.getBlackboxRate()).toBe(1000);
        expect(flightLog.isWrongLogRate()).toBe(false);
    });
});

describe("FlightLog unit conversions", () => {
    it("reads throttle as a percentage of the min-max range, clamped", () => {
        const { flightLog } = open(1, ["H minthrottle:1000", "H maxthrottle:2000"]);

        expect(flightLog.rcCommandRawToThrottle(1500)).toBe(50);
        expect(flightLog.rcCommandRawToThrottle(900)).toBe(0);
        expect(flightLog.rcCommandRawToThrottle(2100)).toBe(100);
        expect(flightLog.ThrottleTorcCommandRaw(25)).toBe(1250);
    });

    it("treats an absent or digital motor protocol as digital", () => {
        expect(open(1).flightLog.isDigitalProtocol()).toBe(true);
        expect(open(1, ["H motor_pwm_protocol:0"]).flightLog.isDigitalProtocol()).toBe(false);
        expect(open(1, ["H motor_pwm_protocol:6"]).flightLog.isDigitalProtocol()).toBe(true);
    });

    it("decodes the disabled-field mask with the layout of the log's firmware", () => {
        // Bit 8 is ATTITUDE from 2025.12 and ACC before it.
        const before = open(1, ["H fields_disabled_mask:256"]).flightLog.isFieldDisabled();
        expect(before.ACC).toBe(true);
        expect("ATTITUDE" in before).toBe(false);
        const revision = "H Firmware revision:Betaflight 2025.12.0 (abcdef) STM32F405";
        const { flightLog } = open(1, [revision, "H fields_disabled_mask:256"]);
        expect(flightLog.isFieldDisabled()).toMatchObject({ ACC: false, ATTITUDE: true });
    });

    it("decodes flight mode flags by bit", () => {
        const modes = open(1).flightLog.getFlightMode((1 << 0) | (1 << 28));

        expect(modes.Arm).toBe(true);
        expect(modes.SuperExpo).toBe(true);
        expect(modes.Angle).toBe(false);
    });
});

describe("FlightLog yaw rate before Betaflight 2.8", () => {
    // Yaw at a stick of 250 with rates[2] = 30: plain, ((30 + 47) * 250) >> 7 = 150. With
    // super expo the factor is 1 / (1 - 0.5 * 250 / 500) = 4/3, giving 200.
    const legacy = (mode: number) =>
        open(1, [
            "H Firmware revision:Betaflight 2.7.0 (abcdef) NAZE",
            `H superExpoYawMode:${mode}`,
            "H superExpoFactor:50,50",
            "H rates:40,40,30",
        ]).flightLog;
    const SUPER_EXPO_MODE = 1 << 28;

    it("never applies super expo when the yaw mode is OFF", () => {
        expect(legacy(0).rcCommandRawToDegreesPerSecond(250, 2, SUPER_EXPO_MODE)).toBe(150);
    });

    it("applies it under ON only while the flight mode has super expo", () => {
        expect(legacy(1).rcCommandRawToDegreesPerSecond(250, 2, SUPER_EXPO_MODE)).toBe(200);
        expect(legacy(1).rcCommandRawToDegreesPerSecond(250, 2, 0)).toBe(150);
        expect(legacy(1).rcCommandRawToDegreesPerSecond(250, 2, null)).toBe(150);
    });

    it("always applies it under ALWAYS", () => {
        expect(legacy(2).rcCommandRawToDegreesPerSecond(250, 2, 0)).toBe(200);
    });
});
