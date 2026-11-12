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

import { constrain } from "./tools";
import type { GraphCurveConfig, GraphFieldConfig, GraphPanelConfig } from "./graph_config";

/**
 * A field as adaptGraphs() leaves it: with a curve and a smoothing. A curve saved without a
 * power or a range keeps the gap, which the arithmetic below reads as NaN, as it always did.
 */
type PenField = GraphFieldConfig & { curve: GraphCurveConfig };

/**
 * The pen being adjusted, as the legend gives it: a graph index, and a field index or null for
 * every field of the graph. Both come as decimal strings; main.ts converts them.
 */
type PenIndex = string | null | undefined;

function pens(graphs: GraphPanelConfig[], group: string): PenField[] {
    return graphs[Number.parseInt(group, 10)].fields as PenField[];
}

function pen(graphs: GraphPanelConfig[], group: string, field: string): PenField {
    return pens(graphs, group)[Number.parseInt(field, 10)];
}

function storeDefaults(field: PenField): void {
    field.default = { smoothing: field.smoothing, power: field.curve.power };
}

export function savePenDefaults(graphs: GraphPanelConfig[], group: PenIndex, field: PenIndex): string | null {
    if (group == null && field == null) {
        return null;
    }

    if (group != null && field == null) {
        for (const configField of pens(graphs, group)) {
            if (configField.default == null) {
                storeDefaults(configField);
            }
        }
        return "<h4>Stored defaults for all pens</h4>";
    }
    if (group != null && field != null) {
        const configField = pen(graphs, group, field);
        if (configField.default == null) {
            storeDefaults(configField);
            return "<h4>Stored defaults for single pen</h4>";
        }
    }
    return null;
}

export function restorePenDefaults(graphs: GraphPanelConfig[], group: PenIndex, field: PenIndex): string | null {
    if (group == null && field == null) {
        return null;
    }

    if (group != null && field == null) {
        for (const configField of pens(graphs, group)) {
            if (configField.default == null) {
                return null;
            }
            configField.smoothing = configField.default.smoothing;
            configField.curve.power = configField.default.power;
        }
        return "<h4>Restored defaults for all pens</h4>";
    }
    if (group != null && field != null) {
        const configField = pen(graphs, group, field);
        if (configField.default == null) {
            return null;
        }
        configField.smoothing = configField.default.smoothing;
        configField.curve.power = configField.default.power;
        return "<h4>Restored defaults for single pen</h4>";
    }
    return null;
}

// Smoothing radius in microseconds, matching the range of the graph config dialog (0-10000%)
const SMOOTHING_RANGE = { min: 0, max: 1000000 };

// The scroll step grows with the value, so the whole range stays reachable without
// losing fine control at the low end where most pens sit
function smoothingStep(value: number): number {
    if (value < 10000) {
        return 1000;
    }
    if (value < 100000) {
        return 10000;
    }
    return 100000;
}

// As in changePenExpo() and changePenZoom(), a truthy delta means "down":
// LegendPanel maps a scroll up to delta = 1, which main.ts passes on as increase = delta >= 0
function nextSmoothing(current: number | undefined, delta: boolean): number {
    const value = current ?? 0;
    const next = delta
        ? Math.ceil(value / smoothingStep(value - 1)) * smoothingStep(value - 1) - smoothingStep(value - 1)
        : Math.floor(value / smoothingStep(value)) * smoothingStep(value) + smoothingStep(value);
    return constrain(next, SMOOTHING_RANGE.min, SMOOTHING_RANGE.max);
}

export function changePenSmoothing(
    graphs: GraphPanelConfig[],
    group: PenIndex,
    field: PenIndex,
    delta: boolean,
): string | null {
    if (group == null && field == null) {
        return null;
    }

    savePenDefaults(graphs, group, field);

    let changedValue = "<h4>Smoothing</h4>";
    if (group != null && field == null) {
        for (const configField of pens(graphs, group)) {
            configField.smoothing = nextSmoothing(configField.smoothing, delta);
            changedValue += `${configField.friendlyName} ${(configField.smoothing / 100).toFixed(2)}%\n`;
        }
        return changedValue;
    }
    if (group != null && field != null) {
        const configField = pen(graphs, group, field);
        configField.smoothing = nextSmoothing(configField.smoothing, delta);
        return `${changedValue + configField.friendlyName} ${(configField.smoothing / 100).toFixed(2)}%\n`;
    }
    return null;
}

/** A range scaled about its middle. A range missing from a saved config gives NaN bounds. */
function scaleMinMax(mimmax: GraphCurveConfig["MinMax"], scale: number): { min: number; max: number } {
    const min = Number(mimmax!.min);
    const max = Number(mimmax!.max);
    const middle = (min + max) / 2;
    const halfRange = (max - min) / 2;
    return {
        min: middle - halfRange * scale,
        max: middle + halfRange * scale,
    };
}

export function changePenZoom(
    graphs: GraphPanelConfig[],
    group: PenIndex,
    field: PenIndex,
    delta: boolean,
): string | null {
    if (group == null && field == null) {
        return null;
    }

    savePenDefaults(graphs, group, field);
    const zoomScaleOut = 1.05;
    const scale = delta ? zoomScaleOut : 1 / zoomScaleOut;
    const direction = delta ? "Zoom out:\n" : "Zoom in:\n";

    if (group != null && field == null) {
        let changedValue = `<h4></h4>${direction}`;
        for (const configField of pens(graphs, group)) {
            configField.curve.MinMax = scaleMinMax(configField.curve.MinMax, scale);
            changedValue += `${configField.friendlyName}\n`;
        }
        return changedValue;
    }
    if (group != null && field != null) {
        const configField = pen(graphs, group, field);
        configField.curve.MinMax = scaleMinMax(configField.curve.MinMax, scale);
        return `<h4></h4>${direction}${configField.friendlyName}\n`;
    }
    return null;
}

export function changePenExpo(
    graphs: GraphPanelConfig[],
    group: PenIndex,
    field: PenIndex,
    delta: boolean,
): string | null {
    const range = { min: 0.05, max: 1 };
    const scroll = 0.05;

    if (group == null && field == null) {
        return null;
    }

    savePenDefaults(graphs, group, field);

    let changedValue = "<h4>Expo</h4>";
    if (group != null && field == null) {
        for (const configField of pens(graphs, group)) {
            // A curve saved without a power gives NaN here, as += did on undefined.
            configField.curve.power = constrain(
                Number(configField.curve.power) + (delta ? -scroll : +scroll),
                range.min,
                range.max,
            );
            changedValue += `${configField.friendlyName} ${(configField.curve.power * 100).toFixed(2)}%\n`;
        }
        return changedValue;
    }
    if (group != null && field != null) {
        const configField = pen(graphs, group, field);
        configField.curve.power = constrain(
            Number(configField.curve.power) + (delta ? -scroll : +scroll),
            range.min,
            range.max,
        );
        return `${changedValue + configField.friendlyName} ${(configField.curve.power * 100).toFixed(2)}%\n`;
    }
    return null;
}
