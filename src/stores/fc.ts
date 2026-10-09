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

import { defineStore } from "pinia";
import { computed, reactive, ref, toRefs } from "vue";
import semver from "semver";
import { bit_check } from "../js/bit";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../js/data_storage";
import { FIRMWARE_BUILD_OPTIONS } from "../js/build_options.js";
import type { FcState } from "./fc.types";

export type { FcState } from "./fc.types";

// Failsafe / RX-loss detection from CONFIG.armingDisableFlags.
// NOTE: these are BIT POSITIONS (the `bit` arg to bit_check), NOT the firmware
// mask values. They deliberately do NOT mirror the firmware enum literals
// (ARMING_DISABLED_FAILSAFE = 1<<1, RX_FAILSAFE = 1<<2, BOXFAILSAFE = 1<<4).
// Naming them `*_BIT` prevents a "correction" to mask values that would silently
// break detection. Positions match SetupTab disarmFlagElements ordering (idx
// 1/2/4) and are stable across all API versions (only bits >=20 get remapped).
export const FAILSAFE_BIT = 1; // ARMING_DISABLED_FAILSAFE
export const RX_FAILSAFE_BIT = 2; // ARMING_DISABLED_RX_FAILSAFE (shown elsewhere as RXLOSS)
export const BOXFAILSAFE_BIT = 4; // ARMING_DISABLED_BOXFAILSAFE (failsafe aux switch)

// Pure detector — true when failsafe/RX-loss is asserted by the FC. Exported so
// it can be unit-tested directly against the same logic the store/getter uses.
// A null from unchecked JS reads as no flags too: bit_check(null, n) is false.
export function isFailsafeActive(flags: number = 0): boolean {
    return bit_check(flags, FAILSAFE_BIT) || bit_check(flags, RX_FAILSAFE_BIT) || bit_check(flags, BOXFAILSAFE_BIT);
}

const MAX_BATTERY_PROFILES = 3;

export const CONFIGURATION_STATES = {
    DEFAULTS_BARE: 0,
    DEFAULTS_CUSTOM: 1,
    CONFIGURED: 2,
} as const;

export const TARGET_CAPABILITIES_FLAGS = {
    HAS_VCP: 0,
    HAS_SOFTSERIAL: 1,
    IS_UNIFIED: 2,
    HAS_FLASH_BOOTLOADER: 3,
    SUPPORTS_CUSTOM_DEFAULTS: 4,
    HAS_CUSTOM_DEFAULTS: 5,
    SUPPORTS_RX_BIND: 6,
} as const;

export const CONFIGURATION_PROBLEM_FLAGS = {
    ACC_NEEDS_CALIBRATION: 0,
    MOTOR_PROTOCOL_DISABLED: 1,
} as const;

export const FILTER_TYPE_FLAGS = {
    PT1: 0,
    BIQUAD: 1,
} as const;

export const RATES_TYPE = {
    BETAFLIGHT: 0,
    RACEFLIGHT: 1,
    KISS: 2,
    ACTUAL: 3,
    QUICKRATES: 4,
} as const;

const INITIAL_CONFIG: FcState["config"] = {
    apiVersion: "0.0.0",
    flightControllerIdentifier: "",
    // Valid semver default so consumers (e.g. CLI autocomplete) that call semver.*
    // on it before MSP_FC_VERSION arrives don't throw "Invalid Version".
    flightControllerVersion: "0.0.0",
    version: 0,
    buildInfo: "",
    buildKey: "",
    buildOptions: [],
    gitRevision: "",
    multiType: 0,
    msp_version: 0, // not specified using semantic versioning
    capability: 0,
    cycleTime: 0,
    i2cError: 0,
    cpuload: 0,
    cpuTemp: 0,
    activeSensors: 0,
    mode: 0,
    profile: 0,
    uid: [0, 0, 0],
    accelerometerTrims: [0, 0],
    name: "", // present for backwards compatibility before MSP v1.45
    craftName: "",
    displayName: "", // present for backwards compatibility before MSP v1.45
    pilotName: "",
    pidProfileNames: ["", "", "", ""],
    rateProfileNames: ["", "", "", ""],
    numProfiles: 3,
    rateProfile: 0,
    numberOfRateProfiles: 0,
    boardType: 0,
    armingDisableCount: 0,
    armingDisableFlags: 0,
    armingDisabled: false,
    runawayTakeoffPreventionDisabled: false,
    boardIdentifier: "",
    boardVersion: 0,
    targetCapabilities: 0,
    targetName: "",
    boardName: "",
    manufacturerId: "",
    signature: [],
    mcuTypeId: 255,
    configurationState: 0,
    configStateFlag: 0,
    sampleRateHz: 0,
    configurationProblems: 0,
    hardwareName: "",
    batteryProfile: 0,
    numberOfBatteryProfiles: 0,
    batteryProfileNames: new Array<string>(MAX_BATTERY_PROFILES).fill(""),
};

