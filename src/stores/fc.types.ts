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

import type Beepers from "../js/Beepers";
import type Features from "../js/Features";
import type VtxDeviceStatus from "../js/utils/VtxDeviceStatus/VtxDeviceStatus";
import type { PortClaims } from "../composables/ports/usePortClaims";

export interface AdjustmentRange {
    slotIndex: number;
    auxChannelIndex: number;
    range: ChannelRange;
    adjustmentFunction: number;
    auxSwitchChannelIndex: number;
    // Decoded as 0 before API 1.48, which does not send them.
    adjustmentCenter: number;
    adjustmentScale: number;
}

export interface ChannelRange {
    start: number;
    end: number;
}

export interface AdvancedTuning {
    rollPitchItermIgnoreRate: number;
    yawItermIgnoreRate: number;
    yaw_p_limit: number;
    deltaMethod: number;
    vbatPidCompensation: number;
    dtermSetpointTransition: number;
    dtermSetpointWeight: number;
    toleranceBand: number;
    toleranceBandReduction: number;
    itermThrottleGain: number;
    pidMaxVelocity: number;
    pidMaxVelocityYaw: number;
    levelAngleLimit: number;
    levelSensitivity: number;
    itermThrottleThreshold: number;
    itermAcceleratorGain: number;
    antiGravityGain: number;
    itermRotation: number;
    smartFeedforward: number;
    itermRelax: number;
    itermRelaxType: number;
    itermRelaxCutoff: number;
    absoluteControlGain: number;
    throttleBoost: number;
    acroTrainerAngleLimit: number;
    feedforwardRoll: number;
    feedforwardPitch: number;
    feedforwardYaw: number;
    feedforwardTransition: number;
    antiGravityMode: number;
    dMaxRoll: number;
    dMaxPitch: number;
    dMaxYaw: number;
    dMaxGain: number;
    dMaxAdvance: number;
    useIntegratedYaw: number;
    integratedYawRelax: number;
    motorOutputLimit: number;
    autoProfileCellCount: number;
    idleMinRpm: number;
    feedforward_averaging: number;
    feedforward_smooth_factor: number;
    feedforward_boost: number;
    feedforward_max_rate_limit: number;
    feedforward_jitter_factor: number;
    vbat_sag_compensation: number;
    thrustLinearization: number;
    // Not in the reset state; set by MSP_PID_ADVANCED and the virtual FC.
    tpaMode?: number;
    tpaRate: number;
    tpaBreakpoint: number;
}

export interface AnalogData {
    voltage: number;
    mAhdrawn: number;
    rssi: number;
    amperage: number;
    last_received_timestamp: number;
}

export interface ArmingConfig {
    auto_disarm_delay: number;
    disarm_kill_switch: number;
    small_angle: number;
    gyro_cal_on_first_arm: number;
}

export type AuxConfigNames = string[];

export type AuxConfigIds = number[];

export interface BatteryConfig {
    vbatmincellvoltage: number;
    vbatmaxcellvoltage: number;
    vbatwarningcellvoltage: number;
    capacity: number;
    voltageMeterSource: number;
    currentMeterSource: number;
}

// Reset to {} and filled by MSP_BATTERY_STATE, so every field is absent until the first reply.
export interface BatteryState {
    cellCount?: number;
    capacity?: number;
    voltage?: number;
    mAhDrawn?: number;
    amperage?: number;
    batteryState?: number;
}

// The masks start as null and become Beepers instances when a connection is established.
export interface BeeperConfig {
    beepers: Beepers | null;
    dshotBeaconTone: number;
    dshotBeaconConditions: Beepers | null;
}

export interface BfConfig {
    currentscale: number;
    currentoffset: number;
    currentmetertype: number;
    batterycapacity: number;
}

export interface BlackboxConfig {
    supported: boolean;
    blackboxDevice: number;
    blackboxRateNum: number;
    blackboxRateDenom: number;
    blackboxPDenom: number;
    blackboxSampleRate: number;
    blackboxDisabledMask: number;
}

export interface BoardAlignmentConfig {
    roll: number;
    pitch: number;
    yaw: number;
}

