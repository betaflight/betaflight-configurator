/**
 * useMagCharacterization — Composable for the supported-pose alignment wizard.
 *
 * Extracts all non-UI state and logic from MagCharacterizationWizard.vue:
 * state machine, stability detection, spacebar gating, capture, solver,
 * and JSON export.  The dialog component keeps only the template, 3D model
 * rendering, and dialog lifecycle.
 */
import { ref, computed } from "vue";
import { computeDeclination, getGeoReference } from "./useMagCalibration.js";
import { fitEllipsoid } from "../js/utils/ellipsoidFit.js";
import {
    computeReplayData as _computeReplayData,
    computeCalFromEllipsoid as _computeCalFromEllipsoid,
    selectAlignmentPackage,
    currentMatrixOf,
    proposedMatrixOf,
    headingError,
} from "../js/utils/magCharacterizationCompute.js";
import { buildCharacterizationModel } from "../js/utils/magModelExport.js";
import { fitSphere, computeDirectionalCoverage } from "../js/utils/sphereFit.js";
import { mat3mulVec, mat3mul, mat3transpose, ALIGNMENT_MATRICES } from "../js/utils/magAlignment.js";
import { useFlightControllerStore } from "../stores/fc";

// ── Constants ──────────────────────────────────────────────────────────────

const CAPTURE_DURATION_MS = 2000;
const POLL_MS = 80;
const STABILITY_THRESHOLD_DEG_S = 3;
const STABILITY_FRAMES = 10;
const CONFIRMED_DELAY_MS = 750;
const MOVEMENT_THRESHOLD_DEG_S = 10;

// Tumble guidance i18n keys — shared with the dialog (single list).
export const CAL_PROMPTS = [
    "magCalibrationPrompt1",
    "magCalibrationPrompt2",
    "magCalibrationPrompt3",
    "magCalibrationPrompt4",
    "magCalibrationPrompt5",
    "magCalibrationPrompt6",
    // Gap-filling step: each yaw spin paints a constant-latitude BAND of
    // field directions around its spin axis; six bands always leave gaps
    // near their poles. Slow full rotations about the two horizontal body
    // axes (barrel roll, front-flip) trace great circles through those
    // gaps and deterministically complete the 20-region coverage.
    "magCalibrationPrompt7Fill",
];

// ── Pose definitions (shared between composable and dialog for 3D model) ───

// Shared pose templates (reused across all 4 cardinal directions)
const _POSE_FLAT = (line) => ({
    label: "Flat",
    instruction: `Rest the drone LEVEL on the paper. Nose pointing along the ${line} line.`,
    rotX: 0,
    rotZ: 0,
    isFlat: true,
});
const _POSE_NOSE_UP = (line) => ({
    label: "Nose Up (box under nose)",
    instruction: `Place box under FRONT arms. Nose tilts UP. Keep nose on the ${line} line.`,
    rotX: 35,
    rotZ: 0,
});
const _POSE_NOSE_DOWN = (line) => ({
    label: "Nose Down (box under tail)",
    instruction: `Place box under REAR arms. Nose tilts DOWN. Keep nose on the ${line} line.`,
    rotX: -35,
    rotZ: 0,
});
const _POSE_LEFT_REST = (_line) => ({
    label: "Box under left (Roll right)",
    instruction: "Place box under LEFT side. Drone rolls RIGHT.",
    rotX: 0,
    rotZ: -25,
});
const _POSE_RIGHT_REST = (_line) => ({
    label: "Box under right (Roll left)",
    instruction: "Place box under RIGHT side. Drone rolls LEFT.",
    rotX: 0,
    rotZ: 25,
});

function _makeDirection(label, alignHint, heading, line) {
    return {
        label,
        alignHint,
        heading,
        poses: [
            _POSE_FLAT(line),
            _POSE_NOSE_UP(line),
            _POSE_NOSE_DOWN(line),
            _POSE_LEFT_REST(line),
            _POSE_RIGHT_REST(line),
        ],
    };
}

const directions = [
    _makeDirection("North (nose to N line)", "Align drone nose with the N-S line, nose toward N.", 0, "N"),
    _makeDirection("East (nose to E line)", "Align drone nose with the E-W line, nose toward E.", Math.PI / 2, "E"),
    _makeDirection("South (nose to S line)", "Align drone nose with the N-S line, nose toward S.", Math.PI, "S"),
    _makeDirection("West (nose to W line)", "Align drone nose with the E-W line, nose toward W.", -Math.PI / 2, "W"),
];

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

// ── Composable ─────────────────────────────────────────────────────────────

