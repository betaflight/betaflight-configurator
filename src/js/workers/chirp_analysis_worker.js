/**
 * Web Worker for chirp/autotune blackbox analysis.
 *
 * Receives a BBL file as ArrayBuffer, parses chirp segments, computes
 * frequency response per axis, and posts back the results.
 *
 * Messages:
 *   Input:  { type: 'analyze', data: ArrayBuffer, logIndex?: number, apiVersion?: string }
 *   Output: { type: 'result', sysConfig, perAxis, chirpData }
 *           { type: 'error', message }
 *           { type: 'progress', stage, detail }
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findLogBoundaries, parseChirpLog } from "../blackbox/chirp_bbl_parser.js";
import { welchTransferFunction, recommendGains } from "../blackbox/spectral_analysis.js";

globalThis.onmessage = function (event) {
    try {
        const payload = event?.data;
        if (!payload || typeof payload !== "object") {
            return;
        }

        const { type, data, logIndex, apiVersion } = payload;
        if (type !== "analyze") {
            return;
        }

        const bytes = new Uint8Array(data);

        // 1. Find log boundaries
        postProgress("parsing", "Finding log boundaries...");
        const logs = findLogBoundaries(bytes);

        if (logs.length === 0) {
            throw new Error("No valid blackbox logs found in this file.");
        }

        // Select which log to parse (default: first, or user-specified)
        const idx = Number.isInteger(logIndex) && logIndex >= 0 && logIndex < logs.length ? logIndex : 0;
        const { start, end } = logs[idx];

        // 2. Parse the log header + data
        postProgress("parsing", `Parsing log ${idx + 1} of ${logs.length}...`);
        const { sysConfig, chirpData } = parseChirpLog(bytes, start, end, apiVersion);

        if (chirpData.sampleCount === 0) {
            throw new Error("No chirp data found in this log. Make sure chirp mode was activated during the flight.");
        }

        if (chirpData.segments.length === 0) {
            throw new Error(
                "Chirp mode was active but no axis segments were detected. " +
                    "Ensure the firmware includes the enhanced DEBUG_CHIRP channels (debug[1] = axis).",
            );
        }

        // 3. Compute frequency response per axis
        postProgress("analyzing", "Computing frequency response...");

        // Determine sample rate from looptime and blackbox decimation
        const looptimeUs = sysConfig.looptime || 125;
        const pidDenom = sysConfig.pid_process_denom || 1;
        const bbRate = sysConfig.frameIntervalPDenom || 1;
        const samplePeriodUs = looptimeUs * pidDenom * bbRate;
        const sampleRate = 1e6 / samplePeriodUs;

        // Choose FFT segment size: ~0.5s of data, rounded to power of 2
        const halfSecondSamples = Math.round(sampleRate * 0.5);
        let segmentSize = 1;
        while (segmentSize < halfSecondSamples) {
            segmentSize <<= 1;
        }
        segmentSize = Math.max(256, Math.min(segmentSize, 4096));

        // Current simplified tuning slider values
        const currentSliders = {
            masterMultiplier: (sysConfig.simplified_master_multiplier || 100) / 100,
            piGain: (sysConfig.simplified_pi_gain || 100) / 100,
            iGain: (sysConfig.simplified_i_gain || 100) / 100,
            dGain: (sysConfig.simplified_d_gain || 100) / 100,
            feedforwardGain: (sysConfig.simplified_feedforward_gain || 100) / 100,
            dtermFilterMultiplier: (sysConfig.simplified_dterm_filter_multiplier || 100) / 100,
        };

        const perAxis = {}; // { 0: { tf, recommendation }, 1: ..., 2: ... }

        for (const segment of chirpData.segments) {
            const { axis, startIdx, endIdx } = segment;
            if (!Number.isInteger(axis) || axis < 0 || axis > 2) {
                throw new Error(
                    "Log uses unsupported DEBUG_CHIRP axis encoding. " +
                        "Use a log recorded with the companion firmware.",
                );
            }
            const len = endIdx - startIdx + 1;

            if (len < segmentSize) {
                // Not enough data for at least one FFT segment — skip
                continue;
            }

            // Extract the segment data for this axis
            const input = chirpData.setpoint[axis].subarray(startIdx, endIdx + 1);
            const output = chirpData.gyro[axis].subarray(startIdx, endIdx + 1);

            postProgress("analyzing", `Axis ${["Roll", "Pitch", "Yaw"][axis]}: ${len} samples...`);

            const tf = welchTransferFunction(input, output, sampleRate, segmentSize, 0.5);
            const recommendation = recommendGains(tf, currentSliders);

            perAxis[axis] = { tf, recommendation, sampleCount: len };
        }

        if (Object.keys(perAxis).length === 0) {
            throw new Error(
                "Chirp segments were too short for frequency analysis. " +
                    "Ensure each chirp runs for the full duration (default 20 seconds).",
            );
        }

        // 4. Post results
        globalThis.postMessage({
            type: "result",
            sysConfig: serializeSysConfig(sysConfig),
            perAxis,
            chirpData: {
                segments: chirpData.segments,
                sampleCount: chirpData.sampleCount,
                totalFrames: chirpData.totalFrames,
                corruptFrames: chirpData.corruptFrames,
            },
            logCount: logs.length,
            logIndex: idx,
            sampleRate,
        });
    } catch (err) {
        globalThis.postMessage({
            type: "error",
            message: err.message || String(err),
        });
    }
};

function postProgress(stage, detail) {
    globalThis.postMessage({ type: "progress", stage, detail });
}

/**
 * Extract a serializable subset of sysConfig for transfer to the main thread.
 */
function serializeSysConfig(sc) {
    return {
        looptime: sc.looptime,
        pid_process_denom: sc.pid_process_denom,
        debug_mode: sc.debug_mode,
        blackbox_high_resolution: sc.blackbox_high_resolution,
        rollPID: sc.rollPID,
        pitchPID: sc.pitchPID,
        yawPID: sc.yawPID,
        chirp_lag_freq_hz: sc.chirp_lag_freq_hz,
        chirp_lead_freq_hz: sc.chirp_lead_freq_hz,
        chirp_amplitude_roll: sc.chirp_amplitude_roll,
        chirp_amplitude_pitch: sc.chirp_amplitude_pitch,
        chirp_amplitude_yaw: sc.chirp_amplitude_yaw,
        chirp_frequency_start_deci_hz: sc.chirp_frequency_start_deci_hz,
        chirp_frequency_end_deci_hz: sc.chirp_frequency_end_deci_hz,
        chirp_time_seconds: sc.chirp_time_seconds,
        simplified_master_multiplier: sc.simplified_master_multiplier,
        simplified_pi_gain: sc.simplified_pi_gain,
        simplified_i_gain: sc.simplified_i_gain,
        simplified_d_gain: sc.simplified_d_gain,
        simplified_feedforward_gain: sc.simplified_feedforward_gain,
        simplified_dterm_filter_multiplier: sc.simplified_dterm_filter_multiplier,
    };
}