export interface FcConfig {
    apiVersion: string;
    flightControllerIdentifier: string;
    flightControllerVersion: string;
    version: number;
    buildInfo: string;
    buildKey: string;
    // MSP_BUILD_INFO pushes numeric option ids, then processBuildOptions() maps them to names
    // within the same handler.
    buildOptions: string[];
    gitRevision: string;
    multiType: number;
    msp_version: number;
    mspProtocolVersion?: number;
    capability: number;
    cycleTime: number;
    i2cError: number;
    cpuload: number;
    cpuTemp: number;
    activeSensors: number;
    mode: number;
    profile: number;
    uid: number[];
    // Hex string from MSP_UID; the virtual FC sets it to 0.
    deviceIdentifier?: string | number;
    accelerometerTrims: number[];
    name: string;
    craftName: string;
    displayName: string;
    pilotName: string;
    pidProfileNames: string[];
    rateProfileNames: string[];
    numProfiles: number;
    rateProfile: number;
    numberOfRateProfiles: number;
    boardType: number;
    armingDisableCount: number;
    armingDisableFlags: number;
    armingDisabled: boolean;
    runawayTakeoffPreventionDisabled: boolean;
    boardIdentifier: string;
    boardVersion: number;
    targetCapabilities: number;
    targetName: string;
    boardName: string;
    manufacturerId: string;
    signature: number[];
    mcuTypeId: number;
    configurationState: number;
    configStateFlag: number;
    sampleRateHz: number;
    configurationProblems: number;
    hardwareName: string;
    batteryProfile: number;
    numberOfBatteryProfiles: number;
    batteryProfileNames: string[];
}

export interface CopyProfile {
    type: number;
    dstProfile: number;
    srcProfile: number;
}

export interface CurrentMeter {
    id: number;
    mAhDrawn: number;
    amperage: number;
}

export interface CurrentMeterConfig {
    id: number;
    sensorType: number;
    scale: number;
    offset: number;
}

export interface DataflashSummary {
    ready: boolean;
    supported: boolean;
    sectors: number;
    totalSize: number;
    usedSize: number;
}

export interface FilterDefaults {
    gyro_lowpass_hz: number;
    gyro_lowpass_dyn_min_hz: number;
    gyro_lowpass_dyn_max_hz: number;
    gyro_lowpass_type: number;
    gyro_lowpass2_hz: number;
    gyro_lowpass2_type: number;
    gyro_notch_cutoff: number;
    gyro_notch_hz: number;
    gyro_notch2_cutoff: number;
    gyro_notch2_hz: number;
    gyro_rpm_notch_harmonics: number;
    gyro_rpm_notch_min_hz: number;
    dterm_lowpass_hz: number;
    dterm_lowpass_dyn_min_hz: number;
    dterm_lowpass_dyn_max_hz: number;
    dyn_lpf_curve_expo: number;
    dterm_lowpass_type: number;
    dterm_lowpass2_hz: number;
    dterm_lowpass2_type: number;
    dterm_notch_cutoff: number;
    dterm_notch_hz: number;
    yaw_lowpass_hz: number;
    dyn_notch_q: number;
    dyn_notch_width_percent: number;
    dyn_notch_count: number;
    dyn_notch_q_rpm: number;
    dyn_notch_count_rpm: number;
    dyn_notch_min_hz: number;
    dyn_notch_max_hz: number;
}

export type DefaultPids = number[];

export interface FailsafeConfig {
    failsafe_delay: number;
    failsafe_off_delay: number;
    failsafe_throttle: number;
    failsafe_switch_mode: number;
    failsafe_throttle_low_delay: number;
    failsafe_procedure: number;
}

export interface FcLoopConfig {
    loopTime: number;
}

// The mask starts as null and becomes a Features instance when a connection is established.
export interface FeatureConfig {
    features: Features | null;
}

