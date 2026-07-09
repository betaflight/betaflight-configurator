import { describe, it, expect } from "vitest";
import { predictDmaConflict } from "../../../src/js/utils/dmaTopology.js";

describe("predictDmaConflict", () => {
    it("returns no conflict on null/empty inputs", () => {
        expect(predictDmaConflict()).toEqual({ hasConflict: false, conflicts: [] });
        expect(predictDmaConflict({ mcuFamily: "F4", motorPicks: [] })).toEqual({
            hasConflict: false,
            conflicts: [],
        });
    });

    it("skips DMA reasoning entirely on F7/H7/G4 (no F4 burst constraint)", () => {
        const motorPicks = [
            { motorIndex: 1, pad: "B07", timer: 4, channel: 1 },
            { motorIndex: 2, pad: "B06", timer: 4, channel: 2 },
        ];
        for (const family of ["F7", "H7", "G4", null, "UNKNOWN"]) {
            expect(predictDmaConflict({ mcuFamily: family, motorPicks }).hasConflict).toBe(false);
        }
    });

    it("rejects two motors sharing a timer on F4", () => {
        const result = predictDmaConflict({
            mcuFamily: "F4",
            motorPicks: [
                { motorIndex: 1, pad: "B07", timer: 4, channel: 1 },
                { motorIndex: 2, pad: "B06", timer: 4, channel: 2 },
            ],
        });
        expect(result.hasConflict).toBe(true);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].type).toBe("f4_burst_shared_timer");
        expect(result.conflicts[0].timer).toBe(4);
        expect(result.conflicts[0].motorIndices).toEqual([1, 2]);
    });

    it("treats AT32 the same as F4", () => {
        const result = predictDmaConflict({
            mcuFamily: "AT32",
            motorPicks: [
                { motorIndex: 1, pad: "B07", timer: 4, channel: 1 },
                { motorIndex: 2, pad: "B06", timer: 4, channel: 2 },
            ],
        });
        expect(result.hasConflict).toBe(true);
    });

    it("accepts motors on disjoint timers on F4", () => {
        const result = predictDmaConflict({
            mcuFamily: "F4",
            motorPicks: [
                { motorIndex: 1, pad: "B07", timer: 4, channel: 1 },
                { motorIndex: 2, pad: "A00", timer: 5, channel: 1 },
            ],
        });
        expect(result.hasConflict).toBe(false);
    });

    it("ignores motors with null timer info (analyzer fallback case)", () => {
        const result = predictDmaConflict({
            mcuFamily: "F4",
            motorPicks: [
                { motorIndex: 1, pad: "B07", timer: null, channel: null },
                { motorIndex: 2, pad: "B06", timer: 4, channel: 2 },
            ],
        });
        expect(result.hasConflict).toBe(false);
    });

    it("flags 3+ motors on the same timer as a single conflict entry", () => {
        const result = predictDmaConflict({
            mcuFamily: "F4",
            motorPicks: [
                { motorIndex: 1, pad: "B07", timer: 4, channel: 1 },
                { motorIndex: 2, pad: "B06", timer: 4, channel: 2 },
                { motorIndex: 3, pad: "B08", timer: 4, channel: 3 },
            ],
        });
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].motorIndices).toEqual([1, 2, 3]);
    });
});
