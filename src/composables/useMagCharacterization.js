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
        heading: -Math.PI / 2,
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
        heading: Math.PI / 2,
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

        if (onWizardStarted) {
            onWizardStarted();
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
                const curMags = [0, 0, 0];
                const newMags = [0, 0, 0];
                let curSin = 0;
                let curCos = 0;
                let newSin = 0;
                let newCos = 0;
                let n = 0;

                for (const s of cap.samples) {
                    sumRoll += s.roll;
                    sumPitch += s.pitch;
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

                    n++;
                }

                const curHeading = Math.atan2(curSin, curCos) * RAD_TO_DEG;
                const newHeading = Math.atan2(newSin, newCos) * RAD_TO_DEG;
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
                });
            }
        }

        replayData.value = data;
    }

    function cancelWizard() {
        cleanupTimer();
        if (onSolverAboutToRun) {
            onSolverAboutToRun();
        } // dispose 3D
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

    function finishReplay() {
        phase.value = "complete";
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
        downloadSamplesJSON,
        finishReplay,
    };
}
