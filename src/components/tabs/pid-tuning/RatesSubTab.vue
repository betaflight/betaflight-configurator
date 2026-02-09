<template>
    <div class="tab-pid-tuning rates-subtab">
        <!-- LEFT COLUMN -->
        <div class="cf_column">
            <!-- Rate Profile Name -->
            <div class="gui_box grey">
                <table class="cf">
                    <thead>
                        <tr>
                            <th>
                                <div>
                                    <div class="float-left" v-text="$t('rateProfileName')"></div>
                                    <div class="helpicon cf_tip" :title="$t('rateProfileNameHelp')"></div>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <input type="text" v-model="rateProfileName" maxlength="8" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Rates Type Selector -->
            <div class="gui_box grey">
                <table class="cf">
                    <thead>
                        <tr>
                            <th>
                                <div>
                                    <div class="float-left" v-text="$t('pidTuningRatesType')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningRatesTypeTip')"></div>
                                </div>
                            </th>
                            <th class="rates_logo_bg"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <select v-model.number="ratesType">
                                    <option :value="0">Betaflight</option>
                                    <option :value="1">Raceflight</option>
                                    <option :value="2">KISS</option>
                                    <option :value="3">Actual</option>
                                    <option :value="4">Quick</option>
                                </select>
                            </td>
                            <td class="rates_logo_bg">
                                <div class="rates_logo_div">
                                    <img :src="ratesLogoSrc" class="rates_logo" alt="Rates logo" />
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Max Rate Warning -->
            <div v-if="showMaxRateWarning" class="danger rates-tab-warning maxRateWarning">
                <p v-text="$t('pidTuningMaxRateWarning')"></p>
            </div>

            <!-- Rate Setup Table -->
            <div class="gui_box grey rateSetup">
                <table id="rateSetup" class="pid_tuning">
                    <tbody>
                        <tr class="pid_titlebar">
                            <th class="name"></th>
                            <th class="rc_rate" v-text="$t('pidTuningRcRate')"></th>
                            <th class="rate" v-text="$t('pidTuningRate')"></th>
                            <th class="rc_expo" v-text="$t('pidTuningRcExpo')"></th>
                            <th
                                v-if="isBetaflightRates"
                                class="new_rates centerSensitivity"
                                v-text="$t('pidTuningRcRateActual')"
                            ></th>
                            <th v-else class="new_rates maxVel" v-text="$t('pidTuningMaxVel')"></th>
                        </tr>
                        <tr class="pid_titlebar2">
                            <th colspan="5">
                                <div class="pid_mode">
                                    <div class="float-left" v-text="$t('pidTuningRateSetup')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningRatesTuningHelp')"></div>
                                </div>
                            </th>
                        </tr>

                        <!-- Roll -->
                        <tr class="ROLL">
                            <td class="pid_roll" v-text="$t('controlAxisRoll')"></td>
                            <td class="rc_rate">
                                <input
                                    type="number"
                                    v-model.number="rcRate"
                                    :step="rcRateLimits.step"
                                    :min="rcRateLimits.min"
                                    :max="rcRateLimits.max"
                                />
                            </td>
                            <td class="roll_rate">
                                <input
                                    type="number"
                                    v-model.number="rollRate"
                                    :step="rateLimits.step"
                                    :min="rateLimits.min"
                                    :max="rateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="rcExpo"
                                    :step="expoLimits.step"
                                    :min="expoLimits.min"
                                    :max="expoLimits.max"
                                />
                            </td>
                            <td v-if="isBetaflightRates" class="new_rates acroCenterSensitivityRoll">
                                {{ centerSensitivityRoll }}
                            </td>
                            <td v-else class="new_rates maxAngularVelRoll">
                                {{ maxAngularVelRoll }}
                            </td>
                        </tr>

                        <!-- Pitch -->
                        <tr class="PITCH">
                            <td class="pid_pitch" v-text="$t('controlAxisPitch')"></td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="rcRatePitch"
                                    :step="rcRateLimits.step"
                                    :min="rcRateLimits.min"
                                    :max="rcRateLimits.max"
                                />
                            </td>
                            <td class="pitch_rate">
                                <input
                                    type="number"
                                    v-model.number="pitchRate"
                                    :step="rateLimits.step"
                                    :min="rateLimits.min"
                                    :max="rateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="rcPitchExpo"
                                    :step="expoLimits.step"
                                    :min="expoLimits.min"
                                    :max="expoLimits.max"
                                />
                            </td>
                            <td v-if="isBetaflightRates" class="new_rates acroCenterSensitivityPitch">
                                {{ centerSensitivityPitch }}
                            </td>
                            <td v-else class="new_rates maxAngularVelPitch">
                                {{ maxAngularVelPitch }}
                            </td>
                        </tr>

                        <!-- Yaw -->
                        <tr class="YAW">
                            <td class="pid_yaw" v-text="$t('controlAxisYaw')"></td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="rcRateYaw"
                                    :step="rcRateLimits.step"
                                    :min="rcRateLimits.min"
                                    :max="rcRateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="yawRate"
                                    :step="rateLimits.step"
                                    :min="rateLimits.min"
                                    :max="rateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="rcYawExpo"
                                    :step="expoLimits.step"
                                    :min="expoLimits.min"
                                    :max="expoLimits.max"
                                />
                            </td>
                            <td v-if="isBetaflightRates" class="new_rates acroCenterSensitivityYaw">
                                {{ centerSensitivityYaw }}
                            </td>
                            <td v-else class="new_rates maxAngularVelYaw">
                                {{ maxAngularVelYaw }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Rate Curve -->
            <div class="gui_box rc_curve">
                <div class="rc_curve_bg">
                    <table class="cf rc_curve">
                        <thead>
                            <tr>
                                <th colspan="2">
                                    <div>
                                        <div class="float-left" v-text="$t('pidTuningRatesCurve')"></div>
                                        <div class="helpicon cf_tip" :title="$t('pidTuningRatesTip')"></div>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="2">
                                    <div class="rate_curve background_paper" style="position: relative; height: 200px">
                                        <canvas
                                            ref="rateCurveLayer0"
                                            style="
                                                position: absolute;
                                                top: 0;
                                                left: 0;
                                                z-index: 0;
                                                height: 100%;
                                                width: 100%;
                                            "
                                        ></canvas>
                                        <canvas
                                            ref="rateCurveLayer1"
                                            style="
                                                position: absolute;
                                                top: 0;
                                                left: 0;
                                                z-index: 1;
                                                height: 100%;
                                                width: 100%;
                                            "
                                        ></canvas>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- MIDDLE COLUMN -->
        <div class="cf_column">
            <!-- Throttle Limit -->
            <div class="gui_box throttle_limit spacer_left">
                <table class="cf">
                    <thead>
                        <tr>
                            <th>
                                <div>
                                    <div class="float-left" v-text="$t('pidTuningThrottleLimitType')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningThrottleLimitTypeTip')"></div>
                                </div>
                            </th>
                            <th>
                                <div>
                                    <div class="float-left" v-text="$t('pidTuningThrottleLimitPercent')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningThrottleLimitPercentTip')"></div>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <select v-model.number="throttleLimitType">
                                    <option :value="0" v-text="$t('pidTuningThrottleLimitTypeOff')"></option>
                                    <option :value="1" v-text="$t('pidTuningThrottleLimitTypeScale')"></option>
                                    <option :value="2" v-text="$t('pidTuningThrottleLimitTypeClip')"></option>
                                </select>
                            </td>
                            <td>
                                <input
                                    type="number"
                                    v-model.number="throttleLimitPercent"
                                    step="1"
                                    min="25"
                                    max="100"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Throttle Settings -->
            <div class="gui_box throttle spacer_left">
                <table class="cf">
                    <thead>
                        <tr>
                            <th v-text="$t('receiverThrottleMid')"></th>
                            <th v-text="$t('receiverThrottleHover')"></th>
                            <th v-text="$t('receiverThrottleExpo')"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <input
                                    type="number"
                                    :value="(throttleMid ?? 0).toFixed(2)"
                                    @input="throttleMid = $event.target.value"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :value="(throttleHover ?? 0.5).toFixed(2)"
                                    @input="throttleHover = $event.target.value"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :value="(throttleExpo ?? 0).toFixed(2)"
                                    @input="throttleExpo = $event.target.value"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Throttle Curve Preview -->
            <div class="gui_box throttle spacer_left">
                <table class="cf">
                    <thead>
                        <tr>
                            <th v-text="$t('pidTuningThrottleCurvePreview')" colspan="2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="2" class="throttleCurvePreview">
                                <div class="throttle_curve background_paper" style="height: 164px">
                                    <canvas ref="throttleCurveCanvas" style="width: 100%; height: 100%"></canvas>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="cf_column">
            <div class="gui_box ratePreview grey spacer_left">
                <table class="pid_titlebar">
                    <thead>
                        <tr>
                            <th v-text="$t('pidTuningRatesPreview')"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="rates_preview_cell">
                                <div class="rates_preview background_paper" ref="ratesPreviewContainer">
                                    <canvas ref="ratesPreviewCanvas"></canvas>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import $ from "jquery";
import FC from "@/js/fc";
import RateCurve from "@/js/RateCurve";
import Model from "@/js/model";
import betaflightLogo from "@/images/rate_logos/betaflight.svg";
import raceflightLogo from "@/images/rate_logos/raceflight.svg";
import kissLogo from "@/images/rate_logos/kiss.svg";
import actualLogo from "@/images/rate_logos/actual.svg";
import quickratesLogo from "@/images/rate_logos/quickrates.svg";

// Canvas refs
const rateCurveLayer0 = ref(null);
const rateCurveLayer1 = ref(null);
const throttleCurveCanvas = ref(null);
const ratesPreviewCanvas = ref(null);
const ratesPreviewContainer = ref(null);

// 3D Model
let model = null;
let rcUpdateInterval = null; // For setInterval RC updates
let initModelTimeoutId = null; // For setTimeout initModel retries
let modelInitTimeout = null; // For setTimeout after model creation
let initTimeout = null; // For setTimeout initial draw delay
let animationFrameId = null;
let lastTimestamp = 0;
let keepRendering = true;

// Rate Profile Name
const rateProfileName = computed({
    get: () => {
        if (FC.CONFIG.rateProfileNames && FC.CONFIG.rateProfile !== undefined) {
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] || "";
        }
    },
    set: (value) => {
        if (FC.CONFIG.rateProfileNames && FC.CONFIG.rateProfile !== undefined) {
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = value;
        }
    },
});

