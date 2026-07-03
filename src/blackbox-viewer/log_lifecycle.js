import pinia from "./pinia_instance.js";
import { useLogStore } from "./stores/log.js";
import { useGraphStore } from "./stores/graph.js";
import { useAppStore } from "./stores/app.js";
import { formatTime, stringLoopTime } from "./tools.js";

export function renderLogFileInfo(file) {
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);

    appStore.logFilename = file.name;

    const logCount = logStore.flightLog.getLogCount();
    const entries = [];
    for (let index = 0; index < logCount; index++) {
        const error = logStore.flightLog.getLogError(index);
        let logLabel;
        if (error) {
            logLabel = error;
        } else {
            logLabel = `${formatTime(logStore.flightLog.getMinTime(index) / 1000, false)} - ${formatTime(
                logStore.flightLog.getMaxTime(index) / 1000,
                false,
            )} [${formatTime(
                Math.ceil((logStore.flightLog.getMaxTime(index) - logStore.flightLog.getMinTime(index)) / 1000),
                false,
            )}]`;
        }
        const label = logCount > 1 ? `${index + 1}/${logCount}: ${logLabel}` : logLabel;
        entries.push({ label, value: index, disabled: !!error });
    }
    logStore.logIndexEntries = entries;
    logStore.activeLogIndex = 0;
}

export function renderSelectedLogInfo() {
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);
    const graphStore = useGraphStore(pinia);

    logStore.activeLogIndex = logStore.flightLog.getLogIndex();

    if (logStore.flightLog.getNumCellsEstimate()) {
        appStore.statusCells = `${logStore.flightLog.getNumCellsEstimate()}S (${Number(
            logStore.flightLog.getReferenceVoltageMillivolts() / 1000,
        ).toFixed(2)}V)`;
    } else {
        appStore.statusCells = "";
    }

    const sysConfig = logStore.flightLog.getSysConfig();

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

    const blackboxRate = logStore.flightLog.getBlackboxRate();
    const lograteText =
        sysConfig["frameIntervalPDenom"] != null && sysConfig["frameIntervalPNum"] != null
            ? `Sample Rate : ${sysConfig["frameIntervalPNum"]}/${sysConfig["frameIntervalPDenom"]} (${blackboxRate.toFixed(0)}Hz)`
            : "";
    appStore.statusLograte = lograteText;

    if (logStore.flightLog.isWrongLogRate()) {
        const actualLogRate = logStore.flightLog.getActualLogRate();
        appStore.statusLograteWarning = `Wrong log rate: ${actualLogRate.toFixed(0)}Hz`;
    } else {
        appStore.statusLograteWarning = null;
    }

    const seekBar = graphStore.seekBar;
    seekBar.setTimeRange(
        logStore.flightLog.getMinTime(),
        logStore.flightLog.getMaxTime(),
        logStore.currentBlackboxTime,
    );
    seekBar.setActivityRange(
        logStore.flightLog.getSysConfig().motorOutput[0],
        logStore.flightLog.getSysConfig().motorOutput[1],
    );

    const activity = logStore.flightLog.getActivitySummary();
    seekBar.setActivity(activity.times, activity[graphStore.seekBarMode], activity.hasEvent);
    seekBar.repaint();

    if (logStore.flightLog.hasGpsData()) {
        graphStore.mapGrapher.setFlightLog(logStore.flightLog);
    }
}

export function setSeekBarMode(mode) {
    const logStore = useLogStore(pinia);
    const graphStore = useGraphStore(pinia);

    graphStore.seekBarMode = mode;
    if (logStore.flightLog) {
        const activity = logStore.flightLog.getActivitySummary();
        graphStore.seekBar.setActivity(activity.times, activity[mode], activity.hasEvent);
        graphStore.seekBar.repaint();
    }
}
