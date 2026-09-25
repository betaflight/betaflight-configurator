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

import { CHANNEL_MIN, CHANNEL_MAX, clampChannel } from "./rcChannel";

/** A channel range in microseconds, as the MSP mode-range payload carries it. */
export interface Range {
    start: number;
    end: number;
}

/** One slot of the MSP `MODE_RANGES` payload. */
export interface ModeRange {
    id: number;
    auxChannelIndex: number;
    range: Range;
}

/** The matching slot of the MSP `MODE_RANGES_EXTRA` payload. */
export interface ModeRangeExtra {
    id: number;
    modeLogic: number;
    linkedTo: number;
}

/** A mode driven by an aux-channel range. */
export interface RangeEntry {
    kind: "range";
    auxChannelIndex: number;
    modeLogic: number;
    sliderRange: [number, number];
}

/** A mode slaved to another mode rather than to a channel. */
export interface LinkEntry {
    kind: "link";
    modeLogic: number;
    linkedTo: number;
}

export type ModeEntry = RangeEntry | LinkEntry;

/** The tab's model for a single box: its id and the entries configured against it. */
export interface Mode {
    id: number;
    entries: ModeEntry[];
}

export const CHANNEL_STEP = 25;
export const MIN_RANGE_GAP = 25;
export const DEFAULT_RANGE: Range = { start: 1300, end: 1700 };

export function snapChannel(value: number): number {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
        return DEFAULT_RANGE.start;
    }
    return clampChannel(Math.round(numericValue / CHANNEL_STEP) * CHANNEL_STEP);
}

// Snap a slider pair to the channel grid, guaranteeing a non-empty range. Every UI range comes
// through here, so `start < end` always holds — which is what lets an empty range mean padding.
export function normalizeRangeValues(values: number[]): [number, number] {
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
 * Decode an MSP mode-range payload into `{ modeId, entry }` pairs in payload order.
 *
 * ARM (box id 0) is never a link, and an empty range is a padding slot rather than a real
 * entry — the only thing separating padding from a configured ARM range, since both carry id 0.
 */
export function entriesFromModeRanges(
    modeRanges: ModeRange[],
    modeRangesExtra: ModeRangeExtra[],
): Array<{ modeId: number; entry: ModeEntry }> {
    const decoded: Array<{ modeId: number; entry: ModeEntry }> = [];

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
 * Project the mode model onto the MSP payload, padded to the slot count the FC expects. A link
 * row still on "None" has no target and is dropped; `serializeModes` ignores it to match.
 */
export function buildModeRangePayload(
    modes: Mode[],
    requiredCount = 0,
): { modeRanges: ModeRange[]; modeRangesExtra: ModeRangeExtra[] } {
    const modeRanges: ModeRange[] = [];
    const modeRangesExtra: ModeRangeExtra[] = [];

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
 * Serialize the mode model for dirty comparison. The save path re-snapshots with this same
 * function rather than rebuilding an equivalent string from the payload, so nothing can drift.
 * "None" links are dropped to match `buildModeRangePayload`, or adding one would never clear.
 */
export function serializeModes(modes: Mode[]): string {
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