// Rates Type
const ratesType = computed({
    get: () => FC.RC_TUNING.rates_type,
    set: (value) => {
        FC.RC_TUNING.rates_type = value;
    },
});

// Rates Logo Source
const ratesLogoSrc = computed(() => {
    const logos = [betaflightLogo, raceflightLogo, kissLogo, actualLogo, quickratesLogo];
    return logos[ratesType.value] || logos[0];
});

// Is Betaflight Rates
const isBetaflightRates = computed(() => ratesType.value === RatesType.BETAFLIGHT);

// Show Max Rate Warning - show if any axis exceeds 1800°/s
const showMaxRateWarning = computed(() => {
    const MAX_RATE_WARNING = 1800;
    return (
        numericMaxAngularVelRoll.value > MAX_RATE_WARNING ||
        numericMaxAngularVelPitch.value > MAX_RATE_WARNING ||
        numericMaxAngularVelYaw.value > MAX_RATE_WARNING
    );
});

// Add a type for rates for better readability
const RatesType = {
    BETAFLIGHT: 0,
    RACEFLIGHT: 1,
    KISS: 2,
    ACTUAL: 3,
    QUICKRATES: 4,
};

// Helper to get scale factor based on rates type
const getScaleFactor = () => {
    const type = FC.RC_TUNING.rates_type;
    if (type === RatesType.RACEFLIGHT) {
        return 1000;
    }
    if (type === RatesType.ACTUAL) {
        return 1000;
    }
    // QUICKRATES, BETAFLIGHT, KISS
    return 1;
};

const getRateScaleFactor = () => {
    const type = FC.RC_TUNING.rates_type;
    if (type === RatesType.RACEFLIGHT) {
        return 100;
    }
    if (type === RatesType.ACTUAL) {
        return 1000;
    }
    if (type === RatesType.QUICKRATES) {
        return 1000;
    }
    // BETAFLIGHT, KISS
    return 1;
};

// RC Rate (Roll) - scaled for display
const rcRate = computed({
    get: () => FC.RC_TUNING.RC_RATE * getScaleFactor(),
    set: (value) => {
        FC.RC_TUNING.RC_RATE = value / getScaleFactor();
    },
});

// RC Rate Pitch - scaled for display
const rcRatePitch = computed({
    get: () => FC.RC_TUNING.rcPitchRate * getScaleFactor(),
    set: (value) => {
        FC.RC_TUNING.rcPitchRate = value / getScaleFactor();
    },
});

// RC Rate Yaw - scaled for display
const rcRateYaw = computed({
    get: () => FC.RC_TUNING.rcYawRate * getScaleFactor(),
    set: (value) => {
        FC.RC_TUNING.rcYawRate = value / getScaleFactor();
    },
});

// Roll Rate - scaled for display
const rollRate = computed({
    get: () => FC.RC_TUNING.roll_rate * getRateScaleFactor(),
    set: (value) => {
        FC.RC_TUNING.roll_rate = value / getRateScaleFactor();
    },
});

