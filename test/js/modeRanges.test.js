import { describe, expect, it } from "vitest";
import { buildModeRangePayload, entriesFromModeRanges, serializeModes } from "../../src/js/utils/modeRanges";

const SLOT_COUNT = 20;

// Minimal stand-in for the tab's `modes` model. ARM is always box id 0 — the case the dirty
// check used to get wrong, because the padding slots the FC reports carry id 0 too (#5385).
function buildModes(entriesByMode = {}) {
    return [
        { id: 0, entries: entriesByMode.arm ?? [] },
        { id: 1, entries: entriesByMode.angle ?? [] },
        { id: 13, entries: entriesByMode.beeper ?? [] },
    ];
}

function rangeEntry(auxChannelIndex, start, end, modeLogic = 0) {
    return { kind: "range", auxChannelIndex, modeLogic, sliderRange: [start, end] };
}

function linkEntry(linkedTo, modeLogic = 0) {
    return { kind: "link", modeLogic, linkedTo };
}

// Mirror of AuxiliaryTab's buildModesFromFC: decode a payload back into the mode model.
function rebuildModes(modes, { modeRanges, modeRangesExtra }) {
    const rebuilt = modes.map((mode) => ({ id: mode.id, entries: [] }));
    const byId = new Map(rebuilt.map((mode) => [mode.id, mode]));

    for (const { modeId, entry } of entriesFromModeRanges(modeRanges, modeRangesExtra)) {
        byId.get(modeId)?.entries.push(entry);
    }

    return rebuilt;
}

describe("mode range dirty serialization", () => {
    it("survives a save round trip with an ARM range (regression: #5385)", () => {
        const modes = buildModes({ arm: [rangeEntry(0, 1700, 2100)] });
        const payload = buildModeRangePayload(modes, SLOT_COUNT);

        expect(serializeModes(rebuildModes(modes, payload))).toBe(serializeModes(modes));
    });

    it("survives a save round trip with ranges, links and AND logic", () => {
        const modes = buildModes({
            arm: [rangeEntry(0, 1700, 2100)],
            angle: [rangeEntry(1, 1300, 1700, 1), rangeEntry(2, 1900, 2100)],
            beeper: [linkEntry(1, 1)],
        });
        const payload = buildModeRangePayload(modes, SLOT_COUNT);

        expect(serializeModes(rebuildModes(modes, payload))).toBe(serializeModes(modes));
    });

    it("reads the empty padding slots back as no entries at all", () => {
        const modes = buildModes();
        const payload = buildModeRangePayload(modes, SLOT_COUNT);

        expect(payload.modeRanges).toHaveLength(SLOT_COUNT);
        expect(entriesFromModeRanges(payload.modeRanges, payload.modeRangesExtra)).toEqual([]);
    });

    it("does not persist a link row still set to None, and does not count it as a change", () => {
        const withStub = buildModes({ angle: [rangeEntry(1, 1300, 1700), linkEntry(0)] });
        const withoutStub = buildModes({ angle: [rangeEntry(1, 1300, 1700)] });

        expect(serializeModes(withStub)).toBe(serializeModes(withoutStub));

        const payload = buildModeRangePayload(withStub, SLOT_COUNT);
        expect(serializeModes(rebuildModes(withStub, payload))).toBe(serializeModes(withStub));
    });

    it("still reports a real edit as dirty", () => {
        const modes = buildModes({ arm: [rangeEntry(0, 1700, 2100)] });
        const baseline = serializeModes(modes);

        modes[0].entries[0].sliderRange = [1500, 2100];
        expect(serializeModes(modes)).not.toBe(baseline);

        modes[1].entries.push(rangeEntry(2, 1300, 1700));
        expect(serializeModes(modes)).not.toBe(baseline);
    });

    it("distinguishes a linked mode from a ranged one on the same box", () => {
        const linked = buildModes({ beeper: [linkEntry(1)] });
        const ranged = buildModes({ beeper: [rangeEntry(0, 900, 925)] });

        expect(serializeModes(linked)).not.toBe(serializeModes(ranged));
        expect(serializeModes(rebuildModes(linked, buildModeRangePayload(linked, SLOT_COUNT)))).toBe(
            serializeModes(linked),
        );
        expect(serializeModes(rebuildModes(ranged, buildModeRangePayload(ranged, SLOT_COUNT)))).toBe(
            serializeModes(ranged),
        );
    });

    it("normalizes slider values so grid snapping alone is not a change", () => {
        const snapped = buildModes({ angle: [rangeEntry(1, 1300, 1700)] });
        const unsnapped = buildModes({ angle: [rangeEntry(1, 1306, 1694)] });

        expect(serializeModes(unsnapped)).toBe(serializeModes(snapped));
    });
});
