// Parser for `betaflight/unified-targets` `.config` files.
//
// Each file is a flat sequence of `#define`/`#mcu` directives,
// `board_name`/`manufacturer_id` declarations, `resource <NAME> <INDEX>
// <PAD>` lines, `timer`/`dma`/`feature`/`serial`/`set` lines, and `#`
// comments grouping them. This parser only cares about four things:
//
//   - `board_name <NAME>`           → board identifier
//   - `manufacturer_id <ID>`        → 4-letter MFGR prefix
//   - `resource MOTOR <n> <pad>`    → motors[]
//   - `resource LED_STRIP 1 <pad>`  → ledStrips[]
//
// FC.CONFIG.boardName on modern firmware is `<MFGR>_<BOARD>` (e.g.
// `TMTR_TMOTORF7`). Older firmware just emits `<BOARD>`. The orchestrator
// uses the combined form as the primary JSON key and the lookup helper
// (PR 2 session 3) handles both shapes. Everything else is ignored —
// the schema stays narrow (just the silkscreen mapping) so the bundle
// ships fast and review-able. UART / SPI / DMA / timer defaults are
// reachable via the FC's safe bare `resource` / `timer` / `dma` reads
// when needed.

const RESOURCE_LINE = /^resource\s+([A-Z][A-Z0-9_]+)\s+(\d+)\s+([A-Z][A-Z0-9]+)\s*$/i;
const BOARD_NAME_LINE = /^board_name\s+([A-Z0-9_]+)\s*$/i;
const MANUFACTURER_LINE = /^manufacturer_id\s+([A-Z0-9_]+)\s*$/i;

export function parseUnifiedTargetConfig(text) {
    let boardName = null;
    let manufacturerId = null;
    const motors = [];
    const ledStrips = [];
    if (typeof text !== "string") {
        return { boardName, manufacturerId, motors, ledStrips };
    }
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const boardMatch = BOARD_NAME_LINE.exec(line);
        if (boardMatch) {
            boardName = boardMatch[1].toUpperCase();
            continue;
        }

        const manufacturerMatch = MANUFACTURER_LINE.exec(line);
        if (manufacturerMatch) {
            manufacturerId = manufacturerMatch[1].toUpperCase();
            continue;
        }

        const resourceMatch = RESOURCE_LINE.exec(line);
        if (!resourceMatch) {
            continue;
        }
        const peripheral = resourceMatch[1].toUpperCase();
        const index = Number(resourceMatch[2]);
        const pad = resourceMatch[3].toUpperCase();
        if (peripheral === "MOTOR" && Number.isFinite(index)) {
            motors.push({ index, pad });
        } else if (peripheral === "LED_STRIP") {
            ledStrips.push({ pad });
        }
    }
    motors.sort((a, b) => a.index - b.index);
    return { boardName, manufacturerId, motors, ledStrips };
}