const INITIAL_ANALOG: FcState["analogData"] = {
    voltage: 0,
    mAhdrawn: 0,
    rssi: 0,
    amperage: 0,
    last_received_timestamp: 0,
};

const INITIAL_RC_TUNING: FcState["rcTuning"] = {
    RC_RATE: 0,
    RC_EXPO: 0,
    roll_pitch_rate: 0, // pre 1.7 api only
    roll_rate: 0,
    pitch_rate: 0,
    yaw_rate: 0,
    dynamic_THR_PID: 0, // moved in 1.45 to ADVANCED_TUNING
    throttle_MID: 0,
    throttle_EXPO: 0,
    dynamic_THR_breakpoint: 0, // moved in 1.45 to ADVANCED_TUNING
    RC_YAW_EXPO: 0,
    rcYawRate: 0,
    rcPitchRate: 0,
    RC_PITCH_EXPO: 0,
    throttleLimitType: 0,
    throttleLimitPercent: 100,
    roll_rate_limit: 1998,
    pitch_rate_limit: 1998,
    yaw_rate_limit: 1998,
    rates_type: 0,
    throttle_HOVER: 0.5, // default for firmware before 1.47
};

const INITIAL_RC_DEADBAND_CONFIG: FcState["rcDeadbandConfig"] = {
    deadband: 0,
    yaw_deadband: 0,
    alt_hold_deadband: 0,
    deadband3d_throttle: 0,
};

