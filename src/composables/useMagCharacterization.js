/**
 * useMagCharacterization — Improved-tumble composable.
 *
 * Single tumble phase: user spins the craft through all orientations, clicks
 * "Done", and the composable un-applies the live FC config, fits an ellipsoid,
 * solves tilt+WMM alignment, computes offsets, and builds a schema-2.2 model.
 *
 * Phases: "intro" → "calibrate" → "compute" → "complete"
 */
import { ref, computed } from "vue";
import { computeDeclination, getGeoReference } from "./useMagCalibration.js";
import { fitEllipsoid } from "../js/utils/ellipsoidFit.js";
import { currentMatrixOf, proposedMatrixOf, assessTumbleQuality } from "../js/utils/magCharacterizationCompute.js";
import { buildCharacterizationModel } from "../js/utils/magModelExport.js";
import { fitSphere, computeDirectionalCoverage, check3DCoverage } from "../js/utils/sphereFit.js";
import { mat3mulVec, mat3transpose, ALIGNMENT_MATRICES } from "../js/utils/magAlignment.js";
import { solveTiltAlignment } from "../js/utils/magTiltAlign.js";
import { useFlightControllerStore } from "../stores/fc";
import { send as cliSend, isMspCliSupported } from "./useMspCliSession";

const POLL_MS = 80;
const DEG_TO_RAD = Math.PI / 180;

const CAL_REFIT_MIN_SAMPLES = 40;
const CAL_REFIT_INTERVAL = 25;
const CAL_PROMPT_INTERVAL_MS = 10000;

export const CAL_PROMPTS = [
    "magCalibrationPrompt1",
    "magCalibrationPrompt2",
    "magCalibrationPrompt3",
    "magCalibrationPrompt4",
];

