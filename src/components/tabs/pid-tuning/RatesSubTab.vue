<template>
    <div class="subtab-rates">
        <!-- LEFT COLUMN -->
        <div class="cf_column">
            <!-- Rate Profile Name (API 1.45+) -->
            <div v-if="hasProfileNames" class="gui_box grey profile_name">
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
                                <input type="text" v-model="rateProfileNameModel" maxlength="8" />
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
                <p v-html="$t('pidTuningMaxRateWarning')"></p>
            </div>

            <!-- Rate Setup Table -->
            <div class="gui_box grey rateSetup">
                <table id="rateSetup" class="pid_tuning">
                    <tbody>
                        <tr class="pid_titlebar">
                            <th class="name"></th>
                            <th class="rc_rate" v-text="rcRateLabel"></th>
                            <th class="rate" v-text="rateLabel"></th>
                            <th class="rc_expo" v-text="rcExpoLabel"></th>
                            <th
                                v-if="isBetaflightRates"
                                class="new_rates centerSensitivity"
                                v-text="fourthColumnLabel"
                            ></th>
                            <th v-else class="new_rates maxVel" v-text="fourthColumnLabel"></th>
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
                                    :value="rcRate.toFixed(rcRatePrecision)"
                                    @change="rcRate = parseFloat($event.target.value)"
                                    :step="rcRateLimits.step"
                                    :min="rcRateLimits.min"
                                    :max="rcRateLimits.max"
                                />
                            </td>
                            <td class="roll_rate">
                                <input
                                    type="number"
                                    :value="rollRate.toFixed(ratePrecision)"
                                    @change="rollRate = parseFloat($event.target.value)"
                                    :step="rateLimits.step"
                                    :min="rateLimits.min"
                                    :max="rateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :value="rcExpo.toFixed(expoPrecision)"
                                    @change="rcExpo = parseFloat($event.target.value)"
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
                                    :value="rcRatePitch.toFixed(rcRatePrecision)"
                                    @change="rcRatePitch = parseFloat($event.target.value)"
                                    :step="rcRateLimits.step"
                                    :min="rcRateLimits.min"
                                    :max="rcRateLimits.max"
                                />
                            </td>
                            <td class="pitch_rate">
                                <input
                                    type="number"
                                    :value="pitchRate.toFixed(ratePrecision)"
                                    @change="pitchRate = parseFloat($event.target.value)"
                                    :step="rateLimits.step"
                                    :min="rateLimits.min"
                                    :max="rateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :value="rcPitchExpo.toFixed(expoPrecision)"
                                    @change="rcPitchExpo = parseFloat($event.target.value)"
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
                                    :value="rcRateYaw.toFixed(rcRatePrecision)"
                                    @change="rcRateYaw = parseFloat($event.target.value)"
                                    :step="rcRateLimits.step"
                                    :min="rcRateLimits.min"
                                    :max="rcRateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :value="yawRate.toFixed(ratePrecision)"
                                    @change="yawRate = parseFloat($event.target.value)"
                                    :step="rateLimits.step"
                                    :min="rateLimits.min"
                                    :max="rateLimits.max"
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    :value="rcYawExpo.toFixed(expoPrecision)"
                                    @change="rcYawExpo = parseFloat($event.target.value)"
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
                                    <div class="rate_curve background_paper" style="position: relative">
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

        <!-- RIGHT COLUMN -->
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
                            <th v-if="hasThrottleHover" v-text="$t('receiverThrottleHover')"></th>
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
                            <td v-if="hasThrottleHover">
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
import { i18n } from "@/js/localization";
import { useDialog } from "@/composables/useDialog";
import $ from "jquery";
import FC from "@/js/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import RateCurve from "@/js/RateCurve";
import Model from "@/js/model";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";
import betaflightLogo from "@/images/rate_logos/betaflight.svg";
import raceflightLogo from "@/images/rate_logos/raceflight.svg";
import kissLogo from "@/images/rate_logos/kiss.svg";
import actualLogo from "@/images/rate_logos/actual.svg";
import quickratesLogo from "@/images/rate_logos/quickrates.svg";