// Pitch Rate - scaled for display
const pitchRate = computed({
    get: () => FC.RC_TUNING.pitch_rate * getRateScaleFactor(),
    set: (value) => {
        FC.RC_TUNING.pitch_rate = value / getRateScaleFactor();
    },
});

// Yaw Rate - scaled for display
const yawRate = computed({
    get: () => FC.RC_TUNING.yaw_rate * getRateScaleFactor(),
    set: (value) => {
        FC.RC_TUNING.yaw_rate = value / getRateScaleFactor();
    },
});

// RC Expo
const rcExpo = computed({
    get: () => FC.RC_TUNING.RC_EXPO,
    set: (value) => {
        FC.RC_TUNING.RC_EXPO = value;
    },
});

// RC Pitch Expo
const rcPitchExpo = computed({
    get: () => FC.RC_TUNING.RC_PITCH_EXPO,
    set: (value) => {
        FC.RC_TUNING.RC_PITCH_EXPO = value;
    },
});

// RC Yaw Expo
const rcYawExpo = computed({
    get: () => FC.RC_TUNING.RC_YAW_EXPO,
    set: (value) => {
        FC.RC_TUNING.RC_YAW_EXPO = value;
    },
});

// Throttle Settings
const throttleLimitType = computed({
    get: () => FC.RC_TUNING.throttleLimitType,
    set: (value) => {
        FC.RC_TUNING.throttleLimitType = value;
    },
});

const throttleLimitPercent = computed({
    get: () => FC.RC_TUNING.throttleLimitPercent,
    set: (value) => {
        FC.RC_TUNING.throttleLimitPercent = value;
    },
});

const throttleMid = computed({
    get: () => FC.RC_TUNING.throttle_MID ?? 0,
    set: (value) => {
        FC.RC_TUNING.throttle_MID = parseFloat(value);
    },
});

const throttleHover = computed({
    get: () => FC.RC_TUNING.throttle_HOVER ?? 0.5,
    set: (value) => {
        FC.RC_TUNING.throttle_HOVER = parseFloat(value);
    },
});

const throttleExpo = computed({
    get: () => FC.RC_TUNING.throttle_EXPO ?? 0,
    set: (value) => {
        FC.RC_TUNING.throttle_EXPO = parseFloat(value);
    },
});

// Rate Curve Helper
const rateCurve = new RateCurve(false);

// Get current rates with proper scaling based on rates type
const currentRates = computed(() => rateCurve.getCurrentRates());

// Helper functions for rate calculations
const RC_RATE_INCREMENTAL = 14.54;

function getRcRateModified(rate) {
    return rate > 2.0 ? (rate - 2.0) * RC_RATE_INCREMENTAL + 2.0 : rate;
}

function getAcroSensitivityFraction(exponent, rate) {
    return ((1 - exponent) * getRcRateModified(rate) * 200).toFixed(0);
}

// Center Sensitivity (Betaflight Rates)
const centerSensitivityRoll = computed(() => {
    if (!isBetaflightRates.value) return "";
    const maxAngularVel = calculateMaxAngularVel(
        rollRate.value,
        rcRate.value,
        rcExpo.value,
        FC.RC_TUNING.roll_rate_limit,
    );
    const centerSensitivity = getAcroSensitivityFraction(rcExpo.value, rcRate.value);
    return `${centerSensitivity} - ${maxAngularVel}`;
});

const centerSensitivityPitch = computed(() => {
    if (!isBetaflightRates.value) return "";
    const maxAngularVel = calculateMaxAngularVel(
        pitchRate.value,
        rcRatePitch.value,
        rcPitchExpo.value,
        FC.RC_TUNING.pitch_rate_limit,
    );
    const centerSensitivity = getAcroSensitivityFraction(rcPitchExpo.value, rcRatePitch.value);
    return `${centerSensitivity} - ${maxAngularVel}`;
});

const centerSensitivityYaw = computed(() => {
    if (!isBetaflightRates.value) return "";
    const rates = currentRates.value;
    const maxAngularVel = calculateMaxAngularVel(
        yawRate.value,
        rcRateYaw.value,
        rcYawExpo.value,
        FC.RC_TUNING.yaw_rate_limit,
        rates.yawDeadband,
    );
    const centerSensitivity = getAcroSensitivityFraction(rcYawExpo.value, rcRateYaw.value);
    return `${centerSensitivity} - ${maxAngularVel}`;
});

// Max Angular Velocity (Non-Betaflight Rates) - String versions for display
const maxAngularVelRoll = computed(() => {
    if (isBetaflightRates.value) return "";
    return calculateMaxAngularVel(rollRate.value, rcRate.value, rcExpo.value, FC.RC_TUNING.roll_rate_limit).toString();
});

const maxAngularVelPitch = computed(() => {
    if (isBetaflightRates.value) return "";
    return calculateMaxAngularVel(
        pitchRate.value,
        rcRatePitch.value,
        rcPitchExpo.value,
        FC.RC_TUNING.pitch_rate_limit,
    ).toString();
});

const maxAngularVelYaw = computed(() => {
    if (isBetaflightRates.value) return "";
    const rates = currentRates.value;
    return calculateMaxAngularVel(
        yawRate.value,
        rcRateYaw.value,
        rcYawExpo.value,
        FC.RC_TUNING.yaw_rate_limit,
        rates.yawDeadband,
    ).toString();
});

// Numeric Max Angular Velocity (All rate types) - Used for warning checks
const numericMaxAngularVelRoll = computed(() => {
    return calculateMaxAngularVel(rollRate.value, rcRate.value, rcExpo.value, FC.RC_TUNING.roll_rate_limit);
});

const numericMaxAngularVelPitch = computed(() => {
    return calculateMaxAngularVel(pitchRate.value, rcRatePitch.value, rcPitchExpo.value, FC.RC_TUNING.pitch_rate_limit);
});

const numericMaxAngularVelYaw = computed(() => {
    const rates = currentRates.value;
    return calculateMaxAngularVel(
        yawRate.value,
        rcRateYaw.value,
        rcYawExpo.value,
        FC.RC_TUNING.yaw_rate_limit,
        rates.yawDeadband,
    );
});

// Input limits based on rates type
const rcRateLimits = computed(() => {
    const type = ratesType.value;
    if (type === RatesType.RACEFLIGHT) {
        return { max: 2000, min: 10, step: 10 };
    }
    if (type === RatesType.ACTUAL) {
        return { max: 2000, min: 10, step: 10 };
    }
    // BETAFLIGHT, KISS, QUICKRATES
    return { max: 2.55, min: 0.01, step: 0.01 };
});

const rateLimits = computed(() => {
    const type = ratesType.value;
    if (type === RatesType.RACEFLIGHT) {
        return { max: 255, min: 0, step: 1 };
    }
    if (type === RatesType.KISS) {
        return { max: 0.99, min: 0, step: 0.01 };
    }
    if (type === RatesType.ACTUAL || type === RatesType.QUICKRATES) {
        return { max: 2000, min: 10, step: 10 };
    }
    // BETAFLIGHT
    return { max: 1.0, min: 0, step: 0.01 };
});

