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
import { renderLogFileInfo, renderSelectedLogInfo } from "../../src/blackbox-viewer/log_lifecycle";

type FlightLogInstance = NonNullable<ReturnType<typeof useLogStore>["flightLog"]>;
type SeekBarInstance = NonNullable<ReturnType<typeof useGraphStore>["seekBar"]>;

function fakeSeekBar() {
    return { setTimeRange: vi.fn(), setActivityRange: vi.fn(), setActivity: vi.fn(), repaint: vi.fn() };
}

function fakeLog(blackboxRate: number | null) {
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
        getActivitySummary: () => ({ times: [], avgThrottle: [], hasEvent: [] }),
        hasGpsData: () => false,
    } as unknown as FlightLogInstance;
}

describe("renderSelectedLogInfo", () => {
    let seekBar: ReturnType<typeof fakeSeekBar>;

    beforeEach(() => {
        seekBar = fakeSeekBar();
        const graphStore = useGraphStore(pinia);
        graphStore.seekBar = seekBar as unknown as SeekBarInstance;
        graphStore.flight3d = null;
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