export interface FilterConfig {
    gyro_hardware_lpf: number;
    gyro_32khz_hardware_lpf: number;
    gyro_lowpass_hz: number;
    gyro_lowpass_dyn_min_hz: number;
    gyro_lowpass_dyn_max_hz: number;
    gyro_lowpass_type: number;
    gyro_lowpass2_hz: number;
    gyro_lowpass2_type: number;
    gyro_notch_hz: number;
    gyro_notch_cutoff: number;
    gyro_notch2_hz: number;
    gyro_notch2_cutoff: number;
    dterm_lowpass_hz: number;
    dterm_lowpass_dyn_min_hz: number;
    dterm_lowpass_dyn_max_hz: number;
    dterm_lowpass_type: number;
    dterm_lowpass2_hz: number;
    dterm_lowpass2_type: number;
    dyn_lpf_curve_expo: number;
    dterm_notch_hz: number;
    dterm_notch_cutoff: number;
    yaw_lowpass_hz: number;
    dyn_notch_range: number;
    dyn_notch_width_percent: number;
    dyn_notch_q: number;
    dyn_notch_min_hz: number;
    dyn_notch_max_hz: number;
    dyn_notch_count: number;
    gyro_rpm_notch_harmonics: number;
    gyro_rpm_notch_min_hz: number;
    gyro_rpm_notch_fade_range_hz: number;
    gyro_rpm_notch_q: number;
    gyro_rpm_notch_weights: number[];
}

export interface GyroSensor {
    gyro_count: number;
    gyro_hardware: number[];
}

export interface SensorNames {
    acc: string[];
    gyro: string[];
    baro: string[];
    mag: string[];
    sonar: string[];
    opticalflow: string[];
    pitot: string[];
}

export interface GpsConfig {
    provider: number;
    ublox_sbas: number;
    auto_config: number;
    auto_baud: number;
    home_point_once: number;
    ublox_use_galileo: number;
}

export interface CompassConfig {
    mag_declination: number;
}

export interface GpsData {
    fix: number;
    numSat: number;
    latitude: number;
    longitude: number;
    alt: number;
    speed: number;
    ground_course: number;
    positionalDop: number;
    distanceToHome: number;
    directionToHome: number;
    update: number;
    chn: number[];
    svid: number[];
    quality: number[];
    cno: number[];
}

export interface GpsRescueConfig {
    angle: number;
    returnAltitudeM: number;
    descentDistanceM: number;
    groundSpeed: number;
    throttleMin: number;
    throttleMax: number;
    throttleHover: number;
    sanityChecks: number;
    minSats: number;
    ascendRate: number;
    descendRate: number;
    allowArmingWithoutFix: number;
    altitudeMode: number;
    minStartDistM: number;
    initialClimbM: number;
}

export interface LedColor {
    h: number;
    s: number;
    v: number;
}

export interface LedModeColor {
    mode: number;
    direction: number;
    color: number;
}

export interface LedStripEntry {
    x: number;
    y: number;
    // MSP decode yields letter arrays; the LED strip tab writes entries back as joined strings.
    functions: string[] | string;
    directions: string[] | string;
    color: number;
    // Only decoded before API 1.46.
    parameters?: number;
}

// Filled by MSP2_GET_LED_STRIP_CONFIG_VALUES (API >= 1.46), empty before.
export interface LedConfigValues {
    brightness?: number;
    rainbow_delta?: number;
    rainbow_freq?: number;
}

export interface McuInfo {
    id: number;
    // Reset to 0; MSP2_MCU_INFO sets the MCU name string.
    name: string | number;
}

export interface MiscConfig {
    failsafe_throttle: number;
    gps_baudrate: number;
    multiwiicurrentoutput: number;
    placeholder2: number;
    vbatscale: number;
    vbatmincellvoltage: number;
    vbatmaxcellvoltage: number;
    vbatwarningcellvoltage: number;
    batterymetertype: number;
}

export interface MixerConfig {
    mixer: number;
    reverseMotorDir: number;
}

export interface ModeRange {
    id: number;
    auxChannelIndex: number;
    range: ChannelRange;
}

export interface ModeRangeExtra {
    id: number;
    modeLogic: number;
    linkedTo: number;
}

export interface Motor3dConfig {
    deadband3d_low: number;
    deadband3d_high: number;
    neutral: number;
}

export interface MotorConfig {
    minthrottle: number;
    maxthrottle: number;
    mincommand: number;
    motor_count: number;
    motor_poles: number;
    use_dshot_telemetry: boolean;
    use_esc_sensor: boolean;
    motor_kv: number;
}

// Reset as 8 undefined slots; MSP_MOTOR / MSP_SERVO fill as many as the FC reports.
export type MotorData = number[];

