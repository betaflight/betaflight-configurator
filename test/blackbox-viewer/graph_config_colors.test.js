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
import { GraphConfig } from "../../src/blackbox-viewer/graph_config.js";

const PALETTE = GraphConfig.PALETTE.map((entry) => entry.color);

// Just enough of a FlightLog for adaptGraphs: four motors and a throttle setpoint.
const flightLog = {
    getMainFieldNames: () => ["motor[0]", "motor[1]", "motor[2]", "motor[3]", "setpoint[3]"],
    getMainFieldIndexByName: (name) => (name === "setpoint[3]" ? 4 : undefined),
    getSysConfig: () => ({ debug_mode: 0, firmwareType: 3, firmwareVersion: "4.6.0" }),
};

function adaptedColors(config, graphs) {
    config.adaptGraphs(flightLog, graphs);
    return config.getGraphs().map((graph) => graph.fields.map((field) => field.color));
}

describe("GraphConfig.adaptGraphs colours", () => {
    it("keeps palette colours when the same config is adapted again", () => {
        const config = new GraphConfig();
        const graphs = [{ label: "Motors", fields: [{ name: "motor[all]", color: -1 }] }];
        const expected = [PALETTE.slice(0, 4)];

        expect(adaptedColors(config, graphs)).toEqual(expected);
        expect(adaptedColors(config, graphs)).toEqual(expected);
        expect(graphs[0].fields[0].color).toBe(-1);
    });

    it("gives a field with no colour its palette slot", () => {
        const config = new GraphConfig();
        const graphs = [
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
});
