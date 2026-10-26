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
import { GraphConfig } from "../../src/blackbox-viewer/graph_config";
import type { DisabledFields, FlightLog } from "../../src/blackbox-viewer/flightlog";

/** Only what getExampleGraphConfigs() reads: the disabled-field mask and the field indexes. */
function logWith(fieldNames: string[], disabled: DisabledFields = {}): FlightLog {
    return {
        isFieldDisabled: () => disabled,
        getMainFieldIndexByName: (name: string) => {
            const index = fieldNames.indexOf(name);
            return index === -1 ? undefined : index;
        },
    } as unknown as FlightLog;
}

const labels = (log: FlightLog) => GraphConfig.getExampleGraphConfigs(log).map((graph) => graph.label);

describe("GraphConfig.getExampleGraphConfigs", () => {
    // No disabled-field mask covers heading: the log computes it from the IMU quaternion,
    // or from the gyro and accelerometer. Without either the example was an empty graph.
    it("offers the Heading graph only when the log has heading fields", () => {
        expect(labels(logWith(["motor[0]"]))).not.toContain("Heading");
        expect(labels(logWith(["motor[0]", "heading[0]", "heading[1]", "heading[2]"]))).toContain("Heading");
    });

    // No log has motorLegacy fields: the example was always an empty graph.
    it("does not offer the empty Motors (Legacy) graph", () => {
        expect(labels(logWith(["motor[0]"]))).toContain("Motors");
        expect(labels(logWith(["motor[0]"]))).not.toContain("Motors (Legacy)");
    });

    it("leaves out the graphs whose fields are disabled", () => {
        const graphs = labels(logWith(["motor[0]"], { MOTORS: true, GYRO: true }));
        expect(graphs).not.toContain("Motors");
        expect(graphs).not.toContain("Gyros");
        expect(graphs).not.toContain("PID Error");
        expect(graphs).toContain("RPM");
    });

    it("returns only the named graphs, with their fields to be coloured from the palette", () => {
        expect(GraphConfig.getExampleGraphConfigs(logWith(["motor[0]"]), ["Gyros", "Motors"])).toEqual([
            {
                label: "Motors",
                height: 1,
                fields: [
                    { name: "motor[all]", color: -1 },
                    { name: "servo[5]", color: -1 },
                ],
            },
            { label: "Gyros", height: 1, fields: [{ name: "gyroADC[all]", color: -1 }] },
        ]);
    });
});
