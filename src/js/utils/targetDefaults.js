// Tier-0 padDefaults source — bundled silkscreen-default mapping for
// every target in betaflight/unified-targets. Loaded once at module
// init from src/data/target-defaults.json. The lookup is FC-state-
// independent: silkscreen labels are physical board markings and don't
// change when software bindings change, so as long as we know the
// target name we know the silkscreen map.
//
// FC.CONFIG.boardName shape varies by firmware era:
//   - Modern BF (4.x+): `<MFGR>_<BOARD>` like `TMTR_TMOTORF7`
//   - Older BF (legacy targets): bare `<BOARD>` like `TMOTORF7`
//   - Either form may include a silicon suffix like `(STM32F7X2)`
//
// The bundle keys by the modern manufacturer-prefixed form. The lookup
// helper normalises the input (strip silicon suffix, uppercase, trim)
// then tries the direct key, falling back to scanning by `boardName`
// alone for older firmware reports.

import bundle from "../../data/target-defaults.json";

const TARGETS = bundle?.targets ?? {};
// Reverse index: `boardName` (no manufacturer prefix) → key. Built once.
// Used as the fallback path when the FC reports the bare board name.
const BARE_BOARD_INDEX = (() => {
    const index = new Map();
    for (const [key, entry] of Object.entries(TARGETS)) {
        const board = entry?.boardName;
        if (typeof board !== "string") {
            continue;
        }
        // First-write-wins: if multiple manufacturers share a board name
        // (rare; would be an upstream conflict), keep the first occurrence
        // sorted alphabetically by key (Object.entries preserves insertion
        // order, and the bundle is alphabetised by key on write).
        if (!index.has(board)) {
            index.set(board, key);
        }
    }
    return index;
})();

// Normalise an FC-reported board name for lookup. Strips trailing
// silicon-package suffixes like `(STM32F7X2)`, surrounding whitespace,
// and uppercases the result.
export function normaliseBoardName(raw) {
    if (typeof raw !== "string") {
        return "";
    }
    let cleaned = raw.trim();
    // Strip trailing silicon-package suffix like "(STM32F7X2)" without a
    // regex (avoids ReDoS hotspots on adversarial input).
    if (cleaned.endsWith(")")) {
        const open = cleaned.lastIndexOf("(");
        if (open > 0) {
            cleaned = cleaned.slice(0, open).trim();
        }
    }
    return cleaned.toUpperCase();
}

// Returns `{ source: "firmware", motors, ledStrips }` when a bundled
// entry matches the FC's board name, else null. Caller merges into
// `smartResourceAnalysis.padDefaults`.
export function lookupTargetDefaults(rawBoardName) {
    const key = normaliseBoardName(rawBoardName);
    if (!key) {
        return null;
    }

    const direct = TARGETS[key];
    if (direct) {
        return {
            source: "firmware",
            motors: direct.motors ?? [],
            ledStrips: direct.ledStrips ?? [],
        };
    }

    // Fallback for older firmware that reports bare boardName without
    // the manufacturer prefix.
    const fallbackKey = BARE_BOARD_INDEX.get(key);
    if (fallbackKey) {
        const entry = TARGETS[fallbackKey];
        return {
            source: "firmware",
            motors: entry.motors ?? [],
            ledStrips: entry.ledStrips ?? [],
        };
    }

    return null;
}