const expoLimits = computed(() => {
    const type = ratesType.value;
    if (type === RatesType.RACEFLIGHT || type === RatesType.ACTUAL || type === RatesType.QUICKRATES) {
        return { max: 100, min: 0, step: 1 };
    }
    // BETAFLIGHT, KISS
    return { max: 1.0, min: 0, step: 0.01 };
});

function calculateMaxAngularVel(rate, rcRate, rcExpo, limit, deadband) {
    // Use provided deadband or fall back to generic deadband
    const db = deadband !== undefined ? deadband : FC.RC_DEADBAND_CONFIG?.deadband || 0;
    const maxAngularVel = rateCurve.getMaxAngularVel(
        rate,
        rcRate,
        rcExpo,
        true, // superexpo
        db,
        limit,
    );
    return Math.round(maxAngularVel);
}

// Canvas Drawing Functions
function drawRateCurves() {
    if (!rateCurveLayer0.value) return;

    const canvas = rateCurveLayer0.value;
    const ctx = canvas.getContext("2d");

    // Set canvas internal dimensions to 1000x1000 like master
    canvas.width = 1000;
    canvas.height = 1000;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ensure we have valid rate data
    if (!FC.RC_TUNING || rcRate.value === undefined) {
        return;
    }

    // Get scaled rates for drawing
    const rates = currentRates.value;

    // Calculate max angular velocity using scaled values
    const maxAngularVels = [
        rateCurve.getMaxAngularVel(
            rates.roll_rate,
            rates.rc_rate,
            rates.rc_expo,
            rates.superexpo,
            rates.deadband,
            rates.roll_rate_limit,
        ),
        rateCurve.getMaxAngularVel(
            rates.pitch_rate,
            rates.rc_rate_pitch,
            rates.rc_pitch_expo,
            rates.superexpo,
            rates.deadband,
            rates.pitch_rate_limit,
        ),
        rateCurve.getMaxAngularVel(
            rates.yaw_rate,
            rates.rc_rate_yaw,
            rates.rc_yaw_expo,
            rates.superexpo,
            rates.yawDeadband,
            rates.yaw_rate_limit,
        ),
    ];
    const maxAngularVel = rateCurve.setMaxAngularVel(Math.max(...maxAngularVels));

    // Draw axes
    drawAxes(ctx, canvas.width, canvas.height);

    // Set line width
    const lineScale = ctx.canvas.width / (ctx.canvas.clientWidth || 1);
    ctx.lineWidth = 2 * lineScale;

    // Draw Roll curve (red)
    ctx.save();
    ctx.strokeStyle = "#ff0000";
    ctx.translate(0, 0);
    rateCurve.draw(
        rates.roll_rate,
        rates.rc_rate,
        rates.rc_expo,
        rates.superexpo,
        rates.deadband,
        rates.roll_rate_limit,
        maxAngularVel,
        ctx,
    );
    ctx.restore();

    // Draw Pitch curve (green)
    ctx.save();
    ctx.strokeStyle = "#00ff00";
    ctx.translate(0, -4);
    rateCurve.draw(
        rates.pitch_rate,
        rates.rc_rate_pitch,
        rates.rc_pitch_expo,
        rates.superexpo,
        rates.deadband,
        rates.pitch_rate_limit,
        maxAngularVel,
        ctx,
    );
    ctx.restore();

    // Draw Yaw curve (blue)
    ctx.save();
    ctx.strokeStyle = "#0000ff";
    ctx.translate(0, 4);
    rateCurve.draw(
        rates.yaw_rate,
        rates.rc_rate_yaw,
        rates.rc_yaw_expo,
        rates.superexpo,
        rates.yawDeadband,
        rates.yaw_rate_limit,
        maxAngularVel,
        ctx,
    );
    ctx.restore();

    // Update layer1 overlays immediately and in nextTick
    updateRatesLabels();
    nextTick(() => updateRatesLabels());
}

// Balloon label configuration
const BALLOON_COLORS = {
    roll: {
        color: "rgba(255,128,128,0.4)",
        border: "rgba(255,128,128,0.6)",
        text: "#000000",
    },
    pitch: {
        color: "rgba(128,255,128,0.4)",
        border: "rgba(128,255,128,0.6)",
        text: "#000000",
    },
    yaw: {
        color: "rgba(128,128,255,0.4)",
        border: "rgba(128,128,255,0.6)",
        text: "#000000",
    },
};