const props = defineProps({
    rateProfileName: {
        type: String,
        default: "",
    },
});

const emit = defineEmits(["update:rateProfileName", "change"]);

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

// API Version helpers
const hasProfileNames = computed(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45));
const hasThrottleHover = computed(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47));

// Rate Profile Name
const rateProfileNameModel = computed({
    get: () => props.rateProfileName,
    set: (value) => emit("update:rateProfileName", value),
});

// Rates Type
const dialog = useDialog();

const ratesType = computed({
    get: () => FC.RC_TUNING.rates_type,
    set: (value) => {
        const current = FC.RC_TUNING.rates_type;
        if (value === current) {
            return;
        }

        // Open confirmation dialog before changing rates type
        dialog.open(
            "RatesTypeDialog",
            {
                title: i18n.getMessage("dialogRatesTypeTitle"),
                note: i18n.getMessage("dialogRatesTypeNote"),
                confirmText: i18n.getMessage("dialogRatesTypeConfirm"),
                cancelText: i18n.getMessage("cancel"),
            },
            {
                confirm: () => {
                    dialog.close();
                    FC.RC_TUNING.rates_type = value;
                    emit("change");
                },
                cancel: () => {
                    dialog.close();
                    // no-op, leave previous rates type
                },
            },
        );
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

// Dynamic labels based on rates type
const rcRateLabel = computed(() => {
    switch (ratesType.value) {
        case RatesType.RACEFLIGHT:
            return i18n.getMessage("pidTuningRcRateRaceflight");
        case RatesType.ACTUAL:
            return i18n.getMessage("pidTuningRcRateActual");
        case RatesType.QUICKRATES:
            return i18n.getMessage("pidTuningRcRate");
        case RatesType.KISS:
            return i18n.getMessage("pidTuningRcRate");
        default:
            return i18n.getMessage("pidTuningRcRate");
    }
});

const rateLabel = computed(() => {
    switch (ratesType.value) {
        case RatesType.RACEFLIGHT:
            return i18n.getMessage("pidTuningRateRaceflight");
        case RatesType.ACTUAL:
            return i18n.getMessage("pidTuningRateQuickRates");
        case RatesType.QUICKRATES:
            return i18n.getMessage("pidTuningRateQuickRates");
        case RatesType.KISS:
            return i18n.getMessage("pidTuningRate");
        default:
            return i18n.getMessage("pidTuningRate");
    }
});

const rcExpoLabel = computed(() => {
    switch (ratesType.value) {
        case RatesType.RACEFLIGHT:
            return i18n.getMessage("pidTuningRcExpoRaceflight");
        case RatesType.ACTUAL:
            return i18n.getMessage("pidTuningRcExpoRaceflight");
        case RatesType.QUICKRATES:
            return i18n.getMessage("pidTuningRcExpoRaceflight");
        case RatesType.KISS:
            return i18n.getMessage("pidTuningRcExpoKISS");
        default:
            return i18n.getMessage("pidTuningRcExpo");
    }
});

const fourthColumnLabel = computed(() => {
    if (isBetaflightRates.value) {
        return i18n.getMessage("pidTuningRcRateActual");
    } else {
        return i18n.getMessage("pidTuningMaxVel");
    }
});

// Precision for expo inputs based on rates type
const expoPrecision = computed(() => (ratesType.value === RatesType.RACEFLIGHT ? 0 : 2));

// Precision for rate inputs based on rates type
const ratePrecision = computed(() => {
    switch (ratesType.value) {
        case RatesType.BETAFLIGHT:
        case RatesType.KISS:
            return 2;
        default:
            return 0;
    }
});

// Precision for RC rate inputs based on rates type
const rcRatePrecision = computed(() => {
    switch (ratesType.value) {
        case RatesType.BETAFLIGHT:
        case RatesType.KISS:
        case RatesType.QUICKRATES:
            return 2;
        default:
            return 0;
    }
});

// Helper to get scale factor based on rates type
const getScaleFactor = () => {
    const type = FC.RC_TUNING.rates_type;
    switch (type) {
        case RatesType.RACEFLIGHT:
        case RatesType.ACTUAL:
            return 1000;
        default:
            return 1;
    }
};

const getRateScaleFactor = () => {
    const type = FC.RC_TUNING.rates_type;
    switch (type) {
        case RatesType.RACEFLIGHT:
            return 100;
        case RatesType.ACTUAL:
        case RatesType.QUICKRATES:
            return 1000;
        default:
            return 1;
    }
};

// RC Rate (Roll) - scaled for display
const rcRate = computed({
    get: () => FC.RC_TUNING.RC_RATE * getScaleFactor(),
    set: (value) => (FC.RC_TUNING.RC_RATE = value / getScaleFactor()),
});

// RC Rate Pitch - scaled for display
const rcRatePitch = computed({
    get: () => FC.RC_TUNING.rcPitchRate * getScaleFactor(),
    set: (value) => (FC.RC_TUNING.rcPitchRate = value / getScaleFactor()),
});

// RC Rate Yaw - scaled for display
const rcRateYaw = computed({
    get: () => FC.RC_TUNING.rcYawRate * getScaleFactor(),
    set: (value) => (FC.RC_TUNING.rcYawRate = value / getScaleFactor()),
});

// Roll Rate - scaled for display
const rollRate = computed({
    get: () => FC.RC_TUNING.roll_rate * getRateScaleFactor(),
    set: (value) => (FC.RC_TUNING.roll_rate = value / getRateScaleFactor()),
});

// Pitch Rate - scaled for display
const pitchRate = computed({
    get: () => FC.RC_TUNING.pitch_rate * getRateScaleFactor(),
    set: (value) => (FC.RC_TUNING.pitch_rate = value / getRateScaleFactor()),
});

// Yaw Rate - scaled for display
const yawRate = computed({
    get: () => FC.RC_TUNING.yaw_rate * getRateScaleFactor(),
    set: (value) => (FC.RC_TUNING.yaw_rate = value / getRateScaleFactor()),
});

// RC Expo
const rcExpo = computed({
    get: () => {
        const type = ratesType.value;
        return type === RatesType.RACEFLIGHT ? FC.RC_TUNING.RC_EXPO * 100 : FC.RC_TUNING.RC_EXPO;
    },
    set: (value) => {
        const type = ratesType.value;
        FC.RC_TUNING.RC_EXPO = type === RatesType.RACEFLIGHT ? value / 100 : value;
    },
});

// RC Pitch Expo
const rcPitchExpo = computed({
    get: () => {
        const type = ratesType.value;
        return type === RatesType.RACEFLIGHT ? FC.RC_TUNING.RC_PITCH_EXPO * 100 : FC.RC_TUNING.RC_PITCH_EXPO;
    },
    set: (value) => {
        const type = ratesType.value;
        FC.RC_TUNING.RC_PITCH_EXPO = type === RatesType.RACEFLIGHT ? value / 100 : value;
    },
});

// RC Yaw Expo
const rcYawExpo = computed({
    get: () => {
        const type = ratesType.value;
        return type === RatesType.RACEFLIGHT ? FC.RC_TUNING.RC_YAW_EXPO * 100 : FC.RC_TUNING.RC_YAW_EXPO;
    },
    set: (value) => {
        const type = ratesType.value;
        FC.RC_TUNING.RC_YAW_EXPO = type === RatesType.RACEFLIGHT ? value / 100 : value;
    },
});

// Throttle Settings
const throttleLimitType = computed({
    get: () => FC.RC_TUNING.throttleLimitType,
    set: (value) => (FC.RC_TUNING.throttleLimitType = value),
});

const throttleLimitPercent = computed({
    get: () => FC.RC_TUNING.throttleLimitPercent,
    set: (value) => (FC.RC_TUNING.throttleLimitPercent = Number.parseFloat(value)),
});

const throttleMid = computed({
    get: () => FC.RC_TUNING.throttle_MID ?? 0,
    set: (value) => (FC.RC_TUNING.throttle_MID = Number.parseFloat(value)),
});

const throttleHover = computed({
    get: () => FC.RC_TUNING.throttle_HOVER ?? 0.5,
    set: (value) => (FC.RC_TUNING.throttle_HOVER = Number.parseFloat(value)),
});

const throttleExpo = computed({
    get: () => FC.RC_TUNING.throttle_EXPO ?? 0,
    set: (value) => (FC.RC_TUNING.throttle_EXPO = Number.parseFloat(value)),
});

// Rate Curve Helper
const rateCurve = new RateCurve(false);

// Get current rates with proper scaling based on rates type - always returns fresh data
const getCurrentRatesSnapshot = () => rateCurve.getCurrentRates();

// Helper functions for rate calculations
const RC_RATE_INCREMENTAL = 14.54;

function getRcRateModified(rate) {
    return rate > 2 ? (rate - 2) * RC_RATE_INCREMENTAL + 2 : rate;
}

function getAcroSensitivityFraction(exponent, rate) {
    return ((1 - exponent) * getRcRateModified(rate) * 200).toFixed(0);
}

// Center Sensitivity (Betaflight Rates)
const centerSensitivityRoll = computed(() => {
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
    const rates = getCurrentRatesSnapshot();
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
    return calculateMaxAngularVel(rollRate.value, rcRate.value, rcExpo.value, FC.RC_TUNING.roll_rate_limit).toString();
});

const maxAngularVelPitch = computed(() => {
    return calculateMaxAngularVel(
        pitchRate.value,
        rcRatePitch.value,
        rcPitchExpo.value,
        FC.RC_TUNING.pitch_rate_limit,
    ).toString();
});

const maxAngularVelYaw = computed(() => {
    const rates = getCurrentRatesSnapshot();
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
    const rates = getCurrentRatesSnapshot();
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
    return { max: 1, min: 0, step: 0.01 };
});

const expoLimits = computed(() => {
    return ratesType.value === RatesType.RACEFLIGHT ? { max: 100, min: 0, step: 1 } : { max: 1, min: 0, step: 0.01 };
});

function calculateMaxAngularVel(rate, rcRate, rcExpo, limit, deadband) {
    // Use provided deadband or fall back to generic deadband
    const db = deadband === undefined ? FC.RC_DEADBAND_CONFIG?.deadband || 0 : deadband;
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
    if (!rateCurveLayer0.value) {
        return;
    }

    const canvas = rateCurveLayer0.value;
    const ctx = canvas.getContext("2d");

    canvas.width = 1000;
    canvas.height = 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ensure we have valid rate data
    // if (!FC.RC_TUNING || rcRate.value === undefined) {
    //     return;
    // }

    // Get scaled rates for drawing
    const rates = getCurrentRatesSnapshot();

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

    canvas.width = 1000;
    canvas.height = 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rates = getCurrentRatesSnapshot();

    // Verify we have valid rate data
    if (!rates || rates.roll_rate === undefined) {
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
    const clientHeight = canvas.clientHeight || 1; // Guard against zero
    const clientWidth = canvas.clientWidth || 1; // Guard against zero
    const windowScale = 400 / clientHeight;
    const rateScale = curveHeight / 2 / maxRate;
    const lineScale = canvas.width / clientWidth;
    const textScale = clientHeight / clientWidth;

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
        Number.parseInt(ctx.font) * 1.2,
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
                value: Number.parseInt(currentRollRate),
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
                value: Number.parseInt(currentPitchRate),
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
                value: Number.parseInt(currentYawRate),
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
    if (ratesType.value === RatesType.ACTUAL) {
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

function resolveBalloonOverlap(x, y, width, height, balloonsDirty) {
    for (const balloon of balloonsDirty) {
        const overlapsH =
            (x >= balloon.left && x <= balloon.right) || (x + width >= balloon.left && x + width <= balloon.right);
        const overlapsV =
            (y >= balloon.top && y <= balloon.bottom) || (y + height >= balloon.top && y + height <= balloon.bottom);

        if (overlapsH && overlapsV) {
            if (y <= (balloon.bottom - balloon.top) / 2 && balloon.top - height > 0) {
                y = balloon.top - height;
            } else {
                y = balloon.bottom;
            }
        }
    }
    return y;
}

function drawBalloonPath(ctx, bounds, pointer, style) {
    const { x, y, width, height } = bounds;
    const { pointerY } = pointer;
    const { align, radius, offset } = style;
    const pointerLength = (height - 2 * radius) / 6;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);

    if (align === "right") {
        ctx.lineTo(x + width, y + radius + pointerLength);
        ctx.lineTo(x + width + offset, pointerY);
        ctx.lineTo(x + width, y + height - radius - pointerLength);
    }
    ctx.lineTo(x + width, y + height - radius);

    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);

    if (align === "left") {
        ctx.lineTo(x, y + height - radius - pointerLength);
        ctx.lineTo(x - offset, pointerY);
        ctx.lineTo(x, y + radius + pointerLength);
    }
    ctx.lineTo(x, y + radius);

    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawBalloonLabel(ctx, text, x, y, align, colors, balloonsDirty) {
    const DEFAULT_OFFSET = 125;
    const DEFAULT_MARGIN = 5;
    const DEFAULT_RADIUS = 10;

    const fontSize = Number.parseInt(ctx.font);
    const width = ctx.measureText(text).width * 1.2;
    const height = fontSize * 1.5;
    const pointerY = y;

    ctx.fillStyle = colors.color;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;

    if (align !== "none") {
        x *= ctx.canvas.clientWidth / ctx.canvas.clientHeight;
    }

    x += (align === "right" ? -(width + DEFAULT_OFFSET) : 0) + (align === "left" ? DEFAULT_OFFSET : 0);
    y -= height / 2;
    y = Math.max(0, Math.min(ctx.canvas.height, y));

    y = resolveBalloonOverlap(x, y, width, height, balloonsDirty);
    balloonsDirty.push({ left: x, right: x + width, top: y - DEFAULT_MARGIN, bottom: y + height + DEFAULT_MARGIN });

    drawBalloonPath(
        ctx,
        { x, y, width, height },
        { pointerY },
        { align, radius: DEFAULT_RADIUS, offset: DEFAULT_OFFSET },
    );

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
            const offset =
                Math.ceil(ctx.measureText(value).width) / (ctx.canvas.clientWidth / ctx.canvas.clientHeight) + 40;
            return (canvas.width - offset) / textScale;
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

// Bezier math helpers extracted for reuse and reduced complexity
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
        return Math.abs(B) < 1e-6 ? 0 : -C / B;
    }

    const disc = B * B - 4 * A * C;
    if (disc < 0) {
        return Math.abs(y - startY) < Math.abs(y - endY) ? 0 : 1;
    }

    const t1 = (-B + Math.sqrt(disc)) / (2 * A);
    const t2 = (-B - Math.sqrt(disc)) / (2 * A);

    if (t1 >= 0 && t1 <= 1) {
        return t1;
    } else if (t2 >= 0 && t2 <= 1) {
        return t2;
    }
    return Math.abs(y - startY) < Math.abs(y - endY) ? 0 : 1;
}

function getTfromXBezier(x, x0, cx, x1) {
    const a = x0 + x1 - 2 * cx;
    const b = 2 * (cx - x0);
    const c = x0 - x;

    if (Math.abs(a) < 1e-6) {
        return Math.abs(b) < 1e-6 ? 0 : -c / b;
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) {
        return 0;
    }

    const t1 = (-b + Math.sqrt(disc)) / (2 * a);
    const t2 = (-b - Math.sqrt(disc)) / (2 * a);
    const t1Valid = !Number.isNaN(t1) && t1 >= 0 && t1 <= 1;
    const t2Valid = !Number.isNaN(t2) && t2 >= 0 && t2 <= 1;

    if (t1Valid) {
        return t1;
    } else if (t2Valid) {
        return t2;
    }
    return Math.abs(x - x0) < Math.abs(x - x1) ? 0 : 1;
}

const THROTTLE_LIMIT_TYPES = { OFF: 0, SCALE: 1, CLIP: 2 };

function drawClipModeCurve(context, curve, canvas, throttle) {
    const { limitPercent, width: canvasWidth, height: canvasHeight } = canvas;
    const { thrPercent, thrX, mid } = throttle;
    const throttleClipY = canvasHeight * (1 - limitPercent);

    let intersectT;
    let intersectX;
    if (throttleClipY >= curve.midY) {
        intersectT = getTfromYBezier(throttleClipY, canvasHeight, curve.midYl, curve.midY);
        intersectX = getQBezierValue(intersectT, 0, curve.midXl, curve.midX);
    } else {
        intersectT = getTfromYBezier(throttleClipY, curve.midY, curve.midYr, curve.topY);
        intersectT = Math.max(0, Math.min(1, intersectT));
        intersectX = getQBezierValue(intersectT, curve.midX, curve.midXr, canvasWidth);
    }
    intersectX = Math.max(0, Math.min(canvasWidth, intersectX));

    context.save();
    context.beginPath();
    context.rect(0, throttleClipY, canvasWidth, canvasHeight - throttleClipY);
    context.clip();

    context.beginPath();
    context.moveTo(0, canvasHeight);
    context.quadraticCurveTo(curve.midXl, curve.midYl, curve.midX, curve.midY);
    context.quadraticCurveTo(curve.midXr, curve.midYr, canvasWidth, curve.topY);
    context.stroke();
    context.restore();

    context.beginPath();
    context.moveTo(intersectX, throttleClipY);
    context.lineTo(canvasWidth, throttleClipY);
    context.stroke();

    let originalThrpos;
    if (thrPercent <= mid) {
        const t = getTfromXBezier(thrX, 0, curve.midXl, curve.midX);
        originalThrpos = getQuadraticCurvePoint(0, canvasHeight, curve.midXl, curve.midYl, curve.midX, curve.midY, t);
    } else {
        const t = getTfromXBezier(thrX, curve.midX, curve.midXr, canvasWidth);
        originalThrpos = getQuadraticCurvePoint(
            curve.midX,
            curve.midY,
            curve.midXr,
            curve.midYr,
            canvasWidth,
            curve.topY,
            t,
        );
    }
    return { x: originalThrpos.x, y: Math.max(throttleClipY, originalThrpos.y) };
}

function drawScaleModeCurve(context, curve, canvas, throttle) {
    const { width: canvasWidth, height: canvasHeight } = canvas;
    const { thrPercent, thrX, mid } = throttle;

    context.beginPath();
    context.moveTo(0, canvasHeight);
    context.quadraticCurveTo(curve.midXl, curve.midYl, curve.midX, curve.midY);
    context.quadraticCurveTo(curve.midXr, curve.midYr, canvasWidth, curve.topY);
    context.stroke();

    if (thrPercent <= mid) {
        const t = getTfromXBezier(thrX, 0, curve.midXl, curve.midX);
        return getQuadraticCurvePoint(0, canvasHeight, curve.midXl, curve.midYl, curve.midX, curve.midY, t);
    }
    const t = getTfromXBezier(thrX, curve.midX, curve.midXr, canvasWidth);
    return getQuadraticCurvePoint(curve.midX, curve.midY, curve.midXr, curve.midYr, canvasWidth, curve.topY, t);
}

function drawThrottlePositionIndicator(context, thrpos, thrPercent, canvasWidth, canvasHeight) {
    thrpos.x = Math.max(0, Math.min(canvasWidth, thrpos.x));
    thrpos.y = Math.max(0, Math.min(canvasHeight, thrpos.y));

    context.beginPath();
    context.arc(thrpos.x, thrpos.y, 4, 0, 2 * Math.PI);
    context.fillStyle = context.strokeStyle;
    context.fill();

    context.save();
    const fontSize = 10;
    context.font = `${fontSize}pt Verdana, Arial, sans-serif`;
    context.fillStyle = "#888888";

    const realInputThr = thrPercent * 100;
    const outputThr = Math.max(0, Math.min(100, (1 - thrpos.y / canvasHeight) * 100));
    const thrlabel = `${Math.round(realInputThr)}% = ${Math.round(outputThr)}%`;

    context.fillText(thrlabel, 5, 5 + fontSize);
    context.restore();
}

function computeCurveParams(canvasWidth, canvasHeight, mid, hover, expo, scaleFactor) {
    const topY = canvasHeight * (1 - scaleFactor);
    const midX = canvasWidth * mid;
    const midY = canvasHeight * (1 - scaleFactor * hover);

    return {
        topY,
        midX,
        midY,
        midXl: midX * 0.5,
        midYl: canvasHeight - (canvasHeight - midY) * 0.5 * (expo + 1),
        midXr: (canvasWidth + midX) * 0.5,
        midYr: topY + (midY - topY) * 0.5 * (expo + 1),
    };
}

function drawThrottleCurve() {
    if (!throttleCurveCanvas.value) {
        return;
    }

    const canvas = throttleCurveCanvas.value;
    const context = canvas.getContext("2d");

    const rect = canvas.getBoundingClientRect();
    if (!rect.height || !rect.width || rect.height === 0 || rect.width === 0) {
        return;
    }

    canvas.height = rect.height;
    canvas.width = canvas.height * (rect.width / rect.height);
    if (canvas.width === 0 || canvas.height === 0) {
        return;
    }

    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;

    const mid = throttleMid.value ?? 0;
    const expo = throttleExpo.value ?? 0;
    // Hover parameter is only available from API 1.47; use mid value for older versions
    const hover = hasThrottleHover.value ? (throttleHover.value ?? 0.5) : mid;
    const limitPercent = (throttleLimitPercent.value ?? 100) / 100;
    const limitType = throttleLimitType.value ?? 0;

    if (
        Number.isNaN(mid) ||
        Number.isNaN(expo) ||
        Number.isNaN(hover) ||
        mid < 0 ||
        mid > 1 ||
        expo < 0 ||
        expo > 1 ||
        hover < 0 ||
        hover > 1
    ) {
        return;
    }

    const originalCurve = computeCurveParams(canvasWidth, canvasHeight, mid, hover, expo, 1);

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.lineWidth = 2;
    context.strokeStyle = "#ffbb00";

    const thrPercent = FC.RC?.channels?.[3] ? Math.max(0, Math.min(1, (FC.RC.channels[3] - 1000) / 1000)) : 0.5;
    const thrX = thrPercent * canvasWidth;

    const throttle = { thrPercent, thrX, mid };

    let thrpos;
    if (limitType === THROTTLE_LIMIT_TYPES.CLIP && limitPercent < 1) {
        thrpos = drawClipModeCurve(
            context,
            originalCurve,
            { limitPercent, width: canvasWidth, height: canvasHeight },
            throttle,
        );
    } else {
        const scaleFactor = limitType === THROTTLE_LIMIT_TYPES.SCALE ? limitPercent : 1;
        const scaledCurve = computeCurveParams(canvasWidth, canvasHeight, mid, hover, expo, scaleFactor);
        thrpos = drawScaleModeCurve(context, scaledCurve, { width: canvasWidth, height: canvasHeight }, throttle);
    }

    if (thrpos) {
        drawThrottlePositionIndicator(context, thrpos, thrPercent, canvasWidth, canvasHeight);
    }
}

function handleModelResize() {
    if (model && model.resize) {
        model.resize();
    }
    // Redraw rate curves on resize
    nextTick(() => {
        drawRateCurves();
    });
}

function renderModel(timestamp) {
    if (!model || !keepRendering) {
        return;
    }

    // Early return if model geometry isn't loaded yet
    if (!model.model) {
        animationFrameId = requestAnimationFrame(renderModel);
        return;
    }

    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const channels = FC.RC?.channels;

    // Only rotate when we have valid RC channel data
    if (channels?.[0] && channels?.[1] && channels?.[2]) {
        const rates = getCurrentRatesSnapshot();
        const degToRad = (deg) => deg * (Math.PI / 180);

        const roll =
            (delta / 1000) *
            rateCurve.rcCommandRawToDegreesPerSecond(
                channels[0],
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
                channels[1],
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
                channels[2],
                rates.yaw_rate,
                rates.rc_rate_yaw,
                rates.rc_yaw_expo,
                rates.superexpo,
                rates.yawDeadband,
                rates.yaw_rate_limit,
            );

        model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));
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

    // Poll MSP_RC for live stick data and update rate curve labels
    rcUpdateInterval = setInterval(() => {
        MSP.send_message(MSPCodes.MSP_RC, false, false, () => {
            if (rateCurveLayer1.value) {
                updateRatesLabels();
            }
        });
    }, 100); // Update 10 times per second
});

// Set defaults for rates type
const setDefaultsForRatesType = (type) => {
    switch (type) {
        case RatesType.RACEFLIGHT:
            FC.RC_TUNING.RC_RATE = 0.37;
            FC.RC_TUNING.rcPitchRate = 0.37;
            FC.RC_TUNING.rcYawRate = 0.37;
            FC.RC_TUNING.roll_rate = 0.8;
            FC.RC_TUNING.pitch_rate = 0.8;
            FC.RC_TUNING.yaw_rate = 0.8;
            FC.RC_TUNING.RC_EXPO = 0.5;
            FC.RC_TUNING.RC_PITCH_EXPO = 0.5;
            FC.RC_TUNING.RC_YAW_EXPO = 0.5;
            break;
        case RatesType.ACTUAL:
            FC.RC_TUNING.RC_RATE = 0.07;
            FC.RC_TUNING.rcPitchRate = 0.07;
            FC.RC_TUNING.rcYawRate = 0.07;
            FC.RC_TUNING.roll_rate = 0.67;
            FC.RC_TUNING.pitch_rate = 0.67;
            FC.RC_TUNING.yaw_rate = 0.67;
            FC.RC_TUNING.RC_EXPO = 0;
            FC.RC_TUNING.RC_PITCH_EXPO = 0;
            FC.RC_TUNING.RC_YAW_EXPO = 0;
            break;
        case RatesType.QUICKRATES:
            FC.RC_TUNING.RC_RATE = 1;
            FC.RC_TUNING.rcPitchRate = 1;
            FC.RC_TUNING.rcYawRate = 1;
            FC.RC_TUNING.roll_rate = 0.67;
            FC.RC_TUNING.pitch_rate = 0.67;
            FC.RC_TUNING.yaw_rate = 0.67;
            FC.RC_TUNING.RC_EXPO = 0;
            FC.RC_TUNING.RC_PITCH_EXPO = 0;
            FC.RC_TUNING.RC_YAW_EXPO = 0;
            break;
        case RatesType.BETAFLIGHT:
        case RatesType.KISS:
            FC.RC_TUNING.RC_RATE = 1;
            FC.RC_TUNING.rcPitchRate = 1;
            FC.RC_TUNING.rcYawRate = 1;
            FC.RC_TUNING.roll_rate = 0.7;
            FC.RC_TUNING.pitch_rate = 0.7;
            FC.RC_TUNING.yaw_rate = 0.7;
            FC.RC_TUNING.RC_EXPO = 0;
            FC.RC_TUNING.RC_PITCH_EXPO = 0;
            FC.RC_TUNING.RC_YAW_EXPO = 0;
            break;
    }
};

// Watch for rates type changes and set default values (only on an actual user change, not on initial mount)
watch(ratesType, (newType, oldType) => {
    if (oldType !== undefined && newType !== oldType) {
        setDefaultsForRatesType(newType);
    }
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
</script>

<style scoped>
.subtab-rates {
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

.background_paper {
    background: var(--surface-50, #fff);
    border: 1px solid var(--surface-400, #ccc);
    padding: 5px;
}

.rate_curve {
    position: relative;
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

@media all and (max-width: 900px) {
    .subtab-rates {
        flex-direction: column;
    }
}
</style>