export type ServoData = number[];

export type MotorOutputOrder = number[];

export interface MotorTelemetryData {
    rpm: number[];
    invalidPercent: number[];
    temperature: number[];
    voltage: number[];
    current: number[];
    consumption: number[];
}

export interface MultipleMsp {
    msp_commands: number[];
}

export interface PidController {
    controller: number;
}

// Rows of [P, I, D]; reset as 10 rows of undefined until MSP_PID arrives.
export type PidGains = number[][];

export interface PidAdvancedConfig {
    gyro_sync_denom: number;
    pid_process_denom: number;
    use_unsyncedPwm: number;
    fast_pwm_protocol: number;
    motor_pwm_rate: number;
    motorIdle: number;
    gyroUse32kHz: number;
    motorPwmInversion: number;
    gyroHighFsr: number;
    gyroMovementCalibThreshold: number;
    gyroCalibDuration: number;
    gyroOffsetYaw: number;
    gyroCheckOverflow: number;
    debugMode: number;
    debugModeCount: number;
}

export type PidNames = string[];

export interface RcData {
    active_channels: number;
    channels: number[];
}

export interface RcDeadbandConfig {
    deadband: number;
    yaw_deadband: number;
    alt_hold_deadband: number;
    deadband3d_throttle: number;
}

export type RcMap = number[];

export interface RcTuning {
    RC_RATE: number;
    RC_EXPO: number;
    roll_pitch_rate: number;
    roll_rate: number;
    pitch_rate: number;
    yaw_rate: number;
    dynamic_THR_PID: number;
    throttle_MID: number;
    throttle_EXPO: number;
    dynamic_THR_breakpoint: number;
    RC_YAW_EXPO: number;
    rcYawRate: number;
    rcPitchRate: number;
    RC_PITCH_EXPO: number;
    throttleLimitType: number;
    throttleLimitPercent: number;
    roll_rate_limit: number;
    pitch_rate_limit: number;
    yaw_rate_limit: number;
    rates_type: number;
    throttle_HOVER: number;
}

export interface RssiConfig {
    channel: number;
}

export interface RxFailChannel {
    mode: number;
    value: number;
}

export interface RxConfig {
    serialrx_provider: number;
    stick_max: number;
    stick_center: number;
    stick_min: number;
    spektrum_sat_bind: number;
    rx_min_usec: number;
    rx_max_usec: number;
    rcInterpolation: number;
    rcInterpolationInterval: number;
    rcInterpolationChannels: number;
    airModeActivateThreshold: number;
    rxSpiProtocol: number;
    rxSpiId: number;
    rxSpiRfChannelCount: number;
    fpvCamAngleDegrees: number;
    rcSmoothingType: number;
    rcSmoothingSetpointCutoff: number;
    rcSmoothingThrottleCutoff: number;
    rcSmoothingFeedforwardCutoff: number;
    rcSmoothingInputType: number;
    rcSmoothingDerivativeType: number;
    rcSmoothingAutoFactor: number;
    rcSmoothingAutoFactorThrottle: number;
    usbCdcHidType: number;
    rcSmoothing: number;
    elrsUid: number[];
    // Only sent for API >= 1.47.
    elrsModelId?: number;
    // Set by MSP_MISC only.
    midrc?: number;
}

export interface SdcardSummary {
    supported: boolean;
    state: number;
    filesystemLastError: number;
    freeSizeKB: number;
    totalSizeKB: number;
}

export interface SensorAlignment {
    align_gyro: number;
    align_acc: number;
    align_mag: number;
    gyro_detection_flags: number;
    gyro_to_use: number;
    gyro_1_align: number;
    gyro_2_align: number;
    mag_align_roll: number;
    mag_align_pitch: number;
    mag_align_yaw: number;
    // Replaces gyro_to_use from API 1.47.
    gyro_enable_mask?: number;
    // Written by the sensors tab only; not part of any MSP payload.
    gyro_align?: number[];
    gyro_align_roll?: number[];
    gyro_align_pitch?: number[];
    gyro_align_yaw?: number[];
    gyro_1_align_roll?: number;
    gyro_1_align_pitch?: number;
    gyro_1_align_yaw?: number;
    gyro_2_align_roll?: number;
    gyro_2_align_pitch?: number;
    gyro_2_align_yaw?: number;
}