function updateRatesLabels() {
    if (!rateCurveLayer1.value) {
        return;
    }

    const canvas = rateCurveLayer1.value;
    const ctx = canvas.getContext("2d");

    // Set canvas internal dimensions to 1000x1000 like master
    canvas.width = 1000;
    canvas.height = 1000;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rates = currentRates.value;

    // Verify we have valid rate data
    if (!rates || typeof rates.roll_rate === "undefined") {
        return;
    }

    // Calculate max angular velocities
    const maxAngularVels = {
        roll: rateCurve.getMaxAngularVel(
            rates.roll_rate,
            rates.rc_rate,
            rates.rc_expo,
            rates.superexpo,
            rates.deadband,
            rates.roll_rate_limit,
        ),
        pitch: rateCurve.getMaxAngularVel(
            rates.pitch_rate,
            rates.rc_rate_pitch,
            rates.rc_pitch_expo,
            rates.superexpo,
            rates.deadband,
            rates.pitch_rate_limit,
        ),
        yaw: rateCurve.getMaxAngularVel(
            rates.yaw_rate,
            rates.rc_rate_yaw,
            rates.rc_yaw_expo,
            rates.superexpo,
            rates.yawDeadband,
            rates.yaw_rate_limit,
        ),
    };

    const maxRate = Math.max(maxAngularVels.roll, maxAngularVels.pitch, maxAngularVels.yaw);

    // Calculate scaling exactly like master
    const curveHeight = canvas.height;
    const curveWidth = canvas.width;
    const windowScale = 400 / canvas.clientHeight;
    const rateScale = curveHeight / 2 / maxRate;
    const lineScale = canvas.width / canvas.clientWidth;
    const textScale = canvas.clientHeight / canvas.clientWidth;

    // Set font size based on window scaling like master
    if (windowScale <= 1) {
        ctx.font = "24pt Verdana, Arial, sans-serif";
    } else {
        ctx.font = `${24 * windowScale}pt Verdana, Arial, sans-serif`;
    }

    // Set line width like master
    ctx.lineWidth = lineScale;

    // Apply text scaling like master to prevent stretched text
    ctx.save();
    ctx.scale(textScale, 1);

    // Add the maximum range label like master
    drawAxisLabel(
        ctx,
        `${maxRate.toFixed(0)} deg/s`,
        (curveWidth / 2 - 10) / textScale,
        parseInt(ctx.font) * 1.2,
        "right",
    );

    // Track drawn balloon positions to prevent overlaps
    const balloonsDirty = [];

    // Draw balloon labels at the curve positions (like master)
    const maxAngularVelRoll = `${maxAngularVels.roll.toFixed(0)} deg/s`;
    const maxAngularVelPitch = `${maxAngularVels.pitch.toFixed(0)} deg/s`;
    const maxAngularVelYaw = `${maxAngularVels.yaw.toFixed(0)} deg/s`;

    // Create an array of balloons to draw (like master)
    const balloons = [
        {
            value: maxAngularVels.roll,
            draw: () => {
                drawBalloonLabel(
                    ctx,
                    maxAngularVelRoll,
                    curveWidth,
                    rateScale * (maxRate - maxAngularVels.roll),
                    "right",
                    BALLOON_COLORS.roll,
                    balloonsDirty,
                );
            },
        },
        {
            value: maxAngularVels.pitch,
            draw: () => {
                drawBalloonLabel(
                    ctx,
                    maxAngularVelPitch,
                    curveWidth,
                    rateScale * (maxRate - maxAngularVels.pitch),
                    "right",
                    BALLOON_COLORS.pitch,
                    balloonsDirty,
                );
            },
        },
        {
            value: maxAngularVels.yaw,
            draw: () => {
                drawBalloonLabel(
                    ctx,
                    maxAngularVelYaw,
                    curveWidth,
                    rateScale * (maxRate - maxAngularVels.yaw),
                    "right",
                    BALLOON_COLORS.yaw,
                    balloonsDirty,
                );
            },
        },
    ];

    // Add current RC stick values on the left side (like master)
    // Calculate stick values first, then add to balloons array AFTER sorting
    if (FC.RC && FC.RC.channels && FC.RC.channels[0] && FC.RC.channels[1] && FC.RC.channels[2]) {
        // Calculate current stick angular velocities
        const currentRollRate = rateCurve.drawStickPosition(
            FC.RC.channels[0],
            rates.roll_rate,
            rates.rc_rate,
            rates.rc_expo,
            rates.superexpo,
            rates.deadband,
            rates.roll_rate_limit,
            maxRate,
            ctx,
            "#FF8080",
        );

        const currentPitchRate = rateCurve.drawStickPosition(
            FC.RC.channels[1],
            rates.pitch_rate,
            rates.rc_rate_pitch,
            rates.rc_pitch_expo,
            rates.superexpo,
            rates.deadband,
            rates.pitch_rate_limit,
            maxRate,
            ctx,
            "#80FF80",
        );

        const currentYawRate = rateCurve.drawStickPosition(
            FC.RC.channels[2],
            rates.yaw_rate,
            rates.rc_rate_yaw,
            rates.rc_yaw_expo,
            rates.superexpo,
            rates.yawDeadband,
            rates.yaw_rate_limit,
            maxRate,
            ctx,
            "#8080FF",
        );

        // Sort right-side balloons first (like master)
        balloons.sort((a, b) => b.value - a.value);

        // NOW add left-side balloons to array AFTER sorting (like master)
        // This prevents them from being reordered
        balloons.push(
            {
                value: parseInt(currentRollRate),
                draw: () => {
                    drawBalloonLabel(
                        ctx,
                        `${currentRollRate} deg/s`,
                        10,
                        150,
                        "none",
                        BALLOON_COLORS.roll,
                        balloonsDirty,
                    );
                },
            },
            {
                value: parseInt(currentPitchRate),
                draw: () => {
                    drawBalloonLabel(
                        ctx,
                        `${currentPitchRate} deg/s`,
                        10,
                        250,
                        "none",
                        BALLOON_COLORS.pitch,
                        balloonsDirty,
                    );
                },
            },
            {
                value: parseInt(currentYawRate),
                draw: () => {
                    drawBalloonLabel(
                        ctx,
                        `${currentYawRate} deg/s`,
                        10,
                        350,
                        "none",
                        BALLOON_COLORS.yaw,
                        balloonsDirty,
                    );
                },
            },
        );
    } else {
        // Still need to sort even if no RC values
        balloons.sort((a, b) => b.value - a.value);
    }

    // Draw angle mode labels if applicable
    if (isBetaflightRates.value || ratesType.value === RatesType.ACTUAL) {
        // Betaflight or Actual
        drawAngleModeLabels(ctx, canvas, rates, balloonsDirty);
    }

    // Draw all balloons
    for (const balloon of balloons) {
        balloon.draw();
    }

    // Restore context after scaling
    ctx.restore();
}

function drawAxisLabel(ctx, text, x, y, align, color) {
    ctx.fillStyle = color || "#888888";
    ctx.textAlign = align || "center";
    ctx.fillText(text, x, y);
}

