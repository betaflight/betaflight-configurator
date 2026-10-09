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

import Features from "./Features";
import { i18n } from "./localization";
import Beepers from "./Beepers";
import { useFlightControllerStore } from "../stores/fc";
import CONFIGURATOR, { API_VERSION_1_47, API_VERSION_1_48 } from "./data_storage";
import { OSD } from "../components/tabs/osd/osd";
import semver from "semver";
import { addArrayElement, addArrayElementAfter } from "./utils/array";
import { getDebugModes } from "./utils/debugModes";

// pid.h PID_*_DEFAULT, pid.c resetPidProfile
const DEFAULT_BETAFLIGHT_PIDS = [
    [45, 80, 30], // ROLL
    [47, 84, 34], // PITCH
    [45, 80, 0], // YAW
    [50, 75, 75], // LEVEL
    [40, 0, 0], // MAG
];

// controlrate_profile.c pgResetFn_controlRateProfiles
const DEFAULT_BETAFLIGHT_RC_TUNING = {
    RC_RATE: 0.07,
    RC_EXPO: 0,
    roll_rate: 0.67,
    pitch_rate: 0.67,
    yaw_rate: 0.67,
    throttle_MID: 0.5,
    throttle_EXPO: 0,
    RC_YAW_EXPO: 0,
    rcYawRate: 0.07,
    rcPitchRate: 0.07,
    RC_PITCH_EXPO: 0,
    throttleLimitType: 0,
    throttleLimitPercent: 100,
    roll_rate_limit: 1998,
    pitch_rate_limit: 1998,
    yaw_rate_limit: 1998,
    rates_type: 3, // RATES_TYPE_ACTUAL
    throttle_HOVER: 0.5,
};

// pid.c resetPidProfile, gyro.c pgResetFn_gyroConfig, pg/dyn_notch.c, pg/rpm_filter.c
const DEFAULT_BETAFLIGHT_FILTER_CONFIG = {
    gyro_hardware_lpf: 0,
    gyro_lowpass_hz: 250,
    gyro_lowpass_dyn_min_hz: 250,
    gyro_lowpass_dyn_max_hz: 500,
    gyro_lowpass_type: 0,
    gyro_lowpass2_hz: 500,
    gyro_lowpass2_type: 0,
    gyro_notch_hz: 0,
    gyro_notch_cutoff: 0,
    gyro_notch2_hz: 0,
    gyro_notch2_cutoff: 0,
    dterm_lowpass_hz: 75,
    dterm_lowpass_dyn_min_hz: 75,
    dterm_lowpass_dyn_max_hz: 150,
    dterm_lowpass_type: 0,
    dterm_lowpass2_hz: 150,
    dterm_lowpass2_type: 0,
    dyn_lpf_curve_expo: 5,
    dterm_notch_hz: 0,
    dterm_notch_cutoff: 0,
    yaw_lowpass_hz: 100,
    dyn_notch_q: 300,
    dyn_notch_min_hz: 100,
    dyn_notch_max_hz: 600,
    dyn_notch_count: 3,
    gyro_rpm_notch_harmonics: 3,
    gyro_rpm_notch_min_hz: 100,
    gyro_rpm_notch_fade_range_hz: 50,
    gyro_rpm_notch_q: 500,
    gyro_rpm_notch_weights: [100, 100, 100],
};

// rx.h SERIALRX_CRSF, pg/rx.c pgResetFn_rxConfig
const DEFAULT_BETAFLIGHT_RX_CONFIG = {
    serialrx_provider: 9,
};

const DEFAULT_BETAFLIGHT_ADVANCED_TUNING = {
    antiGravityGain: 80,
    itermRotation: 0,
    itermRelax: 1,
    itermRelaxType: 1,
    itermRelaxCutoff: 15,
    throttleBoost: 5,
    acroTrainerAngleLimit: 20,
    feedforwardRoll: 120,
    feedforwardPitch: 125,
    feedforwardYaw: 120,
    dMaxRoll: 40,
    dMaxPitch: 46,
    dMaxYaw: 0,
    dMaxGain: 37,
    dMaxAdvance: 20,
    useIntegratedYaw: 0,
    integratedYawRelax: 200,
    motorOutputLimit: 100,
    autoProfileCellCount: -1,
    idleMinRpm: 0,
    feedforward_averaging: 1,
    feedforward_smooth_factor: 65,
    feedforward_boost: 15,
    feedforward_max_rate_limit: 90,
    feedforward_jitter_factor: 7,
    vbat_sag_compensation: 0,
    thrustLinearization: 0,
    tpaMode: 1,
    tpaRate: 0.65,
    tpaBreakpoint: 1350,
};

