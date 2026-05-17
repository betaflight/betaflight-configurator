import { ref, computed, shallowRef, triggerRef, onScopeDispose } from "vue";
import geomagnetism from "geomagnetism";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { useFlightControllerStore } from "../stores/fc";
import { fitSphere, computeCoverage } from "../js/utils/sphereFit";
import { send as cliSend, isMspCliSupported, saveAndReconnect } from "./useMspCliSession";

const POLL_INTERVAL_MS = 100;
const MONITOR_INTERVAL_MS = 1000;
const SPHERE_FIT_EVERY_N = 10;
const ARMING_DISABLE_BIT_CALIBRATING = 12;
const NO_MOVEMENT_TIMEOUT_MS = 30000;
const MOVEMENT_THRESHOLD = 5;
const PROGRESS_TARGET_SAMPLES = 300;

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
    if (fit.residual < 80 && cov.uniform > 0.4) {
        return "good";
    }
    if (fit.residual < 150) {
        return "fair";
    }
    return "poor";
}

/**
 * Composable managing the magnetometer calibration lifecycle.
 * Triggers firmware calibration via MSP, polls raw IMU data,
 * performs client-side sphere fitting for visualization, and
 * tracks coverage across 6 orientation zones.
 */
async function readFirmwareOffsets() {
    if (!isMspCliSupported()) {
        return null;
    }
    try {
        const lines = await cliSend("get mag_calibration");
        for (const line of lines) {
            const match = line.match(/mag_calibration\s*=\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/);
            if (match) {
                return {
                    x: Number.parseInt(match[1], 10),
                    y: Number.parseInt(match[2], 10),
                    z: Number.parseInt(match[3], 10),
                };
            }
        }
    } catch {
        // CLI not available or timed out — non-critical
    }
    return null;
}