function drawBalloonLabel(ctx, text, x, y, align, colors, balloonsDirty) {
    const DEFAULT_OFFSET = 125;
    const DEFAULT_MARGIN = 5;
    const DEFAULT_RADIUS = 10;

    const fontSize = parseInt(ctx.font);

    // Calculate the width and height required for the balloon (like master)
    const width = ctx.measureText(text).width * 1.2;
    const height = fontSize * 1.5;
    const pointerY = y; // Store original y for pointer positioning

    // Setup balloon background
    ctx.fillStyle = colors.color;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;

    // Correct x position to account for window scaling (like master)
    if (align !== "none") {
        x *= ctx.canvas.clientWidth / ctx.canvas.clientHeight;
    }

    // Adjust the coordinates for balloon background (like master)
    x += (align === "right" ? -(width + DEFAULT_OFFSET) : 0) + (align === "left" ? DEFAULT_OFFSET : 0);
    y -= height / 2;

    if (y < 0) {
        y = 0;
    } else if (y > ctx.canvas.height) {
        y = ctx.canvas.height;
    }

    // Check that the balloon does not already overlap (like master)
    for (let i = 0; i < balloonsDirty.length; i++) {
        if (
            (x >= balloonsDirty[i].left && x <= balloonsDirty[i].right) ||
            (x + width >= balloonsDirty[i].left && x + width <= balloonsDirty[i].right)
        ) {
            // does it overlap horizontally
            if (
                (y >= balloonsDirty[i].top && y <= balloonsDirty[i].bottom) ||
                (y + height >= balloonsDirty[i].top && y + height <= balloonsDirty[i].bottom)
            ) {
                // this overlaps another balloon
                // snap above or snap below
                if (y <= (balloonsDirty[i].bottom - balloonsDirty[i].top) / 2 && balloonsDirty[i].top - height > 0) {
                    y = balloonsDirty[i].top - height;
                } else {
                    // snap down
                    y = balloonsDirty[i].bottom;
                }
            }
        }
    }

    // Record position for overlap detection (like master)
    balloonsDirty.push({ left: x, right: x + width, top: y - DEFAULT_MARGIN, bottom: y + height + DEFAULT_MARGIN });

    // Draw rounded rectangle balloon with pointer (like master)
    const pointerLength = (height - 2 * DEFAULT_RADIUS) / 6;

    ctx.beginPath();
    ctx.moveTo(x + DEFAULT_RADIUS, y);
    ctx.lineTo(x + width - DEFAULT_RADIUS, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + DEFAULT_RADIUS);

    if (align === "right") {
        // Pointer extends to the right
        ctx.lineTo(x + width, y + DEFAULT_RADIUS + pointerLength);
        ctx.lineTo(x + width + DEFAULT_OFFSET, pointerY); // pointer tip
        ctx.lineTo(x + width, y + height - DEFAULT_RADIUS - pointerLength);
    }
    ctx.lineTo(x + width, y + height - DEFAULT_RADIUS);

    ctx.quadraticCurveTo(x + width, y + height, x + width - DEFAULT_RADIUS, y + height);
    ctx.lineTo(x + DEFAULT_RADIUS, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - DEFAULT_RADIUS);

    if (align === "left") {
        // Pointer extends to the left
        ctx.lineTo(x, y + height - DEFAULT_RADIUS - pointerLength);
        ctx.lineTo(x - DEFAULT_OFFSET, pointerY); // pointer tip
        ctx.lineTo(x, y + DEFAULT_RADIUS + pointerLength);
    }
    ctx.lineTo(x, y + DEFAULT_RADIUS);

    ctx.quadraticCurveTo(x, y, x + DEFAULT_RADIUS, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw the text label
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.fillText(text, x + width / 2, y + (height + fontSize) / 2 - 4);
}

function drawAngleModeLabels(ctx, canvas, rates, balloonsDirty) {
    const textScale = ctx.canvas.clientHeight / ctx.canvas.clientWidth;

    // Draw "Angle Mode" label at the bottom right (like master)
    if (ratesType.value === RatesType.ACTUAL) {
        // Actual rates
        drawAxisLabel(ctx, "Angle Mode", (canvas.width - 10) / textScale, canvas.height - 250, "right");

        // Draw angle sensitivity ranges
        const angleLimit = FC.ADVANCED_TUNING?.levelAngleLimit || 60;
        const maxAngVelRoll = rateCurve.getMaxAngularVel(
            rates.roll_rate,
            rates.rc_rate,
            rates.rc_expo,
            rates.superexpo,
            rates.deadband,
            rates.roll_rate_limit,
        );
        const maxAngVelPitch = rateCurve.getMaxAngularVel(
            rates.pitch_rate,
            rates.rc_rate_pitch,
            rates.rc_pitch_expo,
            rates.superexpo,
            rates.deadband,
            rates.pitch_rate_limit,
        );

        const rcRate = rates.rc_rate;
        const rcRatePitch = rates.rc_rate_pitch;

        const angleCenterSensRoll = ((rcRate / maxAngVelRoll) * angleLimit).toFixed(1);
        const angleCenterSensPitch = ((rcRatePitch / maxAngVelPitch) * angleLimit).toFixed(1);

        const angleCenterSensRollText = `${angleCenterSensRoll}...${angleLimit}`;
        const angleCenterSensPitchText = `${angleCenterSensPitch}...${angleLimit}`;

        // Calculate offset for balloon placement
        const getOffsetForBalloon = (value) => {
            return (
                canvas.width -
                Math.ceil(ctx.measureText(value).width) / (ctx.canvas.clientWidth / ctx.canvas.clientHeight) -
                40
            );
        };

        const angleCenterSensRollOffset = getOffsetForBalloon(angleCenterSensRollText);
        const angleCenterSensPitchOffset = getOffsetForBalloon(angleCenterSensPitchText);

        // Draw angle sensitivity balloons
        drawBalloonLabel(
            ctx,
            angleCenterSensRollText,
            angleCenterSensRollOffset,
            canvas.height - 150,
            "none",
            BALLOON_COLORS.roll,
            balloonsDirty,
        );

        drawBalloonLabel(
            ctx,
            angleCenterSensPitchText,
            angleCenterSensPitchOffset,
            canvas.height - 200,
            "none",
            BALLOON_COLORS.pitch,
            balloonsDirty,
        );
    }
}

function drawAxes(ctx, width, height) {
    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 4;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Vertical center line
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
}

function drawThrottleCurve() {
    if (!throttleCurveCanvas.value) return;

    const canvas = throttleCurveCanvas.value;
    const context = canvas.getContext("2d");

    // Set canvas dimensions from DOM dimensions to prevent blurry scaling
    const rect = canvas.getBoundingClientRect();
    if (!rect.height || !rect.width || rect.height === 0 || rect.width === 0) return;

    canvas.height = rect.height;
    canvas.width = canvas.height * (rect.width / rect.height);
    if (canvas.width === 0 || canvas.height === 0) return;

    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;

    // Helper functions from original implementation
    function getQBezierValue(t, p1, p2, p3) {
        const iT = 1 - t;
        return iT * iT * p1 + 2 * iT * t * p2 + t * t * p3;
    }

    function getQuadraticCurvePoint(startX, startY, cpX, cpY, endX, endY, position) {
        return {
            x: getQBezierValue(position, startX, cpX, endX),
            y: getQBezierValue(position, startY, cpY, endY),
        };
    }

    function getTfromYBezier(y, startY, cpY, endY) {
        const A = startY - 2 * cpY + endY;
        const B = 2 * (cpY - startY);
        const C = startY - y;

        if (Math.abs(A) < 1e-6) {
            if (Math.abs(B) < 1e-6) return 0;
            return -C / B;
        }

        const disc = B * B - 4 * A * C;
        if (disc < 0) {
            return Math.abs(y - startY) < Math.abs(y - endY) ? 0 : 1;
        }

        const t1 = (-B + Math.sqrt(disc)) / (2 * A);
        const t2 = (-B - Math.sqrt(disc)) / (2 * A);

        if (t1 >= 0 && t1 <= 1) {
            if (t2 >= 0 && t2 <= 1) return t1;
            return t1;
        } else if (t2 >= 0 && t2 <= 1) {
            return t2;
        } else {
            return Math.abs(y - startY) < Math.abs(y - endY) ? 0 : 1;
        }
    }

    function getTfromXBezier(x, x0, cx, x1) {
        const a = x0 + x1 - 2 * cx;
        const b = 2 * (cx - x0);
        const c = x0 - x;
        if (Math.abs(a) < 1e-6) {
            if (Math.abs(b) < 1e-6) return 0;
            return -c / b;
        }
        const disc = b * b - 4 * a * c;
        if (disc < 0) return 0;
        const t1 = (-b + Math.sqrt(disc)) / (2 * a);
        const t2 = (-b - Math.sqrt(disc)) / (2 * a);

        const t1_valid = !isNaN(t1) && 0 <= t1 && t1 <= 1;
        const t2_valid = !isNaN(t2) && 0 <= t2 && t2 <= 1;

        if (t1_valid && t2_valid) return t1;
        else if (t1_valid) return t1;
        else if (t2_valid) return t2;
        else return Math.abs(x - x0) < Math.abs(x - x1) ? 0 : 1;
    }

    const THROTTLE_LIMIT_TYPES = { OFF: 0, SCALE: 1, CLIP: 2 };

    // Get values from computed properties
    const mid = throttleMid.value ?? 0;
    const expo = throttleExpo.value ?? 0;
    const hover = throttleHover.value ?? 0.5;
    const limitPercent = (throttleLimitPercent.value ?? 100) / 100;
    const limitType = throttleLimitType.value ?? 0;

    // Validate values
    if (
        isNaN(mid) ||
        isNaN(expo) ||
        isNaN(hover) ||
        mid < 0 ||
        mid > 1 ||
        expo < 0 ||
        expo > 1 ||
        hover < 0 ||
        hover > 1
    ) {
        return;
    }

    // Calculate base curve parameters
    const originalTopY = 0;
    const originalMidX = canvasWidth * mid;
    const originalMidY = canvasHeight * (1 - hover);

    const originalMidXl = originalMidX * 0.5;
    const originalMidYl = canvasHeight - (canvasHeight - originalMidY) * 0.5 * (expo + 1);
    const originalMidXr = (canvasWidth + originalMidX) * 0.5;
    const originalMidYr = originalTopY + (originalMidY - originalTopY) * 0.5 * (expo + 1);

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.lineWidth = 2;
    context.strokeStyle = "#ffbb00";

    let thrpos;
    const thrPercent = FC.RC?.channels?.[3] ? Math.max(0, Math.min(1, (FC.RC.channels[3] - 1000) / 1000)) : 0.5;
    const thrX = thrPercent * canvasWidth;

    // Draw curve based on limit type
    if (limitType === THROTTLE_LIMIT_TYPES.CLIP && limitPercent < 1.0) {
        const throttleClipY = canvasHeight * (1 - limitPercent);

        let intersectT, intersectX;
        if (throttleClipY >= originalMidY) {
            intersectT = getTfromYBezier(throttleClipY, canvasHeight, originalMidYl, originalMidY);
            intersectX = getQBezierValue(intersectT, 0, originalMidXl, originalMidX);
        } else {
            intersectT = getTfromYBezier(throttleClipY, originalMidY, originalMidYr, originalTopY);
            intersectT = Math.max(0, Math.min(1, intersectT));
            intersectX = getQBezierValue(intersectT, originalMidX, originalMidXr, canvasWidth);
        }
        intersectX = Math.max(0, Math.min(canvasWidth, intersectX));

        context.save();
        context.beginPath();
        context.rect(0, throttleClipY, canvasWidth, canvasHeight - throttleClipY);
        context.clip();

        context.beginPath();
        context.moveTo(0, canvasHeight);
        context.quadraticCurveTo(originalMidXl, originalMidYl, originalMidX, originalMidY);
        context.quadraticCurveTo(originalMidXr, originalMidYr, canvasWidth, originalTopY);
        context.stroke();

        context.restore();

        context.beginPath();
        context.moveTo(intersectX, throttleClipY);
        context.lineTo(canvasWidth, throttleClipY);
        context.stroke();

        let original_thrpos;
        if (thrPercent <= mid) {
            const t = getTfromXBezier(thrX, 0, originalMidXl, originalMidX);
            original_thrpos = getQuadraticCurvePoint(
                0,
                canvasHeight,
                originalMidXl,
                originalMidYl,
                originalMidX,
                originalMidY,
                t,
            );
        } else {
            const t = getTfromXBezier(thrX, originalMidX, originalMidXr, canvasWidth);
            original_thrpos = getQuadraticCurvePoint(
                originalMidX,
                originalMidY,
                originalMidXr,
                originalMidYr,
                canvasWidth,
                originalTopY,
                t,
            );
        }
        thrpos = { x: original_thrpos.x, y: Math.max(throttleClipY, original_thrpos.y) };
    } else {
        let scaleFactor = 1.0;
        if (limitType === THROTTLE_LIMIT_TYPES.SCALE) {
            scaleFactor = limitPercent;
        }

        const currentTopY = canvasHeight * (1 - scaleFactor);
        const currentMidX = originalMidX;
        const currentMidY = canvasHeight * (1 - scaleFactor * hover);

        const currentMidXl = currentMidX * 0.5;
        const currentMidYl = canvasHeight - (canvasHeight - currentMidY) * 0.5 * (expo + 1);
        const currentMidXr = (canvasWidth + currentMidX) * 0.5;
        const currentMidYr = currentTopY + (currentMidY - currentTopY) * 0.5 * (expo + 1);

        context.beginPath();
        context.moveTo(0, canvasHeight);
        context.quadraticCurveTo(currentMidXl, currentMidYl, currentMidX, currentMidY);
        context.quadraticCurveTo(currentMidXr, currentMidYr, canvasWidth, currentTopY);
        context.stroke();

        if (thrPercent <= mid) {
            const t = getTfromXBezier(thrX, 0, currentMidXl, currentMidX);
            thrpos = getQuadraticCurvePoint(0, canvasHeight, currentMidXl, currentMidYl, currentMidX, currentMidY, t);
        } else {
            const t = getTfromXBezier(thrX, currentMidX, currentMidXr, canvasWidth);
            thrpos = getQuadraticCurvePoint(
                currentMidX,
                currentMidY,
                currentMidXr,
                currentMidYr,
                canvasWidth,
                currentTopY,
                t,
            );
        }
    }

    // Draw throttle position indicator
    if (thrpos) {
        thrpos.x = Math.max(0, Math.min(canvasWidth, thrpos.x));
        thrpos.y = Math.max(0, Math.min(canvasHeight, thrpos.y));

        context.beginPath();
        context.arc(thrpos.x, thrpos.y, 4, 0, 2 * Math.PI);
        context.fillStyle = context.strokeStyle;
        context.fill();

        // Draw text label
        context.save();
        let fontSize = 10;
        context.font = `${fontSize}pt Verdana, Arial, sans-serif`;
        context.fillStyle = "#888888";

        let realInputThr = thrPercent * 100.0;
        let outputThr = Math.max(0, Math.min(100, (1 - thrpos.y / canvasHeight) * 100.0));
        let thrlabel = `${Math.round(realInputThr)}%` + ` = ${Math.round(outputThr)}%`;

        let textX = 5;
        let textY = 5 + fontSize;

        context.fillText(thrlabel, textX, textY);
        context.restore();
    }
}

function draw3DRatesPreview() {
    if (!ratesPreviewCanvas.value || !model) return;

    // This function is called continuously via requestAnimationFrame
    // It rotates the 3D model based on current RC input
}

function handleModelResize() {
    if (model && model.resize) {
        model.resize();
    }
    // Also redraw rate curves on resize
    nextTick(() => {
        updateRatesLabels();
    });
}

function renderModel(timestamp) {
    if (!model || !keepRendering) return;

    // Early return if model geometry isn't loaded yet
    if (!model.model) {
        animationFrameId = requestAnimationFrame(renderModel);
        return;
    }

    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Check if we have RC data with valid channel values
    if (FC.RC && FC.RC.channels && FC.RC.channels[0] && FC.RC.channels[1] && FC.RC.channels[2]) {
        const rates = currentRates.value;

        // Calculate rotation for each axis based on RC input
        const degToRad = (deg) => deg * (Math.PI / 180);

        const roll =
            (delta / 1000) *
            rateCurve.rcCommandRawToDegreesPerSecond(
                FC.RC.channels[0],
                rates.roll_rate,
                rates.rc_rate,
                rates.rc_expo,
                rates.superexpo,
                rates.deadband,
                rates.roll_rate_limit,
            );

        const pitch =
            (delta / 1000) *
            rateCurve.rcCommandRawToDegreesPerSecond(
                FC.RC.channels[1],
                rates.pitch_rate,
                rates.rc_rate_pitch,
                rates.rc_pitch_expo,
                rates.superexpo,
                rates.deadband,
                rates.pitch_rate_limit,
            );

        const yaw =
            (delta / 1000) *
            rateCurve.rcCommandRawToDegreesPerSecond(
                FC.RC.channels[2],
                rates.yaw_rate,
                rates.rc_rate_yaw,
                rates.rc_yaw_expo,
                rates.superexpo,
                rates.yawDeadband,
                rates.yaw_rate_limit,
            );

        model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));
    } else {
        // No RC data - just render the static model
        model.render();
    }

    // Continue animation loop
    animationFrameId = requestAnimationFrame(renderModel);
}