const VirtualFC = {
    // these values are manufactured to unlock all the functionality of the configurator, they dont represent actual hardware
    setVirtualConfig() {
        const fcStore = useFlightControllerStore();

        fcStore.resetState();
        fcStore.config.deviceIdentifier = 0;

        fcStore.config.flightControllerVersion = "2025.12.0";
        fcStore.config.flightControllerIdentifier = "BTFL";
        fcStore.config.apiVersion = CONFIGURATOR.virtualApiVersion;
        // Mirror MSP_STATUS_EX fields so virtual API 1.48 exposes battery profile UI.
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_48)) {
            fcStore.config.numberOfBatteryProfiles = 3;
            fcStore.config.batteryProfile = 0;
        }

        fcStore.config.cpuTemp = 48;

        fcStore.config.buildInfo = "now";
        /** @type {string[]} */
        const buildOptions = [
            "USE_DASHBOARD",
            "USE_GPS",
            "USE_LED_STRIP",
            "USE_MAG",
            "USE_OSD_SD",
            "USE_OSD_HD",
            "USE_VTX",
            "USE_SOFTSERIAL",
            "USE_RANGEFINDER",
            "USE_SERVOS",
            "USE_SERIALRX_CRSF",
            "USE_SERIALRX_SBUS",
            "USE_TELEMETRY_SMARTPORT",
            "USE_DSHOT",
        ];
        fcStore.config.buildOptions = buildOptions;

        fcStore.config.craftName = "BetaFlight";
        fcStore.config.pilotName = "BF pilot";

        fcStore.features.features = new Features(fcStore.config);
        fcStore.features.features.setMask(0);
        fcStore.features.features.enable("ESC_SENSOR");
        fcStore.features.features.enable("GPS");
        fcStore.features.features.enable("LED_STRIP");
        fcStore.features.features.enable("OSD");
        fcStore.features.features.enable("SONAR");
        fcStore.features.features.enable("TELEMETRY");
        fcStore.features.features.enable("TRANSPONDER");
        fcStore.features.features.enable("RX_SERIAL");

        fcStore.beepers.beepers = new Beepers(fcStore.config);
        fcStore.beepers.dshotBeaconConditions = new Beepers(fcStore.config, ["RX_LOST", "RX_SET"]);
        fcStore.beepers.dshotBeaconTone = 1;

        fcStore.mixerConfig.mixer = 3;

        fcStore.motorData = Array.from({ length: 8 });
        fcStore.motor3dConfig = {
            deadband3d_low: 1406,
            deadband3d_high: 1514,
            neutral: 1460,
        };
        // Spread the reset values first so the virtual board reports every field a real one does.
        fcStore.motorConfig = {
            ...fcStore.motorConfig,
            minthrottle: 1070,
            maxthrottle: 2000,
            mincommand: 1000,
            motor_count: 4,
            motor_poles: 14,
            use_dshot_telemetry: true,
            use_esc_sensor: false,
        };

        fcStore.servoConfig = Array.from({ length: 8 });

        for (let i = 0; i < fcStore.servoConfig.length; i++) {
            fcStore.servoConfig[i] = {
                middle: 1500,
                min: 1000,
                max: 2000,
                indexOfChannelToForward: 255,
                rate: 100,
                reversedInputSources: 0,
            };
        }

        fcStore.adjustmentRanges = Array.from({ length: 16 });

        for (let i = 0; i < fcStore.adjustmentRanges.length; i++) {
            fcStore.adjustmentRanges[i] = {
                slotIndex: 0,
                auxChannelIndex: 0,
                range: {
                    start: 900,
                    end: 900,
                },
                adjustmentFunction: 0,
                auxSwitchChannelIndex: 0,
                adjustmentCenter: 0,
                adjustmentScale: 0,
            };
        }

        fcStore.serialConfig.ports = Array.from({ length: 6 });

        fcStore.serialConfig.ports[0] = {
            identifier: 20,
            functions: ["MSP"],
            msp_baudrate: "115200",
            gps_baudrate: "57600",
            telemetry_baudrate: "AUTO",
            blackbox_baudrate: "115200",
        };

        for (let i = 1; i < fcStore.serialConfig.ports.length; i++) {
            fcStore.serialConfig.ports[i] = {
                identifier: i - 1,
                functions: [],
                msp_baudrate: "115200",
                gps_baudrate: "57600",
                telemetry_baudrate: "AUTO",
                blackbox_baudrate: "115200",
            };
        }

        fcStore.ledStrip = Array.from({ length: 256 });

        for (let i = 0; i < fcStore.ledStrip.length; i++) {
            fcStore.ledStrip[i] = {
                x: 0,
                y: 0,
                functions: ["c"],
                color: 0,
                directions: [],
                parameters: 0,
            };
        }

        fcStore.analogData = {
            ...fcStore.analogData,
            voltage: 12,
            mAhdrawn: 1200,
            rssi: 100,
            amperage: 3,
        };

        fcStore.config.sampleRateHz = 12000;
        fcStore.pidAdvancedConfig.pid_process_denom = 2;
        fcStore.pidAdvancedConfig.fast_pwm_protocol = 6; // DSHOT300
        fcStore.pidAdvancedConfig.debugModeCount = getDebugModes(fcStore.config.apiVersion).length;
        fcStore.pids = fcStore.pids.map((pid, index) => DEFAULT_BETAFLIGHT_PIDS[index]?.slice() ?? pid);
        fcStore.pidsActive = fcStore.pids.map((pid) => pid.slice());
        // pid.c simplified_pids_mode RPY; fc.js DEFAULT_TUNING_SLIDERS (all multipliers 100 = 1.0)
        fcStore.tuningSliders = {
            ...fcStore.tuningSliders,
            ...fcStore.getSliderDefaults(),
        };
        fcStore.rcTuning = {
            ...fcStore.rcTuning,
            ...DEFAULT_BETAFLIGHT_RC_TUNING,
        };
        fcStore.filterConfig = {
            ...fcStore.filterConfig,
            ...DEFAULT_BETAFLIGHT_FILTER_CONFIG,
        };
        fcStore.advancedTuning = {
            ...fcStore.advancedTuning,
            ...DEFAULT_BETAFLIGHT_ADVANCED_TUNING,
        };
        fcStore.advancedTuningActive = { ...fcStore.advancedTuning };
        fcStore.rxConfig = {
            ...fcStore.rxConfig,
            ...DEFAULT_BETAFLIGHT_RX_CONFIG,
        };

        fcStore.blackbox = {
            ...fcStore.blackbox,
            supported: true,
            blackboxDevice: 1, // Onboard flash
        };

        fcStore.batteryConfig = {
            vbatmincellvoltage: 3.7,
            vbatmaxcellvoltage: 4.3,
            vbatwarningcellvoltage: 3.8,
            capacity: 5000,
            voltageMeterSource: 2,
            currentMeterSource: 3,
        };

        fcStore.batteryState = {
            cellCount: 4,
            voltage: 16.1,
            mAhDrawn: 3000,
            amperage: 2,
        };

        fcStore.dataflash = {
            ready: true,
            supported: true,
            sectors: 1024,
            totalSize: 40000,
            usedSize: 10000,
        };

        fcStore.sdcard = {
            ...fcStore.sdcard,
            supported: true,
            state: 1,
            freeSizeKB: 1024,
            totalSizeKB: 2048,
        };

        fcStore.sensorAlignment = { ...fcStore.sensorAlignment };
        fcStore.sensorAlignment.gyro_to_use = 0;
        fcStore.sensorAlignment.gyro_enable_mask = (1 << 8) - 1; // Used for API v1.47+
        fcStore.sensorAlignment.gyro_detection_flags = semver.gte(fcStore.config.apiVersion, API_VERSION_1_47) ? 3 : 1;

        fcStore.sensorData = { ...fcStore.sensorData };

        fcStore.rc = {
            channels: Array.from({ length: 16 }),
            active_channels: 16,
        };
        for (let i = 0; i < fcStore.rc.channels.length; i++) {
            fcStore.rc.channels[i] = 1500;
        }

        // from https://betaflight.com/docs/development/Modes or msp/msp_box.c
        fcStore.auxConfig = [
            "ARM",
            "ANGLE",
            "HORIZON",
            "ANTI GRAVITY",
            "MAG",
            "HEADFREE",
            "HEADADJ",
            "CAMSTAB",
            "PASSTHRU",
            "BEEPERON",
            "LEDLOW",
            "CALIB",
            "OSD DISABLE",
            "TELEMETRY",
            "SERVO1",
            "SERVO2",
            "SERVO3",
            "BLACKBOX",
            "FAILSAFE",
            "AIR MODE",
            "3D DISABLE",
            "FPV ANGLE MIX",
            "BLACKBOX ERASE",
            "CAMERA CONTROL 1",
            "CAMERA CONTROL 2",
            "CAMERA CONTROL 3",
            "FLIP OVER AFTER CRASH",
            "BOXPREARM",
            "BEEP GPS SATELLITE COUNT",
            "VTX PIT MODE",
            "USER1",
            "USER2",
            "USER3",
            "USER4",
            "PID AUDIO",
            "PARALYZE",
            "GPS RESCUE",
            "ACRO TRAINER",
            "VTX CONTROL DISABLE",
            "LAUNCH CONTROL",
            "MSP OVERRIDE",
            "STICK COMMANDS DISABLE",
            "BEEPER MUTE",
            "READY",
            "LAP TIMER RESET",
        ];

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            addArrayElementAfter(fcStore.auxConfig, "HORIZON", "ALT_HOLD");
            addArrayElementAfter(fcStore.auxConfig, "CAMSTAB", "POS_HOLD");
            addArrayElementAfter(fcStore.auxConfig, "GPS RESCUE", "AUTOPILOT");
            addArrayElement(fcStore.auxConfig, "CHIRP");
        }

        fcStore.auxConfigIds = [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 15, 17, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
            36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
        ];

        for (let i = 0; i < 16; i++) {
            fcStore.rxFailConfig[i] = {
                mode: 1,
                value: 1500,
            };
        }

        // 11 1111 (pass bitchecks)
        fcStore.config.activeSensors = semver.gte(fcStore.config.apiVersion, API_VERSION_1_47) ? 127 : 63;

        fcStore.sensorConfigActive = {
            ...fcStore.sensorConfigActive,
            gyro_hardware: 2, // MPU6050
            acc_hardware: 3, // MPU6050
            baro_hardware: 4, // BMP280
            mag_hardware: 5, // QMC5883
            sonar_hardware: 1, // HCSR04
            opticalflow_hardware: 1, // MT01
        };

        // For API v1.47+, set dual gyro hardware IDs
        fcStore.gyroSensor.gyro_hardware[0] = 13;
        fcStore.gyroSensor.gyro_hardware[1] = 22;

        fcStore.sensorData.sonars = 231;

        fcStore.gpsConfig = {
            provider: 1,
            ublox_sbas: 1,
            auto_config: 1,
            auto_baud: 0,
            home_point_once: 1,
            ublox_use_galileo: 1,
        };

        fcStore.gpsData = sampleGpsData;
    },

    setupVirtualOSD() {
        OSD.data.video_system = 1; // PAL
        OSD.data.unit_mode = 1; // METRIC

        OSD.virtualMode = {
            itemPositions: Array.from({ length: 77 }),
            statisticsState: [],
            warningFlags: 0,
            // Three timers, shaped as the decoder unpacks them from a real FC's zeroed timer words.
            timerData: Array.from({ length: 3 }, () => OSD.msp.helpers.unpack.timer(0)),
        };

        OSD.data.state = {
            haveMax7456Configured: true,
            haveMax7456Video: true,
            haveOsdFeature: true,
            haveMax7456FontDeviceConfigured: true,
            isMax7456FontDeviceDetected: true,
            requiresFbSmallFont: false,
            haveSomeOsd: true,
        };

        OSD.data.parameters = {
            overlayRadioMode: 0,
            cameraFrameWidth: 30,
            cameraFrameHeight: 30,
        };

        OSD.data.osd_profiles = {
            number: 3,
            selected: 0,
        };

        OSD.data.alarms = {
            rssi: { display_name: i18n.getMessage("osdTimerAlarmOptionRssi"), value: 0 },
            cap: { display_name: i18n.getMessage("osdTimerAlarmOptionCapacity"), value: 0 },
            alt: { display_name: i18n.getMessage("osdTimerAlarmOptionAltitude"), value: 0 },
            time: { display_name: "Minutes", value: 0 },
        };
    },
};

const sampleGpsData = {
    fix: 2,
    numSat: 10,
    latitude: 474919409,
    longitude: 190539766,
    alt: 0,
    speed: 0,
    ground_course: 1337,
    positionalDop: 0,
    distanceToHome: 0,
    directionToHome: 0,
    update: 0,
    chn: [
        0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 6, 6, 6, 6, 6, 6, 6, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255,
    ],
    svid: [1, 2, 10, 15, 18, 23, 26, 123, 136, 1, 15, 2, 3, 4, 9, 10, 16, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    quality: [
        3, 95, 95, 95, 95, 95, 95, 23, 23, 1, 31, 20, 31, 23, 20, 17, 31, 31, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
    cno: [
        27, 37, 43, 37, 34, 47, 44, 42, 39, 0, 40, 24, 40, 35, 26, 0, 35, 41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
};

export default VirtualFC;
