import { useAutotuneStore } from "@/stores/autotune";
import FileSystem from "@/js/FileSystem";
import { i18n } from "@/js/localization";
import FC from "@/js/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { findLogBoundaries, parseChirpLog } from "@/js/blackbox/chirp_bbl_parser";
import {
    welchTransferFunction,
    recommendGains,
    computeSensitivity,
    computeStepResponse,
    computeSpectrogram,
} from "@/js/blackbox/spectral_analysis";
import { validateTuningSliders } from "@/composables/useTuningSliders";

const AXIS_NAMES = ["roll", "pitch", "yaw"];

/**
 * Composable providing autotune import and gain-apply logic.
 */
export function useAutotune() {
    const store = useAutotuneStore();

    async function importAndAnalyze() {
        store.analysisState = "importing";
        store.errorMessage = "";
        store.progressMessage = "Selecting file...";

        const file = await pickFileOrSetError(store);
        if (!file) {
            return;
        }

        try {
            store.progressMessage = `Reading ${file.name}...`;
            const blob = await FileSystem.readFileAsBlob(file);
            const data = new Uint8Array(await blob.arrayBuffer());

            store.analysisState = "analyzing";
            store.progressMessage = "Finding log boundaries...";
            const logs = findLogBoundaries(data);
            if (!logs || logs.length === 0) {
                throw new Error("No log segments found in the file.");
            }

            const result = tryParseLogs(data, logs, file.name, store, store.targetPhaseMarginDeg);
            if (!result) {
                throw new Error("No chirp data found in any log segment.");
            }

            store.analysisResult = result;
            store.analysisState = "done";
            store.progressMessage = "";
        } catch (err) {
            store.analysisState = "error";
            store.errorMessage = err.message || "Analysis failed.";
            store.progressMessage = "";
        }
    }

    /**
     * Recompute the gain recommendation against a new phase-margin target.
     *
     * The transfer functions are already in the store, so this is a pure
     * re-derivation — no file access, no re-parse.
     *
     * @param {number} targetPhaseMarginDeg
     */
    function recomputeGains(targetPhaseMarginDeg) {
        const result = store.analysisResult;
        if (!result?.axes) {
            return;
        }
        for (const axis of Object.values(result.axes)) {
            const rec = recommendGains(axis.transferFunction, result.currentSliders, targetPhaseMarginDeg);
            axis.gains = buildGains(rec, axis.sensitivity, axis.stepResponse);
        }
    }

    return { importAndAnalyze, applyGains, recomputeGains };
}

async function pickFileOrSetError(store) {
    try {
        const file = await FileSystem.pickOpenFile(i18n.getMessage("fileSystemPickerFiles", { typeof: "BBL" }), [
            ".bbl",
            ".bfl",
            ".txt",
        ]);
        if (!file) {
            store.analysisState = "idle";
            store.progressMessage = "";
        }
        return file;
    } catch (err) {
        if (err?.name === "AbortError" || err?.message === "cancelled") {
            store.analysisState = "idle";
            store.progressMessage = "";
            return null;
        }
        store.analysisState = "error";
        store.errorMessage = err?.message || "Failed to open file picker.";
        store.progressMessage = "";
        return null;
    }
}

function tryParseLogs(data, logs, filename, store, targetPhaseMarginDeg) {
    let lastError = null;
    for (let idx = 0; idx < logs.length; idx++) {
        store.progressMessage = `Parsing log ${idx + 1} of ${logs.length}...`;
        try {
            const parsed = analyzeLog(data, logs[idx], targetPhaseMarginDeg);
            if (parsed) {
                return { filename, ...parsed };
            }
        } catch (err) {
            lastError = err;
        }
    }
    if (lastError) {
        throw lastError;
    }
    return null;
}

function analyzeLog(data, log, targetPhaseMarginDeg) {
    const { sysConfig, chirpData } = parseChirpLog(data, log.start, log.end);
    if (chirpData.sampleCount === 0 || chirpData.segments.length === 0) {
        return null;
    }

    const sampleRate = computeSampleRate(sysConfig);
    const segmentSize = chooseSegmentSize(sampleRate);
    const currentSliders = extractCurrentSliders(sysConfig);

    const axes = {};
    for (const seg of chirpData.segments) {
        if (!Number.isInteger(seg.axis) || seg.axis < 0 || seg.axis > 2) {
            throw new Error(
                "Log uses unsupported DEBUG_CHIRP axis encoding. " + "Use a log recorded with the companion firmware.",
            );
        }
        const axisResult = computeAxisResult(
            seg,
            chirpData,
            sampleRate,
            segmentSize,
            currentSliders,
            targetPhaseMarginDeg,
        );
        if (axisResult) {
            axes[AXIS_NAMES[seg.axis]] = axisResult;
        }
    }

    if (Object.keys(axes).length === 0) {
        return null;
    }

    return {
        sampleRate: Math.round(sampleRate),
        axes,
        sysConfig,
        // Kept so the gain recommendation can be recomputed against a different
        // phase-margin target without re-importing the log.
        currentSliders,
    };
}