export function useMagCalibration() {
    const fcStore = useFlightControllerStore();

    // --- Reactive state ---
    const phase = ref("idle"); // 'idle' | 'waiting' | 'collecting' | 'complete' | 'error'
    const mode = ref("quick"); // 'quick' | 'guided'
    const samples = shallowRef([]);
    const sphereFitResult = ref(null);
    const coverage = ref(null);
    const quality = ref(null);
    const progress = ref(0);
    const statusMessage = ref("");

    const sampleCount = computed(() => samples.value.length);

    const firmwareDone = ref(false);

    // Live mag reading (updated every IMU poll)
    const liveMag = ref({ x: 0, y: 0, z: 0 });
    const liveFieldStrength = computed(() => Math.round(Math.hypot(liveMag.value.x, liveMag.value.y, liveMag.value.z)));

    // Firmware calibration offsets read via CLI
    const firmwareOffsets = ref(null); // { x, y, z } or null

    // --- Internal state (non-reactive) ---
    let dataInterval = null;
    let monitorInterval = null;
    let samplesSinceLastFit = 0;
    let lastMovementTime = 0;
    let lastMag = null;
    let firmwareFlagSeen = false;
    let guidedOffsets = null; // offsets to add back in guided mode

    async function startCalibration(calMode = "quick") {
        if (phase.value !== "idle") {
            return; // concurrent calibration guard
        }

        cleanup();
        // Reset state
        mode.value = calMode;
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        progress.value = 0;
        samplesSinceLastFit = 0;
        lastMovementTime = Date.now();
        lastMag = null;
        firmwareDone.value = false;
        firmwareFlagSeen = false;
        guidedOffsets = null;

        // Read current firmware offsets before calibration starts
        firmwareOffsets.value = await readFirmwareOffsets();

        if (calMode === "guided") {
            // Guided mode: store offsets for raw reconstruction, skip firmware trigger
            guidedOffsets = firmwareOffsets.value ?? { x: 0, y: 0, z: 0 };
            phase.value = "collecting";
            statusMessage.value = "magCalibrationCollecting";
            startDataPolling();
        } else {
            // Quick mode: trigger firmware calibration
            phase.value = "waiting";
            statusMessage.value = "magCalibrationWaiting";
            MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false);
            startDataPolling();
            startCompletionMonitor();
        }
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

                if (flagSet) {
                    firmwareFlagSeen = true;
                }

                if (phase.value === "waiting" && flagSet) {
                    phase.value = "collecting";
                    statusMessage.value = "magCalibrationCollecting";
                }

                // Track when firmware finishes (flag was set, now cleared)
                if (!firmwareDone.value && firmwareFlagSeen && !flagSet) {
                    firmwareDone.value = true;
                }
            });
        }, MONITOR_INTERVAL_MS);
    }

    function onImuData() {
        let mx = fcStore.sensorData.magnetometer[0];
        let my = fcStore.sensorData.magnetometer[1];
        let mz = fcStore.sensorData.magnetometer[2];

        // Skip zero readings (no data)
        if (mx === 0 && my === 0 && mz === 0) {
            return;
        }

        // In guided mode, reconstruct raw samples by adding back firmware offsets
        if (mode.value === "guided" && guidedOffsets) {
            mx += guidedOffsets.x;
            my += guidedOffsets.y;
            mz += guidedOffsets.z;
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
        liveMag.value = { x: mx, y: my, z: mz };

        // Transition from waiting to collecting on first real sample
        if (phase.value === "waiting") {
            phase.value = "collecting";
            statusMessage.value = "magCalibrationCollecting";
        }

        samples.value.push({ x: mx, y: my, z: mz, timestamp: Date.now() });
        triggerRef(samples);

        samplesSinceLastFit++;
        if (samplesSinceLastFit >= SPHERE_FIT_EVERY_N) {
            updateAnalysis();
            samplesSinceLastFit = 0;
        }

        // Update progress (rough estimate based on sample count, capped at 95 until firmware signals done)
        progress.value = Math.min(95, Math.round((samples.value.length / PROGRESS_TARGET_SAMPLES) * 100));
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

    async function completeCalibration() {
        cleanup();
        progress.value = 100;
        phase.value = "complete";
        statusMessage.value = "magCalibrationComplete";
        updateAnalysis();

        // Re-read firmware offsets after calibration to show actual result
        const newOffsets = await readFirmwareOffsets();
        if (newOffsets) {
            firmwareOffsets.value = newOffsets;
        }
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
        guidedOffsets = null;
    }

    async function acceptCalibration() {
        const fit = sphereFitResult.value;
        if (!fit) {
            return { ok: false, error: "No sphere fit result" };
        }
        const { x, y, z } = fit.center;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return { ok: false, error: "Invalid calibration offsets" };
        }
        try {
            cleanup();
            await cliSend(`set mag_calibration = ${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
            const result = await saveAndReconnect();
            phase.value = "complete";
            statusMessage.value = "magCalibrationComplete";
            progress.value = 100;
            return result;
        } catch (error) {
            // Restart polling so the user can retry without losing samples
            startDataPolling();
            phase.value = "collecting";
            statusMessage.value = "magCalibrationError";
            return { ok: false, error };
        }
    }

    function discardCalibration() {
        cleanup();
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        progress.value = 0;
        phase.value = "idle";
        statusMessage.value = "";
        guidedOffsets = null;
    }

    return {
        // State
        phase,
        mode,
        samples,
        sphereFitResult,
        coverage,
        quality,
        progress,
        statusMessage,
        sampleCount,
        firmwareDone,
        liveMag,
        liveFieldStrength,
        firmwareOffsets,

        // Actions
        startCalibration,
        cancelCalibration,
        completeCalibration,
        acceptCalibration,
        discardCalibration,
        cleanup,
        retry,
        readFirmwareOffsets,
    };
}

/**
 * Compute magnetic declination and inclination from GPS coordinates
 * using the World Magnetic Model via the geomagnetism package.
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @returns {{ declination: number, inclination: number, fieldStrength: number }}
 */
let lastGeoReference = null;

export function computeDeclination(lat, lon) {
    try {
        const info = geomagnetism.model().point([lat, lon]);
        const result = { declination: info.decl, inclination: info.incl, fieldStrength: Math.round(info.f) };
        lastGeoReference = result;
        return result;
    } catch {
        return null;
    }
}

export function getGeoReference() {
    return lastGeoReference;
}
