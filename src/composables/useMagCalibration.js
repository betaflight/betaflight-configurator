import { ref, computed, shallowRef, onScopeDispose } from "vue";
import geomagnetism from "geomagnetism";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { useFlightControllerStore } from "../stores/fc";
import { fitSphere, computeCoverage } from "../js/utils/sphereFit";

const POLL_INTERVAL_MS = 100;
const MONITOR_INTERVAL_MS = 1000;
const SPHERE_FIT_EVERY_N = 10;
const ARMING_DISABLE_BIT_CALIBRATING = 12;
const NO_MOVEMENT_TIMEOUT_MS = 30000;
const MOVEMENT_THRESHOLD = 5;

/**
 * Composable managing the magnetometer calibration lifecycle.
 * Triggers firmware calibration via MSP, polls raw IMU data,
 * performs client-side sphere fitting for visualization, and
 * tracks coverage across 6 orientation zones.
 */
export function useMagCalibration() {
    const fcStore = useFlightControllerStore();

    // --- Reactive state ---
    const phase = ref("idle"); // 'idle' | 'waiting' | 'collecting' | 'complete' | 'error'
    const samples = shallowRef([]);
    const sphereFitResult = ref(null);
    const coverage = ref(null);
    const quality = ref(null);
    const progress = ref(0);
    const statusMessage = ref("");

    const sampleCount = computed(() => samples.value.length);

    const firmwareDone = ref(false);

    // --- Internal state (non-reactive) ---
    let dataInterval = null;
    let monitorInterval = null;
    let monitorCycles = 0;
    let samplesSinceLastFit = 0;
    let lastMovementTime = 0;
    let lastMag = null;

    // --- Actions ---

    function startCalibration() {
        // Reset state
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        progress.value = 0;
        monitorCycles = 0;
        samplesSinceLastFit = 0;
        lastMovementTime = Date.now();
        lastMag = null;
        firmwareDone.value = false;

        phase.value = "waiting";
        statusMessage.value = "magCalibrationWaiting";

        // Trigger firmware calibration and start polling immediately
        MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false);
        startDataPolling();
        startCompletionMonitor();
    }

    function cancelCalibration() {
        cleanup();
        phase.value = "idle";
        statusMessage.value = "";
    }

    function cleanup() {
        if (dataInterval !== null) {
            clearInterval(dataInterval);
            dataInterval = null;
        }
        if (monitorInterval !== null) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
    }

    onScopeDispose(cleanup);

    // --- Internal ---

    function startDataPolling() {
        dataInterval = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, onImuData);
        }, POLL_INTERVAL_MS);
    }

    function startCompletionMonitor() {
        monitorInterval = setInterval(() => {
            monitorCycles++;

            // No-movement timeout
            if (phase.value === "collecting" && Date.now() - lastMovementTime > NO_MOVEMENT_TIMEOUT_MS) {
                cleanup();
                phase.value = "error";
                statusMessage.value = "magCalibrationNoMovement";
                return;
            }

            // Poll MSP_STATUS_EX to track firmware calibration state
            MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false, () => {
                const flagSet = (fcStore.config.armingDisableFlags & (1 << ARMING_DISABLE_BIT_CALIBRATING)) !== 0;

                if (phase.value === "waiting" && flagSet) {
                    phase.value = "collecting";
                    statusMessage.value = "magCalibrationCollecting";
                }

                // Track when firmware finishes (flag clears after being set)
                if (!firmwareDone.value && !flagSet && monitorCycles > 5) {
                    firmwareDone.value = true;
                }
            });
        }, MONITOR_INTERVAL_MS);
    }

    function onImuData() {
        const mx = fcStore.sensorData.magnetometer[0];
        const my = fcStore.sensorData.magnetometer[1];
        const mz = fcStore.sensorData.magnetometer[2];

        // Skip zero readings (no data)
        if (mx === 0 && my === 0 && mz === 0) {
            return;
        }

        // Track movement for stale-data timeout
        if (
            lastMag === null ||
            Math.abs(mx - lastMag.x) > MOVEMENT_THRESHOLD ||
            Math.abs(my - lastMag.y) > MOVEMENT_THRESHOLD ||
            Math.abs(mz - lastMag.z) > MOVEMENT_THRESHOLD
        ) {
            lastMovementTime = Date.now();
        }
        lastMag = { x: mx, y: my, z: mz };

        // Transition from waiting to collecting on first real sample
        if (phase.value === "waiting") {
            phase.value = "collecting";
            statusMessage.value = "magCalibrationCollecting";
        }

        // Append sample (create new array for reactivity)
        const newSamples = [...samples.value, { x: mx, y: my, z: mz, timestamp: Date.now() }];
        samples.value = newSamples;

        samplesSinceLastFit++;
        if (samplesSinceLastFit >= SPHERE_FIT_EVERY_N) {
            updateAnalysis();
            samplesSinceLastFit = 0;
        }

        // Update progress (rough estimate based on sample count, capped at 95 until firmware signals done)
        progress.value = Math.min(95, Math.round((newSamples.length / 300) * 100));
    }

    function updateAnalysis() {
        const pts = samples.value;
        if (pts.length < 10) {
            return;
        }

        const fit = fitSphere(pts);
        // Use sphere center for coverage when available, otherwise fall back to centroid
        const center = fit ? fit.center : centroid(pts);
        const cov = computeCoverage(pts, center);
        coverage.value = cov;

        if (fit) {
            sphereFitResult.value = fit;
            quality.value = computeQuality(fit, cov);
        }
    }

    function centroid(pts) {
        let sx = 0,
            sy = 0,
            sz = 0;
        for (const p of pts) {
            sx += p.x;
            sy += p.y;
            sz += p.z;
        }
        const n = pts.length;
        return { x: sx / n, y: sy / n, z: sz / n };
    }

    function computeQuality(fit, cov) {
        if (!fit || !cov) {
            return null;
        }
        if (fit.residual < 50 && cov.uniform > 0.6) {
            return "good";
        }
        if (fit.residual < 100) {
            return "fair";
        }
        return "poor";
    }

    function completeCalibration() {
        cleanup();
        progress.value = 100;
        phase.value = "complete";
        statusMessage.value = "magCalibrationComplete";
        updateAnalysis();
    }

    function retry() {
        phase.value = "idle";
        statusMessage.value = "";
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        progress.value = 0;
        firmwareDone.value = false;
    }

    return {
        // State
        phase,
        samples,
        sphereFitResult,
        coverage,
        quality,
        progress,
        statusMessage,
        sampleCount,
        firmwareDone,

        // Actions
        startCalibration,
        cancelCalibration,
        completeCalibration,
        cleanup,
        retry,
    };
}

/**
 * Compute magnetic declination and inclination from GPS coordinates
 * using the World Magnetic Model via the geomagnetism package.
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @returns {{ declination: number, inclination: number }}
 */
const geoModel = geomagnetism.model();

export function computeDeclination(lat, lon) {
    try {
        const info = geoModel.point([lat, lon]);
        return { declination: info.decl, inclination: info.incl };
    } catch {
        return { declination: 0, inclination: 0 };
    }
}
