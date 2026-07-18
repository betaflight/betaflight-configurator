import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
    useOsdPreview,
    clampObjectArrayPreviewPosition,
    clampStringPreviewPosition,
    clampStringArrayPreviewPosition,
    clampArrayPreviewPosition,
} from "../../src/composables/useOsdPreview.js";

// Preview shaped like ARTIFICIAL_HORIZON (see src/components/tabs/osd/osd.js):
// cells span x -4..+4 and y +1..+7, so every rendered cell sits below the
// stored anchor position and the element's true minimum Y offset is +1.
function buildArtificialHorizonPreview() {
    const preview = [];
    for (let y = 1; y < 8; y++) {
        for (let x = -4; x <= 4; x++) {
            preview.push({ x, y, sym: 0x20 });
        }
    }
    return preview;
}

// Preview shaped like HORIZON_SIDEBARS: cells span both sides of the anchor.
function buildHorizonSidebarsPreview() {
    const preview = [];
    for (let y = -3; y <= 3; y++) {
        preview.push({ x: -7, y, sym: 0x20 });
        preview.push({ x: 7, y, sym: 0x20 });
    }
    return preview;
}

describe("searchLimitsElement", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("reports the true offset limits for elements whose cells all sit below the anchor", () => {
        const { searchLimitsElement } = useOsdPreview();

        const limits = searchLimitsElement(buildArtificialHorizonPreview());

        expect(limits.minX).toBe(-4);
        expect(limits.maxX).toBe(4);
        expect(limits.minY).toBe(1);
        expect(limits.maxY).toBe(7);
    });

    it("reports unchanged limits for elements spanning both sides of the anchor", () => {
        const { searchLimitsElement } = useOsdPreview();

        const limits = searchLimitsElement(buildHorizonSidebarsPreview());

        expect(limits.minX).toBe(-7);
        expect(limits.maxX).toBe(7);
        expect(limits.minY).toBe(-3);
        expect(limits.maxY).toBe(3);
    });

    it("keeps legacy behavior for string previews", () => {
        const { searchLimitsElement } = useOsdPreview();

        const limits = searchLimitsElement("BAT1");

        expect(limits).toEqual({ minX: 0, maxX: 4, minY: 0, maxY: 0 });
    });

    it("keeps legacy behavior for string array previews", () => {
        const { searchLimitsElement } = useOsdPreview();

        const limits = searchLimitsElement(["ABC", "DEFGH"]);

        expect(limits).toEqual({ minX: 0, maxX: 5, minY: 0, maxY: 2 });
    });

    it("returns zeroed limits for empty previews", () => {
        const { searchLimitsElement } = useOsdPreview();

        expect(searchLimitsElement([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
        expect(searchLimitsElement(null)).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    });
});

describe("clampObjectArrayPreviewPosition", () => {
    const displaySize = { x: 30, y: 16, total: 480 };

    it("clamps ARTIFICIAL_HORIZON correctly at the top edge without jumping to (0,0)", () => {
        const limits = { minX: -4, maxX: 4, minY: 0, maxY: 6 };
        // Dragged to row -1, column 20: index = -30 + 20 = -10
        // Since limits.minY = 0, anchor at y = -1 is out of bounds (topmost cell is y + minY = -1 < 0)
        // It should clamp smoothly to anchor row 0, returning 20 (row 0, col 20).
        const result = clampObjectArrayPreviewPosition(-10, displaySize, limits);
        expect(result).toEqual(20);
    });

    it("correctly corrects out-of-bounds y < -limits.minY at the top edge", () => {
        const limits = { minX: -4, maxX: 4, minY: 0, maxY: 6 };
        // Dragged to row -3, column 20: index = -90 + 20 = -70
        // Topmost allowed anchor row is 0.
        // Expected clamped index = 0 * 30 + 20 = 20.
        const result = clampObjectArrayPreviewPosition(-70, displaySize, limits);
        expect(result).toEqual(20);
    });

    it("clamps ARTIFICIAL_HORIZON correctly at the left edge", () => {
        const limits = { minX: -4, maxX: 4, minY: 0, maxY: 6 };
        // Dragged to row 5, col 2: index = 150 + 2 = 152
        // selectedPositionX = 2. selectedPositionX + limits.minX = 2 - 4 = -2 < 0.
        // Adjusted: position += 2 => 154 (col 4).
        // Leftmost visible cell is now at col 4 - 4 = 0.
        const result = clampObjectArrayPreviewPosition(152, displaySize, limits);
        expect(result).toEqual(154);
    });

    it("clamps ARTIFICIAL_HORIZON correctly at the right edge", () => {
        const limits = { minX: -4, maxX: 4, minY: 0, maxY: 6 };
        // Dragged to row 5, col 28: index = 150 + 28 = 178
        // selectedPositionX = 28. selectedPositionX + limits.maxX = 28 + 4 = 32 >= 30.
        // Adjusted: position -= (28 + 4 + 1 - 30) = 178 - 3 = 175 (col 25).
        // Rightmost visible cell is now at col 25 + 4 = 29.
        const result = clampObjectArrayPreviewPosition(178, displaySize, limits);
        expect(result).toEqual(175);
    });

    it("clamps ARTIFICIAL_HORIZON correctly at the bottom edge", () => {
        const limits = { minX: -4, maxX: 4, minY: 0, maxY: 6 };
        // Dragged to row 10, col 10: index = 310
        // selectedPositionY = 10. selectedPositionY + limits.maxY = 10 + 6 = 16 >= 16.
        // Adjusted: position -= (10 + 6 - 16 + 1) * 30 = 310 - 30 = 280 (row 9).
        // Bottom-most visible cell is now at row 9 + 6 = 15.
        const result = clampObjectArrayPreviewPosition(310, displaySize, limits);
        expect(result).toEqual(280);
    });

    it("clamps negative-offset elements (e.g. HORIZON_SIDEBARS) correctly at the top edge", () => {
        const limits = { minX: -7, maxX: 7, minY: -3, maxY: 3 };
        // Dragged to row 1, col 15: index = 45
        // selectedPositionY = 1. selectedPositionY + limits.minY = 1 - 3 = -2 < 0.
        // Adjusted: position += 2 * 30 = 45 + 60 = 105 (row 3).
        // Top-most visible cell is now at row 3 - 3 = 0.
        const result = clampObjectArrayPreviewPosition(45, displaySize, limits);
        expect(result).toEqual(105);
    });
});

describe("clampStringPreviewPosition", () => {
    const displaySize = { x: 30, y: 16, total: 480 };

    it("clamps standard string elements within horizontal screen bounds", () => {
        const displayItem = { preview: "HELLO" }; // length = 5
        // Dragged to row 2, col 28: index = 60 + 28 = 88. cursorY = 2.
        // Max allowed X = 30 - 5 = 25.
        // Expected clamped index = 60 + 25 = 85.
        const result = clampStringPreviewPosition(displayItem, 88, displaySize, 2);
        expect(result).toEqual(85);
    });
});

describe("clampStringArrayPreviewPosition", () => {
    const displaySize = { x: 30, y: 16, total: 480 };

    it("returns null for negative positions (regression guard)", () => {
        const limits = { minX: 0, maxX: 5, minY: 0, maxY: 2 };
        expect(clampStringArrayPreviewPosition(-10, displaySize, 10, limits)).toBeNull();
    });

    it("clamps string arrays within bounds", () => {
        const limits = { minX: 0, maxX: 5, minY: 0, maxY: 2 };
        // Row 15, col 28: index = 450 + 28 = 478. cursorX = 28.
        // selectedPositionY = 15. limits.maxY = 2.
        // 15 + 2 = 17 >= 16. Clamps Y to 14.
        // selectedPositionX = 28. limits.maxX = 5.
        // 28 + 5 = 33 >= 30. Clamps X to 25.
        // Expected clamped index = 14 * 30 + 25 = 445.
        const result = clampStringArrayPreviewPosition(478, displaySize, 28, limits);
        expect(result).toEqual(445);
    });
});

describe("clampArrayPreviewPosition", () => {
    const displaySize = { x: 30, y: 16, total: 480 };

    it("routes to clampObjectArrayPreviewPosition for object arrays", () => {
        const displayItem = {
            preview: [
                { x: -4, y: 0, sym: 10 },
                { x: 4, y: 6, sym: 10 },
            ],
        };
        // Dragged to row -1, col 20: index = -10
        // Clamps Y to 0, expected: 20
        const result = clampArrayPreviewPosition(displayItem, -10, displaySize, 20);
        expect(result).toEqual(20);
    });

    it("routes to clampStringArrayPreviewPosition for string arrays", () => {
        const displayItem = {
            preview: ["ABC", "DEF"],
        };
        // Dragged to row 15, col 28: index = 478. cursorX = 28.
        const result = clampArrayPreviewPosition(displayItem, 478, displaySize, 28);
        // limits: {minX:0, maxX:3, minY:0, maxY:2}
        // X: 28 + 3 = 31 > 30 → position -= 1 → 477
        // Y: 15 + 2 = 17 > 16 → position -= 30 → 447
        expect(result).toEqual(447);
    });
});
