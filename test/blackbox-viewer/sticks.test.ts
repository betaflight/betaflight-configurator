import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { FlightLogSticks } from "../../src/blackbox-viewer/sticks";
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings";
import type { Chunk, FlightLog, LogFrame } from "../../src/blackbox-viewer/flightlog";

const FIELDS = ["loopIteration", "time", "rcCommand[0]", "rcCommand[1]", "rcCommand[2]", "rcCommand[3]"];
const RC_FIELDS = [2, 3, 4, 5];

const flightLog = {
    getSysConfig: () => ({ rcRate: 100, blackbox_high_resolution: 0 }),
    getMainFieldNames: () => FIELDS,
    getMainFieldIndexByName: (name: string) => FIELDS.indexOf(name),
} as unknown as FlightLog;

/** Roll, pitch, yaw, throttle at a time. */
function frame(time: number, [roll, pitch, yaw, throttle]: number[]): LogFrame {
    return [time / 1000, time, roll, pitch, yaw, throttle];
}

interface Drawn {
    texts: string[];
    /** Each arc as [x, y, radius], in the stick's own coordinates. */
    arcs: number[][];
}

function render(sticks: FlightLogSticks, centre: LogFrame, chunks: Chunk[] | null = null, startFrameIndex = 0): Drawn {
    const drawn: Drawn = { texts: [], arcs: [] };
    context.fillText = (text: string) => drawn.texts.push(String(text));
    context.arc = (x: number, y: number, radius: number) => drawn.arcs.push([x, y, radius]);
    sticks.render(centre, chunks, startFrameIndex, centre[1]);
    return drawn;
}

let context: Record<string, unknown>;
function makeSticks(fields = RC_FIELDS, width = 500): FlightLogSticks {
    context = {};
    const ctx = new Proxy(context, {
        get: (target, prop) => target[prop as string] ?? (() => undefined),
        set: () => true,
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const sticks = new FlightLogSticks(flightLog, fields, canvas);
    // At 200 px high the sticks are 70.7 px in radius, with 13.3 pt labels and 16 px between them.
    sticks.resize(width, 200);
    return sticks;
}

/** The two stick dots, which are the arcs with radius / 7.5. */
function stickDots(drawn: Drawn): number[][] {
    const radius = Math.max(...drawn.arcs.map((arc) => arc[2]));
    // Yaw is negated, so a centred stick can sit at -0.
    const plain = (n: number) => (Object.is(n, -0) ? 0 : n);
    return drawn.arcs.filter((arc) => arc[2] === radius).map(([x, y]) => [plain(x), plain(y)]);
}

describe("FlightLogSticks", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        Object.assign(useSettingsStore().userSettings, {
            stickMode: 2,
            stickUnits: false,
            stickTrails: false,
            stickInvertYaw: false,
            eraseBackground: true,
        });
    });

    it("centres both sticks at mid stick", () => {
        expect(stickDots(render(makeSticks(), frame(1e6, [0, 0, 0, 1500])))).toEqual([
            [0, 0],
            [0, 0],
        ]);
    });

    it("puts yaw and throttle on the left stick in mode 2, clamped to the stick's box", () => {
        const sticks = makeSticks();
        const [left, right] = stickDots(render(sticks, frame(1e6, [0, 0, 500, 1000])));
        const radius = Math.abs(left[0]);
        expect(radius).toBeGreaterThan(0);
        // Yaw is drawn inverted unless the user asks otherwise; low throttle is the bottom.
        expect(left).toEqual([-radius, radius]);
        expect(right).toEqual([0, 0]);

        const [clamped] = stickDots(render(sticks, frame(1e6, [0, 0, 5000, 0])));
        expect(clamped).toEqual([-radius, radius]);
    });

    it("moves throttle to the right stick in mode 1", () => {
        useSettingsStore().userSettings.stickMode = 1;
        const [left, right] = stickDots(render(makeSticks(), frame(1e6, [0, 0, 0, 1000])));
        expect(left).toEqual([0, 0]);
        expect(right[1]).toBeGreaterThan(0);
    });

    it("labels each stick axis with its command, yaw sign corrected", () => {
        const drawn = render(makeSticks(), frame(1e6, [10, 20, 30, 1400]));
        expect(drawn.texts).toEqual(["-30", "1400", "Mode 2", "10", "20"]);
    });

    it("leaves the labels out when they would not fit beside the sticks", () => {
        // Labels need 4 * 70.7 + 2 * 16 + 0.8 * 13.3 * 2 per character: 4 characters fit in 400 px, 7 (with units) in 464.
        expect(render(makeSticks(RC_FIELDS, 399), frame(1e6, [0, 0, 0, 1500])).texts).toEqual([]);
        expect(render(makeSticks(RC_FIELDS, 401), frame(1e6, [0, 0, 0, 1500])).texts).toHaveLength(5);

        useSettingsStore().userSettings.stickUnits = true;
        expect(render(makeSticks(RC_FIELDS, 450), frame(1e6, [0, 0, 0, 1500])).texts).toEqual([]);
        expect(render(makeSticks(RC_FIELDS, 470), frame(1e6, [0, 0, 0, 1500])).texts).toHaveLength(5);
    });

    it("draws no stick without all four commands", () => {
        const drawn = render(makeSticks(RC_FIELDS.slice(0, 3)), frame(1e6, [0, 0, 0, 1500]));
        expect(stickDots(drawn)).toEqual([
            [undefined, undefined],
            [undefined, undefined],
        ]);
        expect(drawn.texts).toEqual(["undefined", "undefined", "Mode 2", "undefined", "undefined"]);
    });

    describe("stick trails", () => {
        const chunk = (frames: LogFrame[]) => ({ index: 0, frames, gapStartsHere: {}, events: [] }) as Chunk;
        const trailDots = (drawn: Drawn) =>
            drawn.arcs.filter((arc) => arc[2] < Math.max(...drawn.arcs.map((a) => a[2])));

        beforeEach(() => {
            useSettingsStore().userSettings.stickTrails = true;
        });

        it("draws the last 500 ms up to the centre of the window, for each stick", () => {
            const frames = [0, 400_000, 700_000, 900_000, 1_000_000, 1_100_000].map((time) =>
                frame(time, [0, 0, 0, 1500]),
            );
            const drawn = render(makeSticks(), frames[4], [chunk(frames.slice(0, 3)), chunk(frames.slice(3))], 1);
            // 700, 900 and 1000 ms are inside the window; 400 ms is too old and 1100 ms is past the centre.
            expect(trailDots(drawn)).toHaveLength(3 * 2);
        });

        it("draws no trail without the chunks", () => {
            const drawn = render(makeSticks(), frame(1e6, [0, 0, 0, 1500]), null, 2);
            expect(trailDots(drawn)).toHaveLength(0);
        });
    });
});
