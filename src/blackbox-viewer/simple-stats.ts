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

import type { FlightLog } from "./flightlog";

/** A field's range and mean over the whole log. */
export interface FieldSummary {
    name: string;
    min: number;
    max: number;
    mean: number;
}

export type StatKey = "roll" | "pitch" | "yaw" | "throttle" | "vbat" | "amps" | "rssi" | "alt_baro" | "alt_gps";

export function SimpleStats(
    flightLog: Pick<FlightLog, "getChunksInTimeRange" | "getMinTime" | "getMaxTime" | "getMainFieldNames">,
): { calculate: () => Record<StatKey, FieldSummary | undefined> } {
    const chunks = flightLog.getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime());
    const frames = chunks.flatMap((chunk) => chunk.frames);
    const fields = flightLog.getMainFieldNames().map((f) => (f === "BaroAlt" ? "baroAlt" : f));

    const getMinMaxMean = (fieldName: string): FieldSummary | undefined => {
        const index = fields.indexOf(fieldName);
        if (index === -1 || !frames.length || !(index in frames[0]) || !frames[index][index]) {
            return undefined;
        }
        let min = Infinity,
            max = -Infinity,
            sum = 0;
        for (const f of frames) {
            // A null slot (a GPS field before the first fix) compares and sums as 0, as `<` and `+=` made it.
            const v = f[index] as number;
            if (v < min) {
                min = v;
            }
            if (v > max) {
                max = v;
            }
            sum += v;
        }
        return {
            name: fieldName,
            min,
            max,
            mean: sum / frames.length,
        };
    };

    const template: Record<StatKey, () => FieldSummary | undefined> = {
        roll: () => getMinMaxMean("rcCommand[0]"),
        pitch: () => getMinMaxMean("rcCommand[1]"),
        yaw: () => getMinMaxMean("rcCommand[2]"),
        throttle: () => getMinMaxMean("rcCommand[3]"),
        vbat: () => getMinMaxMean("vbatLatest"),
        amps: () => getMinMaxMean("amperageLatest"),
        rssi: () => getMinMaxMean("rssi"),
        alt_baro: () => getMinMaxMean("baroAlt"),
        alt_gps: () => getMinMaxMean("GPS_altitude"),
    };

    function calculate() {
        return Object.fromEntries(Object.entries(template).map(([key, fn]) => [key, fn()])) as Record<
            StatKey,
            FieldSummary | undefined
        >;
    }

    return {
        calculate: calculate,
    };
}
