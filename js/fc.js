'use strict';

// define all the global variables that are uses to hold FC state
var CONFIG;
var FEATURE_CONFIG;
var MIXER_CONFIG;
var BOARD_ALIGNMENT_CONFIG;
var LED_STRIP;
var LED_COLORS;
var LED_MODE_COLORS;
var PID;
var PID_names;
var PIDs;
var RC_MAP;
var RC;
var RC_tuning;
var AUX_CONFIG;
var AUX_CONFIG_IDS;
var MODE_RANGES;
var ADJUSTMENT_RANGES;
var SERVO_CONFIG;
var SERVO_RULES;
var SERIAL_CONFIG;
var SENSOR_DATA;
var MOTOR_DATA;
var SERVO_DATA;
var GPS_DATA;
var ANALOG;
var VOLTAGE_METERS;
var VOLTAGE_METER_CONFIGS;
var CURRENT_METERS;
var CURRENT_METER_CONFIGS;
var BATTERY_STATE;
var BATTERY_CONFIG;
var ARMING_CONFIG;
var FC_CONFIG;
var MISC; // DEPRECATED
var MOTOR_CONFIG;
var GPS_CONFIG;
var COMPASS_CONFIG;
var RSSI_CONFIG;
var MOTOR_3D_CONFIG;
var DATAFLASH;
var SDCARD;
var BLACKBOX;
var TRANSPONDER;
var RC_DEADBAND_CONFIG;
var SENSOR_ALIGNMENT;
var RX_CONFIG;
var FAILSAFE_CONFIG;
var RXFAIL_CONFIG;
var PID_ADVANCED_CONFIG;
var FILTER_CONFIG;
var ADVANCED_TUNING;
var SENSOR_CONFIG;