export function useMagCharacterization() {
    const fcStore = useFlightControllerStore();

    const phase = ref("intro");
    const calibrationSamples = ref([]);
    const calibrationSampleCount = computed(() => calibrationSamples.value.length);
    const calibrationSphereFit = ref(null);
    const solverResult = ref(null);
    const ellipsoidParams = ref(null);
    const ellipsoidDiag = ref(null);
    const calibrationOffsets = ref(null);
    const geoReference = ref(null);
    const isFetchingGeo = ref(false);
    const lastMag = ref([0, 0, 0]);
    const lastFieldStrength = ref(0);
    const calCurrentPrompt = ref(0);
    const tiltDiversityWarning = ref(null);
    const magZeroAtCapture = ref(null);

    let sampleTimer = null;
    let _calPromptTimer = null;
    let _calLastFitCount = 0;
    let capturedUnderInfo = null;

    const calLiveMag = computed(() => {
        const m = fcStore.sensorData.magnetometer;
        return m ? [m[0], m[1], m[2]] : [0, 0, 0];
    });

    // ── Live sphere fit during tumble ──────────────────────────────────────

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

    const calibrationCoverage = computed(() => {
        const pts = calibrationSamples.value;
        if (pts.length < 4) return null;
        const center = calibrationSphereFit.value?.center ?? { x: 0, y: 0, z: 0 };
        return computeDirectionalCoverage(
            pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            center,
        );
    });

    // ── Sampling loop (80 ms poll) ─────────────────────────────────────────

    function calibrationTick() {
        if (phase.value !== "calibrate") return;

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

    // ── Geo reference (GPS → IP geolocation → WMM) ────────────────────────

    async function fetchGeoReference() {
        try {
            const gps = fcStore.gpsData;
            if (gps && gps.fix && gps.latitude !== 0 && gps.longitude !== 0) {
                const result = computeDeclination(gps.latitude / 10000000, gps.longitude / 10000000);
                if (result) return result;
            }
        } catch {
            /* GPS not available */
        }

        try {
            const response = await fetch("https://api.ipify.org?format=json");
            const ipData = await response.json();
            const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
            const geoData = await geoResponse.json();
            if (geoData.latitude && geoData.longitude) {
                const result = computeDeclination(geoData.latitude, geoData.longitude);
                if (result) return result;
            }
        } catch {
            /* IP lookup failed */
        }

        return null;
    }

    async function refreshGeoReference() {
        isFetchingGeo.value = true;
        try {
            const geo = await fetchGeoReference();
            if (geo) geoReference.value = geo;
        } finally {
            isFetchingGeo.value = false;
        }
    }

    // ── Read mag_calibration from FC via MSP CLI ───────────────────────────

    async function readMagZeroFromCli() {
        if (!isMspCliSupported()) return null;
        try {
            const lines = await cliSend("get mag_calibration");
            for (const line of lines) {
                const m = line.match(/mag_calibration\s*=\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/);
                if (m) return { x: parseInt(m[1], 10), y: parseInt(m[2], 10), z: parseInt(m[3], 10) };
            }
        } catch {
            /* CLI not available */
        }
        return null;
    }

    // ── Compute field consistency from raw samples ─────────────────────────

    function computeFieldConsistency(samples) {
        if (samples.length < 4) return { maxDevPct: 0, suspect: false };
        let sum = 0;
        const mags = samples.map((s) => {
            const m = Math.hypot(s.x, s.y, s.z);
            sum += m;
            return m;
        });
        const mean = sum / mags.length;
        if (mean < 1) return { maxDevPct: 0, suspect: false };
        let maxDev = 0;
        for (const m of mags) {
            const dev = Math.abs(m - mean) / mean;
            if (dev > maxDev) maxDev = dev;
        }
        const pct = Math.round(maxDev * 1000) / 10;
        return { maxDevPct: pct, suspect: pct > 10 };
    }

    // ── Start tumble ───────────────────────────────────────────────────────

    async function startTumble() {
        calibrationSamples.value = [];
        ellipsoidParams.value = null;
        ellipsoidDiag.value = null;
        calibrationSphereFit.value = null;
        calibrationOffsets.value = null;
        solverResult.value = null;
        tiltDiversityWarning.value = null;
        _calLastFitCount = 0;
        calCurrentPrompt.value = 0;

        const magZero = await readMagZeroFromCli();
        magZeroAtCapture.value = magZero;

        geoReference.value = getGeoReference() || null;
        if (!geoReference.value) {
            await refreshGeoReference();
        }

        if (_calPromptTimer) clearInterval(_calPromptTimer);
        _calPromptTimer = setInterval(() => {
            if (calCurrentPrompt.value < CAL_PROMPTS.length - 1) {
                calCurrentPrompt.value++;
            }
        }, CAL_PROMPT_INTERVAL_MS);

        phase.value = "calibrate";
        sampleTimer = setTimeout(calibrationTick, POLL_MS);
    }

    // ── Compute results (called on "Done") ─────────────────────────────────

    async function computeResults() {
        cleanupTimer();
        if (_calPromptTimer) {
            clearInterval(_calPromptTimer);
            _calPromptTimer = null;
        }

        phase.value = "compute";

        const pts = calibrationSamples.value;
        if (pts.length < 40) {
            solverResult.value = { error: "Not enough samples — need at least 40. Spin longer." };
            phase.value = "complete";
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
        const R_cur = currentMatrixOf(currentAlign, customAngles) || ALIGNMENT_MATRICES[1];
        const R_curT = mat3transpose(R_cur);

        if (!magZeroAtCapture.value) {
            const magZero = await readMagZeroFromCli();
            magZeroAtCapture.value = magZero;
        }
        const z = magZeroAtCapture.value || { x: 0, y: 0, z: 0 };

        const rawSamples = pts.map((s) => {
            const streamed = [s.x + z.x, s.y + z.y, s.z + z.z];
            const raw = mat3mulVec(R_curT, streamed);
            return { x: raw[0], y: raw[1], z: raw[2], roll: s.roll, pitch: s.pitch };
        });

        // Tilt-diversity is load-bearing: without it the yaw alignment is unobservable, so a
        // too-planar tumble is REFUSED (not merely warned). See planv5/30 §9, planv5/32 STEP 3.2.
        const coverageCheck = check3DCoverage(rawSamples);
        if (!coverageCheck.ok) {
            solverResult.value = { error: coverageCheck.reason };
            phase.value = "complete";
            return;
        }
        tiltDiversityWarning.value = null;

        const rawPoints = rawSamples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
        const ep = fitEllipsoid(rawPoints);
        if (!ep) {
            solverResult.value = { error: "Ellipsoid fit failed — spin through more orientations." };
            phase.value = "complete";
            return;
        }
        ellipsoidParams.value = ep;

        const fieldCon = computeFieldConsistency(rawSamples);

        const W_inv = ep.W_inv;
        const center = ep.center;
        const mCalSamples = rawSamples.map((s) => {
            const centered = [s.x - center.x, s.y - center.y, s.z - center.z];
            const cal = mat3mulVec(W_inv, centered);
            return { m_cal: cal, roll: s.roll, pitch: s.pitch };
        });

        let geoRef = geoReference.value;
        if (!geoRef) {
            geoRef = await fetchGeoReference();
            if (geoRef) geoReference.value = geoRef;
        }
        if (!geoRef) {
            solverResult.value = {
                error: "No geo reference — cannot determine WMM inclination. Enable GPS or check internet.",
            };
            phase.value = "complete";
            return;
        }

        const tiltResult = solveTiltAlignment(mCalSamples, geoRef.inclination * DEG_TO_RAD);
        if (!tiltResult) {
            solverResult.value = { error: "Tilt alignment solve failed — ensure sufficient tilt diversity." };
            phase.value = "complete";
            return;
        }

        const qualityScore = Math.max(0, Math.min(100, Math.round(100 - tiltResult.quality.meanResidualDeg * 5)));

        const result = {
            preset: tiltResult.preset,
            label: tiltResult.label,
            euler_zyx_deg: tiltResult.euler_zyx_deg,
            quality: {
                cost: tiltResult.quality.cost,
                meanResidualDeg: tiltResult.quality.meanResidualDeg,
                sampleCount: tiltResult.quality.sampleCount,
                frobNorm: tiltResult.quality.frobNorm,
            },
            qualityScore,
            fieldConsistency: fieldCon,
        };

        solverResult.value = result;

        const proposedMat = proposedMatrixOf(result);

        capturedUnderInfo = {
            alignment: currentAlign,
            custom_angles: currentAlign === 9 && customAngles ? { ...customAngles } : null,
            mag_zero: magZeroAtCapture.value ? { ...magZeroAtCapture.value } : null,
            mag_zero_known: magZeroAtCapture.value !== null,
        };

        const c = ep.center;
        const offsetRaw = [c.x, c.y, c.z];
        const offsetProposed = mat3mulVec(proposedMat, offsetRaw);
        calibrationOffsets.value = {
            x: Math.round(offsetProposed[0]),
            y: Math.round(offsetProposed[1]),
            z: Math.round(offsetProposed[2]),
        };

        computeEllipsoidDiag(rawSamples, ep);

        phase.value = "complete";
    }

    // ── Ellipsoid diagnostics ──────────────────────────────────────────────

    function computeEllipsoidDiag(rawSamples, ep) {
        if (!ep || rawSamples.length < 9) {
            ellipsoidDiag.value = null;
            return;
        }

        const wDiag = [ep.W_inv[0][0], ep.W_inv[1][1], ep.W_inv[2][2]];
        const wMin = Math.min(...wDiag);
        const wMax = Math.max(...wDiag);
        const conditionNumber = wMin > 1e-12 ? wMax / wMin : 1;

        const offDiag = [Math.abs(ep.W_inv[0][1]), Math.abs(ep.W_inv[0][2]), Math.abs(ep.W_inv[1][2])];
        const diagSum = wDiag.reduce((a, b) => a + Math.abs(b), 0);
        const offDiagRms = diagSum > 1e-10 ? Math.sqrt(offDiag.reduce((s, v) => s + v * v, 0)) / diagSum : 0;

        ellipsoidDiag.value = {
            conditionNumber,
            offDiagonalRms: offDiagRms,
            residualRms: ep.residual,
            hardIronBias: [Math.round(ep.center.x), Math.round(ep.center.y), Math.round(ep.center.z)],
        };
    }

    // ── Quality assessment ─────────────────────────────────────────────────

    function computeQualityAssessment() {
        let tumbleVerdict = null;
        if (ellipsoidParams.value && calibrationSamples.value.length) {
            const avgH =
                calibrationSamples.value.reduce((s, v) => s + Math.hypot(v.x, v.y), 0) /
                calibrationSamples.value.length;
            const ratio =
                Math.hypot(
                    ellipsoidParams.value.center.x,
                    ellipsoidParams.value.center.y,
                    ellipsoidParams.value.center.z,
                ) / avgH;
            const covFrac = calibrationCoverage.value?.fraction ?? 0;
            const tumble = assessTumbleQuality({
                centerRatio: ratio,
                coverageFraction: covFrac,
                ellipsoidResidual: ellipsoidParams.value.residual,
            });
            tumbleVerdict = {
                ...tumble,
                center_ratio: ratio,
                coverage: covFrac,
                ellipsoid_residual: ellipsoidParams.value.residual,
            };
        }

        const tiltRes = solverResult.value?.quality?.meanResidualDeg ?? null;

        return {
            tumble_verdict: tumbleVerdict?.verdict ?? null,
            pose_verdict: null,
            center_ratio: tumbleVerdict?.center_ratio ?? null,
            coverage: tumbleVerdict?.coverage ?? null,
            ellipsoid_residual: tumbleVerdict?.ellipsoid_residual ?? null,
            tilt_residual_deg: tiltRes,
            tilt_diversity_ok: tiltDiversityWarning.value === null,
            reasons: [...(tumbleVerdict?.reasons ?? [])],
        };
    }

    // ── Model export ───────────────────────────────────────────────────────

    function exportCharacterizationData() {
        const qualityAssessment = computeQualityAssessment();
        const json = buildCharacterizationModel({
            solverResult: solverResult.value,
            capturedUnder: capturedUnderInfo,
            ellipsoidParams: ellipsoidParams.value,
            calibrationOffsets: calibrationOffsets.value,
            geoReference: geoReference.value,
            gpsFix: !!fcStore.gpsData.fix,
            gpsLat: fcStore.gpsData.latitude,
            gpsLon: fcStore.gpsData.longitude,
            qualityAssessment,
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

    // ── Apply to FC ────────────────────────────────────────────────────────

    function applyAndReboot() {
        const sr = solverResult.value;
        if (!sr || sr.error || !Number.isFinite(sr.preset)) return false;

        fcStore.sensorAlignment.align_mag = sr.preset;
        if (sr.preset === 9 && sr.euler_zyx_deg) {
            fcStore.sensorAlignment.mag_align_roll = sr.euler_zyx_deg.roll;
            fcStore.sensorAlignment.mag_align_pitch = sr.euler_zyx_deg.pitch;
            fcStore.sensorAlignment.mag_align_yaw = sr.euler_zyx_deg.yaw;
        }

        return true;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    function cleanupTimer() {
        if (sampleTimer !== null) {
            clearTimeout(sampleTimer);
            sampleTimer = null;
        }
    }

    function reset() {
        cleanupTimer();
        if (_calPromptTimer) {
            clearInterval(_calPromptTimer);
            _calPromptTimer = null;
        }
        phase.value = "intro";
        calibrationSamples.value = [];
        calibrationSphereFit.value = null;
        _calLastFitCount = 0;
        solverResult.value = null;
        ellipsoidParams.value = null;
        ellipsoidDiag.value = null;
        calibrationOffsets.value = null;
        tiltDiversityWarning.value = null;
        magZeroAtCapture.value = null;
        capturedUnderInfo = null;
    }

    function cleanup() {
        cleanupTimer();
        if (_calPromptTimer) {
            clearInterval(_calPromptTimer);
            _calPromptTimer = null;
        }
    }

    function close() {
        cleanup();
        phase.value = "intro";
    }

    return {
        phase,
        calibrationSamples,
        calibrationSampleCount,
        calibrationCoverage,
        calibrationSphereFit,
        solverResult,
        ellipsoidParams,
        ellipsoidDiag,
        calibrationOffsets,
        geoReference,
        isFetchingGeo,
        calLiveMag,
        calCurrentPrompt,
        lastMag,
        lastFieldStrength,
        tiltDiversityWarning,
        magZeroAtCapture,

        startTumble,
        computeResults,
        exportCharacterizationData,
        fetchGeoReference,
        refreshGeoReference,
        computeQualityAssessment,
        applyAndReboot,
        close,
        reset,
        cleanup,
        cleanupTimer,
    };
}