// Watch for changes and redraw
// Watch for changes and redraw
watch([ratesType, rcRate, rcRatePitch, rcRateYaw, rollRate, pitchRate, yawRate, rcExpo, rcPitchExpo, rcYawExpo], () => {
    nextTick(() => {
        drawRateCurves();
    });
});

watch([throttleMid, throttleHover, throttleExpo, throttleLimitType, throttleLimitPercent], () => {
    nextTick(() => {
        drawThrottleCurve();
    });
});

// Watch for FC.RC_TUNING to become available (initial data load)
watch(
    () => FC.RC_TUNING,
    (newValue) => {
        if (newValue && newValue.rates_type !== undefined) {
            nextTick(() => {
                drawRateCurves();
                drawThrottleCurve();
            });
        }
    },
    { immediate: true },
);

onMounted(() => {
    // Initialize 3D Model for rates preview
    // Wait for MIXER_CONFIG to be available before initializing model
    if (ratesPreviewContainer.value && ratesPreviewCanvas.value) {
        // Check if FC.MIXER_CONFIG is available, if not wait a bit
        const initModel = () => {
            // Guard: Return early if refs are null (component unmounted)
            if (!ratesPreviewContainer.value || !ratesPreviewCanvas.value) {
                return;
            }

            if (!FC.MIXER_CONFIG || FC.MIXER_CONFIG.mixer === undefined) {
                // Use separate timeout ID for init retries
                initModelTimeoutId = setTimeout(initModel, 100);
                return;
            }

            // Ensure container has dimensions
            const containerRect = ratesPreviewContainer.value.getBoundingClientRect();
            if (containerRect.width === 0 || containerRect.height === 0) {
                // Use separate timeout ID for init retries
                initModelTimeoutId = setTimeout(initModel, 100);
                return;
            }

            try {
                // Clear init timeout since we're successfully initializing
                if (initModelTimeoutId) {
                    clearTimeout(initModelTimeoutId);
                    initModelTimeoutId = null;
                }

                model = new Model($(ratesPreviewContainer.value), $(ratesPreviewCanvas.value));

                // Model automatically loads based on FC.MIXER_CONFIG.mixer
                // Give the model a moment to initialize its renderer
                modelInitTimeout = setTimeout(() => {
                    modelInitTimeout = null; // Clear reference once callback runs

                    // Add window resize handler
                    window.addEventListener("resize", handleModelResize);

                    // Start animation loop for 3D model
                    lastTimestamp = performance.now();
                    animationFrameId = requestAnimationFrame(renderModel);
                }, 100);
            } catch (error) {
                console.error("[RatesSubTab] Error creating Model:", error);
            }
        };

        initModel();
    } else {
        console.error(
            "[RatesSubTab] Missing refs - container:",
            ratesPreviewContainer.value,
            "canvas:",
            ratesPreviewCanvas.value,
        );
    }

    // Delay initial draw to ensure data is loaded
    initTimeout = setTimeout(() => {
        nextTick(() => {
            drawRateCurves();
            drawThrottleCurve();
            // Force initial label update
            updateRatesLabels();
        });
    }, 100);

    // Also do an immediate draw attempt
    nextTick(() => {
        drawRateCurves();
        drawThrottleCurve();
        updateRatesLabels();
    });

    // Set up interval to update RC stick positions
    rcUpdateInterval = setInterval(() => {
        if (FC.RC && FC.RC.channels && rateCurveLayer1.value) {
            updateRatesLabels();
        }
    }, 100); // Update 10 times per second
});

