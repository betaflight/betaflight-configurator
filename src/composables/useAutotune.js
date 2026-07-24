import { nextTick } from "vue";
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

const AXIS_NAMES = ["roll", "pitch", "yaw"];

// Both loadProfileData() and applyGainsToProfile() run multi-step
// select-profile/read-or-write/select-back MSP sequences against the FC's single active
// profile slot. MSP.promise() has no built-in mutual exclusion between different message
// codes, so two of these sequences firing concurrently (e.g. the user flips the profile
// dropdown right as they click Apply) can interleave on the wire and land a write on the
// wrong profile. Serialize all of them through this queue so only one runs at a time, in
// call order.
let profileOpQueue = Promise.resolve();

function withProfileLock(store, fn) {
    const run = profileOpQueue.then(async () => {
        store.setProfileOperationInFlight(true);
        try {
            return await fn();
        } finally {
            // The store's FC.CONFIG.profile watcher ignores changes made while this flag
            // is set (they're our own internal switches, not an external profile change).
            // Wait a tick so that watcher has run against our final internal switch before
            // we release the flag, otherwise it fires after release and wrongly treats our
            // own "restore to original profile" step as external, wiping the cache we just
            // populated.
            await nextTick();
            store.setProfileOperationInFlight(false);
        }
    });
    // Keep the queue moving even if this operation throws, so one failure doesn't wedge
    // every later caller.
    profileOpQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

/**
 * Composable providing autotune import, per-axis PID calculation, profile
 * comparison, and apply-to-profile logic.
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

            const result = tryParseLogs(data, logs, file.name, store);
            if (!result) {
                throw new Error("No chirp data found in any log segment.");
            }

            store.analysisResult = result;
            store.comparisonProfile = "logged";
            store.clearProfileCache();
            store.analysisState = "done";
            store.progressMessage = "";
        } catch (err) {
            store.analysisState = "error";
            store.errorMessage = err.message || "Analysis failed.";
            store.progressMessage = "";
        }
    }

    function getProfileOptions() {
        const count = FC.CONFIG?.numProfiles ?? 3;
        const items = [];
        for (let i = 0; i < count; i++) {
            const name = FC.CONFIG?.pidProfileNames?.[i]?.trim();
            const label = name ? `Profile ${i + 1}: ${name}` : `Profile ${i + 1}`;
            items.push({ value: i, label });
        }
        return items;
    }

    async function loadComparisonProfile(profile) {
        if (profile === "logged" || profile == null) {
            return getLoggedProfileData();
        }

        const index = Number(profile);
        const numProfiles = FC.CONFIG?.numProfiles ?? 3;
        if (Number.isNaN(index) || index < 0 || index >= numProfiles) {
            throw new Error("Invalid profile selection.");
        }

        if (store.profileCache[index]) {
            return store.profileCache[index];
        }

        const data = await withProfileLock(store, () => loadProfileData(index));
        store.cacheProfile(index, data);
        return data;
    }

    /**
     * Apply per-axis proposed PID numbers and the lowest D-term filter floor
     * to the selected PID profile.
     */
    async function applyGains(profileIndex, analysisResult) {
        if (profileIndex === "logged" || profileIndex == null) {
            throw new Error("Cannot apply to the logged profile. Select a PID profile.");
        }

        const target = Number(profileIndex);
        const numProfiles = FC.CONFIG?.numProfiles ?? 3;
        if (Number.isNaN(target) || target < 0 || target >= numProfiles) {
            throw new Error("Invalid profile selection.");
        }

        const axes = analysisResult?.axes;
        const globalDtermMultiplier = analysisResult?.globalDtermMultiplier;
        if (!axes || globalDtermMultiplier == null) {
            throw new Error("No analysis result available.");
        }

        const updated = await withProfileLock(store, () => applyGainsToProfile(target, axes, globalDtermMultiplier));
        store.cacheProfile(target, updated);
    }

    return { importAndAnalyze, applyGains, getProfileOptions, loadComparisonProfile };
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

function tryParseLogs(data, logs, filename, store) {
    let lastError = null;
    for (let idx = 0; idx < logs.length; idx++) {
        store.progressMessage = `Parsing log ${idx + 1} of ${logs.length}...`;
        try {
            const parsed = analyzeLog(data, logs[idx]);
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

function analyzeLog(data, log) {
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
        const axisResult = computeAxisResult(seg, chirpData, sampleRate, segmentSize, currentSliders);
        if (axisResult) {
            axes[AXIS_NAMES[seg.axis]] = axisResult;
        }
    }

    if (Object.keys(axes).length === 0) {
        return null;
    }

    const dtermMultipliers = Object.values(axes)
        .map((a) => a.gains.proposedDtermMultiplier)
        .filter((v) => v != null);
    const globalDtermMultiplier = dtermMultipliers.length > 0 ? Math.min(...dtermMultipliers) : null;
    for (const axis of Object.values(axes)) {
        axis.gains.globalDtermMultiplier = globalDtermMultiplier;
    }

    return {
        sampleRate: Math.round(sampleRate),
        axes,
        globalDtermMultiplier,
        sysConfig,
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
        rollPitchRatio: (sysConfig.simplified_roll_pitch_ratio || 100) / 100,
        pitchPIGain: (sysConfig.simplified_pitch_pi_gain || 100) / 100,
        dMaxGain: (sysConfig.simplified_d_max_gain || 100) / 100,
    };
}

function computeAxisResult(seg, chirpData, sampleRate, segmentSize, currentSliders) {
    const len = seg.endIdx - seg.startIdx + 1;
    if (len < segmentSize) {
        return null;
    }
    const input = chirpData.setpoint[seg.axis].subarray(seg.startIdx, seg.endIdx + 1);
    const output = chirpData.gyro[seg.axis].subarray(seg.startIdx, seg.endIdx + 1);
    const tf = welchTransferFunction(input, output, sampleRate, segmentSize, 0.5);
    const rec = recommendGains(tf, currentSliders, seg.axis);
    const sensitivity = computeSensitivity(tf);
    const stepResponse = computeStepResponse(tf, sampleRate, segmentSize);
    const spectrogram = computeSpectrogram(output, sampleRate);
    return {
        transferFunction: tf,
        sensitivity,
        stepResponse,
        spectrogram,
        gains: {
            proposedNumbers: rec.proposedNumbers,
            proposedDtermMultiplier: rec.proposedDtermMultiplier,
            globalDtermMultiplier: null,
            bandwidth: rec.analysis.bandwidthHz,
            phaseMargin: rec.analysis.phaseMarginDeg,
            resonantPeak: rec.analysis.resonantPeakDb,
            sensitivityPeak: sensitivity.peakDb,
            overshoot: stepResponse.overshootPct,
            riseTime: stepResponse.riseTimeMs,
            settlingTime: stepResponse.settlingTimeMs,
            coherencePct: rec.analysis.meanCoherence * 100,
        },
        sampleCount: len,
    };
}

function getLoggedProfileData() {
    const store = useAutotuneStore();
    const sc = store.analysisResult?.sysConfig;
    if (!sc) {
        return null;
    }
    return {
        profileIndex: "logged",
        pids: [
            { P: sc.rollPID?.[0] ?? 0, I: sc.rollPID?.[1] ?? 0, D: sc.rollPID?.[2] ?? 0 },
            { P: sc.pitchPID?.[0] ?? 0, I: sc.pitchPID?.[1] ?? 0, D: sc.pitchPID?.[2] ?? 0 },
            { P: sc.yawPID?.[0] ?? 0, I: sc.yawPID?.[1] ?? 0, D: sc.yawPID?.[2] ?? 0 },
        ],
        advanced: {
            feedforwardRoll: null,
            feedforwardPitch: null,
            feedforwardYaw: null,
            dMaxRoll: null,
            dMaxPitch: null,
            dMaxYaw: null,
        },
        dtermFilterMultiplier: sc.simplified_dterm_filter_multiplier ?? 100,
        dtermFilterEnabled: true,
    };
}

async function selectProfile(index) {
    await MSP.promise(MSPCodes.MSP_SELECT_SETTING, [index]);
    FC.CONFIG.profile = index;
}

async function readCurrentProfileData() {
    await MSP.promise(MSPCodes.MSP_PID);
    await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
    await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
    await MSP.promise(MSPCodes.MSP_SIMPLIFIED_TUNING);
}

function captureProfileData(index) {
    return {
        profileIndex: index,
        pids: [0, 1, 2].map((axis) => ({
            P: FC.PIDS[axis][0],
            I: FC.PIDS[axis][1],
            D: FC.PIDS[axis][2],
        })),
        advanced: {
            feedforwardRoll: FC.ADVANCED_TUNING.feedforwardRoll,
            feedforwardPitch: FC.ADVANCED_TUNING.feedforwardPitch,
            feedforwardYaw: FC.ADVANCED_TUNING.feedforwardYaw,
            dMaxRoll: FC.ADVANCED_TUNING.dMaxRoll,
            dMaxPitch: FC.ADVANCED_TUNING.dMaxPitch,
            dMaxYaw: FC.ADVANCED_TUNING.dMaxYaw,
        },
        dtermFilterMultiplier: FC.TUNING_SLIDERS.slider_dterm_filter_multiplier,
        dtermFilterEnabled: !!FC.TUNING_SLIDERS.slider_dterm_filter,
    };
}

/**
 * Runs the actual MSP sequence for writing proposed per-axis PIDs to `target` and
 * restoring the FC to whatever profile was active beforehand. Must only be called from
 * inside withProfileLock() — it is not safe to run concurrently with itself or with
 * loadProfileData().
 */
async function applyGainsToProfile(target, axes, globalDtermMultiplier) {
    const originalProfile = FC.CONFIG.profile;

    // Matches the arming-safety guard every other EEPROM-persisting save flow in this app
    // uses (useReboot.js saveToEeprom(), MSPHelper.writeConfiguration()) before writing
    // MSP_SET_PID/MSP_SET_PID_ADVANCED/MSP_SET_SIMPLIFIED_TUNING + MSP_EEPROM_WRITE. It
    // matters even more here: unlike those flows, this one also parks the FC on a
    // non-active profile via MSP_SELECT_SETTING (a live switch, not just a staged config
    // value) for the whole sequence, so an arm event mid-sequence would fly on a
    // half-written, non-intended profile.
    if (!FC.CONFIG.armingDisabled) {
        mspHelper.setArmingEnabled(false, false);
    }

    try {
        await selectProfile(target);

        // Read target profile into FC state so we can patch it cleanly.
        await readCurrentProfileData();

        // Patch per-axis PIDs.
        for (let axis = 0; axis < 3; axis++) {
            const nums = axes[AXIS_NAMES[axis]]?.gains?.proposedNumbers;
            if (!nums) {
                continue;
            }
            FC.PIDS[axis][0] = nums.P;
            FC.PIDS[axis][1] = nums.I;
            FC.PIDS[axis][2] = nums.D;
        }
        await MSP.promise(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID));

        // Patch feedforward / D-max.
        FC.ADVANCED_TUNING.feedforwardRoll = axes.roll?.gains?.proposedNumbers?.F ?? FC.ADVANCED_TUNING.feedforwardRoll;
        FC.ADVANCED_TUNING.feedforwardPitch =
            axes.pitch?.gains?.proposedNumbers?.F ?? FC.ADVANCED_TUNING.feedforwardPitch;
        FC.ADVANCED_TUNING.feedforwardYaw = axes.yaw?.gains?.proposedNumbers?.F ?? FC.ADVANCED_TUNING.feedforwardYaw;
        FC.ADVANCED_TUNING.dMaxRoll = axes.roll?.gains?.proposedNumbers?.dMax ?? FC.ADVANCED_TUNING.dMaxRoll;
        FC.ADVANCED_TUNING.dMaxPitch = axes.pitch?.gains?.proposedNumbers?.dMax ?? FC.ADVANCED_TUNING.dMaxPitch;
        FC.ADVANCED_TUNING.dMaxYaw = axes.yaw?.gains?.proposedNumbers?.dMax ?? FC.ADVANCED_TUNING.dMaxYaw;
        await MSP.promise(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED));

        // Disable simplified PID sliders because the PIDs no longer match them,
        // but keep the D-term slider enabled with the lowest floor.
        FC.TUNING_SLIDERS.slider_pids_mode = 0;
        FC.TUNING_SLIDERS.slider_dterm_filter = 1;
        FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = globalDtermMultiplier;
        await MSP.promise(MSPCodes.MSP_SET_SIMPLIFIED_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_SIMPLIFIED_TUNING));

        // Restore original profile before EEPROM write so the user stays on it.
        await selectProfile(originalProfile);
        await readCurrentProfileData();

        await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    } catch (err) {
        // Best-effort restore of original profile on any error.
        await selectProfile(originalProfile).catch(() => {});
        await readCurrentProfileData().catch(() => {});
        throw err;
    }

    // Refresh cached profile data for the target so the UI shows the new values.
    // loadProfileData() switches to `target`, reads it, then restores + re-reads
    // `originalProfile` itself, so no further profile switch is needed after this.
    return loadProfileData(target);
}

async function loadProfileData(index) {
    const originalProfile = FC.CONFIG.profile;

    await selectProfile(index);
    await readCurrentProfileData();
    const data = captureProfileData(index);

    await selectProfile(originalProfile);
    await readCurrentProfileData();

    return data;
}
