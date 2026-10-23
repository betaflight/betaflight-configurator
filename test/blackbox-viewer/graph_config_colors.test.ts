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

import { describe, expect, it } from "vitest";
import { GraphConfig, type GraphPanelConfig } from "../../src/blackbox-viewer/graph_config";
import type { FlightLog } from "../../src/blackbox-viewer/flightlog";

const PALETTE = GraphConfig.PALETTE.map((entry) => entry.color);

// Just enough of a FlightLog for adaptGraphs: four motors and a throttle setpoint.
// It lacks everything else a FlightLog has (getMinMaxForFieldDuringAllTime, rcCommandRawToDegreesPerSecond, ...),
// so the default curve throws and the catch in getDefaultCurveForField hands back the fallback range.
const flightLog = {
    getMainFieldNames: () => ["motor[0]", "motor[1]", "motor[2]", "motor[3]", "setpoint[3]"],
    getMainFieldIndexByName: (name: string) => (name === "setpoint[3]" ? 4 : undefined),
    getSysConfig: () => ({ debug_mode: 0, firmwareType: 3, firmwareVersion: "4.6.0" }),
} as unknown as FlightLog;

function adaptedColors(config: GraphConfig, graphs: GraphPanelConfig[]) {
    config.adaptGraphs(flightLog, graphs);
    return config.getGraphs().map((graph) => graph.fields.map((field) => field.color));
}

describe("GraphConfig.adaptGraphs colours", () => {
    it("keeps palette colours when the same config is adapted again", () => {
        const config = new GraphConfig();
        const graphs: GraphPanelConfig[] = [{ label: "Motors", fields: [{ name: "motor[all]", color: -1 }] }];
        const expected = [PALETTE.slice(0, 4)];

        expect(adaptedColors(config, graphs)).toEqual(expected);
        expect(adaptedColors(config, graphs)).toEqual(expected);
        expect(graphs[0].fields[0].color).toBe(-1);
    });

    it("gives a field with no colour its palette slot", () => {
        const config = new GraphConfig();
        const graphs: GraphPanelConfig[] = [
            {
                label: "Mixed",
                fields: [
                    { name: "setpoint[3]", color: "#123456" },
                    { name: "setpoint[3]", color: -1 },
                    { name: "setpoint[3]" },
                ],
            },
        ];

        expect(adaptedColors(config, graphs)).toEqual([["#123456", PALETTE[1], PALETTE[2]]]);
    });

    it("starts an [all] field at the first palette slot wherever it sits in the graph", () => {
        const config = new GraphConfig();
        const graphs: GraphPanelConfig[] = [
            {
                label: "Mixed",
                fields: [
                    { name: "setpoint[3]", color: "#123456" },
                    { name: "motor[all]", color: -1 },
                ],
            },
        ];

        expect(adaptedColors(config, graphs)).toEqual([["#123456", ...PALETTE.slice(0, 4)]]);
    });

    it("gives a graph with no height a height of 1, and keeps one it has", () => {
        const config = new GraphConfig();
        config.adaptGraphs(flightLog, [
            { label: "Default", fields: [{ name: "setpoint[3]" }] },
            { label: "Tall", height: 3, fields: [{ name: "setpoint[3]" }] },
        ]);

        expect(config.getGraphs().map((graph) => graph.height)).toEqual([1, 3]);
    });

    it("leaves the caller's field curve alone when it adapts a graph", () => {
        const config = new GraphConfig();
        const curve = { power: 0.5 };
        config.adaptGraphs(flightLog, [{ label: "Setpoint", fields: [{ name: "setpoint[3]", curve }] }]);

        expect(curve).toEqual({ power: 0.5 });
        expect(config.getGraphs()[0].fields[0].curve?.power).toBe(0.5);
    });

    it("replaces the curve a saved [all] field carries with the default for each expanded field", () => {
        const config = new GraphConfig();
        config.adaptGraphs(flightLog, [
            { label: "Motors", fields: [{ name: "motor[all]", curve: { power: 0.5, MinMax: { min: 0, max: 50 } } }] },
        ]);

        expect(config.getGraphs()[0].fields.map((field) => field.curve)).toEqual(
            Array.from({ length: 4 }, () => ({ power: 1, MinMax: { min: 0, max: 100 } })),
        );
    });
});

describe("GraphConfig.load", () => {
    it("renames the legacy gyroData fields to gyroADC", () => {
        const config: GraphPanelConfig[] = [
            { label: "Gyros", fields: [{ name: "gyroData[0]" }, { name: "gyroADC[1]" }, { name: "motor[0]" }] },
        ];

        expect(GraphConfig.load(config)).toEqual([
            { label: "Gyros", fields: [{ name: "gyroADC[0]" }, { name: "gyroADC[1]" }, { name: "motor[0]" }] },
        ]);
    });

    it("answers false when there is no saved config", () => {
        expect(GraphConfig.load(null)).toBe(false);
        expect(GraphConfig.load(undefined)).toBe(false);
    });
});
