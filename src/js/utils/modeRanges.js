import { CHANNEL_MIN, CHANNEL_MAX, clampChannel } from "./rcChannel";

export const CHANNEL_STEP = 25;
export const MIN_RANGE_GAP = 25;
export const DEFAULT_RANGE = { start: 1300, end: 1700 };

export function snapChannel(value) {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
        return DEFAULT_RANGE.start;
    }
    return clampChannel(Math.round(numericValue / CHANNEL_STEP) * CHANNEL_STEP);
}

// Snap a slider pair to the channel grid and guarantee a non-empty range. Because every
// range the UI can produce comes through here, `start < end` always holds — which is what
// lets an empty range be read back as an unused padding slot.
export function normalizeRangeValues(values) {
    const [rawStart = DEFAULT_RANGE.start, rawEnd = DEFAULT_RANGE.end] = Array.isArray(values) ? values : [];
    let start = snapChannel(rawStart);
    let end = snapChannel(rawEnd);

    if (start > end) {
        [start, end] = [end, start];
    }

    if (end - start < MIN_RANGE_GAP) {
        if (start <= CHANNEL_MIN) {
            end = Math.min(CHANNEL_MAX, start + MIN_RANGE_GAP);
        } else {
            start = Math.max(CHANNEL_MIN, end - MIN_RANGE_GAP);
        }
    }

    return [start, end];
}

/**
 * Decode an MSP mode-range payload into the tab's entry model, as `{ modeId, entry }` pairs
 * in payload order. Callers attach their own uid and drop pairs for modes they don't know.
 *
 * ARM (box id 0) can never be a link, and an empty range is one of the fixed padding slots
 * the FC always reports rather than a real entry — that is the only thing distinguishing
 * padding from a configured ARM range, since both carry id 0.
 */
export function entriesFromModeRanges(modeRanges, modeRangesExtra) {
    const decoded = [];

    modeRanges.forEach((range, index) => {
        const extra = modeRangesExtra[index];
        const modeLogic = extra?.modeLogic ?? 0;
        const linkedTo = extra?.linkedTo ?? 0;

        if (range.id === 0 || linkedTo === 0) {
            if (range.range.start >= range.range.end) {
                return;
            }
            decoded.push({
                modeId: range.id,
                entry: {
                    kind: "range",
                    auxChannelIndex: range.auxChannelIndex,
                    modeLogic,
                    sliderRange: normalizeRangeValues([range.range.start, range.range.end]),
                },
            });
            return;
        }

        decoded.push({
            modeId: range.id,
            entry: { kind: "link", modeLogic, linkedTo },
        });
    });

    return decoded;
}

/**
 * Project the tab's mode model onto the MSP mode-range payload, padded out to the fixed
 * slot count the FC expects. A link row still set to "None" carries no target and is not
 * persisted, so it is dropped here — `serializeModes` ignores it for the same reason.
 */
export function buildModeRangePayload(modes, requiredCount = 0) {
    const modeRanges = [];
    const modeRangesExtra = [];

    modes.forEach((mode) => {
        mode.entries.forEach((entry) => {
            if (entry.kind === "range") {
                const [start, end] = normalizeRangeValues(entry.sliderRange);
                modeRanges.push({ id: mode.id, auxChannelIndex: entry.auxChannelIndex, range: { start, end } });
                modeRangesExtra.push({ id: mode.id, modeLogic: entry.modeLogic, linkedTo: 0 });
                return;
            }

            if (entry.kind === "link" && entry.linkedTo) {
                modeRanges.push({
                    id: mode.id,
                    auxChannelIndex: 0,
                    range: { start: CHANNEL_MIN, end: CHANNEL_MIN },
                });
                modeRangesExtra.push({ id: mode.id, modeLogic: entry.modeLogic, linkedTo: entry.linkedTo });
            }
        });
    });

    while (modeRanges.length < requiredCount) {
        modeRanges.push({ id: 0, auxChannelIndex: 0, range: { start: CHANNEL_MIN, end: CHANNEL_MIN } });
        modeRangesExtra.push({ id: 0, modeLogic: 0, linkedTo: 0 });
    }

    return { modeRanges, modeRangesExtra };
}

/**
 * Serialize the tab's mode model for dirty comparison.
 *
 * This is the single source of truth for "what does the tab currently hold": the save path
 * re-snapshots the model with this same function instead of reconstructing an equivalent
 * string from the payload, so there is no second serializer that can drift out of step.
 *
 * A link row still set to "None" is dropped by `buildModeRangePayload`, so it must not count
 * as a change here either — otherwise adding one would leave the tab permanently dirty with
 * nothing left to save.
 */
export function serializeModes(modes) {
    return JSON.stringify(
        modes.map((mode) => ({
            id: mode.id,
            entries: mode.entries
                .filter((entry) => entry.kind === "range" || entry.linkedTo > 0)
                .map((entry) => {
                    if (entry.kind === "range") {
                        const [start, end] = normalizeRangeValues(entry.sliderRange);
                        return {
                            kind: "range",
                            auxChannelIndex: entry.auxChannelIndex,
                            modeLogic: entry.modeLogic,
                            start,
                            end,
                        };
                    }
                    return { kind: "link", modeLogic: entry.modeLogic, linkedTo: entry.linkedTo };
                }),
        })),
    );
}
