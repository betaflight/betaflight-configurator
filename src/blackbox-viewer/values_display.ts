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

import { FlightLogFieldPresenter } from "./flightlog_fields_presenter";
import { SimpleStats } from "./simple-stats";
import { formatTime } from "./tools";
import { debugContextFromSysConfig } from "../js/utils/debugModes";
import type { FlightLog, LogFrame } from "./flightlog";
import type { useLogStore } from "./stores/log";
import type { useGraphStore } from "./stores/graph";
import type { useAppStore } from "./stores/app";
import type { UserSettings } from "./user_settings_data";

type LogStore = ReturnType<typeof useLogStore>;
type GraphStore = ReturnType<typeof useGraphStore>;
type AppStore = ReturnType<typeof useAppStore>;

/** A frame's value for a field, or undefined for a field the log does not have. */
function frameValue(frame: LogFrame, index: number | undefined): number | null | undefined {
    return index === undefined ? undefined : frame[index];
}

function atMost2DecPlaces(value: number | null): number | string {
    // Math.trunc, not Number.isInteger: an infinite value is shown as a number.
    if (value !== null && Math.trunc(value) === value) {
        return value;
    }

    if (value === null) {
        return "(absent)";
    }

    return value.toFixed(2);
}

export function updateLegendValues(
    log: FlightLog,
    frame: LogFrame,
    graphStore: Pick<GraphStore, "activeGraphConfig" | "legendValues">,
    userSettings: Pick<UserSettings, "legendUnits">,
): void {
    try {
        const currentFlightMode = frameValue(frame, log.getMainFieldIndexByName("flightModeFlags"));
        // Only reached with a graph loaded, which needs a graph config.
        const graphs = graphStore.activeGraphConfig!.getGraphs();
        const vals: GraphStore["legendValues"] = {};
        for (const graph of graphs) {
            for (const field of graph.fields) {
                const raw = frameValue(frame, log.getMainFieldIndexByName(field.name));
                let value: number | string | null | undefined = raw;
                if (userSettings.legendUnits) {
                    value = FlightLogFieldPresenter.decodeFieldToFriendly(log, field.name, raw, currentFlightMode);
                } else if (raw != null && raw % 1 !== 0) {
                    value = raw.toFixed(2);
                }
                // adaptGraphs() gives every field a curve and a smoothing; a saved curve may lack a power,
                // which shows as NaN.
                const power = Number(field.curve!.power);
                const settings = `Z100 E${(power * 100).toFixed(0)} S${(Number(field.smoothing) / 100).toFixed(0)}`;
                vals[field.name] = { value: value ?? "", settings };
            }
        }
        graphStore.legendValues = vals;
    } catch {
        console.log("Cannot update legend with values");
    }
}

export function updateValuesChart(
    logStore: LogStore,
    graphStore: GraphStore,
    appStore: AppStore,
    userSettings: Pick<UserSettings, "legendUnits">,
): void {
    // Playback only asks for values once a log is loaded.
    const flightLog = logStore.flightLog!;
    const frame = flightLog.getSmoothedFrameAtTime(logStore.currentBlackboxTime);
    if (!frame) {
        return;
    }

    const fieldNames = flightLog.getMainFieldNames();
    const currentFlightMode = frameValue(frame, flightLog.getMainFieldIndexByName("flightModeFlags"));

    if (graphStore.hasTableOverlay) {
        const debugContext = debugContextFromSysConfig(flightLog.getSysConfig());
        const values: LogStore["fieldValues"] = [];

        for (let i = 0; i < fieldNames.length; i++) {
            values.push({
                name: FlightLogFieldPresenter.fieldNameToFriendly(fieldNames[i], debugContext),
                raw: atMost2DecPlaces(frame[i]),
                decoded: FlightLogFieldPresenter.decodeFieldToFriendly(
                    flightLog,
                    fieldNames[i],
                    frame[i],
                    currentFlightMode,
                ),
            });
        }
        logStore.fieldValues = values;

        const statRows: LogStore["fieldStats"] = [];
        const stats = SimpleStats(flightLog).calculate();
        for (const stat of Object.values(stats)) {
            if (stat === undefined) {
                continue;
            }
            statRows.push({
                name: FlightLogFieldPresenter.fieldNameToFriendly(stat.name, debugContext),
                min: `${FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, stat.name, stat.min)} (${atMost2DecPlaces(stat.min)})`,
                max: `${FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, stat.name, stat.max)} (${atMost2DecPlaces(stat.max)})`,
                mean: `${FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, stat.name, stat.mean)} (${atMost2DecPlaces(stat.mean)})`,
            });
        }
        logStore.fieldStats = statRows;
    }

    // The flight mode names do not depend on the log, so any log will do here.
    appStore.statusFlightMode = String(
        FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, "flightModeFlags", currentFlightMode, null),
    );

    appStore.graphTimeDisplay = formatTime((logStore.currentBlackboxTime - flightLog.getMinTime()) / 1000, true);
    if (graphStore.hasMarker) {
        appStore.statusMarkerOffset = `Marker Offset ${formatTime(
            (logStore.currentBlackboxTime - graphStore.markerTime) / 1000,
            true,
        )}ms ${(1000000 / (logStore.currentBlackboxTime - graphStore.markerTime)).toFixed(0)}Hz`;
    }

    if (graphStore.legendVisible) {
        updateLegendValues(flightLog, frame, graphStore, userSettings);
    }
}
