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

import { ref, computed, shallowRef, triggerRef, onScopeDispose } from "vue";
import geomagnetism from "geomagnetism";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { useFlightControllerStore } from "../stores/fc";
import { fitSphere, computeDirectionalCoverage } from "../js/utils/sphereFit";
import { bit_check } from "../js/bit";
import { send as cliSend, isMspCliSupported } from "./useMspCliSession";

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** One magnetometer reading with the attitude it was taken at (degrees). */
export interface MagSample extends Vec3 {
    roll: number;
    pitch: number;
    heading: number;
    timestamp: number;
}

export type MagCalibrationPhase = "idle" | "waiting" | "collecting" | "complete" | "error";
export type MagCalibrationMode = "full" | "quick" | "check";
export type MagCalibrationQuality = "good" | "fair" | "poor";

export interface GeoReference {
    declination: number;
    inclination: number;
    fieldStrength: number;
}

export type WriteCalResult = { ok: true } | { ok: false; error: unknown };

const POLL_INTERVAL_MS = 100;
const MONITOR_INTERVAL_MS = 1000;
const SPHERE_FIT_EVERY_N = 10;
const ARMING_DISABLE_BIT_CALIBRATING = 12;
const NO_MOVEMENT_TIMEOUT_MS = 30000;
const FIRMWARE_CAL_DURATION_S = 30;
const MOVEMENT_THRESHOLD = 5;
const PROGRESS_TARGET_SAMPLES = 300;
const MAG_CAL_MIN = -32768;
const MAG_CAL_MAX = 32767;

// Full-mode quality thresholds use the 20 plotted attitude-direction zones.
const FULL_COVERAGE_GOOD = 0.8;
const FULL_COVERAGE_FAIR = 0.5;

function coverageQuality(fraction: number): MagCalibrationQuality {
    if (fraction >= FULL_COVERAGE_GOOD) {
        return "good";
    }
    if (fraction >= FULL_COVERAGE_FAIR) {
        return "fair";
    }
    return "poor";
}

function centroid(points: Vec3[]): Vec3 {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        sx += points[i].x;
        sy += points[i].y;
        sz += points[i].z;
    }
    return { x: sx / n, y: sy / n, z: sz / n };
}

function computeAttitudeCoverage(samples: MagSample[]) {
    // Match MagSphereView's plotted nose directions in the NED scene. Roll
    // turns the aircraft around its nose, so only pitch and heading set this
    // direction. The raw-mag 3D coverage check still runs before the solve.
    const directions = samples.map((sample) => {
        const pitch = (sample.pitch * Math.PI) / 180;
        const heading = (sample.heading * Math.PI) / 180;
        const cosPitch = Math.cos(pitch);
        return {
            x: cosPitch * Math.cos(heading),
            y: cosPitch * Math.sin(heading),
            z: Math.sin(pitch),
        };
    });

    return computeDirectionalCoverage(directions, { x: 0, y: 0, z: 0 });
}