export function createInitialState(): FcState {
    const advancedTuning: FcState["advancedTuning"] = {
        rollPitchItermIgnoreRate: 0,
        yawItermIgnoreRate: 0,
        yaw_p_limit: 0,
        deltaMethod: 0,
        vbatPidCompensation: 0,
        dtermSetpointTransition: 0,
        dtermSetpointWeight: 0,
        toleranceBand: 0,
        toleranceBandReduction: 0,
        itermThrottleGain: 0,
        pidMaxVelocity: 0,
        pidMaxVelocityYaw: 0,
        levelAngleLimit: 0,
        levelSensitivity: 0,
        itermThrottleThreshold: 0,
        itermAcceleratorGain: 0, // depecrated in API 1.45
        antiGravityGain: 0, // was itermAccelatorGain till API 1.45
        itermRotation: 0,
        smartFeedforward: 0,
        itermRelax: 0,
        itermRelaxType: 0,
        itermRelaxCutoff: 0,
        absoluteControlGain: 0,
        throttleBoost: 0,
        acroTrainerAngleLimit: 0,
        feedforwardRoll: 0,
        feedforwardPitch: 0,
        feedforwardYaw: 0,
        feedforwardTransition: 0,
        antiGravityMode: 0,
        dMaxRoll: 0,
        dMaxPitch: 0,
        dMaxYaw: 0,
        dMaxGain: 0,
        dMaxAdvance: 0,
        useIntegratedYaw: 0,
        integratedYawRelax: 0,
        motorOutputLimit: 0,
        autoProfileCellCount: 0,
        idleMinRpm: 0,
        feedforward_averaging: 0,
        feedforward_smooth_factor: 0,
        feedforward_boost: 0,
        feedforward_max_rate_limit: 0,
        feedforward_jitter_factor: 0,
        vbat_sag_compensation: 0,
        thrustLinearization: 0,
        tpaRate: 0,
        tpaBreakpoint: 0,
    };
    const sensorConfig: FcState["sensorConfig"] = {
        acc_hardware: 0,
        baro_hardware: 0,
        mag_hardware: 0,
        sonar_hardware: 0,
        opticalflow_hardware: 0,
        pitot_hardware: 0,
    };

    return {
        config: structuredClone(INITIAL_CONFIG),
        analogData: { ...INITIAL_ANALOG },
        bfConfig: {
            currentscale: 0,
            currentoffset: 0,
            currentmetertype: 0,
            batterycapacity: 0,
        },
        copyProfile: {
            type: 0,
            dstProfile: 0,
            srcProfile: 0,
        },
        features: {
            features: null,
        },
        beepers: {
            beepers: null,
            dshotBeaconTone: 0,
            dshotBeaconConditions: null,
        },
        mixerConfig: {
            mixer: 0,
            reverseMotorDir: 0,
        },
        boardAlignment: {
            roll: 0,
            pitch: 0,
            yaw: 0,
        },
        ledStrip: [],
        ledColors: [],
        ledModeColors: [],
        pidController: {
            controller: 0,
        },
        pidNames: [],
        pidsActive: Array.from({ length: 10 }, () => Array.from<number>({ length: 3 })),
        pids: Array.from({ length: 10 }, () => Array.from<number>({ length: 3 })),
        rcMap: [],
        // roll, pitch, yaw, throttle, aux 1, ... aux n
        rc: {
            active_channels: 0,
            channels: Array.from<number>({ length: 32 }),
        },
        rcTuning: { ...INITIAL_RC_TUNING },
        auxConfig: [],
        auxConfigIds: [],
        modeRanges: [],
        modeRangesExtra: [],
        adjustmentRanges: [],
        servoConfig: [],
        servoRules: [],
        serialConfig: {
            ports: [],

            // pre 1.6 settings
            mspBaudRate: 0,
            gpsBaudRate: 0,
            gpsPassthroughBaudRate: 0,
            cliBaudRate: 0,
        },
        sensorData: {
            gyroscope: [0, 0, 0],
            accelerometer: [0, 0, 0],
            magnetometer: [0, 0, 0],
            altitude: 0,
            sonar: 0,
            pitot: null,
            kinematics: [0.0, 0.0, 0.0],
            quaternion: null,
            debug: [0, 0, 0, 0, 0, 0, 0, 0],
        },
        motorData: Array.from<number>({ length: 8 }),
        servoData: Array.from<number>({ length: 8 }),
        motorTelemetryData: {
            rpm: [0, 0, 0, 0, 0, 0, 0, 0],
            invalidPercent: [0, 0, 0, 0, 0, 0, 0, 0],
            temperature: [0, 0, 0, 0, 0, 0, 0, 0],
            voltage: [0, 0, 0, 0, 0, 0, 0, 0],
            current: [0, 0, 0, 0, 0, 0, 0, 0],
            consumption: [0, 0, 0, 0, 0, 0, 0, 0],
        },
        gpsData: {
            fix: 0,
            numSat: 0,
            latitude: 0,
            longitude: 0,
            alt: 0,
            speed: 0,
            ground_course: 0,
            positionalDop: 0,
            distanceToHome: 0,
            directionToHome: 0,
            update: 0,

            chn: [],
            svid: [],
            quality: [],
            cno: [],
        },
        voltageMeters: [],
        voltageMeterConfigs: [],
        currentMeters: [],
        currentMeterConfigs: [],
        batteryState: {},
        batteryConfig: {
            vbatmincellvoltage: 0,
            vbatmaxcellvoltage: 0,
            vbatwarningcellvoltage: 0,
            capacity: 0,
            voltageMeterSource: 0,
            currentMeterSource: 0,
        },
        armingConfig: {
            auto_disarm_delay: 0,
            disarm_kill_switch: 0,
            small_angle: 0,
            gyro_cal_on_first_arm: 0,
        },
        fcConfig: {
            loopTime: 0,
        },
        misc: {
            // DEPRECATED = only used to store values that are written back to the fc as-is, do NOT use for any other purpose
            failsafe_throttle: 0,
            gps_baudrate: 0,
            multiwiicurrentoutput: 0,
            placeholder2: 0,
            vbatscale: 0,
            vbatmincellvoltage: 0,
            vbatmaxcellvoltage: 0,
            vbatwarningcellvoltage: 0,
            batterymetertype: 1, // 1=ADC, 2=ESC
        },
        motorConfig: {
            minthrottle: 0,
            maxthrottle: 0,
            mincommand: 0,
            motor_count: 0,
            motor_poles: 0,
            use_dshot_telemetry: false,
            use_esc_sensor: false,
            motor_kv: 0,
        },
        gpsConfig: {
            provider: 0,
            ublox_sbas: 0,
            auto_config: 0,
            auto_baud: 0,
            home_point_once: 0,
            ublox_use_galileo: 0,
        },
        compassConfig: {
            mag_declination: 0,
        },
        rssiConfig: {
            channel: 0,
        },
        motor3dConfig: {
            deadband3d_low: 0,
            deadband3d_high: 0,
            neutral: 0,
        },
        dataflash: {
            ready: false,
            supported: false,
            sectors: 0,
            totalSize: 0,
            usedSize: 0,
        },
        sdcard: {
            supported: false,
            state: 0,
            filesystemLastError: 0,
            freeSizeKB: 0,
            totalSizeKB: 0,
        },
        blackbox: {
            supported: false,
            blackboxDevice: 0,
            blackboxRateNum: 1,
            blackboxRateDenom: 1,
            blackboxPDenom: 0,
            blackboxSampleRate: 0,
            blackboxDisabledMask: 0,
        },
        rcDeadbandConfig: { ...INITIAL_RC_DEADBAND_CONFIG },
        sensorAlignment: {
            align_gyro: 0,
            align_acc: 0,
            align_mag: 0,
            gyro_detection_flags: 0,
            gyro_to_use: 0,
            gyro_1_align: 0,
            gyro_2_align: 0,
            mag_align_roll: 0,
            mag_align_pitch: 0,
            mag_align_yaw: 0,
        },
        pidAdvancedConfig: {
            gyro_sync_denom: 0,
            pid_process_denom: 0,
            use_unsyncedPwm: 0,
            fast_pwm_protocol: 0,
            motor_pwm_rate: 0,
            motorIdle: 0,
            gyroUse32kHz: 0,
            motorPwmInversion: 0,
            gyroHighFsr: 0,
            gyroMovementCalibThreshold: 0,
            gyroCalibDuration: 0,
            gyroOffsetYaw: 0,
            gyroCheckOverflow: 0,
            debugMode: 0,
            debugModeCount: 0,
        },
        filterConfig: {
            gyro_hardware_lpf: 0,
            gyro_32khz_hardware_lpf: 0,
            gyro_lowpass_hz: 0,
            gyro_lowpass_dyn_min_hz: 0,
            gyro_lowpass_dyn_max_hz: 0,
            gyro_lowpass_type: 0,
            gyro_lowpass2_hz: 0,
            gyro_lowpass2_type: 0,
            gyro_notch_hz: 0,
            gyro_notch_cutoff: 0,
            gyro_notch2_hz: 0,
            gyro_notch2_cutoff: 0,
            dterm_lowpass_hz: 0,
            dterm_lowpass_dyn_min_hz: 0,
            dterm_lowpass_dyn_max_hz: 0,
            dterm_lowpass_type: 0,
            dterm_lowpass2_hz: 0,
            dterm_lowpass2_type: 0,
            dyn_lpf_curve_expo: 0,
            dterm_notch_hz: 0,
            dterm_notch_cutoff: 0,
            yaw_lowpass_hz: 0,
            dyn_notch_range: 0,
            dyn_notch_width_percent: 0,
            dyn_notch_q: 0,
            dyn_notch_min_hz: 0,
            dyn_notch_max_hz: 0,
            dyn_notch_count: 0,
            gyro_rpm_notch_harmonics: 0,
            gyro_rpm_notch_min_hz: 0,
            gyro_rpm_notch_fade_range_hz: 0,
            gyro_rpm_notch_q: 0,
            gyro_rpm_notch_weights: [0, 0, 0],
        },
        advancedTuning: advancedTuning,
        advancedTuningActive: { ...advancedTuning },
        sensorConfig: sensorConfig,
        sensorConfigActive: { gyro_hardware: 0, ...sensorConfig },
        mcuInfo: {
            id: 0,
            name: 0,
        },
        gyroSensor: {
            gyro_count: 0,
            gyro_hardware: [],
        },
        sensorNames: {
            acc: [],
            gyro: [],
            baro: [],
            mag: [],
            sonar: [],
            opticalflow: [],
            pitot: [],
        },
        rxConfig: {
            serialrx_provider: 0,
            stick_max: 0,
            stick_center: 0,
            stick_min: 0,
            spektrum_sat_bind: 0,
            rx_min_usec: 0,
            rx_max_usec: 0,
            rcInterpolation: 0,
            rcInterpolationInterval: 0,
            rcInterpolationChannels: 0,
            airModeActivateThreshold: 0,
            rxSpiProtocol: 0,
            rxSpiId: 0,
            rxSpiRfChannelCount: 0,
            fpvCamAngleDegrees: 0,
            rcSmoothingType: 0,
            rcSmoothingSetpointCutoff: 0,
            rcSmoothingThrottleCutoff: 0,
            rcSmoothingFeedforwardCutoff: 0,
            rcSmoothingInputType: 0,
            rcSmoothingDerivativeType: 0,
            rcSmoothingAutoFactor: 0,
            rcSmoothingAutoFactorThrottle: 0,
            usbCdcHidType: 0,
            rcSmoothing: 0,
            elrsUid: [0, 0, 0, 0, 0, 0],
        },
        failsafeConfig: {
            failsafe_delay: 0,
            failsafe_off_delay: 0,
            failsafe_throttle: 0,
            failsafe_switch_mode: 0,
            failsafe_throttle_low_delay: 0,
            failsafe_procedure: 0,
        },
        gpsRescue: {
            angle: 0,
            returnAltitudeM: 0,
            descentDistanceM: 0,
            groundSpeed: 0,
            throttleMin: 0,
            throttleMax: 0,
            throttleHover: 0,
            sanityChecks: 0,
            minSats: 0,
            ascendRate: 0,
            descendRate: 0,
            allowArmingWithoutFix: 0,
            altitudeMode: 0,
            minStartDistM: 0,
            initialClimbM: 0,
        },
        rxFailConfig: [],
        vtxConfig: {
            vtx_type: 0,
            vtx_band: 0,
            vtx_channel: 0,
            vtx_power: 0,
            vtx_pit_mode: false,
            vtx_frequency: 0,
            vtx_device_ready: false,
            vtx_low_power_disarm: 0,
            vtx_pit_mode_frequency: 0,
            vtx_table_available: false,
            vtx_table_bands: 0,
            vtx_table_channels: 0,
            vtx_table_powerlevels: 0,
            vtx_table_clear: false,
        },
        vtxTableBand: {
            vtxtable_band_number: 0,
            vtxtable_band_name: "",
            vtxtable_band_letter: "",
            vtxtable_band_is_factory_band: false,
            vtxtable_band_frequencies: [],
        },
        vtxTablePowerLevel: {
            vtxtable_powerlevel_number: 0,
            vtxtable_powerlevel_value: 0,
            vtxtable_powerlevel_label: "",
        },
        motorOutputOrder: [],
        multipleMsp: {
            msp_commands: [],
        },
        filterDefaults: {
            gyro_lowpass_hz: 100,
            gyro_lowpass_dyn_min_hz: 150,
            gyro_lowpass_dyn_max_hz: 450,
            gyro_lowpass_type: FILTER_TYPE_FLAGS.PT1,
            gyro_lowpass2_hz: 300,
            gyro_lowpass2_type: FILTER_TYPE_FLAGS.PT1,
            gyro_notch_cutoff: 300,
            gyro_notch_hz: 400,
            gyro_notch2_cutoff: 100,
            gyro_notch2_hz: 200,
            gyro_rpm_notch_harmonics: 3,
            gyro_rpm_notch_min_hz: 100,
            dterm_lowpass_hz: 100,
            dterm_lowpass_dyn_min_hz: 150,
            dterm_lowpass_dyn_max_hz: 250,
            dyn_lpf_curve_expo: 5,
            dterm_lowpass_type: FILTER_TYPE_FLAGS.PT1,
            dterm_lowpass2_hz: 200,
            dterm_lowpass2_type: FILTER_TYPE_FLAGS.BIQUAD,
            dterm_notch_cutoff: 160,
            dterm_notch_hz: 260,
            yaw_lowpass_hz: 100,
            dyn_notch_q: 120,
            dyn_notch_width_percent: 8,
            dyn_notch_count: 3,
            dyn_notch_q_rpm: 500, // default with rpm filtering
            dyn_notch_count_rpm: 1,
            dyn_notch_min_hz: 150,
            dyn_notch_max_hz: 600,
        },
        defaultPids: [42, 85, 35, 20, 90, 46, 90, 38, 22, 95, 30, 90, 0, 0, 90],
        vtxDeviceStatus: null,
        tuningSliders: {
            slider_pd_ratio: 0,
            slider_pd_gain: 0,
            slider_feedforward_gain: 0,
            slider_master_multiplier: 0,
            slider_dterm_filter: 0,
            slider_dterm_filter_multiplier: 0,
            slider_gyro_filter: 0,
            slider_gyro_filter_multiplier: 0,
            // introduced in 4.3
            slider_pids_mode: 0,
            slider_d_gain: 0,
            slider_pi_gain: 0,
            slider_dmax_gain: 0,
            slider_i_gain: 0,
            slider_roll_pitch_ratio: 0,
            slider_pitch_pi_gain: 0,

            slider_pids_valid: 0,
            slider_gyro_valid: 0,
            slider_dterm_valid: 0,
        },
        defaultTuningSliders: {
            slider_pids_mode: 2,
            slider_d_gain: 100,
            slider_pi_gain: 100,
            slider_feedforward_gain: 100,
            slider_dmax_gain: 100,
            slider_i_gain: 100,
            slider_roll_pitch_ratio: 100,
            slider_pitch_pi_gain: 100,
            slider_master_multiplier: 100,

            slider_dterm_filter: 1,
            slider_dterm_filter_multiplier: 100,
            slider_gyro_filter: 1,
            slider_gyro_filter_multiplier: 100,

            slider_pids_valid: 1,
            slider_gyro_valid: 1,
            slider_dterm_valid: 1,
        },
        wingConfig: {
            s_term: [0, 0, 0],
            spa_center: [0, 0, 0],
            spa_width: [0, 0, 0],
            spa_mode: [0, 0, 0],
            tpa_curve_type: 0,
            tpa_curve_stall_throttle: 30,
            tpa_curve_pid_thr0: 200,
            tpa_curve_pid_thr100: 70,
            tpa_curve_expo: 20,
            tpa_speed_type: 0,
            tpa_speed_basic_delay: 1000,
            tpa_speed_basic_gravity: 50,
            tpa_speed_adv_prop_pitch: 0,
            tpa_speed_adv_mass: 1000,
            tpa_speed_adv_drag_k: 1000,
            tpa_speed_adv_thrust: 2000,
            tpa_speed_max_voltage: 2520,
            tpa_speed_pitch_offset: 0,
            yaw_type: 0,
            angle_pitch_offset: 0,
        },
        ledConfigValues: {},
    };
}

