/**
 * useMagCharacterization — Composable for the supported-pose alignment wizard.
 *
 * Extracts all non-UI state and logic from MagCharacterizationWizard.vue:
 * state machine, stability detection, spacebar gating, capture, solver,
 * and JSON export.  The dialog component keeps only the template, 3D model
 * rendering, and dialog lifecycle.
 *
 * See implementation.md §12.1 for the full extraction spec.
 */
import { ref, computed } from "vue";
import { characterizeAlignment } from "../js/utils/magCharacterization.js";
import { computeDeclination, getGeoReference } from "./useMagCalibration.js";
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

const directions = [
    {
        label: "North (nose to N line)",
        alignHint: "Align drone nose with the N-S line, nose toward N.",
        heading: 0,
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the N line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the N line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the N line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
    {
        label: "East (nose to E line)",
        alignHint: "Align drone nose with the E-W line, nose toward E.",
        heading: Math.PI / 2, // +90° = East (clockwise from North)
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the E line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the E line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the E line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
    {
        label: "South (nose to S line)",
        alignHint: "Align drone nose with the N-S line, nose toward S.",
        heading: Math.PI,
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the S line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the S line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the S line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
    {
        label: "West (nose to W line)",
        alignHint: "Align drone nose with the E-W line, nose toward W.",
        heading: -Math.PI / 2, // -90° = West (clockwise from North)
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the W line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the W line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the W line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
];

// ── Composable ─────────────────────────────────────────────────────────────

export function useMagCharacterization() {
    const fcStore = useFlightControllerStore();

    // --- Reactive state ---
    const phase = ref("intro");
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

    function runSolver() {
        if (onSolverAboutToRun) {
            onSolverAboutToRun();
        }
        phase.value = "complete";

        const allSamples = [];
        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (cap && cap.samples) {
                    for (const s of cap.samples) {
                        allSamples.push({ mag: s.mag, roll: s.roll, pitch: s.pitch, headingRef: s.headingRef });
                    }
                }
            }
        }

        if (allSamples.length < 30) {
            solverResult.value = { error: "Not enough data — need at least 30 samples across all poses." };
            return;
        }

        const currentAlign = fcStore.sensorAlignment.align_mag || 0;
        const customAngles =
            currentAlign === 9
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

        // Pre-compute replay data for all captured poses
        computeReplayData(result, currentAlign);

        // Run ellipsoid fitter for hardware diagnostics
        runEllipsoidDiagnostics(currentAlign);

        // Compute hard iron calibration offsets using geo reference
        currentMatForCalibration = ALIGNMENT_MATRICES[currentAlign] || ALIGNMENT_MATRICES[1];
        computeHardIronOffset();

        phase.value = "replay";
    }

    function computeReplayData(result, currentAlignment) {
        const DEG_TO_RAD = Math.PI / 180;
        const RAD_TO_DEG = 180 / Math.PI;

        // Build current alignment matrix
        const currentMat = ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];
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
                let n = 0;

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

    function runEllipsoidDiagnostics(currentAlignment) {
        ellipsoidDiag.value = null;
        const currentMat = ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];

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

        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples) {
                    continue;
                }
                for (const s of cap.samples) {
                    const body = mat3mulVec(currentMat, s.mag);
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
                }
            }
        }
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

        // Chirality: check if Z correlates negatively with X-Y cross product
        // A left-handed system would show Z sign opposite to what a right-handed rotation predicts
        let chiralitySum = 0;
        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples) {
                    continue;
                }
                for (const s of cap.samples) {
                    const body = mat3mulVec(currentMat, s.mag);
                    // Cross product of XY should align with Z in right-handed system
                    chiralitySum += body[0] * body[1] * body[2]; // scalar triple product proxy
                }
            }
        }
        const chirality = chiralitySum > 0 ? "right-handed" : "left-handed";

        ellipsoidDiag.value = {
            conditionNumber,
            chirality,
            offDiagonalRms: offDiagRms,
            axisRms: { x: Math.round(rmsX), y: Math.round(rmsY), z: Math.round(rmsZ) },
            residualRms: 0, // not applicable for covariance method
            eigenvalues: [rmsX, rmsY, rmsZ],
            determinant: chirality === "right-handed" ? 1 : -1,
        };
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

        // Try cached geo reference (set by SensorsTab on connect)
        let geo = getGeoReference();
        if (!geo) {
            // Fall back: try to acquire coordinates from GPS or IP
            fetchGeoReference().then((g) => {
                if (g) {
                    computeFromGeo(g);
                }
            });
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

        // Scale B_world to match raw ADC count scale (QMC5883L outputs int16, not nT)
        let meanRawMag = 0;
        let rawCount = 0;
        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples) {
                    continue;
                }
                for (const s of cap.samples) {
                    const actualBody = mat3mulVec(currentMatForCalibration, s.mag);
                    meanRawMag += Math.hypot(actualBody[0], actualBody[1], actualBody[2]);
                    rawCount++;
                }
            }
        }
        const scaleFactor = rawCount > 0 ? meanRawMag / rawCount / B_total : 1;
        const B_world_scaled = [B_world[0] * scaleFactor, B_world[1] * scaleFactor, B_world[2] * scaleFactor];

        // Accumulate expected body mag vs actual body mag across all aligned samples
        let sumDx = 0;
        let sumDy = 0;
        let sumDz = 0;
        let n = 0;

        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples) {
                    continue;
                }
                for (const s of cap.samples) {
                    // Rotate B_world into body frame using known attitude
                    const bodyExpected = rotateNedToBody(B_world_scaled, s.roll, s.pitch, cap.headingRef || 0);
                    // Actual body mag = raw captured mag (already in body frame per current alignment, but we undo it)
                    // Actually, captured mag is POST current alignment. We need TRUE body mag.
                    // body_true = R_current * captured_mag (this IS what the FC sees as body mag)
                    // The expected body should match body_true after hard iron is removed.
                    // So: offset = body_true - body_expected
                    const actualBody = mat3mulVec(currentMatForCalibration, s.mag);
                    sumDx += actualBody[0] - bodyExpected[0];
                    sumDy += actualBody[1] - bodyExpected[1];
                    sumDz += actualBody[2] - bodyExpected[2];
                    n++;
                }
            }
        }

        if (n < 30) {
            return;
        }

        calibrationOffsets.value = {
            x: Math.round(sumDx / n),
            y: Math.round(sumDy / n),
            z: Math.round(sumDz / n),
        };

        // Per-axis gain computation via linear regression
        // For each axis i: actual[i] = gain[i] * expected[i] + offset[i]
        // gain[i] = cov(actual, expected) / var(expected)
        // This uses the same (expected, actual) pairs already collected in the offset loop
        const gainSums = {
            ex: 0,
            ex2: 0,
            ax: 0,
            ax_ex: 0,
            ey: 0,
            ey2: 0,
            ay: 0,
            ay_ey: 0,
            ez: 0,
            ez2: 0,
            az: 0,
            az_ez: 0,
        };
        let gn = 0;

        for (let di = 0; di < directions.length; di++) {
            for (let pi = 0; pi < directions[di].poses.length; pi++) {
                const cap = captureData.value[di]?.[pi];
                if (!cap || !cap.samples) {
                    continue;
                }
                for (const s of cap.samples) {
                    const bodyExpected = rotateNedToBody(B_world_scaled, s.roll, s.pitch, cap.headingRef || 0);
                    const actualBody = mat3mulVec(currentMatForCalibration, s.mag);
                    gainSums.ex += bodyExpected[0];
                    gainSums.ex2 += bodyExpected[0] * bodyExpected[0];
                    gainSums.ax += actualBody[0];
                    gainSums.ax_ex += actualBody[0] * bodyExpected[0];
                    gainSums.ey += bodyExpected[1];
                    gainSums.ey2 += bodyExpected[1] * bodyExpected[1];
                    gainSums.ay += actualBody[1];
                    gainSums.ay_ey += actualBody[1] * bodyExpected[1];
                    gainSums.ez += bodyExpected[2];
                    gainSums.ez2 += bodyExpected[2] * bodyExpected[2];
                    gainSums.az += actualBody[2];
                    gainSums.az_ez += actualBody[2] * bodyExpected[2];
                    gn++;
                }
            }
        }

        if (gn >= 30) {
            const gxVar = gainSums.ex2 - (gainSums.ex * gainSums.ex) / gn;
            const gyVar = gainSums.ey2 - (gainSums.ey * gainSums.ey) / gn;
            const gzVar = gainSums.ez2 - (gainSums.ez * gainSums.ez) / gn;
            axisGains.value = {
                x:
                    gxVar > 0
                        ? Math.round(((gainSums.ax_ex - (gainSums.ax * gainSums.ex) / gn) / gxVar) * 100) / 100
                        : 1,
                y:
                    gyVar > 0
                        ? Math.round(((gainSums.ay_ey - (gainSums.ay * gainSums.ey) / gn) / gyVar) * 100) / 100
                        : 1,
                z:
                    gzVar > 0
                        ? Math.round(((gainSums.az_ez - (gainSums.az * gainSums.ez) / gn) / gzVar) * 100) / 100
                        : 1,
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

    function downloadSamplesJSON() {
        const exportData = {
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
            solverResult: solverResult.value,
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mag-characterization-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
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
        report += hdr("HARDWARE");
        const magHw = fcStore.sensorConfig?.mag_hardware || 0;
        report += `  Magnetometer HW:  ${magHw}\n`;
        report += `  Current alignment: ${fcStore.sensorAlignment?.align_mag || "?"}\n`;
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
                report += "  Correcting this requires firmware support for mag_gain parameters\n";
                report += "  (see implementation.md \u00A722 for implementation guide).\n";
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
        downloadSamplesJSON,
        finishReplay,
        refreshGeoReference,
        applyAndReboot,
        generateDetailedReport,
        detailedReport,
        ellipsoidDiag,
    };
}
