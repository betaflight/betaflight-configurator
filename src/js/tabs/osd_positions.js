/**
 * Preset position configurations for OSD elements.
 * 15 positions arranged in a 3x5 grid (columns x rows).
 *
 * Each config has:
 *  - label: Human-readable name
 *  - coords(w, h, displaySize): Function returning {x, y} target position
 *  - grow: {x, y} direction to search for free space if target is occupied
 *  - gridPos: [col, row] position in the 3x5 selector grid
 */
export const positionConfigs = {
    TL: {
        label: "Top Left",
        coords: (_w, _h, _ds) => ({ x: 1, y: 1 }),
        grow: { x: 0, y: 1 },
        gridPos: [0, 0],
    },
    TC: {
        label: "Top Center",
        coords: (w, _h, ds) => ({
            x: Math.floor((ds.x - w) / 2),
            y: 1,
        }),
        grow: { x: 0, y: 1 },
        gridPos: [1, 0],
    },
    TR: {
        label: "Top Right",
        coords: (w, _h, ds) => ({
            x: Math.max(1, ds.x - w - 1),
            y: 1,
        }),
        grow: { x: 0, y: 1 },
        gridPos: [2, 0],
    },
    TML: {
        label: "Top Middle Left",
        coords: (_w, h, ds) => ({
            x: 1,
            y: Math.floor(ds.y / 3) - Math.floor(h / 2),
        }),
        grow: { x: 0, y: 1 },
        gridPos: [0, 1],
    },
    TMC: {
        label: "Top Mid Center",
        coords: (w, h, ds) => ({
            x: Math.floor((ds.x - w) / 2),
            y: Math.floor(ds.y / 3) - Math.floor(h / 2),
        }),
        grow: { x: 0, y: 1 },
        gridPos: [1, 1],
    },
    TMR: {
        label: "Top Middle Right",
        coords: (w, h, ds) => ({
            x: Math.max(1, ds.x - w - 1),
            y: Math.floor(ds.y / 3) - Math.floor(h / 2),
        }),
        grow: { x: 0, y: 1 },
        gridPos: [2, 1],
    },
    LMC: {
        label: "Left Middle",
        coords: (_w, h, ds) => ({
            x: 1,
            y: Math.floor((ds.y - h) / 2),
        }),
        grow: { x: 0, y: 1 },
        gridPos: [0, 2],
    },
    CTR: {
        label: "Center",
        coords: (w, h, ds) => ({
            x: Math.floor(ds.x / 2 - w / 2),
            y: Math.floor(ds.y / 2 - h / 2),
        }),
        grow: { x: 0, y: 1 },
        gridPos: [1, 2],
    },
    RMC: {
        label: "Right Middle",
        coords: (w, h, ds) => ({
            x: ds.x - 1 - w,
            y: Math.floor((ds.y - h) / 2),
        }),
        grow: { x: 0, y: 1 },
        gridPos: [2, 2],
    },
    BML: {
        label: "Bottom Middle Left",
        coords: (_w, h, ds) => ({
            x: 1,
            y: Math.floor((ds.y * 2) / 3) - Math.floor(h / 2),
        }),
        grow: { x: 0, y: -1 },
        gridPos: [0, 3],
    },
    BMC: {
        label: "Bottom Mid Center",
        coords: (w, h, ds) => ({
            x: Math.floor((ds.x - w) / 2),
            y: Math.floor((ds.y * 2) / 3) - Math.floor(h / 2),
        }),
        grow: { x: 0, y: -1 },
        gridPos: [1, 3],
    },
    BMR: {
        label: "Bottom Middle Right",
        coords: (w, h, ds) => ({
            x: Math.max(1, ds.x - w - 1),
            y: Math.floor((ds.y * 2) / 3) - Math.floor(h / 2),
        }),
        grow: { x: 0, y: -1 },
        gridPos: [2, 3],
    },
    BL: {
        label: "Bottom Left",
        coords: (_w, h, ds) => ({
            x: 1,
            y: ds.y - h - 1,
        }),
        grow: { x: 0, y: -1 },
        gridPos: [0, 4],
    },
    BC: {
        label: "Bottom Center",
        coords: (w, h, ds) => ({
            x: Math.floor((ds.x - w) / 2),
            y: ds.y - h - 1,
        }),
        grow: { x: 0, y: -1 },
        gridPos: [1, 4],
    },
    BR: {
        label: "Bottom Right",
        coords: (w, h, ds) => ({
            x: Math.max(1, ds.x - w - 1),
            y: ds.y - h - 1,
        }),
        grow: { x: 0, y: -1 },
        gridPos: [2, 4],
    },
};

/**
 * Build a flat list of grid cells for use in a 3×5 selector.
 * Returns array of { col, row, key, label } sorted by row then col.
 */
export function getPresetGridCells() {
    const cells = [];
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
            const entry = Object.entries(positionConfigs).find(
                ([, cfg]) => cfg.gridPos[0] === col && cfg.gridPos[1] === row,
            );
            cells.push({
                col,
                row,
                key: entry ? entry[0] : null,
                label: entry ? entry[1].label : "",
            });
        }
    }
    return cells;
}
