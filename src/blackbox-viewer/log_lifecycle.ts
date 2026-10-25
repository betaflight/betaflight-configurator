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

import { pinia } from "@/js/pinia_instance";
import { useLogStore } from "./stores/log";
import { useGraphStore, type SeekBarMode } from "./stores/graph";
import { useAppStore } from "./stores/app";
import { formatTime, stringLoopTime } from "./tools";

// The log lifecycle only runs once a log is parsed and the seekbar is mounted.
function loadedFlightLog() {
    const flightLog = useLogStore(pinia).flightLog;
    if (!flightLog) {
        throw new Error("No flight log is loaded");
    }
    return flightLog;
}

function mountedSeekBar() {
    const seekBar = useGraphStore(pinia).seekBar;
    if (!seekBar) {
        throw new Error("The seekbar is not mounted");
    }
    return seekBar;
}

export function renderLogFileInfo(file: Pick<File, "name">): void {
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);
    const flightLog = loadedFlightLog();

    appStore.logFilename = file.name;

    const logCount = flightLog.getLogCount();
    const entries = [];
    for (let index = 0; index < logCount; index++) {
        const error = flightLog.getLogError(index);
        let logLabel;
        if (error) {
            // A header or data error is usually a thrown Error, which a select would render as "{}".
            logLabel = String(error);
        } else {
            logLabel = `${formatTime(flightLog.getMinTime(index) / 1000, false)} - ${formatTime(
                flightLog.getMaxTime(index) / 1000,
                false,
            )} [${formatTime(Math.ceil((flightLog.getMaxTime(index) - flightLog.getMinTime(index)) / 1000), false)}]`;
        }
        const label = logCount > 1 ? `${index + 1}/${logCount}: ${logLabel}` : logLabel;
        entries.push({ label, value: index, disabled: !!error });
    }
    logStore.logIndexEntries = entries;
    logStore.activeLogIndex = 0;
}

export function renderSelectedLogInfo(): void {
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);
    const graphStore = useGraphStore(pinia);
    const flightLog = loadedFlightLog();

    logStore.activeLogIndex = flightLog.getLogIndex();

    if (flightLog.getNumCellsEstimate()) {
        appStore.statusCells = `${flightLog.getNumCellsEstimate()}S (${Number(
            flightLog.getReferenceVoltageMillivolts() / 1000,
        ).toFixed(2)}V)`;
    } else {
        appStore.statusCells = "";
    }

    const sysConfig = flightLog.getSysConfig();

    const versionText =
        (sysConfig["Craft name"]?.length ? `${sysConfig["Craft name"]} : ` : "") +
        (sysConfig["Firmware revision"] == null ? "" : `${sysConfig["Firmware revision"]}`) +
        (sysConfig.deviceUID == null ? "" : ` (${sysConfig.deviceUID})`);
    appStore.statusVersion = versionText;

    const looptimeText = stringLoopTime(
        sysConfig.looptime,
        sysConfig.pid_process_denom,
        sysConfig.unsynced_fast_pwm,
        sysConfig.motor_pwm_rate,
    );
    appStore.statusLooptime = looptimeText;

    // The rate is unknown without a looptime header; the P interval is still worth showing.
    const blackboxRate = flightLog.getBlackboxRate();
    const rateText = blackboxRate === null ? "" : ` (${blackboxRate.toFixed(0)}Hz)`;
    const lograteText =
        sysConfig["frameIntervalPDenom"] != null && sysConfig["frameIntervalPNum"] != null
            ? `Sample Rate : ${sysConfig["frameIntervalPNum"]}/${sysConfig["frameIntervalPDenom"]}${rateText}`
            : "";
    appStore.statusLograte = lograteText;

    if (flightLog.isWrongLogRate()) {
        const actualLogRate = flightLog.getActualLogRate();
        appStore.statusLograteWarning = `Wrong log rate: ${actualLogRate.toFixed(0)}Hz`;
    } else {
        appStore.statusLograteWarning = null;
    }

    const seekBar = mountedSeekBar();
    seekBar.setTimeRange(flightLog.getMinTime(), flightLog.getMaxTime(), logStore.currentBlackboxTime);
    seekBar.setActivityRange(sysConfig.motorOutput[0], sysConfig.motorOutput[1]);

    const activity = flightLog.getActivitySummary();
    seekBar.setActivity(activity.times, activity[graphStore.seekBarMode], activity.hasEvent);
    seekBar.repaint();

    if (flightLog.hasGpsData()) {
        graphStore.mapGrapher?.setFlightLog(flightLog);
    }
    graphStore.flight3d?.setFlightLog(flightLog);
}

export function setSeekBarMode(mode: SeekBarMode): void {
    const logStore = useLogStore(pinia);
    const graphStore = useGraphStore(pinia);

    graphStore.seekBarMode = mode;
    if (logStore.flightLog) {
        const activity = logStore.flightLog.getActivitySummary();
        const seekBar = mountedSeekBar();
        seekBar.setActivity(activity.times, activity[mode], activity.hasEvent);
        seekBar.repaint();
    }
}