export function useMagCharacterization() {
    const fcStore = useFlightControllerStore();

    // --- Reactive state ---
    const phase = ref("intro"); // "intro" | "calibrate" | "await" | "capturing" | "confirmed" | "complete" | "replay"
    const currentDirectionIndex = ref(0);
    const currentSubPoseIndex = ref(0);
    const isStable = ref(false);
    const lastRoll = ref(0);
    const lastPitch = ref(0);
    const lastMag = ref([0, 0, 0]);
    const lastFieldStrength = ref(0);
    const gyroRms = ref(0);
    const captureSamples = ref(0);
    const poseNeedsRetry = ref(false); // set true when movement auto-aborts capture, cleared on next capture/advance
    const captureData = ref([]);
    const solverResult = ref(null);
    const replayData = ref([]); // [{ dirLabel, poseLabel, expectedHeading, roll, pitch, currentHeading, currentMag, newHeading, newMag }]
    const calibrationOffsets = ref(null); // { x, y, z } or null if not available
    const geoReference = ref(null); // { declination, inclination, fieldStrength } or null
    const detailedReport = ref(""); // LLM-ready text report, populated by generateDetailedReport()
    const ellipsoidDiag = ref(null); // { conditionNumber, chirality, offDiagonalRms, ... } from fitEllipsoid
    const ellipsoidParams = ref(null); // { center: {x,y,z}, W_inv: number[3][3], radius: number, residual: number }
    const calibrationSamples = ref([]); // [{ x, y, z, pitch, heading, timestamp }] for calibration tumble
    const calibrationSampleCount = computed(() => calibrationSamples.value.length);
    const calCurrentPrompt = ref(0); // index into the CAL_PROMPTS guidance steps
    let _calPromptTimer = null;
    const CAL_PROMPT_INTERVAL_MS = 10000;
    // Running sphere fit during the tumble — gives the live center estimate
    // that coverage classification and the 3D view need (the hard-iron bias
    // offsets the cloud by up to ~40% of its radius on real hardware).
    // Refit every CAL_REFIT_INTERVAL new samples to stay cheap.
    const CAL_REFIT_MIN_SAMPLES = 40;
    const CAL_REFIT_INTERVAL = 25;
    const calibrationSphereFit = ref(null);
    let _calLastFitCount = 0;

    function updateCalibrationSphereFit() {
        const pts = calibrationSamples.value;
        if (pts.length < CAL_REFIT_MIN_SAMPLES) return;
        if (pts.length - _calLastFitCount < CAL_REFIT_INTERVAL && calibrationSphereFit.value) return;
        const fit = fitSphere(pts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
        if (fit) {
            calibrationSphereFit.value = fit;
            _calLastFitCount = pts.length;
        }
    }

    // Directional coverage: fraction of the 20 icosahedron-face directions
    // (seen from the running center) that have been sampled. Presence-based,
    // so it only ever grows for a stable center — unlike the old min/max
    // dwell-ratio metric, which DROPPED when the user lingered in any
    // orientation and plateaued long before the sphere was painted.
    const calibrationCoverage = computed(() => {
        const pts = calibrationSamples.value;
        if (pts.length < 4) return null;
        const center = calibrationSphereFit.value?.center ?? { x: 0, y: 0, z: 0 };
        return computeDirectionalCoverage(
            pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            center,
        );
    });
    const isFetchingGeo = ref(false);

    // --- Computed ---
    const currentDirection = computed(() => directions[currentDirectionIndex.value] || null);
    const currentPoseDef = computed(() => {
        const dir = currentDirection.value;
        return dir ? dir.poses[currentSubPoseIndex.value] : null;
    });
    const completedPoseCount = computed(() => {
        let c = 0;
        captureData.value.forEach((dc) => {
            if (dc) {
                dc.forEach((p) => {
                    if (p) {
                        c++;
                    }
                });
            }
        });
        return c;
    });

    // --- Internal mutable state (non-reactive) ---
    let sampleTimer = null;
    let gyroWindow = [];
    let stableCount = 0;
    let currentMatForCalibration = null;
    // R_proposed · R_captureᵀ — maps capture-frame vectors into the proposed
    // alignment frame. Identity until the solver has run.
    let newCombinedForCalibration = null;
    // Alignment configuration active on the FC while samples were captured —
    // recorded at solve time for export provenance (schema 2.1 captured_under).
    let capturedUnderInfo = null;
    // mag_calibration values active on the FC during capture (read via MSP CLI
    // before the tumble; null when unknown → assumed zero).
    const magZeroAtCapture = ref(null);
    // Held-out validation of the tumble-derived offsets against the pose data:
    // { proposedMeanErr, fullCorrectedMeanErr, recommended } or null.
    const calibrationValidation = ref(null);
    // True when the active solverResult was solved on center-subtracted data
    // (correct-then-solve): the Proposed column then represents the firmware
    // package alignment + mag_calibration, not alignment alone.
    const proposedIncludesCenter = ref(false);
    let _movementFrames = 0;

    // Shared helper — iterate every captured sample with body-frame mag pre-computed
    function forEachSample(cb) {
        const mat = currentMatForCalibration || ALIGNMENT_MATRICES[1];
        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples) {
                    continue;
                }
                for (const s of cap.samples) {
                    const body = mat3mulVec(mat, s.mag);
                    cb({ body, sample: s, headingRef: cap.headingRef || 0, dirIdx: di, poseIdx: pi });
                }
            }
        }
    }

    // --- Callbacks provided by the dialog (for 3D model updates) ---
    let onWizardStarted = null; // called after state is initialised — dialog hooks up 3D model
    let onPoseAdvanced = null; // called after advancing to a new pose — dialog updates 3D target
    let onSolverAboutToRun = null; // called before solver — dialog disposes 3D model

    function setCallbacks(callbacks) {
        if (callbacks.onWizardStarted) {
            onWizardStarted = callbacks.onWizardStarted;
        }
        if (callbacks.onPoseAdvanced) {
            onPoseAdvanced = callbacks.onPoseAdvanced;
        }
        if (callbacks.onSolverAboutToRun) {
            onSolverAboutToRun = callbacks.onSolverAboutToRun;
        }
    }

    // --- Stability monitoring ---
    function tick() {
        if (phase.value !== "await") {
            return;
        }

        const gx = fcStore.sensorData.gyroscope[0];
        const gy = fcStore.sensorData.gyroscope[1];
        const gz = fcStore.sensorData.gyroscope[2];
        const roll = fcStore.sensorData.kinematics[0];
        const pitch = fcStore.sensorData.kinematics[1];
        const mx = fcStore.sensorData.magnetometer[0];
        const my = fcStore.sensorData.magnetometer[1];
        const mz = fcStore.sensorData.magnetometer[2];

        lastRoll.value = roll;
        lastPitch.value = pitch;
        lastMag.value = [mx, my, mz];
        lastFieldStrength.value = Math.round(Math.hypot(mx, my, mz));

        const gyroMag = Math.hypot(gx, gy, gz);
        gyroWindow.push(gyroMag);
        if (gyroWindow.length > 6) {
            gyroWindow.shift();
        }
        if (gyroWindow.length > 0) {
            gyroRms.value = Math.sqrt(gyroWindow.reduce((s, v) => s + v * v, 0) / gyroWindow.length);
        }

        stableCount = gyroRms.value < STABILITY_THRESHOLD_DEG_S ? stableCount + 1 : 0;
        isStable.value = stableCount >= STABILITY_FRAMES;

        if (phase.value === "await") {
            sampleTimer = setTimeout(tick, POLL_MS);
        }
    }

    // --- Spacebar handler ---
    function onKeyDown(e) {
        if (e.code === "Space" && phase.value === "await" && isStable.value) {
            e.preventDefault();
            startCapture();
        }
    }

    // --- Phase transitions ---
    function startWizard() {
        currentDirectionIndex.value = 0;
        currentSubPoseIndex.value = 0;
        captureData.value = directions.map(() => []);
        solverResult.value = null;
        replayData.value = [];
        calibrationOffsets.value = null;
        calibrationValidation.value = null;
        proposedIncludesCenter.value = false;
        ellipsoidDiag.value = null;
        // WARNING: This reset clears the ellipsoid correction from any prior
        // calibration tumble or debug JSON import. Callers restoring calibration
        // state (debug loader, completeCalibrationPhase) must save + restore
        // ellipsoidParams around this call.
        ellipsoidParams.value = null;
        calibrationSamples.value = [];
        calibrationSphereFit.value = null;
        _calLastFitCount = 0;
        gyroWindow = [];
        stableCount = 0;
        isStable.value = false;
        phase.value = "await";

        // Wait for Vue to re-render the wizard body (v-if canvas → DOM) before initializing 3D
        if (onWizardStarted) {
            setTimeout(() => {
                onWizardStarted();
            }, 0);
        }
        tick();
    }

    function startCalibrationPhase() {
        calibrationSamples.value = [];
        ellipsoidParams.value = null;
        calibrationSphereFit.value = null;
        _calLastFitCount = 0;
        calCurrentPrompt.value = 0;
        if (_calPromptTimer) clearInterval(_calPromptTimer);
        _calPromptTimer = setInterval(() => {
            if (calCurrentPrompt.value < CAL_PROMPTS.length - 1) {
                calCurrentPrompt.value++;
            }
        }, CAL_PROMPT_INTERVAL_MS);
        phase.value = "calibrate";
        sampleTimer = setTimeout(calibrationTick, POLL_MS);
    }

    function completeCalibrationPhase() {
        cleanupTimer();
        if (_calPromptTimer) {
            clearInterval(_calPromptTimer);
            _calPromptTimer = null;
        }
        if (calibrationSamples.value.length >= 9) {
            const points = calibrationSamples.value.map((s) => ({ x: s.x, y: s.y, z: s.z }));
            ellipsoidParams.value = fitEllipsoid(points);
        }
        const savedEp = ellipsoidParams.value;
        startWizard();
        ellipsoidParams.value = savedEp;
    }

    function skipCalibration() {
        cleanupTimer();
        if (_calPromptTimer) {
            clearInterval(_calPromptTimer);
            _calPromptTimer = null;
        }
        ellipsoidParams.value = null;
        startWizard();
    }

    function calibrationTick() {
        if (phase.value !== "calibrate") {
            return;
        }

        const mx = fcStore.sensorData.magnetometer[0];
        const my = fcStore.sensorData.magnetometer[1];
        const mz = fcStore.sensorData.magnetometer[2];
        const roll = fcStore.sensorData.kinematics[0] || 0;
        const pitch = fcStore.sensorData.kinematics[1] || 0;
        const heading = fcStore.sensorData.kinematics[2] || 0;
        const quat = fcStore.sensorData.quaternion;

        if (mx !== undefined && my !== undefined && mz !== undefined) {
            const lastSample = calibrationSamples.value[calibrationSamples.value.length - 1];
            if (!lastSample || lastSample.x !== mx || lastSample.y !== my || lastSample.z !== mz) {
                calibrationSamples.value.push({
                    x: mx,
                    y: my,
                    z: mz,
                    roll: Math.round(roll * 10) / 10,
                    pitch: Math.round(pitch * 10) / 10,
                    heading: Math.round(heading * 10) / 10,
                    timestamp: Date.now(),
                    qw: quat?.w,
                    qx: quat?.x,
                    qy: quat?.y,
                    qz: quat?.z,
                });
                updateCalibrationSphereFit();
            }
        }

        lastMag.value = [mx, my, mz];
        lastFieldStrength.value = Math.round(Math.hypot(mx, my, mz));

        sampleTimer = setTimeout(calibrationTick, POLL_MS);
    }

    function startCapture() {
        cleanupTimer();
        phase.value = "capturing";
        captureSamples.value = 0;
        _movementFrames = 0;
        poseNeedsRetry.value = false;

        const poseSamples = [];
        const dirIdx = currentDirectionIndex.value;
        const poseIdx = currentSubPoseIndex.value;
        const headingRefDeg = directions[dirIdx].heading * (180 / Math.PI);
        const captureStart = Date.now();

        function captureTick() {
            if (phase.value !== "capturing") {
                return;
            }
            const mx = fcStore.sensorData.magnetometer[0];
            const my = fcStore.sensorData.magnetometer[1];
            const mz = fcStore.sensorData.magnetometer[2];
            const roll = fcStore.sensorData.kinematics[0];
            const pitch = fcStore.sensorData.kinematics[1];
            const gx = fcStore.sensorData.gyroscope[0];
            const gy = fcStore.sensorData.gyroscope[1];
            const gz = fcStore.sensorData.gyroscope[2];
            const gyroMag = Math.hypot(gx, gy, gz);
            const quat = fcStore.sensorData.quaternion;

            if (gyroMag > MOVEMENT_THRESHOLD_DEG_S) {
                _movementFrames++;
                if (_movementFrames >= 2) {
                    if (sampleTimer !== null) {
                        clearTimeout(sampleTimer);
                        sampleTimer = null;
                    }
                    poseNeedsRetry.value = true;
                    phase.value = "await";
                    tick();
                    return;
                }
            } else {
                _movementFrames = 0;
            }

            const elapsed = (Date.now() - captureStart) / 1000;
            poseSamples.push({
                mag: [mx, my, mz],
                roll,
                pitch,
                headingRef: headingRefDeg,
                gyro: [gx, gy, gz],
                gyroRms: gyroMag,
                fieldStrength: Math.round(Math.hypot(mx, my, mz)),
                t: elapsed,
                qw: quat?.w,
                qx: quat?.x,
                qy: quat?.y,
                qz: quat?.z,
            });
            captureSamples.value = poseSamples.length;

            if (elapsed * 1000 >= CAPTURE_DURATION_MS) {
                if (sampleTimer !== null) {
                    clearTimeout(sampleTimer);
                    sampleTimer = null;
                }
                if (!captureData.value[dirIdx]) {
                    captureData.value[dirIdx] = [];
                }
                captureData.value[dirIdx][poseIdx] = { headingRef: headingRefDeg, samples: poseSamples };
                phase.value = "confirmed";
                setTimeout(() => {
                    if (phase.value === "confirmed") {
                        advancePose();
                    }
                }, CONFIRMED_DELAY_MS);
                return;
            }
            sampleTimer = setTimeout(captureTick, POLL_MS);
        }
        captureTick();
    }

    function skipPose() {
        if (phase.value !== "await") {
            return;
        }
        poseNeedsRetry.value = false;
        if (!captureData.value[currentDirectionIndex.value]) {
            captureData.value[currentDirectionIndex.value] = [];
        }
        captureData.value[currentDirectionIndex.value][currentSubPoseIndex.value] = null;
        advancePose();
    }

    function retryPose() {
        if (phase.value === "capturing") {
            cleanupTimer();
            phase.value = "await";
            tick();
            return;
        }
        if (phase.value !== "await") {
            return;
        }
        poseNeedsRetry.value = false;
        gyroWindow = [];
        stableCount = 0;
        isStable.value = false;
    }

    function advancePose() {
        const dir = directions[currentDirectionIndex.value];
        if (currentSubPoseIndex.value + 1 < dir.poses.length) {
            currentSubPoseIndex.value++;
        } else {
            currentSubPoseIndex.value = 0;
            if (currentDirectionIndex.value + 1 < directions.length) {
                currentDirectionIndex.value++;
            } else {
                runSolver();
                return;
            }
        }
        gyroWindow = [];
        stableCount = 0;
        isStable.value = false;
        if (onPoseAdvanced) {
            onPoseAdvanced();
        }
        phase.value = "await";
        tick();
    }

    function runSolver(currentAlignOverride, customAnglesOverride, _ellipsoidUnused, skipHardIron) {
        if (onSolverAboutToRun) {
            onSolverAboutToRun();
        }

        const allSamples = [];
        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (cap && cap.samples) {
                    for (const s of cap.samples) {
                        allSamples.push({
                            mag: s.mag,
                            roll: s.roll,
                            pitch: s.pitch,
                            headingRef: s.headingRef,
                            // Per-pose key so the M-estimator caps each
                            // direction×attitude pose independently
                            poseKey: `${di}:${pi}`,
                        });
                    }
                }
            }
        }

        if (allSamples.length < 30) {
            solverResult.value = { error: "Not enough data — need at least 30 samples across all poses." };
            return;
        }

        const currentAlign =
            currentAlignOverride != null ? currentAlignOverride : fcStore.sensorAlignment.align_mag || 0;
        const customAngles =
            currentAlignOverride != null
                ? customAnglesOverride || null
                : currentAlign === 9
                    ? {
                        roll: fcStore.sensorAlignment.mag_align_roll || 0,
                        pitch: fcStore.sensorAlignment.mag_align_pitch || 0,
                        yaw: fcStore.sensorAlignment.mag_align_yaw || 0,
                    }
                    : null;

        // Build the current alignment matrix (handling CUSTOM align=9 properly)
        currentMatForCalibration = currentMatrixOf(currentAlign, customAngles) || ALIGNMENT_MATRICES[1];

        // Correct-then-solve dual solve + package selection — see
        // selectAlignmentPackage() in magCharacterizationCompute.js (single
        // implementation shared with the offline tools and the test suite).
        const { result, usedCalibratedPackage, validation } = selectAlignmentPackage({
            samples: allSamples,
            captureData: captureData.value,
            directions,
            currentAlignment: currentAlign,
            customAngles,
            currentMat: currentMatForCalibration,
            ellipsoidParams: ellipsoidParams.value,
        });

        solverResult.value = result;
        proposedIncludesCenter.value = usedCalibratedPackage;
        if (validation) {
            console.log(
                `=== PACKAGE SELECTION === calibrated ${validation.fullCorrectedMeanErr.toFixed(1)}° vs ` +
                    `alignment-only ${validation.proposedMeanErr.toFixed(1)}° → ${
                        usedCalibratedPackage ? "CALIBRATED PACKAGE" : "ALIGNMENT-ONLY (bias deferred)"
                    }`,
            );
        }
        console.log("=== MAG CHARACTERIZATION RESULT ===", result);

        // newCombined = R_proposed · R_captureᵀ — used to express capture-frame
        // quantities (ellipsoid center) in the frame of the alignment that will
        // be applied (compass.c subtracts mag_calibration AFTER alignment).
        const proposedMat = proposedMatrixOf(result, currentMatForCalibration);
        newCombinedForCalibration = mat3mul(proposedMat, mat3transpose(currentMatForCalibration));

        // Record capture provenance for the model export (schema 2.1)
        capturedUnderInfo = {
            alignment: currentAlign,
            custom_angles: currentAlign === 9 && customAngles ? { ...customAngles } : null,
            mag_zero: magZeroAtCapture.value ? { ...magZeroAtCapture.value } : { x: 0, y: 0, z: 0 },
        };

        // Pre-compute replay data for all captured poses
        computeReplayData(result, currentAlign);

        // Run ellipsoid fitter for hardware diagnostics
        runEllipsoidDiagnostics(currentAlign);

        // Hard-iron offsets — ONLY from the ellipsoid (the WMM regression
        // fallback was removed: its frame semantics were broken and it
        // produced dangerous proposals on tumble-less runs).
        if (!skipHardIron) {
            calibrationOffsets.value = null;
            // Geo reference from the cached WMM lookup (set by SensorsTab on
            // connect or explicit refresh) — used for declination display/CLI.
            geoReference.value = getGeoReference() || null;
            if (ellipsoidParams.value) {
                computeCalFromEllipsoid();
            }
        }

        // Validation verdict from the package selection. recommended === true
        // means the calibrated package won and the offsets will be applied.
        calibrationValidation.value = validation;
        if (validation && !usedCalibratedPackage) {
            console.warn(
                "Static bias offsets withheld: calibrated package " +
                    `${validation.fullCorrectedMeanErr.toFixed(1)}° vs ` +
                    `${validation.proposedMeanErr.toFixed(1)}° alignment-only on the poses. ` +
                    "World-frame interference at the bench (it does not rotate with the drone) " +
                    "contaminated the tumble's bias estimate. Alignment is still applied; bias " +
                    "estimation is deferred to per-flight self-calibration in the log viewer.",
            );
        }

        phase.value = "replay";
    }

    function computeCalFromEllipsoid() {
        const cal = _computeCalFromEllipsoid(ellipsoidParams.value, newCombinedForCalibration, magZeroAtCapture.value);
        if (cal) calibrationOffsets.value = cal;
    }

    function computeReplayData(result, currentAlignment) {
        replayData.value = _computeReplayData(result, currentAlignment, captureData.value, directions, {
            ellipsoidParams: ellipsoidParams.value,
            calibrationOffsets: calibrationOffsets.value,
            currentMat: currentMatForCalibration || ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1],
            proposedIncludesCenter: proposedIncludesCenter.value,
        });
    }

    function refreshReplayData() {
        if (solverResult.value && !solverResult.value.error) {
            const currentAlign = fcStore.sensorAlignment.align_mag || 0;
            computeReplayData(solverResult.value, currentAlign);
        }
    }

    function runEllipsoidDiagnostics(_currentAlignment) {
        ellipsoidDiag.value = null;

        // Collect body-frame mag, per-axis variance
        let sx = 0,
            sy = 0,
            sz = 0,
            sxx = 0,
            syy = 0,
            szz = 0,
            sxy = 0,
            sxz = 0,
            syz = 0;
        let n = 0;

        forEachSample(({ body }) => {
            sx += body[0];
            sy += body[1];
            sz += body[2];
            sxx += body[0] * body[0];
            syy += body[1] * body[1];
            szz += body[2] * body[2];
            sxy += body[0] * body[1];
            sxz += body[0] * body[2];
            syz += body[1] * body[2];
            n++;
        });
        if (n < 9) {
            return;
        }

        // Per-axis RMS (proxy for condition number without full ellipsoid fit)
        const rmsX = Math.sqrt(sxx / n);
        const rmsY = Math.sqrt(syy / n);
        const rmsZ = Math.sqrt(szz / n);
        const maxRms = Math.max(rmsX, rmsY, rmsZ);
        const minRms = Math.min(rmsX, rmsY, rmsZ);
        const conditionNumber = minRms > 1 ? maxRms / minRms : 1;

        // Off-diagonal coupling (cross-axis correlation normalized)
        const meanX = sx / n,
            meanY = sy / n,
            meanZ = sz / n;
        const varX = sxx / n - meanX * meanX;
        const varY = syy / n - meanY * meanY;
        const varZ = szz / n - meanZ * meanZ;
        const covXY = sxy / n - meanX * meanY;
        const covXZ = sxz / n - meanX * meanZ;
        const covYZ = syz / n - meanY * meanZ;
        const trace = varX + varY + varZ;
        const offDiagRms = trace > 1e-10 ? Math.sqrt(covXY * covXY + covXZ * covXZ + covYZ * covYZ) / trace : 0;

        // Chirality: scalar triple product proxy — right-handed system has XY·Z > 0
        let chiralitySum = 0;
        forEachSample(({ body }) => {
            chiralitySum += body[0] * body[1] * body[2];
        });
        const chirality = chiralitySum > 0 ? "right-handed" : "left-handed";

        // Driver diagnostic: check if sensor-frame field direction rotates with drone heading
        // A correctly-driven chip should show field direction changing by ~90° per cardinal direction.
        // A wrong driver (wrong register order, wrong chip variant) will show stationary field direction.
        let driverSuspect = false;
        const flatHeadings = [];
        for (let di = 0; di < directions.length; di++) {
            const cap = captureData.value[di]?.[0]; // First pose index = Flat
            if (!cap || !cap.samples) {
                continue;
            }
            let sumSin = 0,
                sumCos = 0;
            for (const s of cap.samples) {
                const body = mat3mulVec(currentMatForCalibration || ALIGNMENT_MATRICES[1], s.mag);
                const dir = Math.atan2(body[1], body[0]);
                sumSin += Math.sin(dir);
                sumCos += Math.cos(dir);
            }
            flatHeadings.push({
                label: directions[di].label.split(" ")[0],
                hdg: Math.atan2(sumSin, sumCos) * (180 / Math.PI),
                expected: directions[di].heading * (180 / Math.PI),
            });
        }
        // Check if flat headings rotate by approximately 90° between adjacent cardinal directions
        if (flatHeadings.length >= 4) {
            const deltas = [];
            for (let i = 1; i < flatHeadings.length; i++) {
                let d = flatHeadings[i].hdg - flatHeadings[i - 1].hdg;
                while (d > 180) d -= 360;
                while (d < -180) d += 360;
                deltas.push(d);
            }
            // Also check the wrap from last to first
            let d = flatHeadings[0].hdg - flatHeadings[flatHeadings.length - 1].hdg;
            while (d > 180) d -= 360;
            while (d < -180) d += 360;
            deltas.push(d);
            const meanDelta = deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length;
            driverSuspect = meanDelta < 45; // If average heading change < 45° per 90° rotation, driver is wrong
        }

        ellipsoidDiag.value = {
            conditionNumber,
            chirality,
            driverSuspect,
            offDiagonalRms: offDiagRms,
            axisRms: { x: Math.round(rmsX), y: Math.round(rmsY), z: Math.round(rmsZ) },
            residualRms: 0,
            eigenvalues: [rmsX, rmsY, rmsZ],
            determinant: chirality === "right-handed" ? 1 : -1,
            // Cross-axis coupling diagnostic (covariance-based). The full
            // soft-iron correction is the ellipsoid W_inv; this is display-only.
            softIronMatrix:
                trace > 1e-10
                    ? [
                        [1, round4(covXY / trace), round4(covXZ / trace)],
                        [round4(covXY / trace), 1, round4(covYZ / trace)],
                        [round4(covXZ / trace), round4(covYZ / trace), 1],
                    ]
                    : null,
            hardIronBias: [Math.round(meanX), Math.round(meanY), Math.round(meanZ)],
        };
    }

    async function fetchGeoReference() {
        try {
            // Try FC GPS first
            const gps = fcStore.gpsData;
            if (gps && gps.fix && gps.latitude !== 0 && gps.longitude !== 0) {
                const result = computeDeclination(gps.latitude / 10000000, gps.longitude / 10000000);
                if (result) {
                    return result;
                }
            }
        } catch {
            /* GPS not available */
        }

        // Fall back to IP geolocation
        try {
            const response = await fetch("https://api.ipify.org?format=json");
            const ipData = await response.json();
            const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
            const geoData = await geoResponse.json();
            if (geoData.latitude && geoData.longitude) {
                const result = computeDeclination(geoData.latitude, geoData.longitude);
                if (result) {
                    return result;
                }
            }
        } catch {
            /* IP lookup failed */
        }

        return null;
    }

    function exportCharacterizationPoses() {
        const sr = solverResult.value;
        const exportData = {
            type: "characterization_poses",
            metadata: {
                exportedAt: new Date().toISOString(),
                configuratorVersion: "2026.6.0-alpha",
                currentAlignment: fcStore.sensorAlignment.align_mag || 0,
                customAngles:
                    fcStore.sensorAlignment.align_mag === 9
                        ? {
                            roll: fcStore.sensorAlignment.mag_align_roll || 0,
                            pitch: fcStore.sensorAlignment.mag_align_pitch || 0,
                            yaw: fcStore.sensorAlignment.mag_align_yaw || 0,
                        }
                        : null,
                totalPoses: completedPoseCount.value,
                totalSamples: captureData.value.reduce(
                    (s, d) => s + (d || []).reduce((ss, c) => ss + (c?.samples?.length || 0), 0),
                    0,
                ),
                geoReference: geoReference.value ?? null,
                ellipsoidCorrection: ellipsoidParams.value
                    ? {
                        center: {
                            x: ellipsoidParams.value.center.x,
                            y: ellipsoidParams.value.center.y,
                            z: ellipsoidParams.value.center.z,
                        },
                        W_inv: ellipsoidParams.value.W_inv,
                        radius: ellipsoidParams.value.radius,
                        residual: ellipsoidParams.value.residual,
                    }
                    : null,
                // Deprecated: per-axis gains came from the removed WMM
                // regression; key retained for poses-export compatibility.
                axisGains: null,
                calibrationOffsets: calibrationOffsets.value ?? null,
            },
            directions: directions.map((dir, di) => ({
                label: dir.label,
                heading: dir.heading,
                poses: dir.poses.map((pose, pi) => {
                    const cap = captureData.value[di]?.[pi];
                    return {
                        label: pose.label,
                        captured: !!cap,
                        sampleCount: cap?.samples?.length || 0,
                        samples: cap?.samples || [],
                    };
                }),
            })),
            solverResult: sr,
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `characterization_poses_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportCalibrationSamples() {
        const ep = ellipsoidParams.value;
        const pts = calibrationSamples.value;

        let exportEp = ep;
        if (!exportEp && pts.length >= 9) {
            const points = pts.map((s) => ({ x: s.x, y: s.y, z: s.z }));
            const fit = fitEllipsoid(points);
            if (fit) {
                exportEp = { ...fit, computed_on_export: true };
            }
        }

        // Helper: compute display-frame position matching MagSphereView rendering
        function voxelDisplay(s) {
            const v = [s.x, -s.y, -s.z]; // body→display mapping (negate Y and Z for inverted camera)
            if (s.qw !== undefined && s.qw !== null) {
                // Quaternion(qx, -qy, qz, qw): body-to-display rotation (negate Y only)
                const qw = s.qw,
                    qx = s.qx,
                    qy_ = -s.qy,
                    qz_ = -s.qz;
                const t = 2 * (qy_ * v[2] - qz_ * v[1]);
                const u = 2 * (qz_ * v[0] - qx * v[2]);
                const w = 2 * (qx * v[1] - qy_ * v[0]);
                v[0] += qw * t + (qy_ * w - qz_ * u);
                v[1] += qw * u + (qz_ * t - qx * w);
                v[2] += qw * w + (qx * u - qy_ * t);
            }
            return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
        }

        function _noseDisplay(s) {
            const v = [1, 0, 0];
            if (s.qw !== undefined && s.qw !== null) {
                const qw = s.qw,
                    qx = s.qx,
                    qy_ = -s.qy,
                    qz_ = -s.qz;
                const t = 2 * (qy_ * v[2] - qz_ * v[1]);
                const u = 2 * (qz_ * v[0] - qx * v[2]);
                const w = 2 * (qx * v[1] - qy_ * v[0]);
                v[0] += qw * t + (qy_ * w - qz_ * u);
                v[1] += qw * u + (qz_ * t - qx * w);
                v[2] += qw * w + (qx * u - qy_ * t);
            }
            return [v[0].toFixed(3), v[1].toFixed(3), v[2].toFixed(3)];
        }

        function _wingDisplay(s) {
            const v = [0, 1, 0]; // left wing in display body frame
            if (s.qw !== undefined && s.qw !== null) {
                const qw = s.qw,
                    qx = s.qx,
                    qy_ = -s.qy,
                    qz_ = -s.qz;
                const t = 2 * (qy_ * v[2] - qz_ * v[1]);
                const u = 2 * (qz_ * v[0] - qx * v[2]);
                const w = 2 * (qx * v[1] - qy_ * v[0]);
                v[0] += qw * t + (qy_ * w - qz_ * u);
                v[1] += qw * u + (qz_ * t - qx * w);
                v[2] += qw * w + (qx * u - qy_ * t);
            }
            return [v[0].toFixed(3), v[1].toFixed(3), v[2].toFixed(3)];
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            type: "calibration_tumble",
            scene_info: {
                axes: "X=forward/North, Y=left, Z=up",
                compass: "N at (+X), E at (+Y), S at (-X), W at (-Y)",
                voxel_transform: "body_mag(x,-y,-z) rotated by Quaternion(qx,-qy,-qz,qw) = body-to-display",
                display_note:
                    "camera at (700,560,420) looking at origin, camera.up=(0,0,-1), auto-rotating. White nose line from origin along body +X, length |B|*magScale(). Voxels: blue(old)→red(new).",
            },
            samples: pts.map((s) => ({
                x: s.x,
                y: s.y,
                z: s.z,
                roll: s.roll,
                pitch: s.pitch,
                heading: s.heading,
                timestamp: s.timestamp,
                field_magnitude: Math.round(Math.hypot(s.x, s.y, s.z)),
                qw: s.qw,
                qx: s.qx,
                qy: s.qy,
                qz: s.qz,
                voxel_display: voxelDisplay(s),
                // Debug fields used during camera/quaternion investigation — keep for future AI debugging:
                // _nose_x: Number(_noseDisplay(s)[0]),
                // _nose_y: Number(_noseDisplay(s)[1]),
                // _nose_z: Number(_noseDisplay(s)[2]),
                // _wing_left_z: Number(_wingDisplay(s)[2]),
            })),
            coverage: calibrationCoverage.value ?? { zones: {}, total: pts.length, uniform: 0 },
            ellipsoidParams: exportEp
                ? {
                    center: { x: exportEp.center.x, y: exportEp.center.y, z: exportEp.center.z },
                    W_inv: exportEp.W_inv,
                    radius: exportEp.radius,
                    residual: exportEp.residual,
                    ...(exportEp.computed_on_export ? { computed_on_export: true } : {}),
                }
                : null,
            firmwareOffsets: { x: 0, y: 0, z: 0 },
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `calibration_samples_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportCharacterizationData() {
        // Model assembly lives in magModelExport.js (shared with the export
        // tests and the fixture-regeneration tool).
        const json = buildCharacterizationModel({
            solverResult: solverResult.value,
            replayData: replayData.value,
            capturedUnder: capturedUnderInfo,
            ellipsoidParams: ellipsoidParams.value,
            calibrationOffsets: calibrationOffsets.value,
            geoReference: geoReference.value,
            gpsFix: !!fcStore.gpsData.fix,
            gpsLat: fcStore.gpsData.latitude,
            gpsLon: fcStore.gpsData.longitude,
        });

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `characterization_model_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function refreshGeoReference() {
        isFetchingGeo.value = true;
        try {
            const geo = await fetchGeoReference();
            if (geo) {
                geoReference.value = geo;
            }
        } finally {
            isFetchingGeo.value = false;
        }
    }

    function applyAndReboot() {
        if (!solverResult.value || !solverResult.value.alignment) {
            return false;
        }

        // Mirror the proposal into the store; the dialog performs the actual
        // CLI writes (alignment, validated offsets, declination) and verifies
        // them before save.
        fcStore.sensorAlignment.align_mag = solverResult.value.alignment;
        if (solverResult.value.alignment === 9 && solverResult.value.customAngles) {
            fcStore.sensorAlignment.mag_align_roll = solverResult.value.customAngles.roll;
            fcStore.sensorAlignment.mag_align_pitch = solverResult.value.customAngles.pitch;
            fcStore.sensorAlignment.mag_align_yaw = solverResult.value.customAngles.yaw;
        }

        return true;
    }

    function cancelWizard() {
        cleanupTimer();
        phase.value = "intro";
        currentDirectionIndex.value = 0;
        currentSubPoseIndex.value = 0;
        captureData.value = [];
        solverResult.value = null;
    }

    function reset() {
        cleanupTimer();
        phase.value = "intro";
        currentDirectionIndex.value = 0;
        currentSubPoseIndex.value = 0;
        captureData.value = [];
        solverResult.value = null;
        ellipsoidParams.value = null;
        calibrationSamples.value = [];
        calibrationSphereFit.value = null;
        _calLastFitCount = 0;
        calibrationValidation.value = null;
        proposedIncludesCenter.value = false;
    }

    function cleanupTimer() {
        if (sampleTimer !== null) {
            clearTimeout(sampleTimer);
            sampleTimer = null;
        }
    }

    function finishReplay() {
        phase.value = "complete";
    }

    function generateDetailedReport() {
        const r = solverResult.value;
        const geo = geoReference.value;
        const cal = calibrationOffsets.value;
        const rep = replayData.value;

        let report = "";
        const sep = "============================================================\n";
        const hdr = (s) => `${s}\n${"-".repeat(s.length)}\n`;

        report += sep;
        report += "MAGNETOMETER CHARACTERIZATION REPORT\n";
        report += `${sep}\n`;

        // Location & environment
        report += hdr("LOCATION & ENVIRONMENT");
        const lat = fcStore.gpsData?.latitude ? (fcStore.gpsData.latitude / 10000000).toFixed(2) : null;
        const lon = fcStore.gpsData?.longitude ? (fcStore.gpsData.longitude / 10000000).toFixed(2) : null;
        if (lat != null && lon != null) {
            report += `  Coordinates:      ${lat}N, ${lon}E\n`;
        } else {
            report += "  Coordinates:      (no GPS fix — location estimated from IP)\n";
        }
        if (geo) {
            report += `  Total field |B|:  ${geo.fieldStrength} nT\n`;
            report += `  Inclination:      ${geo.inclination.toFixed(1)}\u00B0\n`;
            report += `  Declination:      ${geo.declination.toFixed(1)}\u00B0\n`;
        } else {
            report += "  Geo reference:    not available (use Refresh GPS)\n";
        }
        report += `  WMM source:       ${geo && geo.fieldStrength ? "WMM2020 model (GPS or IP geolocation)" : "not available"}\n`;
        if (r && r.fieldConsistency) {
            const fc = r.fieldConsistency;
            report += `  Field consistency: ${fc.suspect ? `SUSPECT (\u00B1${fc.maxDevPct}%)` : `OK (\u00B1${fc.maxDevPct}%)`}\n`;
        }
        report += "\n";

        // Hardware
        report += hdr("FIRMWARE & HARDWARE");
        const cfg = fcStore.config;
        const target = cfg?.targetName || "?";
        const version = cfg?.flightControllerVersion || "?";
        const board = cfg?.boardName || cfg?.hardwareName || "?";
        const buildKey = cfg?.buildKey || "";
        report += `  Target:        ${target}\n`;
        report += `  Board:         ${board}\n`;
        report += `  Firmware:      ${version}`;
        if (buildKey && buildKey.length >= 8) {
            report += `  (build ${buildKey.slice(0, 8)})`;
        }
        report += "\n";
        const i2cErr = cfg?.i2cError;
        report += `  I2C errors:    ${i2cErr != null ? i2cErr : "?"}`;
        if (i2cErr > 0) {
            report += `  \u26A0 I2C errors: ${i2cErr} (initial probe errors are normal for unified QMC5883 driver; persistent growth indicates hardware issue)\n`;
        } else if (i2cErr === 0) {
            report += "  (clean)\n";
        }
        report += "\n\n";
        const MAG_HW_NAMES = {
            0: "DEFAULT",
            1: "NONE",
            2: "HMC5883",
            3: "AK8975",
            4: "AK8963",
            5: "QMC5883",
            6: "LIS2MDL",
            7: "LIS3MDL",
            8: "MPU925X_AK8963",
            9: "IST8310",
        };
        const cfgMagHw = fcStore.sensorConfig?.mag_hardware ?? 0;
        const activeMagHw = fcStore.sensorConfigActive?.mag_hardware ?? 0;
        const cfgName = MAG_HW_NAMES[cfgMagHw] || `Unknown (${cfgMagHw})`;
        const activeName = MAG_HW_NAMES[activeMagHw] || `Unknown (${activeMagHw})`;
        report += `  Mag configured: ${cfgMagHw} (${cfgName})\n`;
        report += `  Mag detected:   ${activeMagHw} (${activeName})\n`;
        if (cfgMagHw !== activeMagHw && activeMagHw !== 0) {
            report += "  Note: configured mag differs from auto-detected hardware (unified driver auto-detection)\n";
        }
        if (activeMagHw === 0) {
            report += "  \u26A0 No magnetometer found on I2C bus\n";
        }
        report += `  Alignment:      ${fcStore.sensorAlignment?.align_mag || "?"}\n`;

        // Raw sensor fingerprint — per-axis stats and per-direction flat-pose mag vectors
        const flatMagByDir = {}; // dirIdx -> { dirLabel, magMean: [x,y,z], magMin: [x,y,z], magMax: [x,y,z] }
        let allMagX = [];
        let allMagY = [];
        let allMagZ = [];
        for (let di = 0; di < directions.length; di++) {
            const dir = directions[di];
            for (let pi = 0; pi < dir.poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples || cap.samples.length === 0) {
                    continue;
                }
                for (const s of cap.samples) {
                    allMagX.push(s.mag[0]);
                    allMagY.push(s.mag[1]);
                    allMagZ.push(s.mag[2]);
                }
                if (dir.poses[pi].label.startsWith("Flat")) {
                    const n = cap.samples.length;
                    let mx = 0,
                        my = 0,
                        mz = 0;
                    let minX = Infinity,
                        minY = Infinity,
                        minZ = Infinity;
                    let maxX = -Infinity,
                        maxY = -Infinity,
                        maxZ = -Infinity;
                    for (const s of cap.samples) {
                        mx += s.mag[0];
                        my += s.mag[1];
                        mz += s.mag[2];
                        if (s.mag[0] < minX) {
                            minX = s.mag[0];
                        }
                        if (s.mag[1] < minY) {
                            minY = s.mag[1];
                        }
                        if (s.mag[2] < minZ) {
                            minZ = s.mag[2];
                        }
                        if (s.mag[0] > maxX) {
                            maxX = s.mag[0];
                        }
                        if (s.mag[1] > maxY) {
                            maxY = s.mag[1];
                        }
                        if (s.mag[2] > maxZ) {
                            maxZ = s.mag[2];
                        }
                    }
                    flatMagByDir[di] = {
                        dirLabel: dir.label,
                        magMean: [Math.round(mx / n), Math.round(my / n), Math.round(mz / n)],
                        magMin: [Math.round(minX), Math.round(minY), Math.round(minZ)],
                        magMax: [Math.round(maxX), Math.round(maxY), Math.round(maxZ)],
                    };
                }
            }
        }
        if (allMagX.length > 0) {
            const stats = (arr) => {
                const min = Math.min(...arr);
                const max = Math.max(...arr);
                const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
                return { min: Math.round(min), max: Math.round(max), mean: Math.round(mean) };
            };
            const sx = stats(allMagX);
            const sy = stats(allMagY);
            const sz = stats(allMagZ);
            report += "\n";
            report += hdr("RAW SENSOR FINGERPRINT (post-alignment, ADC counts)");
            report += "  Axis   Min       Max       Mean      Range\n";
            report += "  ----   ---       ---       ----      -----\n";
            report += `  X      ${sx.min.toString().padStart(5)}     ${sx.max.toString().padStart(5)}     ${sx.mean.toString().padStart(5)}     ${(sx.max - sx.min).toString().padStart(5)}\n`;
            report += `  Y      ${sy.min.toString().padStart(5)}     ${sy.max.toString().padStart(5)}     ${sy.mean.toString().padStart(5)}     ${(sy.max - sy.min).toString().padStart(5)}\n`;
            report += `  Z      ${sz.min.toString().padStart(5)}     ${sz.max.toString().padStart(5)}     ${sz.mean.toString().padStart(5)}     ${(sz.max - sz.min).toString().padStart(5)}\n`;
            const rangeMax = Math.max(sx.max - sx.min, sy.max - sy.min, sz.max - sz.min);
            const rangeMin = Math.min(sx.max - sx.min, sy.max - sy.min, sz.max - sz.min);
            const rangeRatio = rangeMax / Math.max(rangeMin, 1);
            report += `\n  Axis range ratio (max/min): ${rangeRatio.toFixed(2)}x\n`;
            const highInclination = geo && Math.abs(geo.inclination) > 50;
            if (rangeRatio > 2.5 && !highInclination) {
                report += "  \u26A0 AXIS MISMATCH \u2014 sensor axes have different sensitivity or are swapped.\n";
            } else if (rangeRatio > 2.5 && highInclination) {
                report += "  (Z range is naturally reduced at this location's high magnetic inclination\n";
                report += `   of ${geo.inclination.toFixed(0)}\u00B0 \u2014 not a sensor defect)\n`;
            }

            // Per-direction flat pose mag — directional fingerprint
            const dirKeys = Object.keys(flatMagByDir);
            if (dirKeys.length >= 4) {
                report += "\n";
                report += "  Directional fingerprint (Flat pose mag vector per cardinal direction):\n";
                report += "  Direction     Mag X    Mag Y    Mag Z   |B|\n";
                report += "  ---------     -----    -----    -----   ---\n";
                for (const di of dirKeys.sort()) {
                    const fd = flatMagByDir[di];
                    const mx = fd.magMean[0],
                        my = fd.magMean[1],
                        mz = fd.magMean[2];
                    const b = Math.round(Math.hypot(mx, my, mz));
                    const dirShort = fd.dirLabel.split(" ")[0];
                    report += `  ${dirShort.padEnd(13)} ${mx.toString().padStart(5)}    ${my.toString().padStart(5)}    ${mz.toString().padStart(5)}   ${b.toString().padStart(5)}\n`;
                }
                // Check: does horizontal vector rotate with heading?
                const nIdx = dirKeys.find((k) => flatMagByDir[k].dirLabel.startsWith("North"));
                const eIdx = dirKeys.find((k) => flatMagByDir[k].dirLabel.startsWith("East"));
                if (nIdx !== undefined && eIdx !== undefined) {
                    const nMag = flatMagByDir[nIdx].magMean;
                    const eMag = flatMagByDir[eIdx].magMean;
                    const dn = Math.hypot(nMag[0], nMag[1]);
                    const de = Math.hypot(eMag[0], eMag[1]);
                    const delta = Math.abs(dn - de);
                    report += "\n";
                    if (delta > Math.max(dn, de) * 0.3) {
                        report += "  \u2717 Horizontal field magnitude varies with heading\n";
                        report += "    (may indicate incorrect alignment preset or driver axis mapping)\n";
                        report += `    North |H|=${dn.toFixed(0)}, East |H|=${de.toFixed(0)} (diff ${delta.toFixed(0)}).\n`;
                    } else {
                        report += "  \u2713 Horizontal field magnitude is stable across headings.\n";
                    }
                }
            }
        }
        report += "\n";

        // Solver result
        if (r && !r.error) {
            report += hdr("SOLVER RESULT");
            report += `  Alignment:        ${r.label}\n`;
            if (r.customAngles) {
                report += `  Euler (ZYX):      roll=${r.customAngles.roll.toFixed(0)}\u00B0, pitch=${r.customAngles.pitch.toFixed(0)}\u00B0, yaw=${r.customAngles.yaw.toFixed(0)}\u00B0\n`;
            }
            report += `  Quality score:    ${r.qualityScore}%\n`;
            if (r.residuals) {
                report += `  Z residual:       ${(r.residuals.zRms * 100).toFixed(1)}% RMS\n`;
                report += `  XY residual:      ${(r.residuals.xyRms * 100).toFixed(1)}% RMS\n`;
            }
            report += `  Chirality:        ${r.chiralityFlag ? "detected" : "not detected"}\n`;
            report += `  Yaw reference:    ${r.yawAbsolute ? "absolute" : "relative"}\n`;
            report += "\n";
        }

        // Calibration - firmware-supported
        if (cal) {
            report += hdr("CALIBRATION (FIRMWARE-SUPPORTED)");
            report += `  mag_calibration = ${cal.x}, ${cal.y}, ${cal.z}\n`;
            report += ellipsoidParams.value
                ? "  (ellipsoid center mapped into the proposed alignment frame:\n" +
                  "   newCombined \u00B7 (center + magZero_at_capture) \u2014 firmware subtracts\n" +
                  "   mag_calibration AFTER alignment, compass.c:492-550)\n"
                : "  (derived from WMM regression \u2014 legacy path, frame semantics\n" +
                  "   unverified; prefer running the calibration tumble)\n";
            const cv = calibrationValidation.value;
            if (cv) {
                report += cv.recommended
                    ? `  Package selection: CALIBRATED PACKAGE \u2014 alignment solved on\n` +
                      `  bias-corrected data + mag_calibration: ${cv.fullCorrectedMeanErr.toFixed(1)}\u00B0 mean error\n` +
                      `  vs ${cv.proposedMeanErr.toFixed(1)}\u00B0 for alignment-only (raw solve) on the 20 poses.\n` +
                      "  Both align_mag and mag_calibration will be applied together.\n"
                    : `  Package selection: ALIGNMENT-ONLY \u2014 calibrated package ` +
                      `${cv.fullCorrectedMeanErr.toFixed(1)}\u00B0\n` +
                      `  vs ${cv.proposedMeanErr.toFixed(1)}\u00B0 alignment-only on the 20 poses.\n` +
                      "  Static offsets will NOT be written to the FC: world-frame bench\n" +
                      "  interference (does not rotate with the drone) contaminated the\n" +
                      "  tumble's bias estimate. Bias correction is deferred to per-flight\n" +
                      "  self-calibration in the log viewer. A tumble re-capture away from\n" +
                      "  electronics can also recover a writable static offset.\n";
            }
            report += "\n";
        }

        // Per-pose table
        if (rep && rep.length > 0) {
            report += hdr(`POSE-BY-POSE HEADING ANALYSIS (${rep.length} poses)`);
            report += "  ID   Direction  Pose           Expected  Current    Err   Proposed  Err   Score\n";
            report += "  ---  ---------  -------------  --------  --------  ----  --------  ----  -----\n";
            for (let i = 0; i < rep.length; i++) {
                const p = rep[i];
                const dirShort = p.dirLabel ? p.dirLabel.split(" ")[0] : "?";
                const expStr = `${(p.expectedHeading || 0).toFixed(0).padStart(5)}\u00B0`;
                const curStr = `${(p.currentHeading || 0).toFixed(1).padStart(7)}\u00B0`;
                const curErr = `${headingError(p.currentHeading, p.expectedHeading).toFixed(1).padStart(4)}\u00B0`;
                const newStr = `${(p.newHeading || 0).toFixed(1).padStart(7)}\u00B0`;
                const newErr = `${headingError(p.newHeading, p.expectedHeading).toFixed(1).padStart(4)}\u00B0`;
                const id = (i + 1).toString().padStart(3);
                const poseLabel = (p.poseLabel || "?").substring(0, 13).padEnd(13);
                report += `  ${id}  ${dirShort.padEnd(9)} ${poseLabel} ${expStr}  ${curStr}  ${curErr}  ${newStr}  ${newErr}  ${p.score || "?"}\n`;
            }

            // Mean errors
            let sumCurErr = 0;
            let sumNewErr = 0;
            let nErr = 0;
            for (const p of rep) {
                sumCurErr += headingError(p.currentHeading, p.expectedHeading);
                sumNewErr += headingError(p.newHeading, p.expectedHeading);
                nErr++;
            }
            if (nErr > 0) {
                report += "  ---  ---------  -------------  --------  --------  ----  --------  ----  -----\n";
                report +=
                    `  MEAN                                    ${(sumCurErr / nErr).toFixed(1).padStart(7)}\u00B0` +
                    `                    ${(sumNewErr / nErr).toFixed(1).padStart(7)}\u00B0\n`;
            }
            report += "\n";

            // Performance summary
            const countCurrentBad = rep.filter((p) => headingError(p.currentHeading, p.expectedHeading) > 5).length;
            const countProposedGood = rep.filter((p) => headingError(p.newHeading, p.expectedHeading) <= 5).length;
            report += hdr("PERFORMANCE EVALUATION");
            report += `  Current alignment mean error:  ${(sumCurErr / nErr).toFixed(1)}\u00B0 (${countCurrentBad}/${nErr} poses exceed 5\u00B0)\n`;
            report += `  Proposed alignment mean error: ${(sumNewErr / nErr).toFixed(1)}\u00B0 (${countProposedGood}/${nErr} poses within 5\u00B0)\n`;
            if (sumNewErr / nErr < sumCurErr / nErr) {
                const improvement = ((sumCurErr - sumNewErr) / nErr).toFixed(1);
                report += `  Improvement:       ${improvement}\u00B0 better with proposed alignment.\n`;
            } else if (sumNewErr / nErr > sumCurErr / nErr) {
                report += "  Proposed alignment has higher mean error than current.\n";
                report += "  The solver may have converged to a local minimum, or the current\n";
                report += "  alignment may already be near-optimal for this hardware.\n";
            }
            report += "\n";
        }

        // Flat pose summary — ground truth (most accurate headingRef)
        const flatPoses = rep.filter((p) => p.isFlat);
        if (flatPoses.length > 0) {
            let flatCurSum = 0,
                flatNewSum = 0;
            let hasCal = false;
            for (const p of flatPoses) {
                flatCurSum += headingError(p.currentHeading, p.expectedHeading);
                flatNewSum += headingError(p.newHeading, p.expectedHeading);
                if (p.fullCorrectedHeading != null) hasCal = true;
            }
            report += hdr("FLAT POSE SUMMARY (ground truth — highest headingRef accuracy)");
            report += `  Flat poses evaluated:       ${flatPoses.length}\n`;
            report += `  Current alignment mean error:  ${(flatCurSum / flatPoses.length).toFixed(1)}\u00B0\n`;
            report += `  Proposed alignment mean error: ${(flatNewSum / flatPoses.length).toFixed(1)}\u00B0\n`;
            if (hasCal) {
                report += `  Calibrated heading:           matches proposed (same alignment)\n`;
                report += "  Calibration offsets + W_inv correct field magnitude uniformity,\n";
                report += "  not heading direction. See HARDWARE DIAGNOSTICS for |B| spread.\n";
            }
            const flatImp = flatCurSum / flatPoses.length - flatNewSum / flatPoses.length;
            if (flatImp > 0) {
                report += `  Improvement: ${flatImp.toFixed(1)}\u00B0 better with proposed alignment.\n`;
            } else if (flatImp < 0) {
                report += `  Proposed is ${Math.abs(flatImp).toFixed(1)}\u00B0 worse on flat poses.\n`;
            }
            report += "\n";
        }

        // Ellipsoid diagnostics (covariance-based)
        const ed = ellipsoidDiag.value;
        if (ed) {
            report += hdr("HARDWARE DIAGNOSTICS");
            const fc = r?.fieldConsistency;
            const fieldClean = fc && !fc.suspect && fc.maxDevPct < 5;
            report += "  Method:            covariance analysis (body-frame mag per-axis RMS + cross-coupling)\n";
            report += `  Environment:       ${fieldClean ? "CLEAN (|B| stable)" : `CONTAMINATED (\u00B1${fc?.maxDevPct || "?"}% |B| variation)`}\n`;
            report += `  Chirality:         ${ed.chirality.toUpperCase()}\n`;
            if (ed.chirality === "left-handed") {
                report += "    DRIVER ERROR: One or more sensor axes are inverted in firmware.\n";
            }
            if (ed.driverSuspect) {
                report += "  Flat heading rotation: < 45\u00B0 average between cardinal directions\n";
                report += "    The leveled field direction does not follow the drone heading as expected.\n";
                report += "    Possible causes: incorrect current alignment, or driver axis mapping issue.\n";
            }
            report += `  Condition \u03BA:       ${ed.conditionNumber.toFixed(2)}`;
            if (ed.conditionNumber > 2.0) {
                report += " \u2192 ASYMMETRIC (significant gain difference)\n";
                report += `    Per-axis RMS: X=${ed.axisRms.x} Y=${ed.axisRms.y} Z=${ed.axisRms.z}\n`;
                report += "    Sensor axes have mismatched sensitivity.\n";
                report += "    Per-axis gain calibration may be required.\n";
            } else if (ed.conditionNumber > 1.3) {
                report += " \u2192 MILD ASYMMETRY (minor gain variation)\n";
                report += `    Per-axis RMS: X=${ed.axisRms.x} Y=${ed.axisRms.y} Z=${ed.axisRms.z}\n`;
            } else {
                report += " \u2192 ISOTROPIC (healthy)\n";
            }
            // Cross-reference with ellipsoid fit if available
            const ep = ellipsoidParams.value;
            if (ep) {
                const wDiag = [ep.W_inv[0][0], ep.W_inv[1][1], ep.W_inv[2][2]];
                const wMin = Math.min(...wDiag);
                const wMax = Math.max(...wDiag);
                const wRatio = wMax / Math.max(wMin, 1e-12);
                report += `  Ellipsoid \u03BA:      ${wRatio.toFixed(3)}`;
                if (wRatio < 1.05) {
                    report += " \u2192 ISOTROPIC (healthy)\n";
                } else if (wRatio < 1.15) {
                    report += " \u2192 MILD ASYMMETRY\n";
                } else {
                    report += " \u2192 ASYMMETRIC\n";
                }
            }
            report += `  Off-diag coupling: ${ed.offDiagonalRms.toFixed(4)}`;
            if (ed.offDiagonalRms > 0.1) {
                report += " \u2192 SKEWED (mounting issue)\n";
                report += "    MOUNTING ISSUE: Cross-axis coupling detected.\n";
                report += "    Sensor module may be physically twisted or tilted.\n";
            } else {
                report += " \u2192 ORTHOGONAL (correctly mounted)\n";
            }
            if (ed.softIronMatrix) {
                report += "\n";
                report += "  Covariance matrix (3\u00D73, body-frame):\n";
                report += `    [${ed.softIronMatrix[0].map((v) => v.toFixed(4)).join(", ")}]\n`;
                report += `    [${ed.softIronMatrix[1].map((v) => v.toFixed(4)).join(", ")}]\n`;
                report += `    [${ed.softIronMatrix[2].map((v) => v.toFixed(4)).join(", ")}]\n`;
                report += `  Body-frame centroid: [${ed.hardIronBias.join(", ")}]\n`;
                report += "  (for reference only — ellipsoid fit provides the authoritative correction)\n";
            }
            if (fieldClean && ed.chirality === "right-handed" && ed.conditionNumber < 1.3 && ed.offDiagonalRms < 0.1) {
                report += "\n  VERDICT: All diagnostics nominal \u2014 sensor appears healthy.\n";
            } else {
                report += "\n  VERDICT: See individual diagnostic categories above.\n";
                if (!fieldClean) report += "  \u2022 Field contamination detected \u2014 results may be degraded.\n";
                if (ed.chirality === "left-handed")
                    report += "  \u2022 Left-handed coordinate system \u2014 possible axis inversion.\n";
                if (ed.conditionNumber > 1.3)
                    report += "  \u2022 Axis gain asymmetry \u2014 sensor axes have different sensitivity.\n";
                if (ed.offDiagonalRms > 0.1)
                    report += "  \u2022 Cross-axis coupling \u2014 sensor may be physically skewed.\n";
            }
            report += "\n";
        }

        report += hdr("FIRMWARE REFERENCE");
        report += "  Alignment:         compass.c:492-496\n";
        report += "  Tilt-comp heading: imu.c:531-554\n";
        report += "  Mahony AHRS:       imu.c:242-244\n";
        report += "  Custom matrix:     vector.c:214-236\n";
        report += "  Presets:           boardalignment.c:98-139\n";
        report += "\n";
        report += sep;
        report += "END OF REPORT - Generated by Betaflight Configurator Mag Wizard\n";
        report += sep;

        detailedReport.value = report;
        return report;
    }

    return {
        // Constants
        directions,
        CAPTURE_DURATION_MS,
        // State
        phase,
        currentDirectionIndex,
        currentSubPoseIndex,
        isStable,
        lastRoll,
        lastPitch,
        lastMag,
        lastFieldStrength,
        gyroRms,
        captureSamples,
        captureData,
        solverResult,
        replayData,
        calibrationOffsets,
        magZeroAtCapture,
        calibrationValidation,
        proposedIncludesCenter,
        geoReference,
        isFetchingGeo,
        ellipsoidParams,
        calibrationSamples,
        calibrationSampleCount,
        calibrationCoverage,
        calibrationSphereFit,
        calCurrentPrompt,
        poseNeedsRetry,
        // Computed
        currentDirection,
        currentPoseDef,
        completedPoseCount,
        // Actions
        setCallbacks,
        startWizard,
        cancelWizard,
        skipPose,
        retryPose,
        startCapture,
        runSolver,
        tick,
        onKeyDown,
        cleanupTimer,
        reset,
        startCalibrationPhase,
        completeCalibrationPhase,
        skipCalibration,
        exportCalibrationSamples,
        exportCharacterizationPoses,
        exportCharacterizationData,
        finishReplay,
        refreshReplayData,
        refreshGeoReference,
        applyAndReboot,
        generateDetailedReport,
        detailedReport,
        ellipsoidDiag,
    };
}
