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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { pinia } from "../../src/js/pinia_instance";
import { useAppStore } from "../../src/blackbox-viewer/stores/app";
import { useGraphStore } from "../../src/blackbox-viewer/stores/graph";
import { useLogStore } from "../../src/blackbox-viewer/stores/log";
import { renderLogFileInfo, renderSelectedLogInfo, setSeekBarMode } from "../../src/blackbox-viewer/log_lifecycle";

type FlightLogInstance = NonNullable<ReturnType<typeof useLogStore>["flightLog"]>;
type SeekBarInstance = NonNullable<ReturnType<typeof useGraphStore>["seekBar"]>;

function fakeSeekBar() {
    return { setTimeRange: vi.fn(), setActivityRange: vi.fn(), setActivity: vi.fn(), repaint: vi.fn() };
}

const activity = {
    times: [1, 2],
    avgThrottle: [10, 20],
    maxRC: [30, 40],
    maxMotorDiff: [50, 60],
    hasEvent: [false, true],
};

function fakeLog(blackboxRate: number | null, overrides: Record<string, unknown> = {}) {
    return {
        getLogIndex: () => 0,
        getNumCellsEstimate: () => 0,
        getReferenceVoltageMillivolts: () => 0,
        getSysConfig: () => ({
            frameIntervalPNum: 1,
            frameIntervalPDenom: 2,
            motorOutput: [0, 2047],
        }),
        getBlackboxRate: () => blackboxRate,
        isWrongLogRate: () => false,
        getActualLogRate: () => 0,
        getMinTime: () => 0,
        getMaxTime: () => 1,
        getActivitySummary: () => activity,
        hasGpsData: () => false,
        ...overrides,
    } as unknown as FlightLogInstance;
}

describe("renderSelectedLogInfo", () => {
    let seekBar: ReturnType<typeof fakeSeekBar>;

    beforeEach(() => {
        seekBar = fakeSeekBar();
        const graphStore = useGraphStore(pinia);
        graphStore.seekBar = seekBar as unknown as SeekBarInstance;
        graphStore.flight3d = null;
        graphStore.seekBarMode = "avgThrottle";
    });

    it("shows the P interval and the derived rate", () => {
        useLogStore(pinia).flightLog = fakeLog(1000);

        renderSelectedLogInfo();

        expect(useAppStore(pinia).statusLograte).toBe("Sample Rate : 1/2 (1000Hz)");
    });

    it("shows the P interval without a rate when the log has no looptime", () => {
        useLogStore(pinia).flightLog = fakeLog(null);

        renderSelectedLogInfo();

        expect(useAppStore(pinia).statusLograte).toBe("Sample Rate : 1/2");
        expect(seekBar.repaint).toHaveBeenCalled();
    });

    it("shows the cell count, craft, firmware and a wrong-rate warning", () => {
        useLogStore(pinia).flightLog = fakeLog(1000, {
            getNumCellsEstimate: () => 4,
            getReferenceVoltageMillivolts: () => 16_800,
            getSysConfig: () => ({
                "Craft name": "Quad",
                "Firmware revision": "Betaflight 4.5.0",
                deviceUID: "abc",
                frameIntervalPNum: 1,
                frameIntervalPDenom: 2,
                motorOutput: [48, 2047],
            }),
            isWrongLogRate: () => true,
            getActualLogRate: () => 498.6,
        });

        renderSelectedLogInfo();

        const appStore = useAppStore(pinia);
        expect(appStore.statusCells).toBe("4S (16.80V)");
        expect(appStore.statusVersion).toBe("Quad : Betaflight 4.5.0 (abc)");
        expect(appStore.statusLograteWarning).toBe("Wrong log rate: 499Hz");
        expect(seekBar.setActivityRange).toHaveBeenCalledWith(48, 2047);
    });

    it("draws the seekbar's current mode and hands the log to the map and 3D view", () => {
        const graphStore = useGraphStore(pinia);
        const mapGrapher = { setFlightLog: vi.fn() };
        const flight3d = { setFlightLog: vi.fn() };
        graphStore.mapGrapher = mapGrapher as unknown as typeof graphStore.mapGrapher;
        graphStore.flight3d = flight3d as unknown as typeof graphStore.flight3d;
        graphStore.seekBarMode = "maxRC";
        const flightLog = fakeLog(1000, { hasGpsData: () => true });
        useLogStore(pinia).flightLog = flightLog;
        useLogStore(pinia).currentBlackboxTime = 7;

        renderSelectedLogInfo();

        expect(useAppStore(pinia).statusLograteWarning).toBeNull();
        expect(seekBar.setTimeRange).toHaveBeenCalledWith(0, 1, 7);
        expect(seekBar.setActivity).toHaveBeenCalledWith(activity.times, activity.maxRC, activity.hasEvent);
        expect(mapGrapher.setFlightLog).toHaveBeenCalledWith(flightLog);
        expect(flight3d.setFlightLog).toHaveBeenCalledWith(flightLog);
        graphStore.mapGrapher = null;
    });
});

describe("setSeekBarMode", () => {
    it("switches the seekbar to the chosen series", () => {
        const seekBar = fakeSeekBar();
        const graphStore = useGraphStore(pinia);
        graphStore.seekBar = seekBar as unknown as SeekBarInstance;
        useLogStore(pinia).flightLog = fakeLog(1000);

        setSeekBarMode("maxMotorDiff");

        expect(graphStore.seekBarMode).toBe("maxMotorDiff");
        expect(seekBar.setActivity).toHaveBeenCalledWith(activity.times, activity.maxMotorDiff, activity.hasEvent);
        expect(seekBar.repaint).toHaveBeenCalled();
    });

    it("only records the mode before a log is loaded", () => {
        useLogStore(pinia).flightLog = null;
        useGraphStore(pinia).seekBar = null;

        setSeekBarMode("maxRC");

        expect(useGraphStore(pinia).seekBarMode).toBe("maxRC");
    });
});

describe("renderLogFileInfo", () => {
    function logsWithErrors(errors: unknown[]) {
        return {
            getLogCount: () => errors.length,
            getLogError: (index: number) => errors[index],
            getMinTime: () => 0,
            getMaxTime: () => 61_000_000,
        } as unknown as FlightLogInstance;
    }

    it("labels a log that failed to parse with the error's text", () => {
        useLogStore(pinia).flightLog = logsWithErrors([new Error("Unsupported field encoding 99")]);

        renderLogFileInfo(new File([""], "LOG00001.BFL"));

        expect(useLogStore(pinia).logIndexEntries).toEqual([
            { label: "Error: Unsupported field encoding 99", value: 0, disabled: true },
        ]);
    });

    it("numbers the logs and gives each good one its time span", () => {
        useLogStore(pinia).flightLog = logsWithErrors([false, "Log truncated, no data"]);
        useLogStore(pinia).activeLogIndex = 1;

        renderLogFileInfo(new File([""], "LOG00002.BFL"));

        const logStore = useLogStore(pinia);
        expect(logStore.logIndexEntries).toEqual([
            { label: "1/2: 00:00 - 01:01 [01:01]", value: 0, disabled: false },
            { label: "2/2: Log truncated, no data", value: 1, disabled: true },
        ]);
        expect(logStore.activeLogIndex).toBe(0);
        expect(useAppStore(pinia).logFilename).toBe("LOG00002.BFL");
    });
});
