import { describe, it, expect } from "vitest";
import { LapTimer } from "../../src/blackbox-viewer/laptimer";

const OPTIONS = { laptimer: { left: "5%", top: "50%", transparency: "40%" } };

/** The rows the timer draws, as "label value" pairs. */
function drawnRows(timer: LapTimer): string[] {
    const texts: string[] = [];
    const ctx = new Proxy(
        {},
        {
            get: (_target, prop) => {
                if (prop === "measureText") {
                    return (text: string) => ({ width: text.length * 6 });
                }
                if (prop === "fillText") {
                    return (text: string) => texts.push(String(text));
                }
                return () => undefined;
            },
            set: () => true,
        },
    );
    const canvas = { width: 800, height: 400, getContext: () => ctx } as unknown as HTMLCanvasElement;
    timer.drawCanvas(canvas, OPTIONS);
    const rows: string[] = [];
    for (let i = 1; i < texts.length; i++) {
        if (texts[i] === "Laps") {
            continue;
        }
        rows.push(`${texts[i]} ${texts[i + 1]}`);
        i++;
    }
    return rows;
}

const MAX = 3600 * 1000000;

describe("LapTimer", () => {
    it("shows zero times and no laps before any refresh", () => {
        expect(drawnRows(new LapTimer())).toEqual(["Current 00:00.000", "Last 00:00.000", "Best 00:00.000"]);
    });

    it("times the current lap from the bookmark before it, and lists the laps so far", () => {
        const timer = new LapTimer();
        const bookmarks = [];
        bookmarks[1] = 1_000_000;
        bookmarks[2] = 3_000_000;
        bookmarks[3] = 4_500_000;
        timer.refresh(5_000_000, MAX, bookmarks);
        expect(drawnRows(timer)).toEqual([
            "Current 00:00.500",
            "Last 00:01.500",
            "Best 00:01.500",
            "Lap 1 00:02.000",
            "Lap 2 00:01.500",
        ]);
    });

    it("takes the bookmarks in time order, whatever slot they are in", () => {
        const timer = new LapTimer();
        timer.refresh(2_500_000, MAX, [3_000_000, 1_000_000, 2_000_000]);
        expect(drawnRows(timer)).toEqual(["Current 00:00.500", "Last 00:01.000", "Best 00:01.000", "Lap 1 00:01.000"]);
    });

    it("keeps the fastest lap as the best, not the last", () => {
        const timer = new LapTimer();
        timer.refresh(4_000_000, MAX, [1_000_000, 1_500_000, 3_500_000]);
        expect(drawnRows(timer).slice(0, 3)).toEqual(["Current 00:00.500", "Last 00:02.000", "Best 00:00.500"]);
    });

    it("leaves out a bookmark that was cleared", () => {
        const timer = new LapTimer();
        // The keyboard handler stores a cleared bookmark as null, and slot 0 is never set.
        const bookmarks: (number | null)[] = [];
        bookmarks[1] = 1_000_000;
        bookmarks[2] = null;
        bookmarks[3] = 3_000_000;
        timer.refresh(3_500_000, MAX, bookmarks);
        expect(drawnRows(timer)).toEqual(["Current 00:00.500", "Last 00:02.000", "Best 00:02.000", "Lap 1 00:02.000"]);
    });

    it("shows nothing once every bookmark is cleared", () => {
        const timer = new LapTimer();
        timer.refresh(3_500_000, MAX, [null, null]);
        expect(drawnRows(timer)).toEqual(["Current 00:00.000", "Last 00:00.000", "Best 00:00.000"]);
    });

    it("counts two bookmarks at the same time as a lap of zero", () => {
        const timer = new LapTimer();
        timer.refresh(1_000_000, MAX, [1_000_000, 1_000_000, 2_000_000]);
        expect(drawnRows(timer)).toEqual(["Current 00:00.000", "Last 00:00.000", "Best 00:00.000", "Lap 1 00:00.000"]);
    });

    it("counts nothing before the first bookmark", () => {
        const timer = new LapTimer();
        timer.refresh(500_000, MAX, [1_000_000, 2_000_000]);
        expect(drawnRows(timer)).toEqual(["Current 00:00.000", "Last 00:00.000", "Best 00:00.000"]);
    });

    it("clears the best lap on returning to the first lap", () => {
        const timer = new LapTimer();
        timer.refresh(2_500_000, MAX, [1_000_000, 2_000_000]);
        timer.refresh(1_500_000, MAX, [1_000_000, 2_000_000]);
        expect(drawnRows(timer)).toEqual(["Current 00:00.500", "Last 00:00.000", "Best 00:00.000"]);
    });

    it("keeps its times without a current time or bookmarks", () => {
        const timer = new LapTimer();
        timer.refresh(2_500_000, MAX, [1_000_000, 2_000_000]);
        const before = drawnRows(timer);
        timer.refresh(null, MAX, [1_000_000]);
        timer.refresh(2_500_000, MAX, null);
        timer.refresh(2_500_000, MAX, []);
        expect(drawnRows(timer)).toEqual(before);
    });
});