async function readFirmwareOffsets(): Promise<Vec3 | null> {
    if (!isMspCliSupported()) {
        return null;
    }
    try {
        // send() (still JS) resolves Promise<unknown>; it always resolves an array of lines.
        const lines = await cliSend("get mag_calibration");
        if (!Array.isArray(lines)) {
            return null;
        }
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

/**
 * Composable managing the magnetometer calibration lifecycle.
 * Supports full 9-DOF characterization with 20-zone icosahedral coverage,
 * legacy onboard 30s firmware calibration via MSP, and read-only check mode.
 */
export function useMagCalibration() {
    const fcStore = useFlightControllerStore();

    // --- Reactive state ---
    const phase = ref<MagCalibrationPhase>("idle");
    const mode = ref<MagCalibrationMode>("full");
    const samples = shallowRef<MagSample[]>([]);
    const sphereFitResult = ref<ReturnType<typeof fitSphere>>(null);
    const coverage = ref<ReturnType<typeof computeDirectionalCoverage> | null>(null);
    const quality = ref<MagCalibrationQuality | null>(null);
    const qualityScore = ref(0);
    const progress = ref(0);
    const statusMessage = ref("");

    const sampleCount = computed(() => samples.value.length);

    const firmwareDone = ref(false);
    const firmwareSecondsRemaining = ref(-1);

    // Live mag reading (updated every IMU poll)
    const liveMag = ref({ x: 0, y: 0, z: 0 });
    const liveFieldStrength = computed(() => Math.round(Math.hypot(liveMag.value.x, liveMag.value.y, liveMag.value.z)));

    // Firmware calibration offsets read via CLI
    const firmwareOffsets = ref<Vec3 | null>(null);

    // --- Internal state (non-reactive) ---
    let dataInterval: ReturnType<typeof setInterval> | null = null;
    let monitorInterval: ReturnType<typeof setInterval> | null = null;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;
    let firmwareCollectingStartTime = 0;
    let samplesSinceLastFit = 0;
    let lastMovementTime = 0;
    let lastMag: Vec3 | null = null;
    let firmwareFlagSeen = false;
    let reconstructionOffsets: Vec3 | null = null; // firmware offsets to add back in full mode for raw sensor reconstruction
    let starting = false;
    // Bumped by every teardown path. startCalibration() captures it before awaiting the
    // CLI offset read and re-checks after, so a cancel/retry/discard/unmount during that
    // await cannot resurrect the phase and start polling on a session the user abandoned.
    let startSequence = 0;

    /**
     * Start a calibration session.
     * @param calMode - Calibration mode:
     *   'full' (default): reconstructs raw samples and tracks 20-zone coverage of the plotted attitude sweep.
     *   'quick': triggers the FC onboard 30s min/max routine (legacy).
     *   'check': real-time validation without altering calibration.
     */
    async function startCalibration(calMode: MagCalibrationMode = "full") {
        if (phase.value !== "idle" || starting) {
            return;
        }

        starting = true;
        const startToken = ++startSequence;
        try {
            cleanup();
            mode.value = calMode;
            samples.value = [];
            sphereFitResult.value = null;
            coverage.value = null;
            quality.value = null;
            qualityScore.value = 0;
            progress.value = 0;
            samplesSinceLastFit = 0;
            lastMovementTime = Date.now();
            lastMag = null;
            firmwareDone.value = false;
            firmwareFlagSeen = false;
            reconstructionOffsets = null;

            firmwareOffsets.value = await readFirmwareOffsets();
        } finally {
            starting = false;
        }

        // Abandoned while the CLI read was in flight — leave the teardown state alone.
        if (startToken !== startSequence) {
            return;
        }

        if (calMode === "check") {
            // Check mode: display calibrated data as-is, no firmware trigger
            phase.value = "collecting";
            statusMessage.value = "magCalibrationCheckTitle";
            startDataPolling();
        } else if (calMode === "full") {
            // Full mode: reconstruct raw samples by adding firmware offsets back
            reconstructionOffsets = firmwareOffsets.value ?? { x: 0, y: 0, z: 0 };
            phase.value = "collecting";
            statusMessage.value = "magCalibrationCollecting";
            startDataPolling();
        } else {
            // Quick / legacy mode: trigger firmware calibration
            phase.value = "waiting";
            statusMessage.value = "magCalibrationWaiting";
            MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false);
            startDataPolling();
            startCompletionMonitor();
        }
    }

    function cancelCalibration() {
        cleanup();
        startSequence++;
        starting = false;
        phase.value = "idle";
        statusMessage.value = "";
    }

    function startCountdown() {
        firmwareCollectingStartTime = Date.now();
        firmwareSecondsRemaining.value = FIRMWARE_CAL_DURATION_S;
        countdownInterval = setInterval(() => {
            const elapsed = (Date.now() - firmwareCollectingStartTime) / 1000;
            const remaining = Math.max(0, Math.ceil(FIRMWARE_CAL_DURATION_S - elapsed));
            firmwareSecondsRemaining.value = remaining;
        }, 1000);
    }

    function stopCountdown() {
        if (countdownInterval !== null) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        firmwareSecondsRemaining.value = -1;
        firmwareCollectingStartTime = 0;
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
        stopCountdown();
    }

    onScopeDispose(() => {
        startSequence++;
        cleanup();
    });

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
                const flagSet = bit_check(fcStore.config.armingDisableFlags, ARMING_DISABLE_BIT_CALIBRATING);

                if (flagSet) {
                    firmwareFlagSeen = true;
                }

                if (phase.value === "waiting" && flagSet) {
                    phase.value = "collecting";
                    statusMessage.value = "magCalibrationCollecting";
                    startCountdown();
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

        // In full mode, reconstruct raw samples by adding back firmware offsets
        if (mode.value === "full" && reconstructionOffsets) {
            mx += reconstructionOffsets.x;
            my += reconstructionOffsets.y;
            mz += reconstructionOffsets.z;
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

        // Store attitude alongside mag data for attitude-based dot placement
        const k = fcStore.sensorData.kinematics;
        samples.value.push({ x: mx, y: my, z: mz, roll: k[0], pitch: k[1], heading: k[2], timestamp: Date.now() });
        triggerRef(samples);

        samplesSinceLastFit++;
        if (mode.value !== "check" && samplesSinceLastFit >= SPHERE_FIT_EVERY_N) {
            updateAnalysis();
            samplesSinceLastFit = 0;
        }

        // For quick mode, update progress based on sample count capped at 95 until firmware finishes.
        if (mode.value !== "full") {
            progress.value = Math.min(95, Math.round((samples.value.length / PROGRESS_TARGET_SAMPLES) * 100));
        }
    }

    function updateAnalysis() {
        const pts = samples.value;
        if (pts.length < 10) {
            return;
        }

        const fit = fitSphere(pts);
        const center = fit ? fit.center : centroid(pts);

        // Full-mode coverage describes the attitude directions shown in the
        // sphere view. The solver separately validates raw magnetometer spread.
        const cov = mode.value === "full" ? computeAttitudeCoverage(pts) : computeDirectionalCoverage(pts, center);
        coverage.value = cov;

        if (mode.value === "full") {
            progress.value = Math.min(100, Math.round(cov.fraction * 100));
        }

        if (fit) {
            sphereFitResult.value = fit;
            quality.value = coverageQuality(cov.fraction);
            qualityScore.value = Math.round(cov.fraction * 100);
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
        cleanup();
        startSequence++;
        starting = false;
        phase.value = "idle";
        statusMessage.value = "";
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        qualityScore.value = 0;
        progress.value = 0;
        firmwareDone.value = false;
        firmwareFlagSeen = false;
        reconstructionOffsets = null;
    }

    async function refreshFirmwareOffsets() {
        const offsets = await readFirmwareOffsets();
        firmwareOffsets.value = offsets;
        return offsets;
    }

    async function writeCalValues(x: number, y: number, z: number): Promise<WriteCalResult> {
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rz = Math.round(z);
        if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) {
            return { ok: false, error: "Invalid calibration values" };
        }
        if (
            rx < MAG_CAL_MIN ||
            rx > MAG_CAL_MAX ||
            ry < MAG_CAL_MIN ||
            ry > MAG_CAL_MAX ||
            rz < MAG_CAL_MIN ||
            rz > MAG_CAL_MAX
        ) {
            return { ok: false, error: "Calibration values out of range (-32768 to 32767)" };
        }
        const previous = firmwareOffsets.value;
        try {
            await cliSend(`set mag_calibration = ${rx},${ry},${rz}`);
            firmwareOffsets.value = { x: rx, y: ry, z: rz };
            return { ok: true };
        } catch (error) {
            firmwareOffsets.value = previous;
            return { ok: false, error };
        }
    }

    function clearSamples() {
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        qualityScore.value = 0;
        progress.value = 0;
        samplesSinceLastFit = 0;
        lastMovementTime = Date.now();
        lastMag = null;
    }

    function discardCalibration() {
        cleanup();
        startSequence++;
        starting = false;
        samples.value = [];
        sphereFitResult.value = null;
        coverage.value = null;
        quality.value = null;
        qualityScore.value = 0;
        progress.value = 0;
        phase.value = "idle";
        statusMessage.value = "";
        reconstructionOffsets = null;
    }

    return {
        // State
        phase,
        mode,
        samples,
        sphereFitResult,
        coverage,
        quality,
        qualityScore,
        progress,
        statusMessage,
        sampleCount,
        firmwareDone,
        firmwareSecondsRemaining,
        liveMag,
        liveFieldStrength,
        firmwareOffsets,

        // Actions
        startCalibration,
        cancelCalibration,
        completeCalibration,
        discardCalibration,
        clearSamples,
        cleanup,
        retry,
        refreshFirmwareOffsets,
        writeCalValues,
    };
}

/**
 * Compute magnetic declination and inclination from GPS coordinates
 * using the World Magnetic Model via the geomagnetism package.
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @returns the reference, or null if the model cannot evaluate the point
 */
let lastGeoReference: GeoReference | null = null;

export function computeDeclination(lat: number, lon: number): GeoReference | null {
    try {
        const info = geomagnetism.model().point([lat, lon]);
        const result = { declination: info.decl, inclination: info.incl, fieldStrength: Math.round(info.f) };
        lastGeoReference = result;
        return result;
    } catch {
        return null;
    }
}

export function getGeoReference(): GeoReference | null {
    return lastGeoReference;
}

// Decimal degrees, comma- or whitespace-separated. Hoisted so it is compiled once.
const COORDINATE_RE = /^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/;

/**
 * Parse latitude and longitude from user input (e.g. Google Maps: "63.728263, -68.446117").
 *
 * @param input - Coordinate string (comma or space separated)
 */
export function parseCoordinates(input: unknown): { lat: number; lon: number } | null {
    if (!input || typeof input !== "string") {
        return null;
    }
    const match = COORDINATE_RE.exec(input.trim());
    if (!match) {
        return null;
    }
    const lat = Number.parseFloat(match[1]);
    const lon = Number.parseFloat(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return null;
    }
    return { lat, lon };
}
