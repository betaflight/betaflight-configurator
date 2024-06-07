import { bit_check } from "./bit";
import { API_VERSION_1_45, API_VERSION_1_46 } from './data_storage';
import semver from "semver";

const INITIAL_CONFIG = {
    apiVersion:                       "0.0.0",
    flightControllerIdentifier:       '',
    flightControllerVersion:          '',
    version:                          0,
    buildInfo:                        '',
    buildKey:                         '',
    buildOptions:                     [],
    gitRevision:                      '',
    multiType:                        0,
    msp_version:                      0, // not specified using semantic versioning
    capability:                       0,
    cycleTime:                        0,
    i2cError:                         0,
    cpuload:                          0,
    cpuTemp:                          0,
    activeSensors:                    0,
    mode:                             0,
    profile:                          0,
    uid:                              [0, 0, 0],
    accelerometerTrims:               [0, 0],
    name:                             '', // present for backwards compatibility before MSP v1.45
    craftName:                        '',
    displayName:                      '', // present for backwards compatibility before MSP v1.45
    pilotName:                        '',
    pidProfileNames:                  ["", "", "", ""],
    rateProfileNames:                 ["", "", "", ""],
    numProfiles:                      3,
    rateProfile:                      0,
    boardType:                        0,
    armingDisableCount:               0,
    armingDisableFlags:               0,
    armingDisabled:                   false,
    runawayTakeoffPreventionDisabled: false,
    boardIdentifier:                  "",
    boardVersion:                     0,
    targetCapabilities:               0,
    targetName:                       "",
    boardName:                        "",
    manufacturerId:                   "",
    signature:                        [],
    mcuTypeId:                        255,
    configurationState:               0,
    configStateFlag:                  0,
    sampleRateHz:                     0,
    configurationProblems:            0,
    hardwareName:                     '',
};

const INITIAL_ANALOG = {
    voltage:                    0,
    mAhdrawn:                   0,
    rssi:                       0,
    amperage:                   0,
    last_received_timestamp:    0,
};

const INITIAL_BATTERY_CONFIG = {
    vbatmincellvoltage:         0,
    vbatmaxcellvoltage:         0,
    vbatwarningcellvoltage:     0,
    capacity:                   0,
    voltageMeterSource:         0,
    currentMeterSource:         0,
};

const FIRMWARE_BUILD_OPTIONS = {
    // Radio Protocols
    USE_SERIALRX_CRSF:          4097,
    USE_SERIALRX_FPORT:         4098,
    USE_SERIALRX_GHST:          4099,
    USE_SERIALRX_IBUS:          4100,
    USE_SERIALRX_JETIEXBUS:     4101,
    USE_RX_PPM:                 4102,
    USE_SERIALRX_SBUS:          4103,
    USE_SERIALRX_SPEKTRUM:      4104,
    USE_SERIALRX_SRXL2:         4105,
    USE_SERIALRX_SUMD:          4106,
    USE_SERIALRX_SUMH:          4107,
    USE_SERIALRX_XBUS:          4108,

    // Motor Protocols
    USE_BRUSHED:                8230,
    USE_DSHOT:                  8231,
    USE_MULTISHOT:              8232,
    USE_ONESHOT:                8233,
    USE_PROSHOT:                8234,
    USE_PWM_OUTPUT:             8235,

    // Telemetry Protocols
    USE_TELEMETRY_FRSKY_HUB:    12301,
    USE_TELEMETRY_HOTT:         12302,
    USE_TELEMETRY_IBUS_EXTENDED:12303,
    USE_TELEMETRY_LTM:          12304,
    USE_TELEMETRY_MAVLINK:      12305,
    USE_TELEMETRY_SMARTPORT:    12306,
    USE_TELEMETRY_SRXL:         12307,

    // General Options
    USE_ACRO_TRAINER:           16404,
    USE_AKK_SMARTAUDIO:         16405,
    USE_BATTERY_CONTINUE:       16406,
    USE_CAMERA_CONTROL:         16407,
    USE_DASHBOARD:              16408,
    USE_EMFAT_TOOLS:            16409,
    USE_ESCSERIAL_SIMONK:       16410,
    USE_FRSKYOSD:               16411,
    USE_GPS:                    16412,
    USE_LED_STRIP:              16413,
    USE_LED_STRIP_64:           16414,
    USE_MAG:                    16415,
    USE_OSD_SD:                 16416,
    USE_OSD_HD:                 16417,
    USE_PINIO:                  16418,
    USE_RACE_PRO:               16419,
    USE_SERVOS:                 16420,
    USE_VTX:                    16421,
};

