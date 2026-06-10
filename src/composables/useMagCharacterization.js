/**
 * useMagCharacterization — Composable for the supported-pose alignment wizard.
 *
 * Extracts all non-UI state and logic from MagCharacterizationWizard.vue:
 * state machine, stability detection, spacebar gating, capture, solver,
 * and JSON export.  The dialog component keeps only the template, 3D model
 * rendering, and dialog lifecycle.
 */
import { ref, computed } from "vue";
import { characterizeAlignment, matrixToEuler } from "../js/utils/magCharacterization.js";
import { computeDeclination, getGeoReference } from "./useMagCalibration.js";
import { fitEllipsoid, applyEllipsoidCorrection } from "../js/utils/ellipsoidFit.js";
import { computeCoverage } from "../js/utils/sphereFit.js";
import {
    eulerToMatrix,
    mat3transpose,
    mat3mul,
    mat3mulVec,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../js/utils/magAlignment.js";
import { useFlightControllerStore } from "../stores/fc";

// ── Constants ──────────────────────────────────────────────────────────────

const CAPTURE_DURATION_MS = 2000;
const POLL_MS = 80;
const STABILITY_THRESHOLD_DEG_S = 3;
const STABILITY_FRAMES = 10;
const CONFIRMED_DELAY_MS = 750;

// ── Pose definitions (shared between composable and dialog for 3D model) ───

// Shared pose templates (reused across all 4 cardinal directions)
const _POSE_FLAT = (line) => ({
    label: "Flat",
    instruction: `Rest the drone LEVEL on the paper. Nose pointing along the ${line} line.`,
    rotX: 0,
    rotZ: 0,
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
    const captureData = ref([]);
    const solverResult = ref(null);
    const replayData = ref([]); // [{ dirLabel, poseLabel, expectedHeading, roll, pitch, currentHeading, currentMag, newHeading, newMag }]
    const calibrationOffsets = ref(null); // { x, y, z } or null if not available
    const axisGains = ref(null); // { x, y, z } per-axis multiplicative gain factors
    const geoReference = ref(null); // { declination, inclination, fieldStrength } or null
    const detailedReport = ref(""); // LLM-ready text report, populated by generateDetailedReport()
    const ellipsoidDiag = ref(null); // { conditionNumber, chirality, offDiagonalRms, ... } from fitEllipsoid
    const ellipsoidParams = ref(null); // { center: {x,y,z}, W_inv: number[3][3], radius: number, residual: number }
    const calibrationSamples = ref([]); // [{ x, y, z, pitch, heading, timestamp }] for calibration tumble
    const calibrationSampleCount = computed(() => calibrationSamples.value.length);
    const calibrationCoverage = computed(() => {
        const pts = calibrationSamples.value;
        if (pts.length < 4) return null;
        const points = pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));
        return computeCoverage(points, { x: 0, y: 0, z: 0 });
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
        axisGains.value = null;
        ellipsoidDiag.value = null;
        ellipsoidParams.value = null;
        calibrationSamples.value = [];
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
        if (onSolverAboutToRun) {
            onSolverAboutToRun();
        }
        calibrationSamples.value = [];
        ellipsoidParams.value = null;
        phase.value = "calibrate";
        sampleTimer = setTimeout(calibrationTick, POLL_MS);
    }

    function completeCalibrationPhase() {
        cleanupTimer();
        if (calibrationSamples.value.length >= 9) {
            const points = calibrationSamples.value.map((s) => ({ x: s.x, y: s.y, z: s.z }));
            ellipsoidParams.value = fitEllipsoid(points);
        }
        phase.value = "await";
        tick();
    }

    function skipCalibration() {
        cleanupTimer();
        ellipsoidParams.value = null;
        phase.value = "await";
        tick();
    }

    function calibrationTick() {
        if (phase.value !== "calibrate") {
            return;
        }

        const mx = fcStore.sensorData.magnetometer[0];
        const my = fcStore.sensorData.magnetometer[1];
        const mz = fcStore.sensorData.magnetometer[2];
        const pitch = fcStore.sensorData.kinematics[1];
        const heading = 0;

        if (mx !== undefined && my !== undefined && mz !== undefined) {
            const lastSample = calibrationSamples.value[calibrationSamples.value.length - 1];
            if (!lastSample || lastSample.x !== mx || lastSample.y !== my || lastSample.z !== mz) {
                calibrationSamples.value.push({
                    x: mx,
                    y: my,
                    z: mz,
                    pitch: Math.round(pitch * 10) / 10,
                    heading,
                    timestamp: Date.now(),
                });
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
        if (!captureData.value[currentDirectionIndex.value]) {
            captureData.value[currentDirectionIndex.value] = [];
        }
        captureData.value[currentDirectionIndex.value][currentSubPoseIndex.value] = null;
        advancePose();
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

    function runSolver(currentAlignOverride, customAnglesOverride, ellipsoidOverride, skipHardIron) {
        if (onSolverAboutToRun) {
            onSolverAboutToRun();
        }
        phase.value = "complete";

        const allSamples = [];
        const ellipsoid = ellipsoidOverride ?? ellipsoidParams.value;
        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (cap && cap.samples) {
                    for (const s of cap.samples) {
                        const corrected = ellipsoid ? applyEllipsoidCorrection(s.mag, ellipsoid) : s.mag;
                        allSamples.push({ mag: corrected, roll: s.roll, pitch: s.pitch, headingRef: s.headingRef });
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

        const result = characterizeAlignment(allSamples, currentAlign, customAngles, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        solverResult.value = result;
        console.log("=== MAG CHARACTERIZATION RESULT ===", result);

        // Build the current alignment matrix (handling CUSTOM align=9 properly)
        if (currentAlign === 9 && customAngles) {
            currentMatForCalibration = eulerToMatrix(customAngles.roll, customAngles.pitch, customAngles.yaw);
        } else {
            currentMatForCalibration = ALIGNMENT_MATRICES[currentAlign] || ALIGNMENT_MATRICES[1];
        }

        // Pre-compute replay data for all captured poses
        computeReplayData(result, currentAlign);

        // Run ellipsoid fitter for hardware diagnostics
        runEllipsoidDiagnostics(currentAlign);

        // Hard iron + gain calibration (skip if debug-loader provided values)
        if (!skipHardIron) {
            computeHardIronOffset();
        }

        phase.value = "replay";
    }

    function computeReplayData(result, currentAlignment) {
        const DEG_TO_RAD = Math.PI / 180;
        const RAD_TO_DEG = 180 / Math.PI;

        // Use the already-built current matrix (handles CUSTOM align=9 properly)
        const currentMat = currentMatForCalibration || ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];
        const currentInv = mat3transpose(currentMat);

        // Build proposed alignment matrix
        let proposedMat;
        if (result.alignment === 9 && result.customAngles) {
            proposedMat = eulerToMatrix(result.customAngles.roll, result.customAngles.pitch, result.customAngles.yaw);
        } else {
            proposedMat = ALIGNMENT_MATRICES[result.alignment] || ALIGNMENT_MATRICES[1];
        }

        const data = [];

        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples || cap.samples.length === 0) {
                    continue;
                }

                // Aggregate all samples for this pose
                let sumRoll = 0;
                let sumPitch = 0;
                let sumField = 0;
                const curMags = [0, 0, 0];
                const newMags = [0, 0, 0];
                let curSin = 0;
                let curCos = 0;
                let newSin = 0;
                let newCos = 0;
                let gcSin = 0; // gain-corrected
                let gcCos = 0;
                let fcSin = 0; // full-corrected (ellipsoid + proposed)
                let fcCos = 0;
                let n = 0;
                let hasFullCorrected = false;

                for (const s of cap.samples) {
                    sumRoll += s.roll;
                    sumPitch += s.pitch;
                    sumField += s.fieldStrength || Math.hypot(s.mag[0], s.mag[1], s.mag[2]);
                    const rollRad = s.roll * DEG_TO_RAD;
                    const pitchRad = s.pitch * DEG_TO_RAD;

                    // Current alignment heading
                    const curCombined = mat3mul(currentMat, currentInv); // = I
                    const curBody = mat3mulVec(curCombined, s.mag);
                    const curLevel = undoRollPitch(curBody, rollRad, pitchRad);
                    const curDir = Math.atan2(curLevel[1], curLevel[0]);
                    curSin += Math.sin(curDir);
                    curCos += Math.cos(curDir);
                    curMags[0] += curBody[0];
                    curMags[1] += curBody[1];
                    curMags[2] += curBody[2];

                    // Proposed alignment heading
                    const newCombined = mat3mul(proposedMat, currentInv);
                    const newBody = mat3mulVec(newCombined, s.mag);
                    const newLevel = undoRollPitch(newBody, rollRad, pitchRad);
                    const newDir = Math.atan2(newLevel[1], newLevel[0]);
                    newSin += Math.sin(newDir);
                    newCos += Math.cos(newDir);
                    newMags[0] += newBody[0];
                    newMags[1] += newBody[1];
                    newMags[2] += newBody[2];

                    // Full corrected heading (ellipsoid correction + proposed alignment)
                    if (ellipsoidParams.value) {
                        const ellCorrected = applyEllipsoidCorrection(s.mag, ellipsoidParams.value);
                        const fcBody = mat3mulVec(newCombined, ellCorrected);
                        const fcLevel = undoRollPitch(fcBody, rollRad, pitchRad);
                        const fcDir = Math.atan2(fcLevel[1], fcLevel[0]);
                        fcSin += Math.sin(fcDir);
                        fcCos += Math.cos(fcDir);
                        hasFullCorrected = true;
                    }

                    // Gain-corrected heading (projected — requires firmware support)
                    if (axisGains.value && calOffsets) {
                        const gcBody = [
                            (newBody[0] - calOffsets.x) / Math.max(axisGains.value.x, 0.01),
                            (newBody[1] - calOffsets.y) / Math.max(axisGains.value.y, 0.01),
                            (newBody[2] - calOffsets.z) / Math.max(axisGains.value.z, 0.01),
                        ];
                        const gcLevel = undoRollPitch(gcBody, rollRad, pitchRad);
                        const gcDir = Math.atan2(gcLevel[1], gcLevel[0]);
                        gcSin += Math.sin(gcDir);
                        gcCos += Math.cos(gcDir);
                    }

                    n++;
                }

                const calOffsets = calibrationOffsets.value;
                const curHeading = Math.atan2(curSin, curCos) * RAD_TO_DEG;
                const newHeading = Math.atan2(newSin, newCos) * RAD_TO_DEG;
                const gcHeading = gcSin !== 0 || gcCos !== 0 ? Math.atan2(gcSin, gcCos) * RAD_TO_DEG : null;
                const fullCorrectedHeading = hasFullCorrected ? Math.atan2(fcSin, fcCos) * RAD_TO_DEG : null;
                const meanRoll = sumRoll / n;
                const meanPitch = sumPitch / n;
                const expectedHeading = cap.headingRef || directions[di].heading * RAD_TO_DEG;

                data.push({
                    dirLabel: directions[di].label,
                    poseLabel: directions[di].poses[pi].label,
                    expectedHeading,
                    roll: meanRoll,
                    pitch: meanPitch,
                    currentHeading: curHeading,
                    currentMag: [curMags[0] / n, curMags[1] / n, curMags[2] / n],
                    newHeading,
                    newMag: [newMags[0] / n, newMags[1] / n, newMags[2] / n],
                    gainCorrectedHeading: gcHeading,
                    fullCorrectedHeading,
                    _fieldSum: sumField,
                    _fieldCount: n,
                });
            }
        }

        // Compute global mean |B| for deviation calculation
        let globalFieldSum = 0;
        let globalFieldCount = 0;
        for (const d of data) {
            globalFieldSum += d._fieldSum;
            globalFieldCount += d._fieldCount;
        }
        const globalFieldMean = globalFieldCount > 0 ? globalFieldSum / globalFieldCount : 1;

        // Add field deviation and scores
        for (const d of data) {
            d.fieldMean = Math.round(d._fieldSum / d._fieldCount);
            d.fieldDevPct = Math.round((d.fieldMean / globalFieldMean - 1) * 1000) / 10;
            d.currentScore = scoreHeading(headingError(d.currentHeading, d.expectedHeading));
            d.score = scoreHeading(headingError(d.newHeading, d.expectedHeading));
            if (d.gainCorrectedHeading != null) {
                d.gcScore = scoreHeading(headingError(d.gainCorrectedHeading, d.expectedHeading));
            }
            if (d.fullCorrectedHeading != null) {
                d.fullCorrectedScore = scoreHeading(headingError(d.fullCorrectedHeading, d.expectedHeading));
            }
            delete d._fieldSum;
            delete d._fieldCount;
        }

        replayData.value = data;
    }

    function headingError(actual, expected) {
        if (expected === null || expected === undefined) {
            return 0;
        }
        let diff = actual - expected;
        while (diff > 180) {
            diff -= 360;
        }
        while (diff < -180) {
            diff += 360;
        }
        return Math.abs(diff);
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
            // Approximate soft iron matrix A and hard iron bias B
            // mag_corrected = A * (mag_raw - B)
            // Diagonal = per-axis gains (from WMM regression)
            // Off-diagonal = cross-axis coupling (from covariance)
            softIronMatrix: null, // populated below if gains available
            hardIronBias: [Math.round(meanX), Math.round(meanY), Math.round(meanZ)],
        };

        // Populate soft iron matrix from per-axis gains + cross-coupling
        const gains = axisGains.value;
        if (gains && trace > 1e-10) {
            const normCovXY = covXY / trace;
            const normCovXZ = covXZ / trace;
            const normCovYZ = covYZ / trace;
            ellipsoidDiag.value.softIronMatrix = [
                [round4(gains.x), round4(normCovXY), round4(normCovXZ)],
                [round4(normCovXY), round4(gains.y), round4(normCovYZ)],
                [round4(normCovXZ), round4(normCovYZ), round4(gains.z)],
            ];
        }
    }

    function scoreHeading(errorDeg) {
        if (errorDeg < 3) {
            return "EXCELLENT";
        }
        if (errorDeg < 10) {
            return "GOOD";
        }
        if (errorDeg < 25) {
            return "POOR";
        }
        if (errorDeg < 60) {
            return "BAD";
        }
        if (errorDeg < 150) {
            return "CRITICAL";
        }
        return "FATAL";
    }

    function computeHardIronOffset() {
        calibrationOffsets.value = null;
        geoReference.value = null;

        // Only use cached geo reference (set by SensorsTab on connect or explicit Refresh GPS)
        const geo = getGeoReference();
        if (!geo) {
            return;
        }
        computeFromGeo(geo);
    }

    function computeFromGeo(geo) {
        geoReference.value = geo;
        const DEG_TO_RAD = Math.PI / 180;

        // Build expected B_world vector in NED (North, East, Down)
        const incRad = geo.inclination * DEG_TO_RAD;
        const decRad = geo.declination * DEG_TO_RAD;
        const B_total = geo.fieldStrength;
        const B_h = B_total * Math.cos(incRad);
        const B_world = [
            B_h * Math.cos(decRad), // North
            B_h * Math.sin(decRad), // East
            B_total * Math.sin(incRad), // Down
        ];

        // Single pass: scale factor, hard iron offsets, and per-axis gain sums
        let meanRawMag = 0,
            rawCount = 0;
        let sumDx = 0,
            sumDy = 0,
            sumDz = 0,
            n = 0;
        const gs = { ex: 0, ex2: 0, ax: 0, ax_ex: 0, ey: 0, ey2: 0, ay: 0, ay_ey: 0, ez: 0, ez2: 0, az: 0, az_ez: 0 };
        let gn = 0;

        forEachSample(({ body, sample, headingRef }) => {
            meanRawMag += Math.hypot(body[0], body[1], body[2]);
            rawCount++;

            const be = rotateNedToBody(B_world, sample.roll, sample.pitch, headingRef);
            sumDx += body[0] - be[0];
            sumDy += body[1] - be[1];
            sumDz += body[2] - be[2];
            n++;

            gs.ex += be[0];
            gs.ex2 += be[0] * be[0];
            gs.ax += body[0];
            gs.ax_ex += body[0] * be[0];
            gs.ey += be[1];
            gs.ey2 += be[1] * be[1];
            gs.ay += body[1];
            gs.ay_ey += body[1] * be[1];
            gs.ez += be[2];
            gs.ez2 += be[2] * be[2];
            gs.az += body[2];
            gs.az_ez += body[2] * be[2];
            gn++;
        });

        const scaleFactor = rawCount > 0 ? meanRawMag / rawCount / B_total : 1;
        // Note: B_world is used directly above (unscaled) for gain regression.
        // Only the offset computation below uses the scaled version for ADC-count compatibility.
        const B_world_scaled = [B_world[0] * scaleFactor, B_world[1] * scaleFactor, B_world[2] * scaleFactor];

        // Recompute offset sums using scaled expected field
        sumDx = 0;
        sumDy = 0;
        sumDz = 0;
        n = 0;
        forEachSample(({ body, sample, headingRef }) => {
            const be = rotateNedToBody(B_world_scaled, sample.roll, sample.pitch, headingRef);
            sumDx += body[0] - be[0];
            sumDy += body[1] - be[1];
            sumDz += body[2] - be[2];
            n++;
        });
        if (n < 30) {
            return;
        }

        calibrationOffsets.value = {
            x: Math.round(sumDx / n),
            y: Math.round(sumDy / n),
            z: Math.round(sumDz / n),
        };

        // Per-axis gain computation (sums collected in the merged pass above)
        // Raw gain = Cov(actual_counts, expected_nT) / Var(expected_nT) → units: counts/nT
        // Divide by scaleFactor to make dimensionless. Threshold Var to avoid
        // division by near-zero when heading references don't match sensor data.
        if (gn >= 30) {
            const sf = scaleFactor > 0 ? scaleFactor : 1;
            const minVarXY = 1e7;
            const minVarZ = 2e6;

            const gxVar = gs.ex2 - (gs.ex * gs.ex) / gn;
            const gyVar = gs.ey2 - (gs.ey * gs.ey) / gn;
            const gzVar = gs.ez2 - (gs.ez * gs.ez) / gn;

            const rawGainX = gxVar > minVarXY ? (gs.ax_ex - (gs.ax * gs.ex) / gn) / gxVar : sf;
            const rawGainY = gyVar > minVarXY ? (gs.ay_ey - (gs.ay * gs.ey) / gn) / gyVar : sf;
            const rawGainZ = gzVar > minVarZ ? (gs.az_ez - (gs.az * gs.ez) / gn) / gzVar : sf;

            axisGains.value = {
                x: Math.round((rawGainX / sf) * 10000) / 10000,
                y: Math.round((rawGainY / sf) * 10000) / 10000,
                z: Math.round((rawGainZ / sf) * 10000) / 10000,
            };
        }
    }

    // Rotation matrix to convert NED world frame → body frame for a given attitude
    function rotateNedToBody(B_ned, rollDeg, pitchDeg, headingDeg) {
        const roll = (-rollDeg * Math.PI) / 180;
        const pitch = (-pitchDeg * Math.PI) / 180;
        const heading = (-headingDeg * Math.PI) / 180;

        const cr = Math.cos(roll);
        const sr = Math.sin(roll);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const cy = Math.cos(heading);
        const sy = Math.sin(heading);

        // R = Rz(yaw) * Ry(pitch) * Rx(roll) in ZYX order (standard aerospace)
        const R = [
            [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
            [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
            [-sp, cp * sr, cp * cr],
        ];
        return mat3mulVec(R, B_ned);
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
                axisGains: axisGains.value ?? null,
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
        const exportData = {
            exportedAt: new Date().toISOString(),
            type: "calibration_tumble",
            samples: pts.map((s) => ({
                x: s.x,
                y: s.y,
                z: s.z,
                pitch: s.pitch,
                heading: s.heading,
                timestamp: s.timestamp,
            })),
            coverage: calibrationCoverage.value ?? { zones: {}, total: pts.length, uniform: 0 },
            ellipsoidParams: ep
                ? {
                    center: { x: ep.center.x, y: ep.center.y, z: ep.center.z },
                    W_inv: ep.W_inv,
                    radius: ep.radius,
                    residual: ep.residual,
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

    function mapPoseType(poseLabel) {
        if (poseLabel.startsWith("Flat")) {
            return "flat";
        }
        if (poseLabel.startsWith("Nose Up")) {
            return "nose_up";
        }
        if (poseLabel.startsWith("Nose Down")) {
            return "nose_down";
        }
        if (poseLabel.includes("Roll right")) {
            return "left_side";
        }
        if (poseLabel.includes("Roll left")) {
            return "right_side";
        }
        if (poseLabel.includes("Inverted")) {
            return "inverted";
        }
        return "flat";
    }

    function normalizeHeading(deg) {
        return ((deg % 360) + 360) % 360;
    }

    function signedHeadingError(actual, expected) {
        if (expected === null || expected === undefined) {
            return 0;
        }
        let diff = actual - expected;
        while (diff > 180) {
            diff -= 360;
        }
        while (diff < -180) {
            diff += 360;
        }
        return diff;
    }

    function getEulerAngles(solverResultVal) {
        if (!solverResultVal) {
            return { roll: 0, pitch: 0, yaw: 0 };
        }
        const preset = solverResultVal.alignment;
        if (preset === 9 && solverResultVal.customAngles) {
            return {
                roll: solverResultVal.customAngles.roll,
                pitch: solverResultVal.customAngles.pitch,
                yaw: solverResultVal.customAngles.yaw,
            };
        }
        if (preset >= 1 && preset <= 8 && ALIGNMENT_MATRICES[preset]) {
            const euler = matrixToEuler(ALIGNMENT_MATRICES[preset]);
            return { roll: euler.roll, pitch: euler.pitch, yaw: euler.yaw };
        }
        return { roll: 0, pitch: 0, yaw: 0 };
    }

    function exportCharacterizationData() {
        const sr = solverResult.value;
        const ep = ellipsoidParams.value;

        const json = {
            $schema: "https://betaflight.com/blackbox/mag-characterization-model/2.0",
            version: "2.0",
            ellipsoid_correction: ep
                ? {
                    center: { x: ep.center.x, y: ep.center.y, z: ep.center.z },
                    soft_iron: ep.W_inv,
                    radius: ep.radius,
                    residual_rms: ep.residual,
                }
                : null,
            geo_reference: {
                latitude_deg: fcStore.gpsData.fix ? fcStore.gpsData.latitude / 10000000 : null,
                longitude_deg: fcStore.gpsData.fix ? fcStore.gpsData.longitude / 10000000 : null,
                declination_deg: geoReference.value?.declination ?? 0,
                inclination_deg: geoReference.value?.inclination ?? 0,
                field_strength_nt: geoReference.value?.fieldStrength ?? null,
            },
            alignment:
                sr && !sr.error
                    ? {
                        preset: sr.alignment,
                        label: sr.label,
                        euler_zyx_deg: getEulerAngles(sr),
                    }
                    : null,
            axis_gains: axisGains.value ?? { x: 1.0, y: 1.0, z: 1.0 },
            hard_iron: calibrationOffsets.value ?? null,
            quality:
                sr && !sr.error
                    ? {
                        score_percent: sr.qualityScore,
                        residual_z_rms: sr.residuals?.zRms ?? 0,
                        residual_xy_rms: sr.residuals?.xyRms ?? 0,
                        field_consistency_pct: sr.fieldConsistency?.maxDevPct ?? 0,
                        chirality_flag: sr.chiralityFlag ?? false,
                    }
                    : null,
            poses: replayData.value.map((pose) => ({
                body_orientation: mapPoseType(pose.poseLabel),
                cardinal_direction: pose.dirLabel.charAt(0).toUpperCase(),
                expected_heading_deg: normalizeHeading(pose.expectedHeading),
                measured_attitude_deg: { roll: pose.roll, pitch: pose.pitch },
                heading_current_deg: normalizeHeading(pose.currentHeading),
                heading_error_current_deg: signedHeadingError(pose.currentHeading, pose.expectedHeading),
                heading_corrected_deg: normalizeHeading(pose.newHeading),
                heading_error_corrected_deg: signedHeadingError(pose.newHeading, pose.expectedHeading),
                heading_gain_corrected_deg:
                    pose.gainCorrectedHeading != null ? normalizeHeading(pose.gainCorrectedHeading) : null,
                heading_error_gain_corrected_deg:
                    pose.gainCorrectedHeading != null
                        ? signedHeadingError(pose.gainCorrectedHeading, pose.expectedHeading)
                        : null,
                heading_quality_weight: Math.max(
                    0,
                    Math.min(1, 1.0 - Math.abs(signedHeadingError(pose.newHeading, pose.expectedHeading)) / 30.0),
                ),
            })),
        };

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
                computeFromGeo(geo);
            }
        } finally {
            isFetchingGeo.value = false;
        }
    }

    function applyAndReboot() {
        if (!solverResult.value || !solverResult.value.alignment) {
            return false;
        }

        // Set alignment
        fcStore.sensorAlignment.align_mag = solverResult.value.alignment;
        if (solverResult.value.alignment === 9 && solverResult.value.customAngles) {
            fcStore.sensorAlignment.mag_align_roll = solverResult.value.customAngles.roll;
            fcStore.sensorAlignment.mag_align_pitch = solverResult.value.customAngles.pitch;
            fcStore.sensorAlignment.mag_align_yaw = solverResult.value.customAngles.yaw;
        }

        // Set calibration offsets if computed
        if (calibrationOffsets.value) {
            // Write via CLI — requires isMspCliSupported
            const cmd = `set mag_calibration = ${calibrationOffsets.value.x},${calibrationOffsets.value.y},${
                calibrationOffsets.value.z
            }`;
            // Deferred to caller — CLI needs MSPHelper context
            window.__magCharApplyCmd = cmd;
        }

        // Set declination if geo reference available
        if (geoReference.value) {
            window.__magCharDeclination = geoReference.value.declination;
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
        const gains = axisGains.value;
        const rep = replayData.value;

        let report = "";
        const sep = "============================================================\n";
        const hdr = (s) => `${s}\n${"-".repeat(s.length)}\n`;

        report += sep;
        report += "MAGNETOMETER CHARACTERIZATION REPORT\n";
        report += `${sep}\n`;

        // Location & environment
        report += hdr("LOCATION & ENVIRONMENT");
        const lat = fcStore.gpsData?.latitude ? (fcStore.gpsData.latitude / 10000000).toFixed(2) : "?";
        const lon = fcStore.gpsData?.longitude ? (fcStore.gpsData.longitude / 10000000).toFixed(2) : "?";
        report += `  Coordinates:      ${lat}N, ${lon}W\n`;
        if (geo) {
            report += `  Total field |B|:  ${geo.fieldStrength} nT\n`;
            report += `  Inclination:      ${geo.inclination.toFixed(1)}\u00B0\n`;
            report += `  Declination:      ${geo.declination.toFixed(1)}\u00B0\n`;
        } else {
            report += "  Geo reference:    not available (use Refresh GPS)\n";
        }
        report += `  WMM source:       ${geo ? "GPS / IP geolocation" : "none"}\n`;
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
            report += "  \u26A0 I2C bus errors detected \u2014 possible electrical issue or wrong address";
        } else if (i2cErr === 0) {
            report += "  (clean)";
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
            report += "  \u26A0 MISMATCH \u2014 configured mag differs from auto-detected hardware\n";
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
            if (rangeRatio > 1.5) {
                report += "  \u26A0 AXIS MISMATCH \u2014 sensor axes have different sensitivity or are swapped.\n";
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
                        report += "  \u2717 DRIVER ISSUE: Horizontal field magnitude changes significantly\n";
                        report += "    between North and East headings. The driver may read registers\n";
                        report += "    in the wrong axis order for this chip variant.\n";
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
            report += "  (hard iron offset in raw ADC counts)\n";
            report += "\n";
        }

        // Calibration - future firmware
        if (gains && (Math.abs(gains.x - 1) > 0.02 || Math.abs(gains.y - 1) > 0.02 || Math.abs(gains.z - 1) > 0.02)) {
            report += hdr("CALIBRATION (FUTURE FIRMWARE - NOT YET SUPPORTED)");
            report += `  Per-axis gain:    X=${gains.x.toFixed(2)} Y=${gains.y.toFixed(2)} Z=${gains.z.toFixed(2)}\n`;
            if (Math.abs(gains.y - 1) > 0.05) {
                report += "  NOTE: Y-axis gain differs from 1.0 by >5%. This indicates asymmetric\n";
                report += "  sensor sensitivity. The chip may have a 2x gain difference on the Y axis.\n";
                report += "  Correcting this requires firmware support for mag_gain parameters.\n";
                report += "  (Add mag_gain_x/y/z CLI params, apply per-axis multiply after alignment.)\n";
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
            const countBad = rep.filter((p) => headingError(p.currentHeading, p.expectedHeading) > 5).length;
            const countGood = rep.filter((p) => headingError(p.newHeading, p.expectedHeading) <= 5).length;
            report += hdr("PERFORMANCE EVALUATION");
            report += `  Current mean error:  ${(sumCurErr / nErr).toFixed(1)}\u00B0 (${countBad}/${nErr} poses out of spec)\n`;
            report += `  Proposed mean error: ${(sumNewErr / nErr).toFixed(1)}\u00B0 (${countGood}/${nErr} poses within spec)\n`;
            if (sumNewErr / nErr < 5 && sumCurErr / nErr > 10) {
                report += "  CONCLUSION: Apply the proposed alignment. It reduces mean heading\n";
                report += `  error from ${(sumCurErr / nErr).toFixed(1)}\u00B0 to ${(sumNewErr / nErr).toFixed(1)}\u00B0 across all ${nErr} test poses.\n`;
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
                report += "  Driver diagnostic: SUSPECT — sensor field direction does not follow drone rotation.\n";
                report += "    Possible causes: wrong chip variant (QMC5883 vs HMC5883), wrong register mapping.\n";
                report += "    The mag readings do not change direction as the drone rotates.\n";
                report +=
                    "    Verify the driver reads registers in X\u2192Y\u2192Z order for QMC5883L 'HA588' variants.\n";
            }
            report += `  Condition \u03BA:       ${ed.conditionNumber.toFixed(2)}`;
            if (ed.conditionNumber > 1.15) {
                report += " \u2192 ASYMMETRIC (hardware defect)\n";
                report += `    Per-axis RMS: X=${ed.axisRms.x} Y=${ed.axisRms.y} Z=${ed.axisRms.z}\n`;
                report += "    HARDWARE DEFECT: Sensor axes have mismatched sensitivity.\n";
                report += `    Ratio max/min = ${ed.conditionNumber.toFixed(1)}x. Per-axis gain calibration required.\n`;
                report += "    NOT supported by current Betaflight firmware.\n";
            } else {
                report += " \u2192 ISOTROPIC (healthy)\n";
            }
            report += `  Off-diag coupling: ${ed.offDiagonalRms.toFixed(4)}`;
            if (ed.offDiagonalRms > 0.05) {
                report += " \u2192 SKEWED (mounting issue)\n";
                report += "    MOUNTING ISSUE: Cross-axis coupling detected.\n";
                report += "    Sensor module may be physically twisted or tilted.\n";
            } else {
                report += " \u2192 ORTHOGONAL (correctly mounted)\n";
            }
            if (ed.softIronMatrix) {
                report += "\n";
                report += "  Soft iron matrix A (3\u00D73):\n";
                report += `    [${ed.softIronMatrix[0].map((v) => v.toFixed(4)).join(", ")}]\n`;
                report += `    [${ed.softIronMatrix[1].map((v) => v.toFixed(4)).join(", ")}]\n`;
                report += `    [${ed.softIronMatrix[2].map((v) => v.toFixed(4)).join(", ")}]\n`;
                report += `  Hard iron bias B: [${ed.hardIronBias.join(", ")}]\n`;
                report += "  Transform: mag_corrected = A \u00D7 (mag_raw \u2212 B)\n";
                report += "  Apply before alignment rotation. Requires firmware 3\u00D73 matrix support.\n";
            }
            if (
                fieldClean &&
                ed.chirality === "right-handed" &&
                ed.conditionNumber < 1.15 &&
                ed.offDiagonalRms < 0.05
            ) {
                report += "\n  VERDICT: HEALTHY \u2014 hardware and driver are correct.\n";
            } else {
                report += "\n  VERDICT: Investigation needed \u2014 see above diagnostics.\n";
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
        axisGains,
        geoReference,
        isFetchingGeo,
        ellipsoidParams,
        calibrationSamples,
        calibrationSampleCount,
        calibrationCoverage,
        // Computed
        currentDirection,
        currentPoseDef,
        completedPoseCount,
        // Actions
        setCallbacks,
        startWizard,
        cancelWizard,
        skipPose,
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
        refreshGeoReference,
        applyAndReboot,
        generateDetailedReport,
        detailedReport,
        ellipsoidDiag,
    };
}