onUnmounted(() => {
    // Stop rendering immediately
    keepRendering = false;

    // Cancel animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Clear model initialization timeout (prevents resize listener and animation from starting)
    if (modelInitTimeout) {
        clearTimeout(modelInitTimeout);
        modelInitTimeout = null;
    }

    // Clear initial draw timeout
    if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
    }

    // Dispose 3D model
    if (model) {
        window.removeEventListener("resize", handleModelResize);
        model.dispose();
        model = null;
    }

    // Clear initModel retry timeout
    if (initModelTimeoutId) {
        clearTimeout(initModelTimeoutId);
        initModelTimeoutId = null;
    }

    // Clear RC update interval
    if (rcUpdateInterval) {
        clearInterval(rcUpdateInterval);
        rcUpdateInterval = null;
    }
});

// Expose rateProfileName for parent component to save
defineExpose({
    rateProfileName,
});
</script>

<style scoped>
.rates-subtab {
    display: flex;
    gap: 10px;
}

.cf_column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.gui_box {
    padding: 10px;
}

.rates_logo {
    max-width: 100px;
    max-height: 40px;
}

.background_paper {
    background: var(--surface-50, #fff);
    border: 1px solid var(--surface-400, #ccc);
    padding: 5px;
}

.rate_curve {
    position: relative;
    width: 100%;
}

.throttle_curve {
    width: 100%;
}

.rates_preview {
    width: 100%;
}

canvas {
    display: block;
}
</style>
