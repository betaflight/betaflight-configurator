import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useOsdPreview } from "../../src/composables/useOsdPreview.js";

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
