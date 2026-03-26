/**
 * AeroTune 7 — BBL Header Parser
 *
 * Parses the ASCII header section of Betaflight Blackbox logs.
 * Extracts all configuration: PIDs, filters, rates, motor config, etc.
 *
 * Supports Betaflight 4.3, 4.4, 4.5+ header field naming.
 *
 * Written from scratch by aerobot2.com
 * Reference: BBL format specification (public documentation)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

class BBLHeaderParser {
    constructor() {
        this.LOG_START_MARKER = "H Product:Blackbox flight data recorder by Nicholas Sherlock";
    }

    parseFile(fileBuffer) {
        let text = typeof fileBuffer === "string" ? fileBuffer : new TextDecoder("ascii").decode(fileBuffer);

        let sessions = [];
        let searchFrom = 0;

        while (true) {
            let markerPos = text.indexOf(this.LOG_START_MARKER, searchFrom);
            if (markerPos === -1) break;

            let headerLines = [];
            let pos = markerPos;

            while (pos < text.length) {
                let lineEnd = text.indexOf("\n", pos);
                if (lineEnd === -1) break;

                let line = text.substring(pos, lineEnd).trim();

                if (line.startsWith("H ")) {
                    headerLines.push(line);
                } else if (headerLines.length > 0 && !line.startsWith("H")) {
                    break;
                }

                pos = lineEnd + 1;
            }

            if (headerLines.length > 0) {
                let config = this._parseHeaderLines(headerLines);
                config._sessionIndex = sessions.length;
                config._headerLineCount = headerLines.length;
                sessions.push(config);
            }

            searchFrom = pos;
        }

        return sessions;
    }

    _parseHeaderLines(lines) {
        let raw = {};

        for (let i = 0; i < lines.length; i++) {
            let match = lines[i].match(/^H\s+(.+?):(.*)$/);
            if (!match) continue;
            raw[match[1].trim()] = match[2].trim();
        }

        return {
            firmware: this._parseFirmware(raw),
            pids: this._parsePIDs(raw),
            rates: this._parseRates(raw),
            gyroFilters: this._parseGyroFilters(raw),
            dtermFilters: this._parseDtermFilters(raw),
            dynamicNotch: this._parseDynamicNotch(raw),
            rpmFilter: this._parseRpmFilter(raw),
            rcSmoothing: this._parseRCSmoothing(raw),
            feedforward: this._parseFeedforward(raw),
            motor: this._parseMotor(raw),
            tpa: this._parseTPA(raw),
            sliders: this._parseSliders(raw),
            battery: this._parseBattery(raw),
            misc: this._parseMisc(raw),
            frameFields: this._parseFrameFields(raw),
            _raw: raw,
        };
    }

    // ── Helpers ─────────────────────────────────────────────────
    _get(raw, names) {
        if (typeof names === "string") names = [names];
        for (let i = 0; i < names.length; i++) {
            if (raw[names[i]] !== undefined && raw[names[i]] !== "") return raw[names[i]];
        }
        return null;
    }

    _csv(value) {
        if (!value) return [];
        return value.split(",").map(function (v) {
            return parseInt(v.trim(), 10);
        });
    }

    _csvFromRaw(raw, names) {
        return this._csv(this._get(raw, names));
    }

    _int(value) {
        if (value === null || value === undefined || value === "") return null;
        return parseInt(value, 10);
    }

    _intFromRaw(raw, names) {
        return this._int(this._get(raw, names));
    }

    // ── Firmware Info ───────────────────────────────────────────
    _parseFirmware(raw) {
        let revision = raw["Firmware revision"] || "";
        let versionMatch = revision.match(/(\d+\.\d+\.\d+)/);

        return {
            type: raw["Firmware type"] || null,
            revision: revision || null,
            version: versionMatch ? versionMatch[1] : null,
            date: raw["Firmware date"] || null,
            board: raw["Board information"] || null,
            craftName: raw["Craft name"] || null,
            logStartDatetime: raw["Log start datetime"] || null,
            deviceUID: raw["Device UID"] || null,
        };
    }

    // ── PIDs ────────────────────────────────────────────────────
    _parsePIDs(raw) {
        let rollPID = this._csv(raw["rollPID"]);
        let pitchPID = this._csv(raw["pitchPID"]);
        let yawPID = this._csv(raw["yawPID"]);

        let dMax = this._csvFromRaw(raw, ["d_max", "d_min"]);
        if (dMax.length >= 3) {
            rollPID[3] = dMax[0];
            pitchPID[3] = dMax[1];
            yawPID[3] = dMax[2];
        }

        let ff = this._csv(raw["ff_weight"]);
        if (ff.length >= 3) {
            rollPID[4] = ff[0];
            pitchPID[4] = ff[1];
            yawPID[4] = ff[2];
        }

        return {
            roll: rollPID,
            pitch: pitchPID,
            yaw: yawPID,
            controller: this._intFromRaw(raw, ["pidController"]),
            processDenom: this._intFromRaw(raw, ["pid_process_denom"]),
            atMinThrottle: this._intFromRaw(raw, ["pid_at_min_throttle", "pidAtMinThrottle"]),
            sumLimit: this._intFromRaw(raw, ["pidsum_limit", "pidSumLimit"]),
            sumLimitYaw: this._intFromRaw(raw, ["pidsum_limit_yaw", "pidSumLimitYaw"]),
            useIntegratedYaw: this._intFromRaw(raw, ["use_integrated_yaw"]),
            itermRelax: this._intFromRaw(raw, ["iterm_relax"]),
            itermRelaxType: this._intFromRaw(raw, ["iterm_relax_type"]),
            itermRelaxCutoff: this._intFromRaw(raw, ["iterm_relax_cutoff"]),
            itermWindup: this._intFromRaw(raw, ["iterm_windup"]),
            absControlGain: this._intFromRaw(raw, ["abs_control_gain"]),
            antiGravityGain: this._intFromRaw(raw, ["anti_gravity_gain"]),
            antiGravityPGain: this._intFromRaw(raw, ["anti_gravity_p_gain"]),
            antiGravityCutoff: this._intFromRaw(raw, ["anti_gravity_cutoff_hz"]),
            dMaxGain: this._intFromRaw(raw, ["d_max_gain"]),
            dMaxAdvance: this._intFromRaw(raw, ["d_max_advance"]),
        };
    }

    // ── Rates ───────────────────────────────────────────────────
    _parseRates(raw) {
        return {
            rcRates: this._csv(raw["rc_rates"]),
            rcExpo: this._csv(raw["rc_expo"]),
            rates: this._csv(raw["rates"]),
            ratesType: this._intFromRaw(raw, ["rates_type"]),
            rateLimits: this._csv(raw["rate_limits"]),
            thrMid: this._intFromRaw(raw, ["thr_mid", "thrMid"]),
            thrExpo: this._intFromRaw(raw, ["thr_expo", "thrExpo"]),
            deadband: this._intFromRaw(raw, ["deadband"]),
            yawDeadband: this._intFromRaw(raw, ["yaw_deadband"]),
        };
    }

    // ── Gyro Filters ────────────────────────────────────────────
    _parseGyroFilters(raw) {
        return {
            hardwareLpf: this._intFromRaw(raw, ["gyro_hardware_lpf", "gyro_lpf"]),
            lowpass1Hz: this._intFromRaw(raw, ["gyro_lpf1_static_hz", "gyro_lowpass_hz"]),
            lowpass1Type: this._intFromRaw(raw, ["gyro_lpf1_type", "gyro_soft_type"]),
            lowpass1DynHz: this._csvFromRaw(raw, ["gyro_lpf1_dyn_hz", "gyro_lowpass_dyn_hz"]),
            lowpass1DynExpo: this._intFromRaw(raw, ["gyro_lpf1_dyn_expo", "gyro_lowpass_dyn_expo"]),
            lowpass2Hz: this._intFromRaw(raw, ["gyro_lpf2_static_hz", "gyro_lowpass2_hz"]),
            lowpass2Type: this._intFromRaw(raw, ["gyro_lpf2_type", "gyro_soft2_type"]),
            notchHz: this._csvFromRaw(raw, ["gyro_notch_hz"]),
            notchCutoff: this._csvFromRaw(raw, ["gyro_notch_cutoff"]),
        };
    }

    // ── RPM Filter ──────────────────────────────────────────────
    _parseRpmFilter(raw) {
        return {
            harmonics: this._intFromRaw(raw, ["rpm_filter_harmonics", "gyro_rpm_notch_harmonics"]),
            q: this._intFromRaw(raw, ["rpm_filter_q", "gyro_rpm_notch_q"]),
            minHz: this._intFromRaw(raw, ["rpm_filter_min_hz", "gyro_rpm_notch_min"]),
            lpfHz: this._intFromRaw(raw, ["rpm_filter_lpf_hz", "rpm_notch_lpf"]),
            fadeRangeHz: this._intFromRaw(raw, ["rpm_filter_fade_range_hz"]),
            weights: this._csvFromRaw(raw, ["rpm_filter_weights"]),
        };
    }

    // ── D-Term Filters ──────────────────────────────────────────
    _parseDtermFilters(raw) {
        return {
            lpf1Hz: this._intFromRaw(raw, ["dterm_lpf1_static_hz", "dterm_lpf_hz"]),
            lpf1Type: this._intFromRaw(raw, ["dterm_lpf1_type", "dterm_filter_type"]),
            lpf1DynHz: this._csvFromRaw(raw, ["dterm_lpf1_dyn_hz", "dterm_lpf_dyn_hz"]),
            lpf1DynExpo: this._intFromRaw(raw, ["dterm_lpf1_dyn_expo", "dterm_lpf_dyn_expo"]),
            lpf2Hz: this._intFromRaw(raw, ["dterm_lpf2_static_hz", "dterm_lpf2_hz"]),
            lpf2Type: this._intFromRaw(raw, ["dterm_lpf2_type", "dterm_filter2_type"]),
            notchHz: this._intFromRaw(raw, ["dterm_notch_hz"]),
            notchCutoff: this._intFromRaw(raw, ["dterm_notch_cutoff"]),
            yawLpfHz: this._intFromRaw(raw, ["yaw_lowpass_hz", "yaw_lpf_hz"]),
        };
    }

    // ── Dynamic Notch ───────────────────────────────────────────
    _parseDynamicNotch(raw) {
        return {
            count: this._intFromRaw(raw, ["dyn_notch_count"]),
            q: this._intFromRaw(raw, ["dyn_notch_q"]),
            minHz: this._intFromRaw(raw, ["dyn_notch_min_hz"]),
            maxHz: this._intFromRaw(raw, ["dyn_notch_max_hz"]),
            range: this._intFromRaw(raw, ["dyn_notch_range"]),
            widthPercent: this._intFromRaw(raw, ["dyn_notch_width_percent"]),
        };
    }

    // ── RC Smoothing ────────────────────────────────────────────
    _parseRCSmoothing(raw) {
        return {
            mode: this._intFromRaw(raw, ["rc_smoothing", "rc_smoothing_mode"]),
            feedforwardCutoff: this._intFromRaw(raw, [
                "rc_smoothing_feedforward_cutoff",
                "rc_smoothing_feedforward_hz",
            ]),
            setpointCutoff: this._intFromRaw(raw, ["rc_smoothing_setpoint_cutoff", "rc_smoothing_setpoint_hz"]),
            throttleCutoff: this._intFromRaw(raw, ["rc_smoothing_throttle_cutoff", "rc_smoothing_throttle_hz"]),
            autoFactor: this._intFromRaw(raw, ["rc_smoothing_auto_factor", "rc_smoothing_auto_factor_setpoint"]),
            autoFactorThrottle: this._intFromRaw(raw, ["rc_smoothing_auto_factor_throttle"]),
            activeCutoffs: this._csvFromRaw(raw, ["rc_smoothing_active_cutoffs_ff_sp_thr"]),
            rxSmoothed: this._intFromRaw(raw, ["rc_smoothing_rx_smoothed"]),
        };
    }

    // ── Feedforward ─────────────────────────────────────────────
    _parseFeedforward(raw) {
        return {
            transition: this._intFromRaw(raw, ["feedforward_transition", "ff_transition"]),
            averaging: this._intFromRaw(raw, ["feedforward_averaging", "ff_averaging"]),
            smoothFactor: this._intFromRaw(raw, ["feedforward_smooth_factor", "ff_smooth_factor"]),
            jitterFactor: this._intFromRaw(raw, ["feedforward_jitter_factor", "ff_jitter_factor"]),
            boost: this._intFromRaw(raw, ["feedforward_boost", "ff_boost"]),
            maxRateLimit: this._intFromRaw(raw, ["feedforward_max_rate_limit", "ff_max_rate_limit"]),
        };
    }

    // ── Motor Config ────────────────────────────────────────────
    _parseMotor(raw) {
        return {
            minThrottle: this._intFromRaw(raw, ["minthrottle"]),
            maxThrottle: this._intFromRaw(raw, ["maxthrottle"]),
            motorOutput: this._csvFromRaw(raw, ["motorOutput"]),
            dshotIdleValue: this._intFromRaw(raw, ["dshot_idle_value", "digitalIdleOffset"]),
            pwmProtocol: this._intFromRaw(raw, ["motor_pwm_protocol"]),
            pwmRate: this._intFromRaw(raw, ["motor_pwm_rate"]),
            poles: this._intFromRaw(raw, ["motor_poles"]),
            outputLimit: this._intFromRaw(raw, ["motor_output_limit"]),
            dynamicIdleMinRpm: this._intFromRaw(raw, ["dyn_idle_min_rpm", "dynamic_idle_min_rpm"]),
            dynIdleP: this._intFromRaw(raw, ["dyn_idle_p_gain"]),
            dynIdleI: this._intFromRaw(raw, ["dyn_idle_i_gain"]),
            dynIdleD: this._intFromRaw(raw, ["dyn_idle_d_gain"]),
            dynIdleMaxIncrease: this._intFromRaw(raw, ["dyn_idle_max_increase"]),
            dshotBidir: this._intFromRaw(raw, ["dshot_bidir"]),
        };
    }

    // ── TPA ─────────────────────────────────────────────────────
    _parseTPA(raw) {
        return {
            rate: this._intFromRaw(raw, ["tpa_rate"]),
            breakpoint: this._intFromRaw(raw, ["tpa_breakpoint"]),
            mode: this._intFromRaw(raw, ["tpa_mode"]),
            lowRate: this._intFromRaw(raw, ["tpa_low_rate"]),
            lowBreakpoint: this._intFromRaw(raw, ["tpa_low_breakpoint"]),
            lowAlways: this._intFromRaw(raw, ["tpa_low_always"]),
        };
    }

    // ── Simplified PID Sliders ──────────────────────────────────
    _parseSliders(raw) {
        return {
            mode: this._intFromRaw(raw, ["simplified_pids_mode"]),
            piGain: this._intFromRaw(raw, ["simplified_pi_gain"]),
            iGain: this._intFromRaw(raw, ["simplified_i_gain"]),
            dGain: this._intFromRaw(raw, ["simplified_d_gain"]),
            dMaxGain: this._intFromRaw(raw, ["simplified_dmax_gain", "simplified_d_max_gain"]),
            feedforwardGain: this._intFromRaw(raw, ["simplified_feedforward_gain"]),
            pitchDGain: this._intFromRaw(raw, ["simplified_pitch_d_gain"]),
            pitchPIGain: this._intFromRaw(raw, ["simplified_pitch_pi_gain"]),
            masterMultiplier: this._intFromRaw(raw, ["simplified_master_multiplier"]),
            dtermFilter: this._intFromRaw(raw, ["simplified_dterm_filter"]),
            dtermFilterMultiplier: this._intFromRaw(raw, ["simplified_dterm_filter_multiplier"]),
            gyroFilter: this._intFromRaw(raw, ["simplified_gyro_filter"]),
            gyroFilterMultiplier: this._intFromRaw(raw, ["simplified_gyro_filter_multiplier"]),
        };
    }

    // ── Battery ─────────────────────────────────────────────────
    _parseBattery(raw) {
        let cellVoltage = this._csv(raw["vbatcellvoltage"]);
        let currentMeter = this._csvFromRaw(raw, ["currentSensor", "currentMeter"]);

        return {
            scale: this._intFromRaw(raw, ["vbat_scale", "vbatscale"]),
            ref: this._intFromRaw(raw, ["vbatref"]),
            minCellVoltage: cellVoltage[0] || null,
            warningCellVoltage: cellVoltage[1] || null,
            maxCellVoltage: cellVoltage[2] || null,
            pidCompensation: this._intFromRaw(raw, ["vbat_pid_compensation"]),
            sagCompensation: this._intFromRaw(raw, ["vbat_sag_compensation"]),
            currentMeterOffset: currentMeter[0] || null,
            currentMeterScale: currentMeter[1] || null,
        };
    }

    // ── Misc ────────────────────────────────────────────────────
    _parseMisc(raw) {
        return {
            looptime: this._intFromRaw(raw, ["looptime"]),
            gyroSyncDenom: this._intFromRaw(raw, ["gyro_sync_denom"]),
            features: this._intFromRaw(raw, ["features"]),
            debugMode: this._intFromRaw(raw, ["debug_mode"]),
            acc1G: this._intFromRaw(raw, ["acc_1G"]),
            gyroScale: raw["gyro_scale"] || raw["gyro.scale"] || null,
            airmodeThrottle: this._intFromRaw(raw, ["airmode_activate_throttle"]),
            throttleBoost: this._intFromRaw(raw, ["throttle_boost"]),
            throttleBoostCutoff: this._intFromRaw(raw, ["throttle_boost_cutoff"]),
            thrustLinear: this._intFromRaw(raw, ["thrust_linear"]),
            mixerType: raw["mixer_type"] || null,
        };
    }

    // ── Frame Field Definitions ─────────────────────────────────
    _parseFrameFields(raw) {
        let fields = {};
        let frameTypes = ["I", "P", "S", "G", "H"];

        for (let i = 0; i < frameTypes.length; i++) {
            let ft = frameTypes[i];
            let nameKey = `Field ${ft} name`;
            let hasPred = raw[`Field ${ft} predictor`] !== undefined;
            let hasEnc = raw[`Field ${ft} encoding`] !== undefined;

            if (raw[nameKey]) {
                // Has its own field names
                fields[ft] = {
                    names: raw[nameKey].split(",").map(function (s) {
                        return s.trim();
                    }),
                    signed: this._csv(raw[`Field ${ft} signed`]),
                    predictor: this._csv(raw[`Field ${ft} predictor`]),
                    encoding: this._csv(raw[`Field ${ft} encoding`]),
                };
            } else if ((hasPred || hasEnc) && fields.I) {
                // BF 4.5+: P-frames have predictor/encoding but no name header.
                // Inherit field names from I-frame.
                fields[ft] = {
                    names: fields.I.names,
                    signed: fields.I.signed,
                    predictor: this._csv(raw[`Field ${ft} predictor`]),
                    encoding: this._csv(raw[`Field ${ft} encoding`]),
                };
            }
        }

        return fields;
    }
}

export { BBLHeaderParser };