export interface SensorConfig {
    acc_hardware: number;
    baro_hardware: number;
    mag_hardware: number;
    sonar_hardware: number;
    opticalflow_hardware: number;
    pitot_hardware: number;
}

export interface SensorConfigActive extends SensorConfig {
    gyro_hardware: number;
}

export interface Quaternion {
    w: number;
    x: number;
    y: number;
    z: number;
}

export interface PitotData {
    airspeed: number;
    diffPressure: number;
}

export interface SensorData {
    gyroscope: number[];
    accelerometer: number[];
    magnetometer: number[];
    altitude: number;
    sonar: number;
    pitot: PitotData | null;
    kinematics: number[];
    quaternion: Quaternion | null;
    debug: number[];
    // Set by the virtual FC only.
    sonars?: number;
}

export interface SerialPort {
    identifier: number;
    functions: string[];
    msp_baudrate: string;
    gps_baudrate: string;
    telemetry_baudrate: string;
    blackbox_baudrate: string;
}

export interface SerialConfig {
    ports: SerialPort[];
    mspBaudRate: number;
    gpsBaudRate: number;
    gpsPassthroughBaudRate: number;
    cliBaudRate: number;
    // Cached by loadPortClaims(): absent until read, null when the build lacks the command.
    claims?: PortClaims | null;
}

export interface ServoConfig {
    min: number;
    max: number;
    middle: number;
    rate: number;
    indexOfChannelToForward: number;
    reversedInputSources: number;
}

// Never populated: MSP_SERVO_MIX_RULES is not decoded.
export type ServoRules = unknown[];

export interface TuningSliders {
    slider_pd_ratio: number;
    slider_pd_gain: number;
    slider_feedforward_gain: number;
    slider_master_multiplier: number;
    slider_dterm_filter: number;
    slider_dterm_filter_multiplier: number;
    slider_gyro_filter: number;
    slider_gyro_filter_multiplier: number;
    slider_pids_mode: number;
    slider_d_gain: number;
    slider_pi_gain: number;
    slider_dmax_gain: number;
    slider_i_gain: number;
    slider_roll_pitch_ratio: number;
    slider_pitch_pi_gain: number;
    slider_pids_valid: number;
    slider_gyro_valid: number;
    slider_dterm_valid: number;
}

export type DefaultTuningSliders = Omit<TuningSliders, "slider_pd_ratio" | "slider_pd_gain">;

export interface VoltageMeter {
    id: number;
    voltage: number;
}

export interface VoltageMeterConfig {
    id: number;
    sensorType: number;
    vbatscale: number;
    vbatresdivval: number;
    vbatresdivmultiplier: number;
}

export interface VtxTableBand {
    vtxtable_band_number: number;
    vtxtable_band_name: string;
    vtxtable_band_letter: string;
    vtxtable_band_is_factory_band: boolean;
    vtxtable_band_frequencies: number[];
}

export interface VtxTablePowerLevel {
    vtxtable_powerlevel_number: number;
    vtxtable_powerlevel_value: number;
    vtxtable_powerlevel_label: string;
}

export interface VtxConfig {
    vtx_type: number;
    vtx_band: number;
    vtx_channel: number;
    vtx_power: number;
    vtx_pit_mode: boolean;
    vtx_frequency: number;
    vtx_device_ready: boolean;
    vtx_low_power_disarm: number;
    vtx_pit_mode_frequency: number;
    vtx_table_available: boolean;
    vtx_table_bands: number;
    vtx_table_channels: number;
    vtx_table_powerlevels: number;
    vtx_table_clear: boolean;
}

export interface WingConfig {
    s_term: number[];
    spa_center: number[];
    spa_width: number[];
    spa_mode: number[];
    tpa_curve_type: number;
    tpa_curve_stall_throttle: number;
    tpa_curve_pid_thr0: number;
    tpa_curve_pid_thr100: number;
    tpa_curve_expo: number;
    tpa_speed_type: number;
    tpa_speed_basic_delay: number;
    tpa_speed_basic_gravity: number;
    tpa_speed_adv_prop_pitch: number;
    tpa_speed_adv_mass: number;
    tpa_speed_adv_drag_k: number;
    tpa_speed_adv_thrust: number;
    tpa_speed_max_voltage: number;
    tpa_speed_pitch_offset: number;
    yaw_type: number;
    angle_pitch_offset: number;
}