var FC = {
    resetState: function() {
        CONFIG = {
            apiVersion:                 "0.0.0",
            flightControllerIdentifier: '',
            flightControllerVersion:    '',
            version:                    0,
            buildInfo:                  '',
            multiType:                  0,
            msp_version:                0, // not specified using semantic versioning
            capability:                 0,
            cycleTime:                  0,
            i2cError:                   0,
            activeSensors:              0,
            mode:                       0,
            profile:                    0,
            uid:                        [0, 0, 0],
            accelerometerTrims:         [0, 0],
            name:                       '',
            numProfiles:                3,
            rateProfile:                0,
            boardType:                  0,
        };
        
        FEATURE_CONFIG = {
            features:                   0,
        };
        
        MIXER_CONFIG = {
            mixer:                      0,
        }; 

        BOARD_ALIGNMENT_CONFIG = {
            roll:                       0,
            pitch:                      0,
            yaw:                        0,
        };
        
        LED_STRIP =                     [];
        LED_COLORS =                    [];
        LED_MODE_COLORS =               [];

        PID = {
            controller:                 0
        };

        PID_names =                     [];
        PIDs = new Array(10);
        for (var i = 0; i < 10; i++) {
            PIDs[i] = new Array(3);
        }

        RC_MAP = [];

        // defaults
        // roll, pitch, yaw, throttle, aux 1, ... aux n
        RC = {
            active_channels:            0,
            channels:                   new Array(32),
        };

        RC_tuning = {
            RC_RATE:                    0,
            RC_EXPO:                    0,
            roll_pitch_rate:            0, // pre 1.7 api only
            roll_rate:                  0,
            pitch_rate:                 0,
            yaw_rate:                   0,
            dynamic_THR_PID:            0,
            throttle_MID:               0,
            throttle_EXPO:              0,
            dynamic_THR_breakpoint:     0,
            RC_YAW_EXPO:                0,
            rcYawRate:                  0,
        };

        AUX_CONFIG =                    [];
        AUX_CONFIG_IDS =                [];

        MODE_RANGES =                   [];
        ADJUSTMENT_RANGES =             [];

        SERVO_CONFIG =                  [];
        SERVO_RULES =                   [];

        SERIAL_CONFIG = {
            ports:                      [],

            // pre 1.6 settings
            mspBaudRate:                0,
            gpsBaudRate:                0,
            gpsPassthroughBaudRate:     0,
            cliBaudRate:                0,
        };

        SENSOR_DATA = {
            gyroscope:                  [0, 0, 0],
            accelerometer:              [0, 0, 0],
            magnetometer:               [0, 0, 0],
            altitude:                   0,
            sonar:                      0,
            kinematics:                 [0.0, 0.0, 0.0],
            debug:                      [0, 0, 0, 0],
        };

        MOTOR_DATA =                    new Array(8);
        SERVO_DATA =                    new Array(8);

        GPS_DATA = {
            fix:                        0,
            numSat:                     0,
            lat:                        0,
            lon:                        0,
            alt:                        0,
            speed:                      0,
            ground_course:              0,
            distanceToHome:             0,
            ditectionToHome:            0,
            update:                     0,

            chn:                        [],
            svid:                       [],
            quality:                    [],
            cno:                        []
        };

        ANALOG = {
            voltage:                    0,
            mAhdrawn:                   0,
            rssi:                       0,
            amperage:                   0,
            last_received_timestamp:    Date.now() // FIXME this code lies, it's never been received at this point
        };

        VOLTAGE_METERS =                [];
        VOLTAGE_METER_CONFIGS =         [];
        CURRENT_METERS =                [];
        CURRENT_METER_CONFIGS =         [];
        
        BATTERY_STATE = {};
        BATTERY_CONFIG = {
            vbatmincellvoltage:         0,
            vbatmaxcellvoltage:         0,
            vbatwarningcellvoltage:     0,
            capacity:                   0,
            voltageMeterSource:         0,
            currentMeterSource:         0,
        };
        
        ARMING_CONFIG = {
            auto_disarm_delay:          0,
            disarm_kill_switch:         0,
        };

        FC_CONFIG = {
            loopTime:                   0
        };
        
        MISC = {
            // DEPRECATED = only used to store values that are written back to the fc as-is, do NOT use for any other purpose
            failsafe_throttle:          0,
            gps_baudrate:               0,
            multiwiicurrentoutput:      0,
            placeholder2:               0,
            vbatscale:                  0,
            vbatmincellvoltage:         0,
            vbatmaxcellvoltage:         0,
            vbatwarningcellvoltage:     0,
        };
        MOTOR_CONFIG = {
            minthrottle:                0,
            maxthrottle:                0,
            mincommand:                 0,
        };
        
        GPS_CONFIG = {
            provider:                   0,
            ublox_sbas:                 0,
            auto_config:                0,
            auto_baud:                  0,
        };
        
        COMPASS_CONFIG = {
            mag_declination:            0,
        };

        RSSI_CONFIG = {
            channel:                    0,
        };
        
        MOTOR_3D_CONFIG = {
            deadband3d_low:             0,
            deadband3d_high:            0,
            neutral:                    0,
        };

        DATAFLASH = {
            ready:                      false,
            supported:                  false,
            sectors:                    0,
            totalSize:                  0,
            usedSize:                   0
        };

        SDCARD = {
            supported:                  false,
            state:                      0,
            filesystemLastError:        0,
            freeSizeKB:                 0,
            totalSizeKB:                0,
        };

        BLACKBOX = {
            supported:                  false,
            blackboxDevice:             0,
            blackboxRateNum:            1,
            blackboxRateDenom:          1,
        };

        TRANSPONDER = {
            supported:                  false,
            data:                       [],
            provider:                   0,
            providers:                  [],
        };

        RC_DEADBAND_CONFIG = {
            deadband:                   0,
            yaw_deadband:               0,
            alt_hold_deadband:          0,
            deadband3d_throttle:        0,
        };

        SENSOR_ALIGNMENT = {
            align_gyro:                 0,
            align_acc:                  0,
            align_mag:                  0,
        };

        PID_ADVANCED_CONFIG = {
            gyro_sync_denom:            0,
            pid_process_denom:          0,
            use_unsyncedPwm:            0,
            fast_pwm_protocol:          0,
            motor_pwm_rate:             0,
            digitalIdlePercent:         0,
            gyroUse32kHz:               0,
        };

        FILTER_CONFIG = {
            gyro_soft_lpf_hz:           0,
            dterm_lpf_hz:               0,
            yaw_lpf_hz:                 0,
            gyro_soft_notch_hz_1:       0,
            gyro_soft_notch_cutoff_1:   0,
            dterm_notch_hz:             0,
            dterm_notch_cutoff:         0,
            gyro_soft_notch_hz_2:       0,
            gyro_soft_notch_cutoff_2:   0,
        };

        ADVANCED_TUNING = {
            rollPitchItermIgnoreRate:   0,
            yawItermIgnoreRate:         0,
            yaw_p_limit:                0,
            deltaMethod:                0,
            vbatPidCompensation:        0,
            ptermSetpointWeight:        0,
            dtermSetpointWeight:        0,
            toleranceBand:              0,
            toleranceBandReduction:     0,
            itermThrottleGain:          0,
            pidMaxVelocity:             0,
            pidMaxVelocityYaw:          0,
            levelAngleLimit:            0,
            levelSensitivity:           0,
        };

        SENSOR_CONFIG = {
            acc_hardware:               0,
            baro_hardware:              0,
            mag_hardware:               0,
        };

        RX_CONFIG = {
            serialrx_provider:          0,
            stick_max:                  0,
            stick_center:               0,
            stick_min:                  0,
            spektrum_sat_bind:          0,
            rx_min_usec:                0,
            rx_max_usec:                0,
            rcInterpolation:            0,
            rcInterpolationInterval:    0,
            airModeActivateThreshold:   0,
            rxSpiProtocol:              0,
            rxSpiId:                    0,
            rxSpiRfChannelCount:        0,
            fpvCamAngleDegrees:         0,
        };

        FAILSAFE_CONFIG = {
            failsafe_delay:                 0,
            failsafe_off_delay:             0,
            failsafe_throttle:              0,
            failsafe_kill_switch:           0,
            failsafe_throttle_low_delay:    0,
            failsafe_procedure:             0.
        };

        RXFAIL_CONFIG = [];
    }
};