const FC = {

    // define all the global variables that are uses to hold FC state
    // the default state must be defined inside the resetState() method
    ADJUSTMENT_RANGES: null,
    ADVANCED_TUNING: null,
    ADVANCED_TUNING_ACTIVE: null,
    ANALOG: {...INITIAL_ANALOG},
    ARMING_CONFIG: null,
    AUX_CONFIG: null,
    AUX_CONFIG_IDS: null,
    BATTERY_CONFIG: {...INITIAL_BATTERY_CONFIG},
    BATTERY_STATE: null,
    BEEPER_CONFIG: null,
    BF_CONFIG: null,          // Remove when we officialy retire BF 3.1
    BLACKBOX: null,
    BOARD_ALIGNMENT_CONFIG: null,
    // Shallow copy of original config and added getter
    // getter allows this to be used with simple dot notation
    // and bridges the vue and rest of the code
    CONFIG: {
        ...INITIAL_CONFIG,
        get hardwareName() {
            let name;
            if (this.targetName) {
                name = this.targetName;
            } else {
                name = this.boardIdentifier;
            }

            if (this.boardName && this.boardName !== name) {
                name = `${this.boardName}(${name})`;
            }

            if (this.manufacturerId) {
                name = `${this.manufacturerId}/${name}`;
            }

            return name;
        },
        set hardwareName(name) {
            // NOOP, can't really be set. Maybe implement some logic?
        },
    },
    COPY_PROFILE: null,
    CURRENT_METERS: null,
    CURRENT_METER_CONFIGS: null,
    DATAFLASH: null,
    DEFAULT: null,
    DEFAULT_PIDS: null,
    FAILSAFE_CONFIG: null,
    FC_CONFIG: null,
    FEATURE_CONFIG: null,
    FILTER_CONFIG: null,
    GPS_CONFIG: null,
    COMPASS_CONFIG: null,
    GPS_DATA: null,
    GPS_RESCUE: null,
    LED_COLORS: null,
    LED_MODE_COLORS: null,
    LED_STRIP: null,
    LED_CONFIG_VALUES: [],
    MISC: null, // DEPRECATED
    MIXER_CONFIG: null,
    MODE_RANGES: null,
    MODE_RANGES_EXTRA: null,
    MOTOR_3D_CONFIG: null,
    MOTOR_CONFIG: null,
    MOTOR_DATA: null,
    MOTOR_OUTPUT_ORDER: null,
    MOTOR_TELEMETRY_DATA: null,
    MULTIPLE_MSP: null,
    PID: null,
    PIDS_ACTIVE: null,
    PID_ADVANCED_CONFIG: null,
    PID_NAMES: null,
    PIDS: null,
    RC: null,
    RC_DEADBAND_CONFIG: null,
    RC_MAP: null,
    RC_TUNING: null,
    RSSI_CONFIG: null,
    RXFAIL_CONFIG: null,
    RX_CONFIG: null,
    SDCARD: null,
    SENSOR_ALIGNMENT: null,
    SENSOR_CONFIG: null,
    SENSOR_CONFIG_ACTIVE: null,
    SENSOR_DATA: null,
    SERIAL_CONFIG: null,
    SERVO_CONFIG: null,
    SERVO_DATA: null,
    SERVO_RULES: null,
    TRANSPONDER: null,
    TUNING_SLIDERS: null,
    VOLTAGE_METERS: null,
    VOLTAGE_METER_CONFIGS: null,
    VTXTABLE_BAND: null,
    VTXTABLE_POWERLEVEL: null,
    VTX_CONFIG: null,
    VTX_DEVICE_STATUS: null,

    resetState () {
        // Using `Object.assign` instead of reassigning to
        // trigger the updates on the Vue side
        this.CONFIG = JSON.parse(JSON.stringify(INITIAL_CONFIG));
        this.ANALOG = JSON.parse(JSON.stringify(INITIAL_ANALOG));
        this.BATTERY_CONFIG = JSON.parse(JSON.stringify(INITIAL_BATTERY_CONFIG));

        this.BF_CONFIG = {
            currentscale:               0,
            currentoffset:              0,
            currentmetertype:           0,
            batterycapacity:            0,
        };

        this.COPY_PROFILE = {
            type:                       0,
            dstProfile:                 0,
            srcProfile:                 0,
        };

        this.FEATURE_CONFIG = {
            features:                   0,
        };

        this.BEEPER_CONFIG = {
            beepers:                    0,
            dshotBeaconTone:            0,
            dshotBeaconConditions:      0,
        };

        this.MIXER_CONFIG = {
            mixer:                      0,
            reverseMotorDir:            0,
        };

        this.BOARD_ALIGNMENT_CONFIG = {
            roll:                       0,
            pitch:                      0,
            yaw:                        0,
        };

        this.LED_STRIP =                [];
        this.LED_COLORS =               [];
        this.LED_MODE_COLORS =          [];

        this.PID = {
            controller:                 0,
        };

        this.PID_NAMES =                [];
        this.PIDS_ACTIVE = Array.from({length: 10});
        this.PIDS = Array.from({length: 10});
        for (let i = 0; i < 10; i++) {
            this.PIDS_ACTIVE[i] = Array.from({length: 3});
            this.PIDS[i] = Array.from({length: 3});
        }

        this.RC_MAP = [];

        // defaults
        // roll, pitch, yaw, throttle, aux 1, ... aux n
        this.RC = {
            active_channels:            0,
            channels:                   Array.from({length: 32}),
        };

        this.RC_TUNING = {
            RC_RATE:                    0,
            RC_EXPO:                    0,
            roll_pitch_rate:            0, // pre 1.7 api only
            roll_rate:                  0,
            pitch_rate:                 0,
            yaw_rate:                   0,
            dynamic_THR_PID:            0, // moved in 1.45 to ADVANCED_TUNING
            throttle_MID:               0,
            throttle_EXPO:              0,
            dynamic_THR_breakpoint:     0, // moved in 1.45 to ADVANCED_TUNING
            RC_YAW_EXPO:                0,
            rcYawRate:                  0,
            rcPitchRate:                0,
            RC_PITCH_EXPO:              0,
            throttleLimitType:          0,
            throttleLimitPercent:       100,
            roll_rate_limit:            1998,
            pitch_rate_limit:           1998,
            yaw_rate_limit:             1998,
            rates_type:                 0,
        };

        this.AUX_CONFIG =               [];
        this.AUX_CONFIG_IDS =           [];

        this.MODE_RANGES =              [];
        this.MODE_RANGES_EXTRA =        [];
        this.ADJUSTMENT_RANGES =        [];

        this.SERVO_CONFIG =             [];
        this.SERVO_RULES =              [];

        this.SERIAL_CONFIG = {
            ports:                      [],

            // pre 1.6 settings
            mspBaudRate:                0,
            gpsBaudRate:                0,
            gpsPassthroughBaudRate:     0,
            cliBaudRate:                0,
        };

        this.SENSOR_DATA = {
            gyroscope:                  [0, 0, 0],
            accelerometer:              [0, 0, 0],
            magnetometer:               [0, 0, 0],
            altitude:                   0,
            sonar:                      0,
            kinematics:                 [0.0, 0.0, 0.0],
            debug:                      [0, 0, 0, 0, 0, 0, 0, 0],
        };

        this.MOTOR_DATA =               Array.from({length: 8});
        this.SERVO_DATA =               Array.from({length: 8});

        this.MOTOR_TELEMETRY_DATA = {
            rpm:                        [0, 0, 0, 0, 0, 0, 0, 0],
            invalidPercent:             [0, 0, 0, 0, 0, 0, 0, 0],
            temperature:                [0, 0, 0, 0, 0, 0, 0, 0],
            voltage:                    [0, 0, 0, 0, 0, 0, 0, 0],
            current:                    [0, 0, 0, 0, 0, 0, 0, 0],
            consumption:                [0, 0, 0, 0, 0, 0, 0, 0],
        };

        this.GPS_DATA = {
            fix:                        0,
            numSat:                     0,
            lat:                        0,
            lon:                        0,
            alt:                        0,
            speed:                      0,
            ground_course:              0,
            positionalDop:              0,
            distanceToHome:             0,
            directionToHome:            0,
            update:                     0,

            chn:                        [],
            svid:                       [],
            quality:                    [],
            cno:                        [],
        };

        this.VOLTAGE_METERS =           [];
        this.VOLTAGE_METER_CONFIGS =    [];
        this.CURRENT_METERS =           [];
        this.CURRENT_METER_CONFIGS =    [];

        this.BATTERY_STATE = {};
        this.BATTERY_CONFIG = {
            vbatmincellvoltage:         0,
            vbatmaxcellvoltage:         0,
            vbatwarningcellvoltage:     0,
            capacity:                   0,
            voltageMeterSource:         0,
            currentMeterSource:         0,
        };

        this.ARMING_CONFIG = {
            auto_disarm_delay:          0,
            disarm_kill_switch:         0,
            small_angle:                0,
            gyro_cal_on_first_arm:      0,
        };

        this.FC_CONFIG = {
            loopTime:                   0,
        };

        this.MISC = {
            // DEPRECATED = only used to store values that are written back to the fc as-is, do NOT use for any other purpose
            failsafe_throttle:          0,
            gps_baudrate:               0,
            multiwiicurrentoutput:      0,
            placeholder2:               0,
            vbatscale:                  0,
            vbatmincellvoltage:         0,
            vbatmaxcellvoltage:         0,
            vbatwarningcellvoltage:     0,
            batterymetertype:           1, // 1=ADC, 2=ESC
        };
        this.MOTOR_CONFIG = {
            minthrottle:                0,
            maxthrottle:                0,
            mincommand:                 0,
            motor_count:                0,
            motor_poles:                0,
            use_dshot_telemetry:        false,
            use_esc_sensor:             false,
        };

        this.GPS_CONFIG = {
            provider:                   0,
            ublox_sbas:                 0,
            auto_config:                0,
            auto_baud:                  0,
            home_point_once:            0,
            ublox_use_galileo:          0,
        };

        this.COMPASS_CONFIG = {
            mag_declination:            0,
        };

        this.RSSI_CONFIG = {
            channel:                    0,
        };

        this.MOTOR_3D_CONFIG = {
            deadband3d_low:             0,
            deadband3d_high:            0,
            neutral:                    0,
        };

        this.DATAFLASH = {
            ready:                      false,
            supported:                  false,
            sectors:                    0,
            totalSize:                  0,
            usedSize:                   0,
        };

        this.SDCARD = {
            supported:                  false,
            state:                      0,
            filesystemLastError:        0,
            freeSizeKB:                 0,
            totalSizeKB:                0,
        };

        this.BLACKBOX = {
            supported:                  false,
            blackboxDevice:             0,
            blackboxRateNum:            1,
            blackboxRateDenom:          1,
            blackboxPDenom:             0,
            blackboxSampleRate:         0,
            blackboxDisabledMask:       0,
        };

        this.TRANSPONDER = {
            supported:                  false,
            data:                       [],
            provider:                   0,
            providers:                  [],
        };

        this.RC_DEADBAND_CONFIG = {
            deadband:                   0,
            yaw_deadband:               0,
            alt_hold_deadband:          0,
            deadband3d_throttle:        0,
        };

        this.SENSOR_ALIGNMENT = {
            align_gyro:                 0,
            align_acc:                  0,
            align_mag:                  0,
            gyro_detection_flags:       0,
            gyro_to_use:                0,
            gyro_1_align:               0,
            gyro_2_align:               0,
        };

        this.PID_ADVANCED_CONFIG = {
            gyro_sync_denom:            0,
            pid_process_denom:          0,
            use_unsyncedPwm:            0,
            fast_pwm_protocol:          0,
            motor_pwm_rate:             0,
            digitalIdlePercent:         0,
            gyroUse32kHz:               0,
            motorPwmInversion:          0,
            gyroHighFsr:                0,
            gyroMovementCalibThreshold: 0,
            gyroCalibDuration:          0,
            gyroOffsetYaw:              0,
            gyroCheckOverflow:          0,
            debugMode:                  0,
            debugModeCount:             0,
        };

        this.FILTER_CONFIG = {
            gyro_hardware_lpf:          0,
            gyro_32khz_hardware_lpf:    0,
            gyro_lowpass_hz:            0,
            gyro_lowpass_dyn_min_hz:    0,
            gyro_lowpass_dyn_max_hz:    0,
            gyro_lowpass_type:          0,
            gyro_lowpass2_hz:           0,
            gyro_lowpass2_type:         0,
            gyro_notch_hz:              0,
            gyro_notch_cutoff:          0,
            gyro_notch2_hz:             0,
            gyro_notch2_cutoff:         0,
            dterm_lowpass_hz:           0,
            dterm_lowpass_dyn_min_hz:   0,
            dterm_lowpass_dyn_max_hz:   0,
            dterm_lowpass_type:         0,
            dterm_lowpass2_hz:          0,
            dterm_lowpass2_type:        0,
            dyn_lpf_curve_expo:         0,
            dterm_notch_hz:             0,
            dterm_notch_cutoff:         0,
            yaw_lowpass_hz:             0,
            dyn_notch_range:            0,
            dyn_notch_width_percent:    0,
            dyn_notch_q:                0,
            dyn_notch_min_hz:           0,
            dyn_notch_max_hz:           0,
            dyn_notch_count:            0,
            gyro_rpm_notch_harmonics:   0,
            gyro_rpm_notch_min_hz:      0,
        };

        this.ADVANCED_TUNING = {
            rollPitchItermIgnoreRate:   0,
            yawItermIgnoreRate:         0,
            yaw_p_limit:                0,
            deltaMethod:                0,
            vbatPidCompensation:        0,
            dtermSetpointTransition:    0,
            dtermSetpointWeight:        0,
            toleranceBand:              0,
            toleranceBandReduction:     0,
            itermThrottleGain:          0,
            pidMaxVelocity:             0,
            pidMaxVelocityYaw:          0,
            levelAngleLimit:            0,
            levelSensitivity:           0,
            itermThrottleThreshold:     0,
            itermAcceleratorGain:       0, // depecrated in API 1.45
            antiGravityGain:            0, // was itermAccelatorGain till API 1.45
            itermRotation:              0,
            smartFeedforward:           0,
            itermRelax:                 0,
            itermRelaxType:             0,
            itermRelaxCutoff:           0,
            absoluteControlGain:        0,
            throttleBoost:              0,
            acroTrainerAngleLimit:      0,
            feedforwardRoll:            0,
            feedforwardPitch:           0,
            feedforwardYaw:             0,
            feedforwardTransition:      0,
            antiGravityMode:            0,
            dMinRoll:                   0,
            dMinPitch:                  0,
            dMinYaw:                    0,
            dMinGain:                   0,
            dMinAdvance:                0,
            useIntegratedYaw:           0,
            integratedYawRelax:         0,
            motorOutputLimit:           0,
            autoProfileCellCount:       0,
            idleMinRpm:                 0,
            feedforward_averaging:      0,
            feedforward_smooth_factor:  0,
            feedforward_boost:          0,
            feedforward_max_rate_limit: 0,
            feedforward_jitter_factor:  0,
            vbat_sag_compensation:      0,
            thrustLinearization:        0,
            tpaRate:                    0,
            tpaBreakpoint:              0,
        };
        this.ADVANCED_TUNING_ACTIVE = { ...this.ADVANCED_TUNING };

        this.SENSOR_CONFIG = {
            acc_hardware:               0,
            baro_hardware:              0,
            mag_hardware:               0,
            sonar_hardware:             0,
        };

        this.SENSOR_CONFIG_ACTIVE = { gyro_hardware: 0, ...this.SENSOR_CONFIG };

        this.RX_CONFIG = {
            serialrx_provider:            0,
            stick_max:                    0,
            stick_center:                 0,
            stick_min:                    0,
            spektrum_sat_bind:            0,
            rx_min_usec:                  0,
            rx_max_usec:                  0,
            rcInterpolation:              0,
            rcInterpolationInterval:      0,
            rcInterpolationChannels:      0,
            airModeActivateThreshold:     0,
            rxSpiProtocol:                0,
            rxSpiId:                      0,
            rxSpiRfChannelCount:          0,
            fpvCamAngleDegrees:           0,
            rcSmoothingType:              0,
            rcSmoothingSetpointCutoff:    0,
            rcSmoothingFeedforwardCutoff: 0,
            rcSmoothingInputType:         0,
            rcSmoothingDerivativeType:    0,
            rcSmoothingAutoFactor:        0,
            usbCdcHidType:                0,
            rcSmoothingMode:              0,
            elrsUid:                      [0, 0, 0, 0, 0, 0],
        };

        this.FAILSAFE_CONFIG = {
            failsafe_delay:                 0,
            failsafe_off_delay:             0,
            failsafe_throttle:              0,
            failsafe_switch_mode:           0,
            failsafe_throttle_low_delay:    0,
            failsafe_procedure:             0,
        };

        this.GPS_RESCUE = {
            angle:                          0,
            returnAltitudeM:                0,
            descentDistanceM:               0,
            groundSpeed:                    0,
            throttleMin:                    0,
            throttleMax:                    0,
            throttleHover:                  0,
            sanityChecks:                   0,
            minSats:                        0,
            ascendRate:                     0,
            descendRate:                    0,
            allowArmingWithoutFix:          0,
            altitudeMode:                   0,
            minStartDistM:                  0,
            initialClimbM:                  0,
        };

        this.RXFAIL_CONFIG = [];

        this.VTX_CONFIG = {
            vtx_type:                       0,
            vtx_band:                       0,
            vtx_channel:                    0,
            vtx_power:                      0,
            vtx_pit_mode:                   false,
            vtx_frequency:                  0,
            vtx_device_ready:               false,
            vtx_low_power_disarm:           0,
            vtx_pit_mode_frequency:         0,
            vtx_table_available:            false,
            vtx_table_bands:                0,
            vtx_table_channels:             0,
            vtx_table_powerlevels:          0,
            vtx_table_clear:                false,
        };

        this.VTXTABLE_BAND = {
            vtxtable_band_number:           0,
            vtxtable_band_name:             '',
            vtxtable_band_letter:           '',
            vtxtable_band_is_factory_band:  false,
            vtxtable_band_frequencies:      [],
        };

        this.VTXTABLE_POWERLEVEL = {
            vtxtable_powerlevel_number:     0,
            vtxtable_powerlevel_value:      0,
            vtxtable_powerlevel_label:      0,
        };

        this.MOTOR_OUTPUT_ORDER =           [];

        this.MULTIPLE_MSP = {
            msp_commands:                   [],
        };

        this.DEFAULT = {
            gyro_lowpass_hz:                100,
            gyro_lowpass_dyn_min_hz:        150,
            gyro_lowpass_dyn_max_hz:        450,
            gyro_lowpass_type:              this.FILTER_TYPE_FLAGS.PT1,
            gyro_lowpass2_hz:               300,
            gyro_lowpass2_type:             this.FILTER_TYPE_FLAGS.PT1,
            gyro_notch_cutoff:              300,
            gyro_notch_hz:                  400,
            gyro_notch2_cutoff:             100,
            gyro_notch2_hz:                 200,
            gyro_rpm_notch_harmonics:         3,
            gyro_rpm_notch_min_hz:          100,
            dterm_lowpass_hz:               100,
            dterm_lowpass_dyn_min_hz:       150,
            dterm_lowpass_dyn_max_hz:       250,
            dyn_lpf_curve_expo:               5,
            dterm_lowpass_type:             this.FILTER_TYPE_FLAGS.PT1,
            dterm_lowpass2_hz:              200,
            dterm_lowpass2_type:            this.FILTER_TYPE_FLAGS.BIQUAD,
            dterm_notch_cutoff:             160,
            dterm_notch_hz:                 260,
            yaw_lowpass_hz:                 100,
            dyn_notch_q:                    120,
            dyn_notch_width_percent:          8,
            dyn_notch_count:                  3,
            dyn_notch_q_rpm:                500, // default with rpm filtering
            dyn_notch_count_rpm:              1,
            dyn_notch_min_hz:               150,
            dyn_notch_max_hz:               600,
        };

        this.DEFAULT_PIDS = [
            42, 85, 35, 20, 90,
            46, 90, 38, 22, 95,
            30, 90,  0,  0, 90,
        ];

        this.VTX_DEVICE_STATUS = null;

        this.TUNING_SLIDERS = {
            slider_pd_ratio:                    0,
            slider_pd_gain:                     0,
            slider_feedforward_gain:            0,
            slider_master_multiplier:           0,
            slider_dterm_filter:                0,
            slider_dterm_filter_multiplier:     0,
            slider_gyro_filter:                 0,
            slider_gyro_filter_multiplier:      0,
            // introduced in 4.3
            slider_pids_mode:                   0,
            slider_d_gain:                      0,
            slider_pi_gain:                     0,
            slider_dmax_gain:                   0,
            slider_i_gain:                      0,
            slider_roll_pitch_ratio:            0,
            slider_pitch_pi_gain:               0,

            slider_pids_valid:                  0,
            slider_gyro_valid:                  0,
            slider_dterm_valid:                 0,
        };

        this.DEFAULT_TUNING_SLIDERS = {
            slider_pids_mode:                   2,
            slider_d_gain:                      100,
            slider_pi_gain:                     100,
            slider_feedforward_gain:            100,
            slider_dmax_gain:                   100,
            slider_i_gain:                      100,
            slider_roll_pitch_ratio:            100,
            slider_pitch_pi_gain:               100,
            slider_master_multiplier:           100,

            slider_dterm_filter:                1,
            slider_dterm_filter_multiplier:     100,
            slider_gyro_filter:                 1,
            slider_gyro_filter_multiplier:      100,

            slider_pids_valid:                  1,
            slider_gyro_valid:                  1,
            slider_dterm_valid:                 1,
        };
    },

    getSerialRxTypes: () => {
        const apiVersion = FC.CONFIG.apiVersion;

        // defaults
        const serialRxTypes = [
            'SPEKTRUM1024',
            'SPEKTRUM2048',
            'SBUS',
            'SUMD',
            'SUMH',
            'XBUS_MODE_B',
            'XBUS_MODE_B_RJ01',
            'IBUS',
            'JETIEXBUS',
            'CRSF',
            'SPEKTRUM2048/SRXL',
            'TARGET_CUSTOM',
            'FPORT',
            'SPEKTRUM SRXL2',
            'IRC GHOST',
        ];

        if (semver.gte(apiVersion, API_VERSION_1_46)) {
            // Default to NONE and move SPEKTRUM1024 to the end (firmware PR #12500)
            serialRxTypes[0] = 'NONE';
            serialRxTypes.push('SPEKTRUM1024');
        }

        return serialRxTypes;
    },

    getHardwareName() {
        let name;
        if (this.CONFIG.targetName) {
            name = this.CONFIG.targetName;
        } else {
            name = this.CONFIG.boardIdentifier;
        }

        if (this.CONFIG.boardName && this.CONFIG.boardName !== name) {
            name = `${this.CONFIG.boardName}(${name})`;
        }

        if (this.CONFIG.manufacturerId) {
            name = `${this.CONFIG.manufacturerId}/${name}`;
        }

        return name;
    },

    MCU_TYPES: {
        0: "SIMULATOR",
        1: "F40X",
        2: "F411",
        3: "F446",
        4: "F722",
        5: "F745",
        6: "F746",
        7: "F765",
        8: "H750",
        9: "H743_REV_UNKNOWN",
        10: "H743_REV_Y",
        11: "H743_REV_X",
        12: "H743_REV_V",
        13: "H7A3",
        14: "H723_725",
        15: "G474",
        16: "H730",
        255: "Unknown MCU",
    },

    getMcuType() {
        return this.MCU_TYPES[this.CONFIG.mcuTypeId];
    },

    CONFIGURATION_STATES: {
        DEFAULTS_BARE: 0,
        DEFAULTS_CUSTOM: 1,
        CONFIGURED: 2,
    },

    TARGET_CAPABILITIES_FLAGS: {
        HAS_VCP: 0,
        HAS_SOFTSERIAL: 1,
        IS_UNIFIED: 2,
        HAS_FLASH_BOOTLOADER: 3,
        SUPPORTS_CUSTOM_DEFAULTS: 4,
        HAS_CUSTOM_DEFAULTS: 5,
        SUPPORTS_RX_BIND: 6,
    },

    CONFIGURATION_PROBLEM_FLAGS: {
        ACC_NEEDS_CALIBRATION: 0,
        MOTOR_PROTOCOL_DISABLED: 1,
    },

    processBuildOptions() {
        const buildOptions = [];

        for (const [key, value] of Object.entries(FIRMWARE_BUILD_OPTIONS)) {
            for (const option of this.CONFIG.buildOptions) {
                if (option === value) {
                    buildOptions.push(key);
                    break;
                }
            }
        }

        this.CONFIG.buildOptions = buildOptions;
    },

    boardHasVcp() {
        return bit_check(this.CONFIG.targetCapabilities, this.TARGET_CAPABILITIES_FLAGS.HAS_VCP);
    },

    boardHasFlashBootloader() {
        return bit_check(this.CONFIG.targetCapabilities, this.TARGET_CAPABILITIES_FLAGS.HAS_FLASH_BOOTLOADER);
    },

    FILTER_TYPE_FLAGS: {
        PT1: 0,
        BIQUAD: 1,
    },

    getFilterDefaults() {
        const versionFilterDefaults = this.DEFAULT;
        // Change filter defaults depending on API version here
        versionFilterDefaults.gyro_lowpass_hz = 150;
        versionFilterDefaults.gyro_lowpass_type = this.FILTER_TYPE_FLAGS.BIQUAD;
        versionFilterDefaults.gyro_lowpass2_hz = 0;
        versionFilterDefaults.gyro_lowpass2_type = this.FILTER_TYPE_FLAGS.BIQUAD;
        versionFilterDefaults.dterm_lowpass_hz = 150;
        versionFilterDefaults.dterm_lowpass_type = this.FILTER_TYPE_FLAGS.BIQUAD;
        versionFilterDefaults.dterm_lowpass2_hz = 150;
        versionFilterDefaults.dterm_lowpass2_type = this.FILTER_TYPE_FLAGS.BIQUAD;

        // Introduced in 1.42
        versionFilterDefaults.gyro_lowpass_hz = 200;
        versionFilterDefaults.gyro_lowpass_dyn_min_hz = 200;
        versionFilterDefaults.gyro_lowpass_dyn_max_hz = 500;
        versionFilterDefaults.gyro_lowpass_type = this.FILTER_TYPE_FLAGS.PT1;
        versionFilterDefaults.gyro_lowpass2_hz = 250;
        versionFilterDefaults.gyro_lowpass2_type = this.FILTER_TYPE_FLAGS.PT1;
        versionFilterDefaults.dterm_lowpass_hz = 150;
        versionFilterDefaults.dterm_lowpass_dyn_min_hz = 70;
        versionFilterDefaults.dterm_lowpass_dyn_max_hz = 170;
        versionFilterDefaults.dterm_lowpass_type = this.FILTER_TYPE_FLAGS.PT1;
        versionFilterDefaults.dterm_lowpass2_hz = 150;
        versionFilterDefaults.dterm_lowpass2_type = this.FILTER_TYPE_FLAGS.PT1;

        // Introduced in 1.44
        versionFilterDefaults.dyn_notch_q = 300;
        versionFilterDefaults.gyro_lowpass_hz = 250;
        versionFilterDefaults.gyro_lowpass_dyn_min_hz = 250;
        versionFilterDefaults.gyro_lowpass2_hz = 500;
        versionFilterDefaults.dterm_lowpass_hz = 75;
        versionFilterDefaults.dterm_lowpass_dyn_min_hz = 75;
        versionFilterDefaults.dterm_lowpass_dyn_max_hz = 150;

        // Introduced in 1.45
        if (semver.gte(this.CONFIG.apiVersion, API_VERSION_1_45)) {
            versionFilterDefaults.dyn_notch_min_hz = 100;
        }

        return versionFilterDefaults;
    },

    getPidDefaults() {
        // if defaults change they should go here
        // Introduced in 1.44
        const versionPidDefaults = [
            45, 80, 40, 30, 120,
            47, 84, 46, 34, 125,
            45, 80,  0,  0, 120,
        ];

        return versionPidDefaults;
    },

    getSliderDefaults() {
        return this.DEFAULT_TUNING_SLIDERS;
    },

    RATES_TYPE: {
        BETAFLIGHT: 0,
        RACEFLIGHT: 1,
        KISS: 2,
        ACTUAL: 3,
        QUICKRATES: 4,
    },
};

export default FC;