function computeSampleRate(sysConfig) {
    const looptimeUs = sysConfig.looptime || 125;
    const pidDenom = sysConfig.pid_process_denom || 1;
    const bbRate = sysConfig.frameIntervalPDenom || 1;
    return 1e6 / (looptimeUs * pidDenom * bbRate);
}

function chooseSegmentSize(sampleRate) {
    let segmentSize = 256;
    while (segmentSize < sampleRate * 0.5) {
        segmentSize <<= 1;
    }
    return Math.min(segmentSize, 4096);
}

function extractCurrentSliders(sysConfig) {
    return {
        masterMultiplier: (sysConfig.simplified_master_multiplier || 100) / 100,
        piGain: (sysConfig.simplified_pi_gain || 100) / 100,
        iGain: (sysConfig.simplified_i_gain || 100) / 100,
        dGain: (sysConfig.simplified_d_gain || 100) / 100,
        feedforwardGain: (sysConfig.simplified_feedforward_gain || 100) / 100,
        dtermFilterMultiplier: (sysConfig.simplified_dterm_filter_multiplier || 100) / 100,
    };
}

function buildGains(rec, sensitivity, stepResponse) {
    return {
        proposed: rec.proposed,
        bandwidth: rec.analysis.bandwidthHz,
        crossover: rec.analysis.openLoopCrossoverHz,
        phaseMargin: rec.analysis.phaseMarginDeg,
        targetCrossover: rec.analysis.targetCrossoverHz,
        maxPhaseMargin: rec.analysis.maxAchievablePhaseMarginDeg,
        loopDelay: rec.analysis.loopDelayMs,
        resonantPeak: rec.analysis.resonantPeakDb,
        sensitivityPeak: sensitivity.peakDb,
        predictedSensitivityPeak: rec.analysis.predictedSensitivityPeakDb,
        // Which constraint limited the gain, and whether the recommendation
        // could be delivered in full. The interface reports these so a figure it
        // shows is never one the applied gain does not reach.
        sensitivityBinds: rec.analysis.sensitivityBinds,
        sensitivityUnreachable: rec.analysis.sensitivityUnreachable,
        gainClamped: rec.analysis.gainClamped,
        requestedGain: rec.analysis.requestedGain,
        appliedGain: rec.analysis.piScale,
        overshoot: stepResponse.overshootPct,
        riseTime: stepResponse.riseTimeMs,
        settlingTime: stepResponse.settlingTimeMs,
        coherencePct: rec.analysis.meanCoherence * 100,
    };
}

function computeAxisResult(seg, chirpData, sampleRate, segmentSize, currentSliders, targetPhaseMarginDeg) {
    const len = seg.endIdx - seg.startIdx + 1;
    if (len < segmentSize) {
        return null;
    }
    const input = chirpData.setpoint[seg.axis].subarray(seg.startIdx, seg.endIdx + 1);
    const output = chirpData.gyro[seg.axis].subarray(seg.startIdx, seg.endIdx + 1);
    const tf = welchTransferFunction(input, output, sampleRate, segmentSize, 0.5);
    const rec = recommendGains(tf, currentSliders, targetPhaseMarginDeg);
    const sensitivity = computeSensitivity(tf);
    const stepResponse = computeStepResponse(tf, sampleRate, segmentSize);
    const spectrogram = computeSpectrogram(output, sampleRate);
    return {
        transferFunction: tf,
        sensitivity,
        stepResponse,
        spectrogram,
        gains: buildGains(rec, sensitivity, stepResponse),
        sampleCount: len,
    };
}

async function applyGains(proposed) {
    for (const [key, value] of Object.entries(proposed)) {
        if (key in FC.TUNING_SLIDERS) {
            FC.TUNING_SLIDERS[key] = value;
        }
    }

    await MSP.promise(MSPCodes.MSP_SET_SIMPLIFIED_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_SIMPLIFIED_TUNING));
    await validateTuningSliders();
    if (!FC.TUNING_SLIDERS.slider_pids_valid || !FC.TUNING_SLIDERS.slider_dterm_valid) {
        throw new Error("Recommended autotune sliders did not pass firmware validation.");
    }
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
}
