import semver from "semver";
import {
    adjustFieldDefsList,
    FlightLogEvent,
    FIRMWARE_TYPE_UNKNOWN,
    FIRMWARE_TYPE_BASEFLIGHT,
    FIRMWARE_TYPE_CLEANFLIGHT,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_INAV,
} from "./flightlog_fielddefs";
import { ArrayDataStream } from "./datastream";
import "./decoders";
import {
    hexToFloat,
    uint32ToFloat,
    asciiArrayToString,
    asciiStringToByteArray,
    signExtend14Bit,
    stringHasComma,
    parseCommaSeparatedString,
} from "./tools";
import {
    API_VERSION_1_44,
    API_VERSION_1_45,
    API_VERSION_1_46,
    API_VERSION_1_47,
    API_VERSION_1_48,
} from "../js/data_storage";

/**
 * Maps a blackbox log's firmware revision (firmware type + version) to the MSP
 * API version whose debug-mode / debug-field definitions match it.
 *
 * A blackbox log header carries only a firmware revision string (no API
 * version), but the shared debug definitions (`getDebugModes` /
 * `getDebugFieldNames` in `src/js/utils/debugModes.js`) are keyed by API
 * version. Resolving the version here — at the core, where the log's firmware
 * identity is established — lets every consumer simply read
 * `sysConfig.apiVersion`, mirroring how the FC store exposes `config.apiVersion`.
 *
 * The result is clamped to the configurator's supported range
 * [API_VERSION_1_44, API_VERSION_1_48]. Non-Betaflight firmware
 * (Cleanflight / iNav / Baseflight / unknown) and anything below the floor
 * resolve to API_VERSION_1_44, which yields the base definition tables.
 *
 * Known Betaflight version <-> API pairs:
 *   - 4.4.x          -> 1.45
 *   - 4.5.x          -> 1.46
 *   - 2025.12.x      -> 1.47
 *   - 2026.x and up  -> 1.48
 * Anything older (incl. legacy "0.0.0") -> 1.44.
 *
 * @param {number} firmwareType - sysConfig.firmwareType id.
 * @param {string} firmwareVersion - sysConfig.firmwareVersion, e.g. "4.5.0".
 * @returns {string} An API version string in [1.44.0, 1.48.0].
 */
function firmwareToApiVersion(firmwareType, firmwareVersion) {
    if (firmwareType !== FIRMWARE_TYPE_BETAFLIGHT) {
        return API_VERSION_1_44;
    }

    const version = semver.valid(semver.coerce(firmwareVersion));
    if (!version) {
        return API_VERSION_1_44;
    }

    // Betaflight switched from 4.x to a year-based scheme (2025.12, 2026.x),
    // so a calendar version always compares greater than any 4.x version.
    if (semver.gte(version, "2026.0.0")) {
        return API_VERSION_1_48;
    }
    if (semver.gte(version, "2025.12.0")) {
        return API_VERSION_1_47;
    }
    if (semver.gte(version, "4.5.0")) {
        return API_VERSION_1_46;
    }
    if (semver.gte(version, "4.4.0")) {
        return API_VERSION_1_45;
    }

    return API_VERSION_1_44;
}

function mapFieldNamesToIndex(fieldNames) {
    const result = {};

    for (let i = 0; i < fieldNames.length; i++) {
        result[fieldNames[i]] = i;
    }

    return result;
}

/**
 * Translates old field names in the given array to their modern equivalents and return the passed array.
 */
function translateLegacyFieldNames(names) {
    for (let i = 0; i < names.length; i++) {
        const matches = names[i].match(/^gyroData(.+)$/);

        if (matches) {
            names[i] = `gyroADC${matches[1]}`;
        }
    }

    return names;
}

