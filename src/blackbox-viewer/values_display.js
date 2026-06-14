import { FlightLogFieldPresenter } from "./flightlog_fields_presenter.js";
import { SimpleStats } from "./simple-stats.js";
import { formatTime } from "./tools.js";

function isInteger(value) {
    return Math.trunc(value) === value;
}

function atMost2DecPlaces(value) {
    if (isInteger(value)) {
        return value;
    }

    if (value === null) {
        return "(absent)";
    }

    return value.toFixed(2);
}

export function updateLegendValues(log, frame, graphStore, userSettings) {
    try {
        const currentFlightMode = frame[log.getMainFieldIndexByName("flightModeFlags")];
        const graphs = graphStore.activeGraphConfig.getGraphs();
        const vals = {};
        for (const graph of graphs) {
            for (const field of graph.fields) {
                let value = frame[log.getMainFieldIndexByName(field.name)];
                if (userSettings.legendUnits) {
                    value = FlightLogFieldPresenter.decodeFieldToFriendly(log, field.name, value, currentFlightMode);
                } else if (value % 1 !== 0) {
                    value = value.toFixed(2);
                }
                const settings = `Z100 E${(field.curve.power * 100).toFixed(0)} S${(field.smoothing / 100).toFixed(0)}`;
                vals[field.name] = { value: value ?? "", settings };
            }
        }
        graphStore.legendValues = vals;
    } catch {
        console.log("Cannot update legend with values");
    }
}

export function updateValuesChart(logStore, graphStore, appStore, userSettings) {
    const frame = logStore.flightLog.getSmoothedFrameAtTime(logStore.currentBlackboxTime);
    if (!frame) {
        return;
    }

    const fieldNames = logStore.flightLog.getMainFieldNames();
    const currentFlightMode = frame[logStore.flightLog.getMainFieldIndexByName("flightModeFlags")];

    if (graphStore.hasTableOverlay) {
        const sysConfig = logStore.flightLog.getSysConfig();
        const debugMode = sysConfig.debug_mode;
        const apiVersion = sysConfig.apiVersion;
        const values = [];

        for (let i = 0; i < fieldNames.length; i++) {
            values.push({
                name: FlightLogFieldPresenter.fieldNameToFriendly(fieldNames[i], debugMode, apiVersion),
                raw: atMost2DecPlaces(frame[i]),
                decoded: FlightLogFieldPresenter.decodeFieldToFriendly(
                    logStore.flightLog,
                    fieldNames[i],
                    frame[i],
                    currentFlightMode,
                ),
            });
        }
        logStore.fieldValues = values;

        const statRows = [];
        const stats = SimpleStats(logStore.flightLog).calculate();
        for (const field of Object.keys(stats)) {
            const stat = stats[field];
            if (stat === undefined) {
                continue;
            }
            statRows.push({
                name: FlightLogFieldPresenter.fieldNameToFriendly(stat.name, debugMode, apiVersion),
                min: `${FlightLogFieldPresenter.decodeFieldToFriendly(logStore.flightLog, stat.name, stat.min)} (${atMost2DecPlaces(stat.min)})`,
                max: `${FlightLogFieldPresenter.decodeFieldToFriendly(logStore.flightLog, stat.name, stat.max)} (${atMost2DecPlaces(stat.max)})`,
                mean: `${FlightLogFieldPresenter.decodeFieldToFriendly(logStore.flightLog, stat.name, stat.mean)} (${atMost2DecPlaces(stat.mean)})`,
            });
        }
        logStore.fieldStats = statRows;
    }

    appStore.statusFlightMode = FlightLogFieldPresenter.decodeFieldToFriendly(
        null,
        "flightModeFlags",
        currentFlightMode,
        null,
    );

    appStore.graphTimeDisplay = formatTime(
        (logStore.currentBlackboxTime - logStore.flightLog.getMinTime()) / 1000,
        true,
    );
    if (graphStore.hasMarker) {
        appStore.statusMarkerOffset = `Marker Offset ${formatTime(
            (logStore.currentBlackboxTime - graphStore.markerTime) / 1000,
            true,
        )}ms ${(1000000 / (logStore.currentBlackboxTime - graphStore.markerTime)).toFixed(0)}Hz`;
    }

    if (graphStore.legendVisible) {
        updateLegendValues(logStore.flightLog, frame, graphStore, userSettings);
    }
}