export interface FcState {
    ADJUSTMENT_RANGES: AdjustmentRange[];
    ADVANCED_TUNING: AdvancedTuning;
    ADVANCED_TUNING_ACTIVE: AdvancedTuning;
    ANALOG: AnalogData;
    ARMING_CONFIG: ArmingConfig;
    AUX_CONFIG: AuxConfigNames;
    AUX_CONFIG_IDS: AuxConfigIds;
    BATTERY_CONFIG: BatteryConfig;
    BATTERY_STATE: BatteryState;
    BEEPER_CONFIG: BeeperConfig;
    BF_CONFIG: BfConfig;
    BLACKBOX: BlackboxConfig;
    BOARD_ALIGNMENT_CONFIG: BoardAlignmentConfig;
    CONFIG: FcConfig;
    COPY_PROFILE: CopyProfile;
    CURRENT_METERS: CurrentMeter[];
    CURRENT_METER_CONFIGS: CurrentMeterConfig[];
    DATAFLASH: DataflashSummary;
    DEFAULT: FilterDefaults;
    DEFAULT_PIDS: DefaultPids;
    DEFAULT_TUNING_SLIDERS: DefaultTuningSliders;
    FAILSAFE_CONFIG: FailsafeConfig;
    FC_CONFIG: FcLoopConfig;
    FEATURE_CONFIG: FeatureConfig;
    FILTER_CONFIG: FilterConfig;
    GYRO_SENSOR: GyroSensor;
    SENSOR_NAMES: SensorNames;
    GPS_CONFIG: GpsConfig;
    COMPASS_CONFIG: CompassConfig;
    GPS_DATA: GpsData;
    GPS_RESCUE: GpsRescueConfig;
    LED_COLORS: LedColor[];
    LED_MODE_COLORS: LedModeColor[];
    LED_STRIP: LedStripEntry[];
    LED_CONFIG_VALUES: LedConfigValues;
    MCU_INFO: McuInfo;
    MISC: MiscConfig;
    MIXER_CONFIG: MixerConfig;
    MODE_RANGES: ModeRange[];
    MODE_RANGES_EXTRA: ModeRangeExtra[];
    MOTOR_3D_CONFIG: Motor3dConfig;
    MOTOR_CONFIG: MotorConfig;
    MOTOR_DATA: MotorData;
    MOTOR_OUTPUT_ORDER: MotorOutputOrder;
    MOTOR_TELEMETRY_DATA: MotorTelemetryData;
    MULTIPLE_MSP: MultipleMsp;
    PID: PidController;
    PIDS_ACTIVE: PidGains;
    PID_ADVANCED_CONFIG: PidAdvancedConfig;
    PID_NAMES: PidNames;
    PIDS: PidGains;
    RC: RcData;
    RC_DEADBAND_CONFIG: RcDeadbandConfig;
    RC_MAP: RcMap;
    RC_TUNING: RcTuning;
    RSSI_CONFIG: RssiConfig;
    RXFAIL_CONFIG: RxFailChannel[];
    RX_CONFIG: RxConfig;
    SDCARD: SdcardSummary;
    SENSOR_ALIGNMENT: SensorAlignment;
    SENSOR_CONFIG: SensorConfig;
    SENSOR_CONFIG_ACTIVE: SensorConfigActive;
    SENSOR_DATA: SensorData;
    SERIAL_CONFIG: SerialConfig;
    SERVO_CONFIG: ServoConfig[];
    SERVO_DATA: ServoData;
    SERVO_RULES: ServoRules;
    TUNING_SLIDERS: TuningSliders;
    VOLTAGE_METERS: VoltageMeter[];
    VOLTAGE_METER_CONFIGS: VoltageMeterConfig[];
    VTXTABLE_BAND: VtxTableBand;
    VTXTABLE_POWERLEVEL: VtxTablePowerLevel;
    VTX_CONFIG: VtxConfig;
    VTX_DEVICE_STATUS: VtxDeviceStatus | null;
    WING_CONFIG: WingConfig;
}