function getPidDefaults(): number[] {
    // if defaults change they should go here
    // Introduced in 1.44
    const versionPidDefaults = [45, 80, 30, 40, 120, 47, 84, 34, 46, 125, 45, 80, 0, 0, 120];

    return versionPidDefaults;
}

// Serial RX providers each firmware build option enables, in the order the Receiver tab lists them.
const SERIAL_RX_TYPES_BY_BUILD_OPTION: [buildOption: string, rxTypes: string[]][] = [
    ["USE_SERIALRX_TARGET_CUSTOM", ["TARGET_CUSTOM"]],
    ["USE_SERIALRX_SPEKTRUM", ["SPEKTRUM1024", "SPEKTRUM2048", "SPEKTRUM2048/SRXL"]],
    ["USE_SERIALRX_SBUS", ["SBUS"]],
    ["USE_SERIALRX_SUMD", ["SUMD"]],
    ["USE_SERIALRX_SUMH", ["SUMH"]],
    ["USE_SERIALRX_XBUS", ["XBUS_MODE_B", "XBUS_MODE_B_RJ01"]],
    ["USE_SERIALRX_IBUS", ["IBUS"]],
    ["USE_SERIALRX_JETIEXBUS", ["JETIEXBUS"]],
    ["USE_SERIALRX_CRSF", ["CRSF"]],
    ["USE_SERIALRX_FPORT", ["FPORT"]],
    ["USE_SERIALRX_SRXL2", ["SPEKTRUM SRXL2"]],
    ["USE_SERIALRX_GHST", ["IRC GHOST"]],
    ["USE_SERIALRX_MAVLINK", ["MAVLINK"]],
];

