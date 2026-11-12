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
import { createPinia, setActivePinia } from "pinia";

// The sticks, crafts, lap timer and analyser draw on canvases of their own; only their presence matters here.
vi.mock("../../src/blackbox-viewer/sticks", () => ({
    FlightLogSticks: vi.fn(function (this: Record<string, unknown>) {
        this.render = vi.fn();
        this.resize = vi.fn();
    }),
}));
vi.mock("../../src/blackbox-viewer/craft_3d", () => ({
    Craft3D: vi.fn(function (this: Record<string, unknown>) {
        this.render = vi.fn();
        this.resize = vi.fn();
    }),
}));
vi.mock("../../src/blackbox-viewer/craft_2d", () => ({ Craft2D: vi.fn() }));
vi.mock("../../src/blackbox-viewer/laptimer", () => ({ LapTimer: vi.fn() }));
vi.mock("../../src/blackbox-viewer/graph_spectrum", () => ({
    FlightLogAnalyser: vi.fn(function (this: Record<string, unknown>) {
        this.resize = vi.fn();
        this.plotSpectrum = vi.fn();
    }),
}));

import { FlightLogGrapher } from "../../src/blackbox-viewer/grapher";
import { GraphConfig } from "../../src/blackbox-viewer/graph_config";
import type { FlightLog, LogFrame } from "../../src/blackbox-viewer/flightlog";
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings";
import { useWorkspaceStore } from "../../src/blackbox-viewer/stores/workspace";
import { useGraphStore } from "../../src/blackbox-viewer/stores/graph";

/** A canvas whose 2D context records the text drawn on it; every other call is a no-op. */
function recordingCanvas(texts: string[]): HTMLCanvasElement {
    const canvas: Record<string, unknown> = { width: 800, height: 480, style: {} };
    const ctx = new Proxy({ canvas } as Record<string, unknown>, {
        get(target, prop) {
            if (prop in target) return target[prop as string];
            if (prop === "fillText") return (text: string) => texts.push(String(text));
            if (prop === "measureText") return () => ({ width: 10 });
            if (prop === "createLinearGradient") return () => ({ addColorStop() {} });
            return () => {};
        },
        set(target, prop, value) {
            target[prop as string] = value;
            return true;
        },
    });
    canvas.getContext = () => ctx;
    canvas.addEventListener = () => {};
    canvas.removeEventListener = () => {};
    // Only what the grapher touches: size, style, listeners and the 2D context.
    return canvas as unknown as HTMLCanvasElement;
}

/** A one-chunk log of `testField[0]`, a frame every 10 ms from 0 to 2 s, with no events. */
function fakeLog(): FlightLog {
    const frames: LogFrame[] = Array.from({ length: 201 }, (_, i) => [i, i * 10_000, 1500]);
    const chunk = { index: 0, frames, gapStartsHere: {}, events: [] };
    // Only the members the grapher and GraphConfig read.
    return {
        getMainFieldNames: () => ["loopIteration", "time", "testField[0]"],
        getMainFieldIndexByName: (name: string) => ({ loopIteration: 0, time: 1, "testField[0]": 2 })[name],
        getMainFieldIndexes: () => ({ loopIteration: 0, time: 1, "testField[0]": 2 }),
        getSysConfig: () => ({}),
        getMinTime: () => 0,
        getMaxTime: () => 2_000_000,
        getSmoothedChunksInTimeRange: () => [chunk],
        getSmoothedFrameAtTime: () => frames[100],
        setFieldSmoothing: vi.fn(),
    } as unknown as FlightLog;
}

describe("FlightLogGrapher", () => {
    let texts: string[];

    beforeEach(() => {
        setActivePinia(createPinia());
        texts = [];
    });

    function grapher() {
        const config = new GraphConfig([
            {
                label: "Motors",
                height: 1,
                fields: [
                    { name: "testField[0]", color: "#fff", curve: { power: 1, MinMax: { min: 1000, max: 2000 } } },
                ],
            },
        ]);
        const settings = useSettingsStore().userSettings;
        return new FlightLogGrapher(
            fakeLog(),
            config,
            recordingCanvas(texts),
            recordingCanvas([]),
            recordingCanvas([]),
            recordingCanvas([]),
            { ...settings, drawTime: false },
        );
    }

    // Bookmark 0's label is the number 0, which is falsy, so it was drawn as "EVENT".
    it("labels each bookmark with its number, 0 included", () => {
        useWorkspaceStore().bookmarkTimes = [900_000, 0, 1_100_000, null, null, null, null, null, null, 1_050_000];
        useGraphStore().hasMarker = false;

        grapher().render(1_000_000);

        expect(texts).toEqual(expect.arrayContaining(["0", "2", "9"]));
        expect(texts).not.toContain("EVENT");
        // Bookmark 1 is cleared (time 0) and is not drawn.
        expect(texts).not.toContain("1");
    });
});