export function FlightLogParser(logData) {
    //Private constants:
    const FLIGHT_LOG_MAX_FRAME_LENGTH = 256,
        //Assume that even in the most woeful logging situation, we won't miss 10 seconds of frames
        MAXIMUM_TIME_JUMP_BETWEEN_FRAMES = 10 * 1000000,
        //Likewise for iteration count
        MAXIMUM_ITERATION_JUMP_BETWEEN_FRAMES = 500 * 10,
        // Flight log field predictors:

        //No prediction:
        FLIGHT_LOG_FIELD_PREDICTOR_0 = 0,
        //Predict that the field is the same as last frame:
        FLIGHT_LOG_FIELD_PREDICTOR_PREVIOUS = 1,
        //Predict that the slope between this field and the previous item is the same as that between the past two history items:
        FLIGHT_LOG_FIELD_PREDICTOR_STRAIGHT_LINE = 2,
        //Predict that this field is the same as the average of the last two history items:
        FLIGHT_LOG_FIELD_PREDICTOR_AVERAGE_2 = 3,
        //Predict that this field is minthrottle
        FLIGHT_LOG_FIELD_PREDICTOR_MINTHROTTLE = 4,
        //Predict that this field is the same as motor 0
        FLIGHT_LOG_FIELD_PREDICTOR_MOTOR_0 = 5,
        //This field always increments
        FLIGHT_LOG_FIELD_PREDICTOR_INC = 6,
        //Predict this GPS co-ordinate is the GPS home co-ordinate (or no prediction if that coordinate is not set)
        FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD = 7,
        //Predict 1500
        FLIGHT_LOG_FIELD_PREDICTOR_1500 = 8,
        //Predict vbatref, the reference ADC level stored in the header
        FLIGHT_LOG_FIELD_PREDICTOR_VBATREF = 9,
        //Predict the last time value written in the main stream
        FLIGHT_LOG_FIELD_PREDICTOR_LAST_MAIN_FRAME_TIME = 10,
        //Predict that this field is minthrottle
        FLIGHT_LOG_FIELD_PREDICTOR_MINMOTOR = 11,
        //Home coord predictors appear in pairs (two copies of FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD). Rewrite the second
        //one we see to this to make parsing easier
        FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD_1 = 256,
        FLIGHT_LOG_FIELD_ENCODING_SIGNED_VB = 0, // Signed variable-byte
        FLIGHT_LOG_FIELD_ENCODING_UNSIGNED_VB = 1, // Unsigned variable-byte
        FLIGHT_LOG_FIELD_ENCODING_NEG_14BIT = 3, // Unsigned variable-byte but we negate the value before storing, value is 14 bits
        FLIGHT_LOG_FIELD_ENCODING_TAG8_8SVB = 6,
        FLIGHT_LOG_FIELD_ENCODING_TAG2_3S32 = 7,
        FLIGHT_LOG_FIELD_ENCODING_TAG8_4S16 = 8,
        FLIGHT_LOG_FIELD_ENCODING_NULL = 9, // Nothing is written to the file, take value to be zero
        FLIGHT_LOG_FIELD_ENCODING_TAG2_3SVARIABLE = 10,
        EOF = ArrayDataStream.prototype.EOF,
        NEWLINE = "\n".codePointAt(0),
        INFLIGHT_ADJUSTMENT_FUNCTIONS = [
            {
                name: "None",
            },
            {
                name: "RC Rate",
                scale: 0.01,
            },
            {
                name: "RC Expo",
                scale: 0.01,
            },
            {
                name: "Throttle Expo",
                scale: 0.01,
            },
            {
                name: "Pitch & Roll Rate",
                scale: 0.01,
            },
            {
                name: "Yaw rate",
                scale: 0.01,
            },
            {
                name: "Pitch & Roll P",
                scale: 0.1,
                scalef: 1,
            },
            {
                name: "Pitch & Roll I",
                scale: 0.001,
                scalef: 0.1,
            },
            {
                name: "Pitch & Roll D",
                scalef: 1000,
            },
            {
                name: "Yaw P",
                scale: 0.1,
                scalef: 1,
            },
            {
                name: "Yaw I",
                scale: 0.001,
                scalef: 0.1,
            },
            {
                name: "Yaw D",
                scalef: 1000,
            },
            {
                name: "Rate Profile",
            },
            {
                name: "Pitch Rate",
                scale: 0.01,
            },
            {
                name: "Roll Rate",
                scale: 0.01,
            },
            {
                name: "Pitch P",
                scale: 0.1,
                scalef: 1,
            },
            {
                name: "Pitch I",
                scale: 0.001,
                scalef: 0.1,
            },
            {
                name: "Pitch D",
                scalef: 1000,
            },
            {
                name: "Roll P",
                scale: 0.1,
                scalef: 1,
            },
            {
                name: "Roll I",
                scale: 0.001,
                scalef: 0.1,
            },
            {
                name: "Roll D",
                scalef: 1000,
            },
        ];

    //Private variables:
    let dataVersion;
    const defaultSysConfig = {
        frameIntervalI: 32,
        frameIntervalPNum: 1,
        frameIntervalPDenom: 1,
        firmwareType: FIRMWARE_TYPE_UNKNOWN,
        // Resolved from the firmware revision once headers are parsed (see
        // firmwareToApiVersion); consumers read this instead of mapping per call.
        apiVersion: API_VERSION_1_44,
        rcRate: 90,
        vbatscale: 110,
        vbatref: 4095,
        vbatmincellvoltage: 33,
        vbatmaxcellvoltage: 43,
        vbatwarningcellvoltage: 35,
        gyroScale: 0.0001, // Not even close to the default, but it's hardware specific so we can't do much better
        acc_1G: 2048, // Ditto ^
        minthrottle: 1150,
        maxthrottle: 1850,
        currentMeterOffset: 0,
        currentMeterScale: 400,
        deviceUID: null,
    };
    // Blackbox log header parameter names.
    // each name should exist in the blackbox log of the current firmware, or
    // be an older name which is translated into a current name in the table below
    const defaultSysConfigExtension = {
        abs_control_gain: null, // Absolute control gain
        anti_gravity_gain: null, // Anti gravity gain
        anti_gravity_p_gain: null, // Anti gravity P gain
        anti_gravity_mode: null, // Anti gravity mode
        anti_gravity_threshold: null, // Anti gravity threshold for step mode
        anti_gravity_cutoff_hz: null, // Anti gravity Cutoff
        blackbox_high_resolution: null, // Blackbox high resolution mode
        thrMid: null, // Throttle Mid Position
        thrExpo: null, // Throttle Expo
        tpa_mode: null, // TPA Mode
        tpa_breakpoint: null, // TPA Breakpoint
        airmode_activate_throttle: null, // airmode activation level
        serialrx_provider: null, // name of the serial rx provider
        superExpoFactor: null, // Super Expo Factor
        rates: [null, null, null], // Rates [ROLL, PITCH, YAW]
        rate_limits: [1998, 1998, 1998], // Limits [ROLL, PITCH, YAW] with defaults for backward compatibility
        rc_rates: [null, null, null], // RC Rates [ROLL, PITCH, YAW]
        rc_expo: [null, null, null], // RC Expo [ROLL, PITCH, YAW]
        looptime: null, // Looptime
        gyro_sync_denom: null, // Gyro Sync Denom
        pid_process_denom: null, // PID Process Denom
        pidController: null, // Active PID Controller
        rollPID: [null, null, null], // Roll [P, I, D]
        pitchPID: [null, null, null], // Pitch[P, I, D]
        yawPID: [null, null, null], // Yaw  [P, I, D]
        altPID: [null, null, null], // Altitude Hold [P, I, D]
        posPID: [null, null, null], // Position Hold [P, I, D]
        posrPID: [null, null, null], // Position Rate [P, I, D]
        navrPID: [null, null, null], // Nav Rate      [P, I, D]
        levelPID: [null, null, null], // Level Mode    [P, I, D]
        magPID: null, // Magnetometer   P
        velPID: [null, null, null], // Velocity      [P, I, D]
        yaw_p_limit: null, // Yaw P Limit
        yaw_lpf_hz: null, // Yaw LowPass Filter Hz
        dterm_average_count: null, // DTerm Average Count
        rollPitchItermResetRate: null, // ITerm Reset rate for Roll and Pitch
        yawItermResetRate: null, // ITerm Reset Rate for Yaw
        dshot_bidir: null, // DShot bidir protocol enabled
        dterm_lpf_hz: null, // DTerm Lowpass Filter Hz
        dterm_lpf_dyn_hz: [null, null], // DTerm Lowpass Dynamic Filter Min and Max Hz
        dterm_lpf_dyn_expo: null, // DTerm Lowpass Dynamic Filter Expo
        dterm_lpf2_hz: null, // DTerm Lowpass Filter Hz 2
        dterm_differentiator: null, // DTerm Differentiator
        H_sensitivity: null, // Horizon Sensitivity
        iterm_reset_offset: null, // I-Term reset offset
        deadband: null, // Roll, Pitch Deadband
        yaw_deadband: null, // Yaw Deadband
        gyro_lpf: null, // Gyro lpf setting.
        gyro_32khz_hardware_lpf: null, // Gyro 32khz hardware lpf setting. (post BF3.4)
        gyro_lowpass_hz: null, // Gyro Soft Lowpass Filter Hz
        gyro_lowpass_dyn_hz: [null, null], // Gyro Soft Lowpass Dynamic Filter Min and Max Hz
        gyro_lowpass_dyn_expo: null, // Gyro Soft Lowpass Dynamic Filter Expo
        gyro_lowpass2_hz: null, // Gyro Soft Lowpass Filter Hz 2
        gyro_notch_hz: null, // Gyro Notch Frequency
        gyro_notch_cutoff: null, // Gyro Notch Cutoff
        gyro_rpm_notch_harmonics: null, // Number of Harmonics in the gyro rpm filter
        gyro_rpm_notch_q: null, // Value of Q in the gyro rpm filter
        gyro_rpm_notch_min: null, // Min Hz for the gyro rpm filter
        rpm_notch_lpf: null, // Cutoff for smoothing rpm filter data
        dterm_rpm_notch_harmonics: null, // Number of Harmonics in the dterm rpm filter
        dterm_rpm_notch_q: null, // Value of Q in the dterm rpm filter
        dterm_rpm_notch_min: null, // Min Hz for the dterm rpm filter
        dterm_notch_hz: null, // Dterm Notch Frequency
        dterm_notch_cutoff: null, // Dterm Notch Cutoff
        acc_lpf_hz: null, // Accelerometer Lowpass filter Hz
        acc_hardware: null, // Accelerometer Hardware type
        baro_hardware: null, // Barometer Hardware type
        mag_hardware: null, // Magnetometer Hardware type
        gyro_cal_on_first_arm: null, // Gyro Calibrate on first arm
        vbat_pid_compensation: null, // VBAT PID compensation
        rc_smoothing: null, // RC Control Smoothing
        rc_interpolation: null, // RC Control Interpolation type
        rc_interpolation_channels: null, // RC Control Interpotlation channels
        rc_interpolation_interval: null, // RC Control Interpolation Interval
        rc_smoothing_active_cutoffs: [null, null], // RC Smoothing active cutoffs
        rc_smoothing_cutoffs: [null, null], // RC Smoothing input and derivative cutoff
        rc_smoothing_filter_type: [null, null], // RC Smoothing input and derivative type
        rc_smoothing_rx_average: null, // RC Smoothing rx average read in ms
        rc_smoothing_debug_axis: null, // Axis recorded in the debug mode of rc_smoothing
        dterm_filter_type: null, // D term filtering type (PT1, BIQUAD, PT2, PT3)
        dterm_filter2_type: null, // D term 2 filtering type (PT1, BIQUAD, PT2, PT3)
        pidAtMinThrottle: null, // Stabilisation at zero throttle
        itermThrottleGain: null, // Betaflight PID
        ptermSetpointWeight: null, // Betaflight PID
        dtermSetpointWeight: null, // Betaflight PID
        yawRateAccelLimit: null, // Betaflight PID
        rateAccelLimit: null, // Betaflight PID
        gyro_soft_type: null, // Gyro soft filter type (PT1, BIQUAD, PT2, PT3)
        gyro_soft2_type: null, // Gyro soft filter 2 type (PT1, BIQUAD, PT2, PT3)
        debug_mode: null, // Selected Debug Mode
        features: null, // Activated features (e.g. MOTORSTOP etc)
        Craft_name: null, // Craft Name
        motorOutput: [null, null], // Minimum and maximum outputs to motor's
        digitalIdleOffset: null, // min throttle for d-shot (as a percentage)
        pidSumLimit: null, // PID sum limit
        pidSumLimitYaw: null, // PID sum limit yaw
        use_integrated_yaw: null, // Use integrated yaw
        d_max: [null, null, null], // D_MAX [ROLL, PITCH, YAW]
        d_max_gain: null, // D_MAX gain
        d_max_advance: null, // D_MAX advance
        iterm_relax: null, // ITerm Relax mode
        iterm_relax_type: null, // ITerm Relax type
        iterm_relax_cutoff: null, // ITerm Relax cutoff
        dyn_notch_range: null, // Dyn Notch Range (LOW, MED, HIGH or AUTO)
        dyn_notch_width_percent: null, // Dyn Notch width percent distance between the two notches
        dyn_notch_q: null, // Dyn Notch width of each dynamic filter
        dyn_notch_min_hz: null, // Dyn Notch min limit in Hz for the filter
        dyn_notch_max_hz: null, // Dyn Notch max limit in Hz for the filter
        rates_type: null,
        fields_disabled_mask: null,
        vbat_sag_compensation: null,
        gyro_to_use: null,
        gyro_enabled_bitmask: null,
        dynamic_idle_min_rpm: null,
        motor_poles: 1,
        ff_transition: null,
        ff_averaging: null,
        ff_smooth_factor: null,
        ff_jitter_factor: null,
        ff_boost: null,
        ff_max_rate_limit: null,
        rc_smoothing_mode: null, // ** 4.3** RC on or off (0 or 1)
        rc_smoothing_feedforward_hz: null, // RC Smoothing manual cutoff for feedforward
        rc_smoothing_setpoint_hz: null, // RC Smoothing manual cutoff for setpoint
        rc_smoothing_auto_factor_setpoint: null, // RC Smoothing auto factor for roll, pitch and yaw setpoint
        rc_smoothing_throttle_hz: null, // RC Smoothing manual cutoff for throttle
        rc_smoothing_auto_factor_throttle: null, // RC Smoothing cutoff for throttle
        rc_smoothing_active_cutoffs_ff_sp_thr: [null, null, null], // RC Smoothing active cutoffs feedforward, setpoint, throttle
        rc_smoothing_rx_smoothed: null,
        dyn_notch_count: null, // Number of dynamic notches 4.3
        rpm_filter_fade_range_hz: null, // Fade range for RPM notch filters in Hz
        dyn_idle_p_gain: null,
        dyn_idle_i_gain: null,
        dyn_idle_d_gain: null,
        dyn_idle_start_increase: null,
        dyn_idle_max_increase: null,
        simplified_pids_mode: null, // Simplified / slider PIDS
        simplified_pi_gain: null,
        simplified_i_gain: null,
        simplified_d_gain: null,
        simplified_d_max_gain: null,
        simplified_feedforward_gain: null,
        simplified_pitch_d_gain: null,
        simplified_pitch_pi_gain: null,
        simplified_master_multiplier: null,
        simplified_dterm_filter: null,
        simplified_dterm_filter_multiplier: null,
        simplified_gyro_filter: null,
        simplified_gyro_filter_multiplier: null,
        motor_output_limit: null, // motor output limit
        throttle_limit_type: null, // throttle limit
        throttle_limit_percent: null,
        throttle_boost: null, // throttle boost
        throttle_boost_cutoff: null,
        thrust_linear: null,
        tpa_low_rate: null,
        tpa_low_breakpoint: null,
        tpa_low_always: null,
        mixer_type: null,
        chirp_lag_freq_hz: null,
        chirp_lead_freq_hz: null,
        chirp_amplitude_roll: null,
        chirp_amplitude_pitch: null,
        chirp_amplitude_yaw: null,
        chirp_frequency_start_deci_hz: null,
        chirp_frequency_end_deci_hz: null,
        chirp_time_seconds: null,
        unknownHeaders: [], // Unknown Extra Headers
    };
    // Translation of the field values name to the sysConfig var where it must be stored
    // on the left are field names from the latest versions of blackbox.c
    // on the right are older field names that must exist in the list above
    const translationValues = {
        acc_limit_yaw: "yawRateAccelLimit",
        accel_limit: "rateAccelLimit",
        acc_limit: "rateAccelLimit",
        anti_gravity_thresh: "anti_gravity_threshold",
        currentSensor: "currentMeter",
        d_notch_cut: "dterm_notch_cutoff",
        d_setpoint_weight: "dtermSetpointWeight",
        dterm_lowpass_hz: "dterm_lpf_hz",
        dterm_lowpass_dyn_hz: "dterm_lpf_dyn_hz",
        dterm_lowpass2_hz: "dterm_lpf2_hz",
        dterm_lpf1_type: "dterm_filter_type",
        dterm_lpf1_static_hz: "dterm_lpf_hz",
        dterm_lpf1_dyn_hz: "dterm_lpf_dyn_hz",
        dterm_lpf1_dyn_expo: "dterm_lpf_dyn_expo",
        dterm_lpf2_type: "dterm_filter2_type",
        dterm_lpf2_static_hz: "dterm_lpf2_hz",
        dterm_setpoint_weight: "dtermSetpointWeight",
        digital_idle_value: "digitalIdleOffset",
        simplified_dmax_gain: "simplified_d_max_gain",
        d_max: "d_min",
        dshot_idle_value: "digitalIdleOffset",
        dyn_idle_min_rpm: "dynamic_idle_min_rpm",
        feedforward_transition: "ff_transition",
        feedforward_averaging: "ff_averaging",
        feedforward_smooth_factor: "ff_smooth_factor",
        feedforward_jitter_factor: "ff_jitter_factor",
        feedforward_boost: "ff_boost",
        feedforward_max_rate_limit: "ff_max_rate_limit",
        feedforward_weight: "dtermSetpointWeight",
        gyro_hardware_lpf: "gyro_lpf",
        gyro_lowpass: "gyro_lowpass_hz",
        gyro_lowpass_type: "gyro_soft_type",
        gyro_lowpass2_type: "gyro_soft2_type",
        gyro_lpf1_type: "gyro_soft_type",
        gyro_lpf1_static_hz: "gyro_lowpass_hz",
        gyro_lpf1_dyn_hz: "gyro_lowpass_dyn_hz",
        gyro_lpf1_dyn_expo: "gyro_lowpass_dyn_expo",
        gyro_lpf2_type: "gyro_soft2_type",
        gyro_lpf2_static_hz: "gyro_lowpass2_hz",
        "gyro.scale": "gyro_scale",
        iterm_windup: "itermWindupPointPercent",
        motor_pwm_protocol: "fast_pwm_protocol",
        pid_at_min_throttle: "pidAtMinThrottle",
        pidsum_limit: "pidSumLimit",
        pidsum_limit_yaw: "pidSumLimitYaw",
        rc_expo_yaw: "rcYawExpo",
        rc_interp: "rc_interpolation",
        rc_interp_int: "rc_interpolation_interval",
        rc_rate: "rc_rates",
        rc_rate_yaw: "rcYawRate",
        rc_smoothing: "rc_smoothing_mode",
        rc_smoothing_auto_factor: "rc_smoothing_auto_factor_setpoint",
        rc_smoothing_feedforward_cutoff: "rc_smoothing_feedforward_hz",
        rc_smoothing_setpoint_cutoff: "rc_smoothing_setpoint_hz",
        rc_smoothing_throttle_cutoff: "rc_smoothing_throttle_hz",
        rc_smoothing_type: "rc_smoothing_mode",
        rc_yaw_expo: "rcYawExpo",
        rcExpo: "rc_expo",
        rcRate: "rc_rates",
        rpm_filter_harmonics: "gyro_rpm_notch_harmonics",
        rpm_filter_q: "gyro_rpm_notch_q",
        rpm_filter_min_hz: "gyro_rpm_notch_min",
        rpm_filter_lpf_hz: "rpm_notch_lpf",
        setpoint_relax_ratio: "setpointRelaxRatio",
        setpoint_relaxation_ratio: "setpointRelaxRatio",
        thr_expo: "thrExpo",
        thr_mid: "thrMid",
        dynThrPID: "tpa_rate",
        use_unsynced_pwm: "unsynced_fast_pwm",
        vbat_scale: "vbatscale",
        vbat_pid_gain: "vbat_pid_compensation",
        yaw_accel_limit: "yawRateAccelLimit",
        yaw_lowpass_hz: "yaw_lpf_hz",
        thrust_linear: "thrust_linear",
        tpa_low_rate: "tpa_low_rate",
        tpa_low_breakpoint: "tpa_low_breakpoint",
        tpa_low_always: "tpa_low_always",
        mixer_type: "mixer_type",
        chirp_lag_freq_hz: "chirp_lag_freq_hz",
        chirp_lead_freq_hz: "chirp_lead_freq_hz",
        chirp_amplitude_roll: "chirp_amplitude_roll",
        chirp_amplitude_pitch: "chirp_amplitude_pitch",
        chirp_amplitude_yaw: "chirp_amplitude_yaw",
        chirp_frequency_start_deci_hz: "chirp_frequency_start_deci_hz",
        chirp_frequency_end_deci_hz: "chirp_frequency_end_deci_hz",
        chirp_time_seconds: "chirp_time_seconds",
        // MULTI_GYRO to DUAL_GYRO debug mode aliases
        multi_gyro: "dual_gyro",
        multi_gyro_raw: "dual_gyro_raw",
        multi_gyro_combined: "dual_gyro_combined",
        multi_gyro_diff: "dual_gyro_diff",
        multi_gyro_scaled: "dual_gyro_scaled",
    };
    // frameTypes and stream are initialized at the end of the constructor (after function definitions)
    // Blackbox state:
    let mainHistoryRing;
    /* Points into blackboxHistoryRing to give us a circular buffer.
     *
     * 0 - space to decode new frames into, 1 - previous frame, 2 - previous previous frame
     *
     * Previous frame pointers are null when no valid history exists of that age.
     */
    const mainHistory = [null, null, null];
    let mainStreamIsValid = false;
    let gpsHomeHistory = new Array(2); // 0 - space to decode new frames into, 1 - previous frame
    let gpsHomeIsValid = false;
    //Because these events don't depend on previous events, we don't keep copies of the old state, just the current one:
    let lastEvent, lastGPS, lastSlow;
    // How many intentionally un-logged frames did we skip over before we decoded the current frame?
    let lastSkippedFrames;
    // Details about the last main frame that was successfully parsed
    let lastMainFrameIteration, lastMainFrameTime;

    //Public fields:

    /* Information about the frame types the log contains, along with details on their fields.
     * Each entry is an object with field details {encoding:[], predictor:[], name:[], count:0, signed:[]}
     */
    this.frameDefs = {};

    // Lets add the custom extensions
    const completeSysConfig = { ...defaultSysConfig, ...defaultSysConfigExtension };
    this.sysConfig = Object.create(completeSysConfig);

    /*
     * Event handler of the signature (frameValid, frame, frameType, frameOffset, frameSize)
     * called when a frame has been decoded.
     */
    this.onFrameReady = null;

    /**
     * Translates the name of a field to the parameter in sysConfig object equivalent
     *
     * fieldName Name of the field to translate
     * returns The equivalent in the sysConfig object or the fieldName if not found
     */
    function translateFieldName(fieldName) {
        const translation = translationValues[fieldName];
        if (translation === undefined) {
            return fieldName;
        } else {
            return translation;
        }
    }

    // Sets of field names for dispatch-based header parsing (avoids large switch statement)

    // Fields parsed as simple parseInt and stored directly in sysConfig
    const PARSE_INT_FIELDS = new Set([
        "rcRate",
        "thrMid",
        "thrExpo",
        "tpa_rate",
        "tpa_mode",
        "tpa_breakpoint",
        "airmode_activate_throttle",
        "serialrx_provider",
        "looptime",
        "gyro_sync_denom",
        "pid_process_denom",
        "pidController",
        "yaw_p_limit",
        "dterm_average_count",
        "rollPitchItermResetRate",
        "yawItermResetRate",
        "rollPitchItermIgnoreRate",
        "yawItermIgnoreRate",
        "dterm_differentiator",
        "deltaMethod",
        "dynamic_dterm_threshold",
        "dynamic_pterm",
        "iterm_reset_offset",
        "deadband",
        "yaw_deadband",
        "gyro_lpf",
        "gyro_hardware_lpf",
        "gyro_32khz_hardware_lpf",
        "acc_lpf_hz",
        "acc_hardware",
        "baro_hardware",
        "mag_hardware",
        "gyro_cal_on_first_arm",
        "vbat_pid_compensation",
        "rc_smoothing",
        "rc_smoothing_type",
        "rc_smoothing_debug_axis",
        "rc_smoothing_rx_average",
        "rc_smoothing_rx_smoothed",
        "rc_smoothing_mode",
        "rc_smoothing_auto_factor_setpoint",
        "rc_smoothing_auto_factor_throttle",
        "rc_smoothing_feedforward_hz",
        "rc_smoothing_setpoint_hz",
        "rc_smoothing_throttle_hz",
        "superExpoYawMode",
        "features",
        "dynamic_pid",
        "rc_interpolation",
        "rc_interpolation_channels",
        "rc_interpolation_interval",
        "unsynced_fast_pwm",
        "fast_pwm_protocol",
        "motor_pwm_rate",
        "vbatscale",
        "vbatref",
        "acc_1G",
        "dterm_filter_type",
        "dterm_filter2_type",
        "pidAtMinThrottle",
        "pidSumLimit",
        "pidSumLimitYaw",
        "anti_gravity_threshold",
        "itermWindupPointPercent",
        "ptermSRateWeight",
        "setpointRelaxRatio",
        "ff_transition",
        "ff_averaging",
        "ff_smooth_factor",
        "ff_jitter_factor",
        "ff_boost",
        "ff_max_rate_limit",
        "dtermSetpointWeight",
        "gyro_soft_type",
        "gyro_soft2_type",
        "debug_mode",
        "anti_gravity_mode",
        "anti_gravity_gain",
        "anti_gravity_p_gain",
        "anti_gravity_cutoff_hz",
        "abs_control_gain",
        "use_integrated_yaw",
        "d_max_gain",
        "d_max_advance",
        "dshot_bidir",
        "gyro_rpm_notch_harmonics",
        "gyro_rpm_notch_q",
        "gyro_rpm_notch_min",
        "rpm_filter_fade_range_hz",
        "rpm_notch_lpf",
        "dterm_rpm_notch_harmonics",
        "dterm_rpm_notch_q",
        "dterm_rpm_notch_min",
        "iterm_relax",
        "iterm_relax_type",
        "iterm_relax_cutoff",
        "dyn_notch_range",
        "dyn_notch_width_percent",
        "dyn_notch_q",
        "dyn_notch_count",
        "dyn_notch_min_hz",
        "dyn_notch_max_hz",
        "rates_type",
        "vbat_sag_compensation",
        "fields_disabled_mask",
        "motor_pwm_protocol",
        "gyro_to_use",
        "gyro_enabled_bitmask",
        "dynamic_idle_min_rpm",
        "dyn_idle_p_gain",
        "dyn_idle_i_gain",
        "dyn_idle_d_gain",
        "dyn_idle_start_increase",
        "dyn_idle_max_increase",
        "simplified_pids_mode",
        "simplified_pi_gain",
        "simplified_i_gain",
        "simplified_d_gain",
        "simplified_dmax_gain",
        "simplified_d_max_gain",
        "simplified_feedforward_gain",
        "simplified_pitch_d_gain",
        "simplified_pitch_pi_gain",
        "simplified_master_multiplier",
        "simplified_dterm_filter",
        "simplified_dterm_filter_multiplier",
        "simplified_gyro_filter",
        "simplified_gyro_filter_multiplier",
        "motor_output_limit",
        "throttle_limit_type",
        "throttle_limit_percent",
        "throttle_boost",
        "throttle_boost_cutoff",
        "motor_poles",
        "blackbox_high_resolution",
        // Legacy firmware log headers
        "dterm_cut_hz",
        "acc_cut_hz",
    ]);

    // Fields parsed as CSV and stored directly in sysConfig
    const CSV_FIELDS = new Set([
        "rates",
        "rate_limits",
        "rollPID",
        "pitchPID",
        "yawPID",
        "altPID",
        "posPID",
        "posrPID",
        "navrPID",
        "levelPID",
        "velPID",
        "motorOutput",
        "rc_smoothing_cutoffs",
        "rc_smoothing_active_cutoffs",
        "rc_smoothing_active_cutoffs_ff_sp_thr",
        "gyro_lowpass_dyn_hz",
        "gyro_lowpass_dyn_expo",
        "dterm_lpf_dyn_expo",
        "thrust_linear",
        "tpa_low_rate",
        "tpa_low_breakpoint",
        "tpa_low_always",
        "mixer_type",
        "chirp_lag_freq_hz",
        "chirp_lead_freq_hz",
        "chirp_amplitude_roll",
        "chirp_amplitude_pitch",
        "chirp_amplitude_yaw",
        "chirp_frequency_start_deci_hz",
        "chirp_frequency_end_deci_hz",
        "chirp_time_seconds",
        "dterm_lpf_dyn_hz",
    ]);

    // Fields where parseInt value is divided by 100 on older firmware, raw on newer
    const VERSION_CONDITIONAL_INT_FIELDS = new Set([
        "yaw_lpf_hz",
        "gyro_lowpass_hz",
        "gyro_lowpass2_hz",
        "dterm_notch_hz",
        "dterm_notch_cutoff",
        "dterm_lpf_hz",
        "dterm_lpf2_hz",
    ]);

    // Fields where value is CSV on newer firmware, parseInt/100 on older
    const VERSION_CONDITIONAL_CSV_FIELDS = new Set(["gyro_notch_hz", "gyro_notch_cutoff"]);

    // Fields stored as raw string values
    const STRING_FIELDS = new Set([
        "Product",
        "Blackbox version",
        "Firmware date",
        "Board information",
        "Craft name",
        "Log start datetime",
    ]);

    // Fields where parseInt value is divided by 1000 on newer firmware
    const ACCEL_LIMIT_FIELDS = new Set(["yawRateAccelLimit", "rateAccelLimit"]);

    // Fields where parseInt value is divided by 100
    const DIVIDE_100_FIELDS = new Set(["motor_idle", "digitalIdleOffset"]);

    /**
     * Check if firmware meets the 3.0.1/2.0.0 version threshold for filter fields
     */
    const isModernFilterFirmware = () =>
        (this.sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
            semver.gte(this.sysConfig.firmwareVersion, "3.0.1")) ||
        (this.sysConfig.firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
            semver.gte(this.sysConfig.firmwareVersion, "2.0.0"));

    /**
     * Parse "Firmware revision" header value and set firmware type/version in sysConfig
     */
    const parseFirmwareRevision = (fieldValue) => {
        // Extract the firmware revision in case of Betaflight/Raceflight/Cleanflight 2.x/Other
        const fwMatches = /((?:Beta|Race|Clean|Base|Butter)flight)\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(fieldValue);
        const FIRMWARE_NAME_MAP = {
            betaflight: FIRMWARE_TYPE_BETAFLIGHT,
            raceflight: FIRMWARE_TYPE_BETAFLIGHT,
            butterflight: FIRMWARE_TYPE_BETAFLIGHT,
            cleanflight: FIRMWARE_TYPE_CLEANFLIGHT,
            baseflight: FIRMWARE_TYPE_BASEFLIGHT,
        };

        if (fwMatches != null) {
            this.sysConfig.firmwareType = FIRMWARE_NAME_MAP[fwMatches[1].toLowerCase()] ?? FIRMWARE_TYPE_BETAFLIGHT;

            this.sysConfig.firmware = `${Number.parseInt(fwMatches[2], 10)}.${Number.parseInt(fwMatches[3], 10)}`;
            this.sysConfig.firmwarePatch = fwMatches[4] ? Number.parseInt(fwMatches[4], 10) : "0";
            this.sysConfig.firmwareVersion = `${this.sysConfig.firmware}.${this.sysConfig.firmwarePatch}`;
            return;
        }

        // Try to detect INAV
        const inavMatches = /(INAV).* (\d+)\.(\d+)(?:\.(\d+))?/i.exec(fieldValue);
        if (inavMatches != null) {
            this.sysConfig.firmwareType = FIRMWARE_TYPE_INAV;
            this.sysConfig.firmware = `${Number.parseInt(inavMatches[2], 10)}.${Number.parseInt(inavMatches[3], 10)}`;
            this.sysConfig.firmwarePatch = inavMatches[4] ? Number.parseInt(inavMatches[4], 10) : "0";
            this.sysConfig.firmwareVersion = `${this.sysConfig.firmware}.${this.sysConfig.firmwarePatch}`;
            return;
        }

        // Legacy firmware versions
        this.sysConfig.firmwareVersion = "0.0.0";
        this.sysConfig.firmware = 0;
        this.sysConfig.firmwarePatch = 0;
    };

    /**
     * Parse "Field X ..." header and update frameDefs
     */
    const parseFieldDefinition = (fieldName, fieldValue) => {
        const matches = fieldName.match(/^Field (.) (.+)$/);
        if (!matches) {
            return false;
        }

        const frameName = matches[1];
        const frameInfo = matches[2];

        if (!this.frameDefs[frameName]) {
            this.frameDefs[frameName] = {
                name: [],
                nameToIndex: {},
                count: 0,
                signed: [],
                predictor: [],
                encoding: [],
            };
        }

        const frameDef = this.frameDefs[frameName];

        const frameInfoHandlers = {
            predictor: () => {
                frameDef.predictor = parseCommaSeparatedString(fieldValue);
            },
            encoding: () => {
                frameDef.encoding = parseCommaSeparatedString(fieldValue);
            },
            name: () => {
                frameDef.name = translateLegacyFieldNames(fieldValue.split(","));
                frameDef.count = frameDef.name.length;
                frameDef.nameToIndex = mapFieldNamesToIndex(frameDef.name);
                /*
                 * We could survive with the `signed` header just being filled with zeros, so if it is absent
                 * then resize it to length.
                 */
                frameDef.signed.length = frameDef.count;
            },
            signed: () => {
                frameDef.signed = parseCommaSeparatedString(fieldValue);
            },
        };

        const handler = frameInfoHandlers[frameInfo];
        if (handler) {
            handler();
        } else {
            console.log(`Saw unsupported field header "${fieldName}"`);
        }

        return true;
    };

    // Unified dispatch map for all header fields (replaces Set lookups + switch)
    const parseIntHandler = (fn, fv) => {
        this.sysConfig[fn] = Number.parseInt(fv, 10);
    };
    const csvHandler = (fn, fv) => {
        this.sysConfig[fn] = parseCommaSeparatedString(fv);
    };
    const versionCondIntHandler = (fn, fv) => {
        this.sysConfig[fn] = isModernFilterFirmware() ? Number.parseInt(fv, 10) : Number.parseInt(fv, 10) / 100;
    };
    const versionCondCsvHandler = (fn, fv) => {
        this.sysConfig[fn] = isModernFilterFirmware() ? parseCommaSeparatedString(fv) : Number.parseInt(fv, 10) / 100;
    };
    const accelLimitHandler = (fn, fv) => {
        const isBfModern =
            this.sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
            semver.gte(this.sysConfig.firmwareVersion, "3.1.0");
        const isCfModern =
            this.sysConfig.firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
            semver.gte(this.sysConfig.firmwareVersion, "2.0.0");
        this.sysConfig[fn] = isBfModern || isCfModern ? Number.parseInt(fv, 10) / 1000 : Number.parseInt(fv, 10);
    };
    const divide100Handler = (fn, fv) => {
        this.sysConfig[fn] = Number.parseInt(fv, 10) / 100;
    };
    const stringHandler = (fn, fv) => {
        this.sysConfig[fn] = fv;
    };
    const rcExpoRateHandler = (fn, fv) => {
        if (stringHasComma(fv)) {
            this.sysConfig[fn] = parseCommaSeparatedString(fv);
        } else {
            this.sysConfig[fn][0] = Number.parseInt(fv, 10);
            this.sysConfig[fn][1] = Number.parseInt(fv, 10);
        }
    };
    const pidArrayPushHandler = (_fn, fv) => {
        const values = parseCommaSeparatedString(fv);
        this.sysConfig["rollPID"].push(values[0]);
        this.sysConfig["pitchPID"].push(values[1]);
        this.sysConfig["yawPID"].push(values[2]);
    };
    const currentMeterHandler = (_fn, fv) => {
        const params = parseCommaSeparatedString(fv);
        this.sysConfig.currentMeterOffset = params[0];
        this.sysConfig.currentMeterScale = params[1];
    };
    const gyroScaleHandler = (_fn, fv) => {
        this.sysConfig.gyroScale = hexToFloat(fv);
        /* Legacy firmware uses a gyroScale that'll give radians per microsecond as output, whereas modern firmware produces degrees
         * per second and leaves the conversion to radians per us to the IMU. Let's convert the scale to
         * match the legacy format so we can use a consistent IMU for all firmware types: */
        if (
            this.sysConfig.firmwareType === FIRMWARE_TYPE_INAV ||
            this.sysConfig.firmwareType === FIRMWARE_TYPE_CLEANFLIGHT ||
            this.sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT
        ) {
            this.sysConfig.gyroScale *= (Math.PI / 180) * 0.000001;
        }
    };
    const noopHandler = () => {};

    const HEADER_HANDLERS = {};
    for (const field of PARSE_INT_FIELDS) {
        HEADER_HANDLERS[field] = parseIntHandler;
    }
    for (const field of CSV_FIELDS) {
        HEADER_HANDLERS[field] = csvHandler;
    }
    for (const field of VERSION_CONDITIONAL_INT_FIELDS) {
        HEADER_HANDLERS[field] = versionCondIntHandler;
    }
    for (const field of VERSION_CONDITIONAL_CSV_FIELDS) {
        HEADER_HANDLERS[field] = versionCondCsvHandler;
    }
    for (const field of ACCEL_LIMIT_FIELDS) {
        HEADER_HANDLERS[field] = accelLimitHandler;
    }
    for (const field of DIVIDE_100_FIELDS) {
        HEADER_HANDLERS[field] = divide100Handler;
    }
    for (const field of STRING_FIELDS) {
        HEADER_HANDLERS[field] = stringHandler;
    }

    // Individual handlers with unique logic
    HEADER_HANDLERS["I interval"] = (_fn, fv) => {
        this.sysConfig.frameIntervalI = Number.parseInt(fv, 10);
        if (this.sysConfig.frameIntervalI < 1) {
            this.sysConfig.frameIntervalI = 1;
        }
    };
    HEADER_HANDLERS["P interval"] = (_fn, fv) => {
        const slashIdx = fv.indexOf("/");
        if (slashIdx === -1) {
            this.sysConfig.frameIntervalPNum = 1;
            this.sysConfig.frameIntervalPDenom = Number.parseInt(fv, 10);
        } else {
            this.sysConfig.frameIntervalPNum = Number.parseInt(fv.substring(0, slashIdx), 10);
            this.sysConfig.frameIntervalPDenom = Number.parseInt(fv.substring(slashIdx + 1), 10);
        }
    };
    HEADER_HANDLERS["P denom"] = noopHandler;
    HEADER_HANDLERS["P ratio"] = noopHandler;
    HEADER_HANDLERS["Data version"] = (_fn, fv) => {
        dataVersion = Number.parseInt(fv, 10);
    };
    HEADER_HANDLERS["Firmware type"] = (_fn, fv) => {
        this.sysConfig.firmwareType = fv === "Cleanflight" ? FIRMWARE_TYPE_CLEANFLIGHT : FIRMWARE_TYPE_BASEFLIGHT;
    };
    HEADER_HANDLERS["minthrottle"] = (fn, fv) => {
        this.sysConfig[fn] = Number.parseInt(fv, 10);
        this.sysConfig.motorOutput[0] = this.sysConfig[fn];
    };
    HEADER_HANDLERS["maxthrottle"] = (fn, fv) => {
        this.sysConfig[fn] = Number.parseInt(fv, 10);
        this.sysConfig.motorOutput[1] = this.sysConfig[fn];
    };
    HEADER_HANDLERS["rc_expo"] = rcExpoRateHandler;
    HEADER_HANDLERS["rc_rates"] = rcExpoRateHandler;
    HEADER_HANDLERS["rcYawExpo"] = (_fn, fv) => {
        this.sysConfig["rc_expo"][2] = Number.parseInt(fv, 10);
    };
    HEADER_HANDLERS["rcYawRate"] = (_fn, fv) => {
        this.sysConfig["rc_rates"][2] = Number.parseInt(fv, 10);
    };
    HEADER_HANDLERS["superExpoFactor"] = (_fn, fv) => {
        if (stringHasComma(fv)) {
            const expoParams = parseCommaSeparatedString(fv);
            this.sysConfig.superExpoFactor = expoParams[0];
            this.sysConfig.superExpoFactorYaw = expoParams[1];
        } else {
            this.sysConfig.superExpoFactor = Number.parseInt(fv, 10);
        }
    };
    HEADER_HANDLERS["magPID"] = (_fn, fv) => {
        this.sysConfig.magPID = parseCommaSeparatedString(fv, 3);
    };
    HEADER_HANDLERS["d_min"] = pidArrayPushHandler;
    HEADER_HANDLERS["d_max"] = pidArrayPushHandler;
    HEADER_HANDLERS["ff_weight"] = pidArrayPushHandler;
    HEADER_HANDLERS["vbatcellvoltage"] = (_fn, fv) => {
        const params = parseCommaSeparatedString(fv);
        this.sysConfig.vbatmincellvoltage = params[0];
        this.sysConfig.vbatwarningcellvoltage = params[1];
        this.sysConfig.vbatmaxcellvoltage = params[2];
    };
    HEADER_HANDLERS["currentMeter"] = currentMeterHandler;
    HEADER_HANDLERS["currentSensor"] = currentMeterHandler;
    HEADER_HANDLERS["gyro.scale"] = gyroScaleHandler;
    HEADER_HANDLERS["gyro_scale"] = gyroScaleHandler;
    HEADER_HANDLERS["Firmware revision"] = (fn, fv) => {
        parseFirmwareRevision(fv);
        this.sysConfig[fn] = fv;
    };
    HEADER_HANDLERS["DeviceUID"] = (_fn, fv) => {
        this.sysConfig.deviceUID = fv;
    };

    const parseHeaderLine = () => {
        const COLON = ":".codePointAt(0);
        let separatorPos = false;

        if (stream.peekChar() !== " ") {
            return;
        }

        //Skip the leading space
        stream.readChar();

        const lineStart = stream.pos;

        for (; stream.pos < lineStart + 1024 && stream.pos < stream.end; stream.pos++) {
            if (separatorPos === false && stream.data[stream.pos] === COLON) {
                separatorPos = stream.pos;
            }

            if (stream.data[stream.pos] === NEWLINE || stream.data[stream.pos] === 0) {
                break;
            }
        }

        if (stream.data[stream.pos] !== NEWLINE || separatorPos === false) {
            return;
        }

        const lineEnd = stream.pos;

        const fieldName = translateFieldName(asciiArrayToString(stream.data.subarray(lineStart, separatorPos)));
        const fieldValue = asciiArrayToString(stream.data.subarray(separatorPos + 1, lineEnd));

        const handler = HEADER_HANDLERS[fieldName];
        if (handler) {
            handler(fieldName, fieldValue);
        } else if (!parseFieldDefinition(fieldName, fieldValue)) {
            console.log(`Ignoring unsupported header ${fieldName} ${fieldValue}`);
            this.sysConfig.unknownHeaders ??= [];
            this.sysConfig.unknownHeaders.push({
                name: fieldName,
                value: fieldValue,
            });
        }
    };

    function invalidateMainStream() {
        mainStreamIsValid = false;

        mainHistory[0] = mainHistoryRing ? mainHistoryRing[0] : null;
        mainHistory[1] = null;
        mainHistory[2] = null;
    }

    /**
     * Use data from the given frame to update field statistics for the given frame type.
     */
    const updateFieldStatistics = (frameType, frame) => {
        const fieldStats = this.stats.frame[frameType].field;

        for (let i = 0; i < frame.length; i++) {
            if (fieldStats[i]) {
                fieldStats[i].max = Math.max(frame[i], fieldStats[i].max);
                fieldStats[i].min = Math.min(frame[i], fieldStats[i].min);
            } else {
                fieldStats[i] = {
                    max: frame[i],
                    min: frame[i],
                };
            }
        }
    };

    const completeIntraframe = (frameType, frameStart, frameEnd, raw) => {
        let acceptFrame = true;

        // Do we have a previous frame to use as a reference to validate field values against?
        if (!raw && lastMainFrameIteration !== -1) {
            /*
             * Check that iteration count and time didn't move backwards, and didn't move forward too much.
             */
            acceptFrame =
                mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION] >= lastMainFrameIteration &&
                mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION] <
                    lastMainFrameIteration + MAXIMUM_ITERATION_JUMP_BETWEEN_FRAMES &&
                mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] >= lastMainFrameTime &&
                mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] <
                    lastMainFrameTime + MAXIMUM_TIME_JUMP_BETWEEN_FRAMES;
        }

        if (acceptFrame) {
            this.stats.intentionallyAbsentIterations += countIntentionallySkippedFramesTo(
                mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION],
            );

            lastMainFrameIteration = mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION];
            lastMainFrameTime = mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];

            mainStreamIsValid = true;

            updateFieldStatistics(frameType, mainHistory[0]);
        } else {
            invalidateMainStream();
        }

        if (this.onFrameReady) {
            this.onFrameReady(mainStreamIsValid, mainHistory[0], frameType, frameStart, frameEnd - frameStart);
        }

        // Rotate history buffers

        // Both the previous and previous-previous states become the I-frame, because we can't look further into the past than the I-frame
        mainHistory[1] = mainHistory[0];
        mainHistory[2] = mainHistory[0];

        // And advance the current frame into an empty space ready to be filled
        if (mainHistory[0] === mainHistoryRing[0]) {
            mainHistory[0] = mainHistoryRing[1];
        } else if (mainHistory[0] === mainHistoryRing[1]) {
            mainHistory[0] = mainHistoryRing[2];
        } else {
            mainHistory[0] = mainHistoryRing[0];
        }
        return mainStreamIsValid;
    };

    /**
     * Should a frame with the given index exist in this log (based on the user's selection of sampling rates)?
     */
    const shouldHaveFrame = (frameIndex) => {
        return (
            ((frameIndex % this.sysConfig.frameIntervalI) + this.sysConfig.frameIntervalPNum - 1) %
                this.sysConfig.frameIntervalPDenom <
            this.sysConfig.frameIntervalPNum
        );
    };

    /**
     * Attempt to parse the frame of into the supplied `current` buffer using the encoding/predictor
     * definitions from `frameDefs`. The previous frame values are used for predictions.
     *
     * frameDef - The definition for the frame type being parsed (from this.frameDefs)
     * raw - Set to true to disable predictions (and so store raw values)
     * skippedFrames - Set to the number of field iterations that were skipped over by rate settings since the last frame.
     */
    function parseFrame(frameDef, current, previous, previous2, skippedFrames, raw) {
        const predictor = frameDef.predictor,
            encoding = frameDef.encoding,
            values = new Array(8);
        let i, j, groupCount;

        i = 0;
        while (i < frameDef.count) {
            let value;

            if (predictor[i] === FLIGHT_LOG_FIELD_PREDICTOR_INC) {
                current[i] = skippedFrames + 1;

                if (previous) {
                    current[i] += previous[i];
                }

                i++;
            } else {
                switch (encoding[i]) {
                    case FLIGHT_LOG_FIELD_ENCODING_SIGNED_VB:
                        value = stream.readSignedVB();
                        break;
                    case FLIGHT_LOG_FIELD_ENCODING_UNSIGNED_VB:
                        value = stream.readUnsignedVB();
                        break;
                    case FLIGHT_LOG_FIELD_ENCODING_NEG_14BIT:
                        value = -signExtend14Bit(stream.readUnsignedVB());
                        break;
                    case FLIGHT_LOG_FIELD_ENCODING_TAG8_4S16:
                        if (dataVersion < 2) {
                            stream.readTag8_4S16_v1(values);
                        } else {
                            stream.readTag8_4S16_v2(values);
                        }

                        //Apply the predictors for the fields:
                        for (j = 0; j < 4; j++, i++) {
                            current[i] = applyPrediction(
                                i,
                                raw ? FLIGHT_LOG_FIELD_PREDICTOR_0 : predictor[i],
                                values[j],
                                current,
                                previous,
                                previous2,
                            );
                        }

                        continue;
                    case FLIGHT_LOG_FIELD_ENCODING_TAG2_3S32:
                        stream.readTag2_3S32(values);

                        //Apply the predictors for the fields:
                        for (j = 0; j < 3; j++, i++) {
                            current[i] = applyPrediction(
                                i,
                                raw ? FLIGHT_LOG_FIELD_PREDICTOR_0 : predictor[i],
                                values[j],
                                current,
                                previous,
                                previous2,
                            );
                        }

                        continue;
                    case FLIGHT_LOG_FIELD_ENCODING_TAG2_3SVARIABLE:
                        stream.readTag2_3SVariable(values);

                        //Apply the predictors for the fields:
                        for (j = 0; j < 3; j++, i++) {
                            current[i] = applyPrediction(
                                i,
                                raw ? FLIGHT_LOG_FIELD_PREDICTOR_0 : predictor[i],
                                values[j],
                                current,
                                previous,
                                previous2,
                            );
                        }

                        continue;
                    case FLIGHT_LOG_FIELD_ENCODING_TAG8_8SVB:
                        //How many fields are in this encoded group? Check the subsequent field encodings:
                        for (j = i + 1; j < i + 8 && j < frameDef.count; j++) {
                            if (encoding[j] !== FLIGHT_LOG_FIELD_ENCODING_TAG8_8SVB) {
                                break;
                            }
                        }

                        groupCount = j - i;

                        stream.readTag8_8SVB(values, groupCount);

                        for (j = 0; j < groupCount; j++, i++) {
                            current[i] = applyPrediction(
                                i,
                                raw ? FLIGHT_LOG_FIELD_PREDICTOR_0 : predictor[i],
                                values[j],
                                current,
                                previous,
                                previous2,
                            );
                        }

                        continue;
                    case FLIGHT_LOG_FIELD_ENCODING_NULL:
                        //Nothing to read
                        value = 0;
                        break;
                    default:
                        if (encoding[i] === undefined) {
                            throw new Error(`Missing field encoding header for field #${i} '${frameDef.name[i]}'`);
                        } else {
                            throw new Error(`Unsupported field encoding ${encoding[i]}`);
                        }
                }

                current[i] = applyPrediction(
                    i,
                    raw ? FLIGHT_LOG_FIELD_PREDICTOR_0 : predictor[i],
                    value,
                    current,
                    previous,
                    previous2,
                );
                i++;
            }
        }
    }

    const parseIntraframe = (raw) => {
        const current = mainHistory[0],
            previous = mainHistory[1];

        parseFrame(this.frameDefs.I, current, previous, null, 0, raw);
    };

    const completeGPSHomeFrame = (frameType, frameStart, frameEnd, _raw) => {
        updateFieldStatistics(frameType, gpsHomeHistory[0]);

        this.setGPSHomeHistory(gpsHomeHistory[0]);

        if (this.onFrameReady) {
            this.onFrameReady(true, gpsHomeHistory[0], frameType, frameStart, frameEnd - frameStart);
        }

        return true;
    };

    const completeGPSFrame = (frameType, frameStart, frameEnd, _raw) => {
        if (gpsHomeIsValid) {
            updateFieldStatistics(frameType, lastGPS);
        }

        if (this.onFrameReady) {
            this.onFrameReady(gpsHomeIsValid, lastGPS, frameType, frameStart, frameEnd - frameStart);
        }

        return gpsHomeIsValid;
    };

    const completeSlowFrame = (frameType, frameStart, frameEnd, _raw) => {
        updateFieldStatistics(frameType, lastSlow);

        if (this.onFrameReady) {
            this.onFrameReady(true, lastSlow, frameType, frameStart, frameEnd - frameStart);
        }
        return true;
    };

    const completeInterframe = (frameType, frameStart, frameEnd, raw) => {
        // Reject this frame if the time or iteration count jumped too far
        if (
            mainStreamIsValid &&
            !raw &&
            (mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] >
                lastMainFrameTime + MAXIMUM_TIME_JUMP_BETWEEN_FRAMES ||
                mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION] >
                    lastMainFrameIteration + MAXIMUM_ITERATION_JUMP_BETWEEN_FRAMES)
        ) {
            mainStreamIsValid = false;
        }

        if (mainStreamIsValid) {
            lastMainFrameIteration = mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION];
            lastMainFrameTime = mainHistory[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];

            this.stats.intentionallyAbsentIterations += lastSkippedFrames;

            updateFieldStatistics(frameType, mainHistory[0]);
        }

        //Receiving a P frame can't resynchronise the stream so it doesn't set mainStreamIsValid to true

        if (this.onFrameReady) {
            this.onFrameReady(mainStreamIsValid, mainHistory[0], frameType, frameStart, frameEnd - frameStart);
        }

        if (mainStreamIsValid) {
            // Rotate history buffers

            mainHistory[2] = mainHistory[1];
            mainHistory[1] = mainHistory[0];

            // And advance the current frame into an empty space ready to be filled
            if (mainHistory[0] === mainHistoryRing[0]) {
                mainHistory[0] = mainHistoryRing[1];
            } else if (mainHistory[0] === mainHistoryRing[1]) {
                mainHistory[0] = mainHistoryRing[2];
            } else {
                mainHistory[0] = mainHistoryRing[0];
            }
        }
        return mainStreamIsValid;
    };

    /**
     * Take the raw value for a a field, apply the prediction that is configured for it, and return it.
     */
    const applyPrediction = (fieldIndex, predictor, value, current, previous, previous2) => {
        switch (predictor) {
            case FLIGHT_LOG_FIELD_PREDICTOR_0:
                // No correction to apply
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_MINTHROTTLE:
                /*
                 * Force the value to be a *signed* 32-bit integer. Encoded motor values can be negative when motors are
                 * below minthrottle, but despite this motor[0] is encoded in I-frames using *unsigned* encoding (to
                 * save space for positive values). So we need to convert those very large unsigned values into their
                 * corresponding 32-bit signed values.
                 */
                value = Math.trunc(value) + this.sysConfig.minthrottle;
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_MINMOTOR:
                /*
                 * Force the value to be a *signed* 32-bit integer. Encoded motor values can be negative when motors are
                 * below minthrottle, but despite this motor[0] is encoded in I-frames using *unsigned* encoding (to
                 * save space for positive values). So we need to convert those very large unsigned values into their
                 * corresponding 32-bit signed values.
                 */
                value = Math.trunc(value) + Math.trunc(this.sysConfig.motorOutput[0]); // motorOutput[0] is the min motor output
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_1500:
                value += 1500;
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_MOTOR_0:
                if (this.frameDefs.I.nameToIndex["motor[0]"] === undefined) {
                    throw new Error("Attempted to base I-field prediction on motor0 before it was read");
                }
                value += current[this.frameDefs.I.nameToIndex["motor[0]"]];
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_VBATREF:
                value += this.sysConfig.vbatref;
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_PREVIOUS:
                if (!previous) {
                    break;
                }

                value += previous[fieldIndex];
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_STRAIGHT_LINE:
                if (!previous) {
                    break;
                }

                value += 2 * previous[fieldIndex] - previous2[fieldIndex];
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_AVERAGE_2:
                if (!previous) {
                    break;
                }

                //Round toward zero like C would do for integer division:
                value += ~~((previous[fieldIndex] + previous2[fieldIndex]) / 2);
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD:
                if (this.frameDefs.H?.nameToIndex["GPS_home[0]"] === undefined) {
                    throw new Error(
                        "Attempted to base prediction on GPS home position without GPS home frame definition",
                    );
                }

                value += gpsHomeHistory[1][this.frameDefs.H.nameToIndex["GPS_home[0]"]];
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD_1:
                if (this.frameDefs.H?.nameToIndex["GPS_home[1]"] === undefined) {
                    throw new Error(
                        "Attempted to base prediction on GPS home position without GPS home frame definition",
                    );
                }

                value += gpsHomeHistory[1][this.frameDefs.H.nameToIndex["GPS_home[1]"]];
                break;
            case FLIGHT_LOG_FIELD_PREDICTOR_LAST_MAIN_FRAME_TIME:
                if (mainHistory[1]) {
                    value += mainHistory[1][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                }
                break;
            default:
                throw new Error(`Unsupported field predictor ${predictor}`);
        }

        return value;
    };

    /*
     * Based on the log sampling rate, work out how many frames would have been skipped after the last frame that was
     * parsed until we get to the next logged iteration.
     */
    function countIntentionallySkippedFrames() {
        let count = 0,
            frameIndex;

        if (lastMainFrameIteration === -1) {
            // Haven't parsed a frame yet so there's no frames to skip
            return 0;
        } else {
            for (frameIndex = lastMainFrameIteration + 1; !shouldHaveFrame(frameIndex); frameIndex++) {
                count++;
            }
        }

        return count;
    }

    /*
     * Based on the log sampling rate, work out how many frames would have been skipped after the last frame that was
     * parsed until we get to the iteration with the given index.
     */
    function countIntentionallySkippedFramesTo(targetIteration) {
        let count = 0,
            frameIndex;

        if (lastMainFrameIteration === -1) {
            // Haven't parsed a frame yet so there's no frames to skip
            return 0;
        } else {
            for (frameIndex = lastMainFrameIteration + 1; frameIndex < targetIteration; frameIndex++) {
                if (!shouldHaveFrame(frameIndex)) {
                    count++;
                }
            }
        }

        return count;
    }

    const parseInterframe = (raw) => {
        const current = mainHistory[0],
            previous = mainHistory[1],
            previous2 = mainHistory[2];

        lastSkippedFrames = countIntentionallySkippedFrames();

        parseFrame(this.frameDefs.P, current, previous, previous2, lastSkippedFrames, raw);
    };

    const parseGPSFrame = (raw) => {
        // Only parse a GPS frame if we have GPS header definitions
        if (this.frameDefs.G) {
            parseFrame(this.frameDefs.G, lastGPS, null, null, 0, raw);
        }
    };

    const parseGPSHomeFrame = (raw) => {
        if (this.frameDefs.H) {
            parseFrame(this.frameDefs.H, gpsHomeHistory[0], null, null, 0, raw);
        }
    };

    const parseSlowFrame = (raw) => {
        if (this.frameDefs.S) {
            parseFrame(this.frameDefs.S, lastSlow, null, null, 0, raw);
        }
    };

    const completeEventFrame = (frameType, frameStart, frameEnd, _raw) => {
        if (lastEvent) {
            if (lastEvent.event === FlightLogEvent.LOGGING_RESUME) {
                /*
                 * Bring the "last time" and "last iteration" up to the new resume time so we accept the sudden jump into
                 * the future.
                 */
                lastMainFrameIteration = lastEvent.data.logIteration;
                lastMainFrameTime = lastEvent.data.currentTime;
            }

            if (this.onFrameReady) {
                this.onFrameReady(true, lastEvent, frameType, frameStart, frameEnd - frameStart);
            }

            return true;
        }

        return false;
    };

    const TWITCH_TEST_NAMES = {
        1: "Response Time->",
        2: "Half Setpoint Time->",
        3: "Setpoint Time->",
        4: "Negative Setpoint->",
        5: "Initial Setpoint->",
    };

    function parseInflightAdjustment(data) {
        const tmp = stream.readU8();
        data.name = "Unknown";
        data.func = tmp & 127;
        data.value = tmp < 128 ? stream.readSignedVB() : uint32ToFloat(stream.readU32());
        const descr = INFLIGHT_ADJUSTMENT_FUNCTIONS[data.func];
        if (descr !== undefined) {
            data.name = descr.name;
            let scale = descr.scale ?? 1;
            if (tmp >= 128 && descr.scalef !== undefined) {
                scale = descr.scalef;
            }
            data.value = Math.round(data.value * scale * 10000) / 10000;
        }
    }

    function parseEventFrame(_raw) {
        const END_OF_LOG_MESSAGE = "End of log\0",
            eventType = stream.readByte();

        lastEvent = {
            event: eventType,
            data: {},
        };

        switch (eventType) {
            case FlightLogEvent.SYNC_BEEP:
                lastEvent.data.time = stream.readUnsignedVB();
                lastEvent.time = lastEvent.data.time;
                break;
            case FlightLogEvent.FLIGHT_MODE: // get the flag status change
                lastEvent.data.newFlags = stream.readUnsignedVB();
                lastEvent.data.lastFlags = stream.readUnsignedVB();
                break;
            case FlightLogEvent.DISARM:
                lastEvent.data.reason = stream.readUnsignedVB();
                break;
            case FlightLogEvent.AUTOTUNE_CYCLE_START: {
                lastEvent.data.phase = stream.readByte();

                const cycleAndRising = stream.readByte();

                lastEvent.data.cycle = cycleAndRising & 0x7f;
                lastEvent.data.rising = (cycleAndRising >> 7) & 0x01;

                lastEvent.data.p = stream.readByte();
                lastEvent.data.i = stream.readByte();
                lastEvent.data.d = stream.readByte();
                break;
            }
            case FlightLogEvent.AUTOTUNE_CYCLE_RESULT:
                lastEvent.data.overshot = stream.readByte();
                lastEvent.data.p = stream.readByte();
                lastEvent.data.i = stream.readByte();
                lastEvent.data.d = stream.readByte();
                break;
            case FlightLogEvent.AUTOTUNE_TARGETS:
                //Convert the angles from decidegrees back to plain old degrees for ease of use
                lastEvent.data.currentAngle = stream.readS16() / 10;

                lastEvent.data.targetAngle = stream.readS8();
                lastEvent.data.targetAngleAtPeak = stream.readS8();

                lastEvent.data.firstPeakAngle = stream.readS16() / 10;
                lastEvent.data.secondPeakAngle = stream.readS16() / 10;
                break;
            case FlightLogEvent.GTUNE_CYCLE_RESULT:
                lastEvent.data.axis = stream.readU8();
                lastEvent.data.gyroAVG = stream.readSignedVB();
                lastEvent.data.newP = stream.readS16();
                break;
            case FlightLogEvent.INFLIGHT_ADJUSTMENT:
                parseInflightAdjustment(lastEvent.data);
                break;
            case FlightLogEvent.TWITCH_TEST: {
                const stage = stream.readU8();
                lastEvent.data.name = TWITCH_TEST_NAMES[stage];
                lastEvent.data.value = uint32ToFloat(stream.readU32());
                break;
            }
            case FlightLogEvent.LOGGING_RESUME:
                lastEvent.data.logIteration = stream.readUnsignedVB();
                lastEvent.data.currentTime = stream.readUnsignedVB();
                break;
            case FlightLogEvent.LOG_END: {
                const endMessage = stream.readString(END_OF_LOG_MESSAGE.length);

                if (endMessage === END_OF_LOG_MESSAGE) {
                    //Adjust the end of stream so we stop reading, this log is done
                    stream.end = stream.pos;
                } else {
                    /*
                     * This isn't the real end of log message, it's probably just some bytes that happened to look like
                     * an event header.
                     */
                    lastEvent = null;
                }
                break;
            }
            default:
                lastEvent = null;
        }
    }

    function getFrameType(command) {
        return frameTypes[command];
    }

    // Reset parsing state from the data section of the current log (don't reset header information). Useful for seeking.
    this.resetDataState = function () {
        lastSkippedFrames = 0;

        lastMainFrameIteration = -1;
        lastMainFrameTime = -1;

        invalidateMainStream();
        gpsHomeIsValid = false;
        lastEvent = null;
    };

    // Reset any parsed information from previous parses (header & data)
    this.resetAllState = function () {
        this.resetStats();

        //Reset system configuration to MW's defaults
        // Lets add the custom extensions
        const completeSysConfig = {
            ...defaultSysConfig,
            ...defaultSysConfigExtension,
        };
        this.sysConfig = Object.create(completeSysConfig);

        this.frameDefs = {};

        this.resetDataState();
    };

    // Check that the given frame definition contains some fields and the right number of predictors & encodings to match
    const isFrameDefComplete = (frameDef) => {
        return (
            frameDef &&
            frameDef.count > 0 &&
            frameDef.encoding.length === frameDef.count &&
            frameDef.predictor.length === frameDef.count
        );
    };

    this.parseHeader = function (startOffset, endOffset) {
        this.resetAllState();

        //Set parsing ranges up
        stream.start = startOffset === undefined ? stream.pos : startOffset;
        stream.pos = stream.start;
        stream.end = endOffset === undefined ? stream.end : endOffset;
        stream.eof = false;

        mainloop: while (true) {
            const command = stream.readChar();

            switch (command) {
                case "H":
                    parseHeaderLine();
                    break;
                case EOF:
                    break mainloop;
                default:
                    /*
                     * If we see something that looks like the beginning of a data frame, assume it
                     * is and terminate the header.
                     */
                    if (getFrameType(command)) {
                        stream.unreadChar(command);

                        break mainloop;
                    } // else skip garbage which apparently precedes the first data frame
                    break;
            }
        }

        adjustFieldDefsList(this.sysConfig.firmwareType, this.sysConfig.firmwareVersion);
        this.sysConfig.apiVersion = firmwareToApiVersion(this.sysConfig.firmwareType, this.sysConfig.firmwareVersion);

        if (!isFrameDefComplete(this.frameDefs.I)) {
            throw new Error("Log is missing required definitions for I frames, header may be corrupt");
        }

        if (!this.frameDefs.P) {
            throw new Error("Log is missing required definitions for P frames, header may be corrupt");
        }

        // P frames are derived from I frames so copy over frame definition information to those
        this.frameDefs.P.count = this.frameDefs.I.count;
        this.frameDefs.P.name = this.frameDefs.I.name;
        this.frameDefs.P.nameToIndex = this.frameDefs.I.nameToIndex;
        this.frameDefs.P.signed = this.frameDefs.I.signed;

        if (!isFrameDefComplete(this.frameDefs.P)) {
            throw new Error("Log is missing required definitions for P frames, header may be corrupt");
        }

        // Now we know our field counts, we can allocate arrays to hold parsed data
        mainHistoryRing = [
            new Array(this.frameDefs.I.count),
            new Array(this.frameDefs.I.count),
            new Array(this.frameDefs.I.count),
        ];

        if (this.frameDefs.H && this.frameDefs.G) {
            gpsHomeHistory = [new Array(this.frameDefs.H.count), new Array(this.frameDefs.H.count)];
            lastGPS = new Array(this.frameDefs.G.count);

            /* Home coord predictors appear in pairs (lat/lon), but the predictor ID is the same for both. It's easier to
             * apply the right predictor during parsing if we rewrite the predictor ID for the second half of the pair here:
             */
            for (let i = 1; i < this.frameDefs.G.count; i++) {
                if (
                    this.frameDefs.G.predictor[i - 1] === FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD &&
                    this.frameDefs.G.predictor[i] === FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD
                ) {
                    this.frameDefs.G.predictor[i] = FLIGHT_LOG_FIELD_PREDICTOR_HOME_COORD_1;
                }
            }
        } else {
            gpsHomeHistory = [];
            lastGPS = [];
        }

        if (this.frameDefs.S) {
            lastSlow = new Array(this.frameDefs.S.count);
        } else {
            lastSlow = [];
        }
    };

    /**
     * Set the current GPS home data to the given frame. Pass an empty array in in order to invalidate the GPS home
     * frame data.
     *
     * (The data is stored in gpsHomeHistory[1])
     */
    this.setGPSHomeHistory = function (newGPSHome) {
        if (newGPSHome.length === this.frameDefs.H.count) {
            //Copy the decoded frame into the "last state" entry of gpsHomeHistory to publish it:
            for (let i = 0; i < newGPSHome.length; i++) {
                gpsHomeHistory[1][i] = newGPSHome[i];
            }

            gpsHomeIsValid = true;
        } else {
            gpsHomeIsValid = false;
        }
    };

    /**
     * Continue the current parse by scanning the given range of offsets for data. To begin an independent parse,
     * call resetDataState() first.
     */
    this.parseLogData = function (raw, startOffset, endOffset) {
        let looksLikeFrameCompleted,
            prematureEof = false,
            frameStart = 0,
            frameType,
            lastFrameType = null;

        invalidateMainStream();

        //Set parsing ranges up for the log the caller selected
        stream.start = startOffset === undefined ? stream.pos : startOffset;
        stream.pos = stream.start;
        stream.end = endOffset === undefined ? stream.end : endOffset;
        stream.eof = false;
        while (true) {
            const command = stream.readChar();

            if (lastFrameType) {
                const lastFrameSize = stream.pos - frameStart;

                // Is this the beginning of a new frame?
                looksLikeFrameCompleted = getFrameType(command) || (!prematureEof && command === EOF);

                if (!this.stats.frame[lastFrameType.marker]) {
                    this.stats.frame[lastFrameType.marker] = {
                        bytes: 0,
                        sizeCount: new Int32Array(256) /* int32 arrays are zero-filled, handy! */,
                        validCount: 0,
                        corruptCount: 0,
                        desyncCount: 0,
                        field: [],
                    };
                }

                const frameTypeStats = this.stats.frame[lastFrameType.marker];
                // If we see what looks like the beginning of a new frame, assume that the previous frame was valid:
                if (lastFrameSize <= FLIGHT_LOG_MAX_FRAME_LENGTH && looksLikeFrameCompleted) {
                    let frameAccepted = true;

                    if (lastFrameType.complete) {
                        frameAccepted = lastFrameType.complete(lastFrameType.marker, frameStart, stream.pos, raw);
                    }

                    if (frameAccepted) {
                        //Update statistics for this frame type
                        frameTypeStats.bytes += lastFrameSize;
                        frameTypeStats.sizeCount[lastFrameSize]++;
                        frameTypeStats.validCount++;
                    } else {
                        frameTypeStats.desyncCount++;
                    }
                } else {
                    //The previous frame was corrupt

                    //We need to resynchronise before we can deliver another main frame:
                    mainStreamIsValid = false;
                    frameTypeStats.corruptCount++;
                    this.stats.totalCorruptFrames++;

                    /*
                     * Start the search for a frame beginning after the first byte of the previous corrupt frame.
                     * This way we can find the start of the next frame after the corrupt frame if the corrupt frame
                     * was truncated.
                     */
                    stream.pos = frameStart + 1;
                    lastFrameType = null;
                    prematureEof = false;
                    stream.eof = false;
                    continue;
                }
            }

            if (command === EOF) {
                break;
            }

            frameStart = stream.pos - 1;
            frameType = getFrameType(command);

            // Reject the frame if it is one that we have no definitions for in the header
            if (frameType && (command === "E" || this.frameDefs[command])) {
                lastFrameType = frameType;
                frameType.parse(raw);

                //We shouldn't read an EOF during reading a frame (that'd imply the frame was truncated)
                if (stream.eof) {
                    prematureEof = true;
                }
            } else {
                mainStreamIsValid = false;
                lastFrameType = null;
            }
        }

        this.stats.totalBytes += stream.end - stream.start;

        return true;
    };

    const frameTypes = {
        I: { marker: "I", parse: parseIntraframe, complete: completeIntraframe },
        P: { marker: "P", parse: parseInterframe, complete: completeInterframe },
        G: { marker: "G", parse: parseGPSFrame, complete: completeGPSFrame },
        H: {
            marker: "H",
            parse: parseGPSHomeFrame,
            complete: completeGPSHomeFrame,
        },
        S: { marker: "S", parse: parseSlowFrame, complete: completeSlowFrame },
        E: { marker: "E", parse: parseEventFrame, complete: completeEventFrame },
    };

    const stream = new ArrayDataStream(logData);
}

FlightLogParser.prototype.resetStats = function () {
    this.stats = {
        totalBytes: 0,

        // Number of frames that failed to decode:
        totalCorruptFrames: 0,

        //If our sampling rate is less than 1, we won't log every loop iteration, and that is accounted for here:
        intentionallyAbsentIterations: 0,

        // Statistics for each frame type ("I", "P" etc)
        frame: {},
    };
};

FlightLogParser.prototype.FLIGHT_LOG_START_MARKER = asciiStringToByteArray(
    "H Product:Blackbox flight data recorder by Nicholas Sherlock\n",
);

FlightLogParser.prototype.FLIGHT_LOG_FIELD_UNSIGNED = 0;
FlightLogParser.prototype.FLIGHT_LOG_FIELD_SIGNED = 1;

FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_ITERATION = 0;
FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME = 1;