export interface ArmingFlag {
    id: string;
    name: string;
    tooltip: string;
    visible: boolean;
}

export const useFlightControllerStore = defineStore("flightController", () => {
    // The store owns the flight controller state, keyed by camelCase parameter group.
    const state = reactive(createInitialState()) as FcState;

    const apiVersion = computed(() => state.config.apiVersion);

    const armingFlags = ref<ArmingFlag[]>([]);

    function setArmingFlags(flags: ArmingFlag[]) {
        armingFlags.value = flags;
    }

    function updateArmingFlags(bitmask: number) {
        armingFlags.value.forEach((flag, index) => {
            flag.visible = bit_check(bitmask, index);
        });
    }

    const isReadyToArm = computed(() => {
        return armingFlags.value.filter((f) => f.name !== "ARM_SWITCH").every((f) => !f.visible);
    });

    const activeFlagNames = computed(() => {
        return armingFlags.value.filter((f) => f.visible).map((f) => f.name);
    });

    const failsafeActive = computed(() => isFailsafeActive(state.config.armingDisableFlags));

    // ledConfigValues survives a reset, as it did in the legacy resetState().
    function resetState() {
        const { ledConfigValues: _ledConfigValues, ...fresh } = createInitialState();
        Object.assign(state, fresh);
    }

    function isApiVersionSupported(version: string) {
        return semver.gte(state.config.apiVersion, version);
    }

    function isApiVersionLessThan(version: string) {
        return semver.lt(state.config.apiVersion, version);
    }

    function getSerialRxTypes(): string[] {
        const apiVersion = state.config.apiVersion;

        // defaults
        const serialRxTypes = [
            "SPEKTRUM1024",
            "SPEKTRUM2048",
            "SBUS",
            "SUMD",
            "SUMH",
            "XBUS_MODE_B",
            "XBUS_MODE_B_RJ01",
            "IBUS",
            "JETIEXBUS",
            "CRSF",
            "SPEKTRUM2048/SRXL",
            "TARGET_CUSTOM",
            "FPORT",
            "SPEKTRUM SRXL2",
            "IRC GHOST",
        ];

        if (semver.gte(apiVersion, API_VERSION_1_46)) {
            // Default to NONE and move SPEKTRUM1024 to the end (firmware PR #12500)
            serialRxTypes[0] = "NONE";
            serialRxTypes.push("SPEKTRUM1024");
        }

        if (semver.gte(apiVersion, API_VERSION_1_47)) {
            serialRxTypes.push("MAVLINK");
        }

        return serialRxTypes;
    }

    function getSupportedSerialRxTypes(): string[] {
        const options = state.config.buildOptions;
        if (!options?.length) {
            return getSerialRxTypes();
        }
        const built = SERIAL_RX_TYPES_BY_BUILD_OPTION.filter(([option]) => options.includes(option));
        return ["NONE", ...built.flatMap(([, rxTypes]) => rxTypes)];
    }

    function checkBuildOption(option: string): boolean {
        if (state.config.buildOptions?.length) {
            return state.config.buildOptions.includes(option);
        }
        return true; // assume all options are available if build options are not known
    }

    function calculateHardwareName() {
        let name;
        if (state.config.targetName) {
            name = state.config.targetName;
        } else {
            name = state.config.boardIdentifier;
        }

        if (state.config.boardName && state.config.boardName !== name) {
            name = `${state.config.boardName}(${name})`;
        }

        if (state.config.manufacturerId) {
            name = `${state.config.manufacturerId}/${name}`;
        }

        state.config.hardwareName = name;
    }

    // MSP_BUILD_INFO pushes the raw numeric option ids into CONFIG.buildOptions and then
    // calls this to replace them with their names, so only here are they numbers.
    function processBuildOptions() {
        const buildOptions: string[] = [];
        const optionIds = state.config.buildOptions as unknown as number[];

        for (const [key, value] of Object.entries(FIRMWARE_BUILD_OPTIONS)) {
            for (const option of optionIds) {
                if (option === value) {
                    buildOptions.push(key);
                    break;
                }
            }
        }

        state.config.buildOptions = buildOptions;
    }

    function boardHasVcp(): boolean {
        return bit_check(state.config.targetCapabilities, TARGET_CAPABILITIES_FLAGS.HAS_VCP);
    }

    function boardHasSoftSerial(): boolean {
        return bit_check(state.config.targetCapabilities, TARGET_CAPABILITIES_FLAGS.HAS_SOFTSERIAL);
    }

    function boardHasFlashBootloader(): boolean {
        return bit_check(state.config.targetCapabilities, TARGET_CAPABILITIES_FLAGS.HAS_FLASH_BOOTLOADER);
    }

    function getFilterDefaults(): FcState["filterDefaults"] {
        const versionFilterDefaults = state.filterDefaults;
        // Change filter defaults depending on API version here
        versionFilterDefaults.gyro_lowpass_hz = 150;
        versionFilterDefaults.gyro_lowpass_type = FILTER_TYPE_FLAGS.BIQUAD;
        versionFilterDefaults.gyro_lowpass2_hz = 0;
        versionFilterDefaults.gyro_lowpass2_type = FILTER_TYPE_FLAGS.BIQUAD;
        versionFilterDefaults.dterm_lowpass_hz = 150;
        versionFilterDefaults.dterm_lowpass_type = FILTER_TYPE_FLAGS.BIQUAD;
        versionFilterDefaults.dterm_lowpass2_hz = 150;
        versionFilterDefaults.dterm_lowpass2_type = FILTER_TYPE_FLAGS.BIQUAD;

        // Introduced in 1.42
        versionFilterDefaults.gyro_lowpass_hz = 200;
        versionFilterDefaults.gyro_lowpass_dyn_min_hz = 200;
        versionFilterDefaults.gyro_lowpass_dyn_max_hz = 500;
        versionFilterDefaults.gyro_lowpass_type = FILTER_TYPE_FLAGS.PT1;
        versionFilterDefaults.gyro_lowpass2_hz = 250;
        versionFilterDefaults.gyro_lowpass2_type = FILTER_TYPE_FLAGS.PT1;
        versionFilterDefaults.dterm_lowpass_hz = 150;
        versionFilterDefaults.dterm_lowpass_dyn_min_hz = 70;
        versionFilterDefaults.dterm_lowpass_dyn_max_hz = 170;
        versionFilterDefaults.dterm_lowpass_type = FILTER_TYPE_FLAGS.PT1;
        versionFilterDefaults.dterm_lowpass2_hz = 150;
        versionFilterDefaults.dterm_lowpass2_type = FILTER_TYPE_FLAGS.PT1;

        // Introduced in 1.44
        versionFilterDefaults.dyn_notch_q = 300;
        versionFilterDefaults.gyro_lowpass_hz = 250;
        versionFilterDefaults.gyro_lowpass_dyn_min_hz = 250;
        versionFilterDefaults.gyro_lowpass2_hz = 500;
        versionFilterDefaults.dterm_lowpass_hz = 75;
        versionFilterDefaults.dterm_lowpass_dyn_min_hz = 75;
        versionFilterDefaults.dterm_lowpass_dyn_max_hz = 150;

        // Introduced in 1.45
        if (semver.gte(state.config.apiVersion, API_VERSION_1_45)) {
            versionFilterDefaults.dyn_notch_min_hz = 100;
        }

        return versionFilterDefaults;
    }

    function getSliderDefaults(): FcState["defaultTuningSliders"] {
        return state.defaultTuningSliders;
    }

    return {
        ...toRefs(state),

        apiVersion,
        armingFlags,
        setArmingFlags,
        updateArmingFlags,
        isReadyToArm,
        activeFlagNames,
        failsafeActive,

        resetState,
        isApiVersionSupported,
        isApiVersionLessThan,
        getSerialRxTypes,
        getSupportedSerialRxTypes,
        checkBuildOption,
        calculateHardwareName,
        processBuildOptions,
        boardHasVcp,
        boardHasSoftSerial,
        boardHasFlashBootloader,
        getFilterDefaults,
        getPidDefaults,
        getSliderDefaults,

        CONFIGURATION_STATES,
        TARGET_CAPABILITIES_FLAGS,
        CONFIGURATION_PROBLEM_FLAGS,
        FILTER_TYPE_FLAGS,
        RATES_TYPE,
    };
});
