<template>
    <div class="subtab-filter">
        <div class="clear-both"></div>

        <!-- Filter Sliders -->
        <div id="slidersFilterBox" class="gui_box grey tuningFilterSliders">
            <table class="pid_titlebar">
                <thead>
                    <tr>
                        <th scope="col" class="sm-min"></th>
                        <th></th>
                        <th>{{ $t("pidTuningSliderHighFiltering") }}</th>
                        <th>{{ $t("pidTuningSliderDefaultFiltering") }}</th>
                        <th>{{ $t("pidTuningSliderLowFiltering") }}</th>
                        <th></th>
                    </tr>
                </thead>
            </table>

            <table class="sliderLabels">
                <tbody>
                    <tr class="xs sliderHeaders">
                        <td colspan="5">
                            <span>{{ $t("pidTuningGyroFilterSlider") }}</span>
                        </td>
                    </tr>
                    <tr class="sliderGyroFilter">
                        <td class="sm-min">
                            <span>{{ $t("pidTuningGyroFilterSlider") }}</span>
                        </td>
                        <td>
                            <output>{{ gyroFilterMultiplier.toFixed(2) }}</output>
                        </td>
                        <td colspan="3">
                            <input
                                type="range"
                                v-model.number="gyroFilterMultiplier"
                                min="0.1"
                                max="2.0"
                                step="0.05"
                                class="tuningSlider"
                            />
                        </td>
                        <td></td>
                    </tr>
                    <tr class="xs sliderHeaders">
                        <td colspan="5">
                            <span>{{ $t("pidTuningDTermFilterSlider") }}</span>
                        </td>
                    </tr>
                    <tr class="sliderDTermFilter">
                        <td class="sm-min">
                            <span>{{ $t("pidTuningDTermFilterSlider") }}</span>
                        </td>
                        <td>
                            <output>{{ dtermFilterMultiplier.toFixed(2) }}</output>
                        </td>
                        <td colspan="3">
                            <input
                                type="range"
                                v-model.number="dtermFilterMultiplier"
                                min="0.1"
                                max="2.0"
                                step="0.05"
                                class="tuningSlider"
                            />
                        </td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <!-- Danger Zone Warning -->
            <div v-if="filterSlidersInDangerZone" class="danger slidersWarning">
                <p v-html="$t('pidTuningSliderWarning')"></p>
            </div>
        </div>

        <!-- Two Column Layout -->
        <div class="cf_column two_columns">
            <!-- LEFT COLUMN: Profile independent Filter Settings -->
            <div class="gui_box grey pid_filter two_columns_first">
                <table class="pid_titlebar new_rates">
                    <thead>
                        <tr>
                            <th>{{ $t("pidTuningNonProfileFilterSettings") }}</th>
                            <td>
                                <span>{{ $t("pidTuningGyroFilterSlider") }}</span>
                                <select v-model.number="gyroSliderMode" class="sliderMode">
                                    <option :value="0">OFF</option>
                                    <option :value="1">ON</option>
                                </select>
                            </td>
                        </tr>
                    </thead>
                </table>

                <table class="filterTable compensation">
                    <tbody>
                        <!-- Gyro Lowpass Filters Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div>{{ $t("pidTuningGyroLowpassFiltersGroup") }}</div>
                                </div>
                            </th>
                        </tr>

                        <!-- Gyro Lowpass 1 -->
                        <tr class="gyroLowpass">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="gyroLowpassEnabled"
                                        v-model="gyroLowpassEnabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>{{ $t("pidTuningGyroLowpass") }}</span>

                                <span v-if="gyroLowpassEnabled" class="suboption gyroLowpassFilterModeGroup">
                                    <span class="inputValue">
                                        <select v-model.number="gyroLowpassMode">
                                            <option :value="0">{{ $t("pidTuningStatic") }}</option>
                                            <option :value="1">{{ $t("pidTuningDynamic") }}</option>
                                        </select>
                                    </span>
                                    <label>
                                        <span>{{ $t("pidTuningMode") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled && gyroLowpassMode === 0" class="suboption static">
                                    <input type="number" v-model.number="gyro_lowpass_hz" step="1" min="1" max="1000" />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequencyHz") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled && gyroLowpassMode === 1" class="suboption dynamic">
                                    <input
                                        type="number"
                                        v-model.number="gyro_lowpass_dyn_min_hz"
                                        step="1"
                                        min="1"
                                        max="1000"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningMinCutoffFrequencyHz") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled && gyroLowpassMode === 1" class="suboption dynamic">
                                    <input
                                        type="number"
                                        v-model.number="gyro_lowpass_dyn_max_hz"
                                        step="1"
                                        min="1"
                                        max="1000"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningMaxCutoffFrequencyHz") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled" class="suboption">
                                    <select v-model.number="gyro_lowpass_type">
                                        <option :value="0">{{ $t("pidTuningPT1") }}</option>
                                        <option :value="1">{{ $t("pidTuningBiquad") }}</option>
                                    </select>
                                    <label>
                                        <span>{{ $t("pidTuningFilterType") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Gyro Lowpass 2 -->
                        <tr class="gyroLowpass2">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="gyroLowpass2Enabled"
                                        v-model="gyroLowpass2Enabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>{{ $t("pidTuningGyroLowpass2") }}</span>

                                <span v-if="gyroLowpass2Enabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="gyro_lowpass2_hz"
                                        step="1"
                                        min="1"
                                        max="1000"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequencyHz") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpass2Enabled" class="suboption">
                                    <select v-model.number="gyro_lowpass2_type">
                                        <option :value="0">{{ $t("pidTuningPT1") }}</option>
                                        <option :value="1">{{ $t("pidTuningBiquad") }}</option>
                                    </select>
                                    <label>
                                        <span>{{ $t("pidTuningFilterType") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Gyro Notch Filters Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div>{{ $t("pidTuningGyroNotchFiltersGroup") }}</div>
                                </div>
                            </th>
                        </tr>

                        <!-- Gyro Notch Filter 1 -->
                        <tr class="newFilter gyroNotch1">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="gyroNotch1Enabled"
                                        v-model="gyroNotch1Enabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>Notch Filter 1</span>

                                <span v-if="gyroNotch1Enabled" class="suboption">
                                    <input type="number" v-model.number="gyro_notch_hz" step="1" min="1" max="16000" />
                                    <label>
                                        <span>Center Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="gyroNotch1Enabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="gyro_notch_cutoff"
                                        step="1"
                                        min="0"
                                        max="16000"
                                    />
                                    <label>
                                        <span>Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Gyro Notch Filter 2 -->
                        <tr class="newFilter gyroNotch2">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="gyroNotch2Enabled"
                                        v-model="gyroNotch2Enabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>Notch Filter 2</span>

                                <span v-if="gyroNotch2Enabled" class="suboption">
                                    <input type="number" v-model.number="gyro_notch2_hz" step="1" min="1" max="16000" />
                                    <label>
                                        <span>Center Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="gyroNotch2Enabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="gyro_notch2_cutoff"
                                        step="1"
                                        min="0"
                                        max="16000"
                                    />
                                    <label>
                                        <span>Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- RPM Filter Header -->
                        <tr v-if="dshotTelemetryEnabled" class="newFilter rpmFilter">
                            <th class="rpmFilter" colspan="2">
                                <div class="pid_mode rpmFilter">
                                    <div>Gyro RPM Filter</div>
                                </div>
                            </th>
                        </tr>

                        <!-- RPM Filter -->
                        <tr v-if="dshotTelemetryEnabled" class="newFilter rpmFilter">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="rpmFilterEnabled"
                                        v-model="rpmFilterEnabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>Gyro RPM Filter</span>

                                <span v-if="rpmFilterEnabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="gyro_rpm_notch_harmonics"
                                        step="1"
                                        min="1"
                                        max="3"
                                    />
                                    <label>
                                        <span>Gyro RPM Filter Harmonics Number</span>
                                    </label>
                                </span>

                                <span v-if="rpmFilterEnabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="gyro_rpm_notch_min_hz"
                                        step="1"
                                        min="50"
                                        max="200"
                                    />
                                    <label>
                                        <span>Gyro RPM Filter Min Frequency [Hz]</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Dynamic Notch Filter Header -->
                        <tr class="newFilter dynamicNotch">
                            <th class="dynamicNotch" colspan="2">
                                <div class="pid_mode dynamicNotch">
                                    <div>{{ $t("pidTuningDynamicNotchFilterGroup") }}</div>
                                </div>
                            </th>
                        </tr>

                        <!-- Dynamic Notch Filter -->
                        <tr class="newFilter dynamicNotch">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="dynamicNotchEnabled"
                                        v-model="dynamicNotchEnabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>Dynamic Notch Filter</span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <input type="number" v-model.number="dyn_notch_count" step="1" min="1" max="5" />
                                    <label>
                                        <span>Notch Count</span>
                                    </label>
                                </span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <input type="number" v-model.number="dyn_notch_q" step="1" min="1" max="1000" />
                                    <label>
                                        <span>Q Factor</span>
                                    </label>
                                </span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="dyn_notch_min_hz"
                                        step="1"
                                        min="60"
                                        max="250"
                                    />
                                    <label>
                                        <span>Min Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="dyn_notch_max_hz"
                                        step="1"
                                        min="200"
                                        max="1000"
                                    />
                                    <label>
                                        <span>Max Frequency [Hz]</span>
                                    </label>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- RIGHT COLUMN: Profile dependent Filter Settings -->
            <div class="gui_box grey pid_filter two_columns_second">
                <table class="pid_titlebar new_rates">
                    <thead>
                        <tr>
                            <th>{{ $t("pidTuningFilterSettings") }}</th>
                            <td>
                                <span>{{ $t("pidTuningDTermFilterSlider") }}</span>
                                <select v-model.number="dtermSliderMode" class="sliderMode">
                                    <option :value="0">OFF</option>
                                    <option :value="1">ON</option>
                                </select>
                            </td>
                        </tr>
                    </thead>
                </table>

                <table class="filterTable compensation">
                    <tbody>
                        <!-- D Term Lowpass Filters Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div>D Term Lowpass Filters</div>
                                </div>
                            </th>
                        </tr>

                        <!-- D Term Lowpass 1 -->
                        <tr class="dtermLowpass">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="dtermLowpassEnabled"
                                        v-model="dtermLowpassEnabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>D Term Lowpass</span>

                                <span v-if="dtermLowpassEnabled" class="suboption dtermLowpassFilterModeGroup">
                                    <span class="inputValue">
                                        <select v-model.number="dtermLowpassMode">
                                            <option :value="0">STATIC</option>
                                            <option :value="1">DYNAMIC</option>
                                        </select>
                                    </span>
                                    <label>
                                        <span>Mode</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 0" class="suboption static">
                                    <input
                                        type="number"
                                        v-model.number="dterm_lowpass_hz"
                                        step="1"
                                        min="1"
                                        max="1000"
                                    />
                                    <label>
                                        <span>Static Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 1" class="suboption dynamic">
                                    <input
                                        type="number"
                                        v-model.number="dterm_lowpass_dyn_min_hz"
                                        step="1"
                                        min="1"
                                        max="1000"
                                    />
                                    <label>
                                        <span>Min Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 1" class="suboption dynamic">
                                    <input
                                        type="number"
                                        v-model.number="dterm_lowpass_dyn_max_hz"
                                        step="10"
                                        min="200"
                                        max="2000"
                                    />
                                    <label>
                                        <span>Max Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 1" class="suboption dynamic">
                                    <input
                                        type="number"
                                        v-model.number="dyn_lpf_curve_expo"
                                        step="1"
                                        min="0"
                                        max="10"
                                    />
                                    <label>
                                        <span>Dynamic Curve Expo</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled" class="suboption">
                                    <select v-model.number="dterm_lowpass_type">
                                        <option :value="0">PT1</option>
                                        <option :value="1">BIQUAD</option>
                                    </select>
                                    <label>
                                        <span>Filter Type</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- D Term Lowpass 2 -->
                        <tr class="dtermLowpass2">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="dtermLowpass2Enabled"
                                        v-model="dtermLowpass2Enabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>D Term Lowpass 2</span>

                                <span v-if="dtermLowpass2Enabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="dterm_lowpass2_hz"
                                        step="1"
                                        min="1"
                                        max="1000"
                                    />
                                    <label>
                                        <span>Static Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpass2Enabled" class="suboption">
                                    <select v-model.number="dterm_lowpass2_type">
                                        <option :value="0">PT1</option>
                                        <option :value="1">BIQUAD</option>
                                    </select>
                                    <label>
                                        <span>Filter Type</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- D Term Notch Filter Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div>D Term Notch Filter</div>
                                </div>
                            </th>
                        </tr>

                        <!-- D Term Notch Filter -->
                        <tr class="newFilter dtermNotch">
                            <td>
                                <span class="inputSwitch">
                                    <input
                                        type="checkbox"
                                        id="dtermNotchEnabled"
                                        v-model="dtermNotchEnabled"
                                        class="toggle"
                                    />
                                </span>
                            </td>
                            <td colspan="2">
                                <span>D Term Notch Filter</span>

                                <span v-if="dtermNotchEnabled" class="suboption">
                                    <input type="number" v-model.number="dterm_notch_hz" step="1" min="1" max="16000" />
                                    <label>
                                        <span>Center Frequency [Hz]</span>
                                    </label>
                                </span>

                                <span v-if="dtermNotchEnabled" class="suboption">
                                    <input
                                        type="number"
                                        v-model.number="dterm_notch_cutoff"
                                        step="1"
                                        min="0"
                                        max="16000"
                                    />
                                    <label>
                                        <span>Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Yaw Lowpass Filter Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div>Yaw Lowpass Filter</div>
                                </div>
                            </th>
                        </tr>

                        <!-- Yaw Lowpass Filter -->
                        <tr class="yawLowpass">
                            <td colspan="3">
                                <span>Yaw Lowpass Filter</span>

                                <span class="suboption">
                                    <input type="number" v-model.number="yaw_lowpass_hz" step="1" min="0" max="500" />
                                    <label>
                                        <span>Static Cutoff Frequency [Hz]</span>
                                    </label>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import FC from "@/js/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";

// Store previous non-zero values AND mode to restore when re-enabling filters
const previousValues = ref({
    gyroLowpassHz: 100,
    gyroLowpassDynMin: 200,
    gyroLowpassDynMax: 500,
    lastGyroLowpassMode: 1, // 0 = static, 1 = dynamic
    gyroLowpass2Hz: 250,
    gyroNotch1Hz: 400,
    gyroNotch1Cutoff: 300,
    gyroNotch2Hz: 400,
    gyroNotch2Cutoff: 300,
    rpmFilterHarmonics: 1,
    dtermLowpassHz: 100,
    dtermLowpassDynMin: 100,
    dtermLowpassDynMax: 250,
    lastDtermLowpassMode: 1, // 0 = static, 1 = dynamic
    dtermLowpass2Hz: 250,
    dtermNotchHz: 260,
    dtermNotchCutoff: 160,
    dynNotchCount: 3, // Default dynamic notch count
    lastDynNotchMode: 1, // Track if dynamic notch was enabled
});

// Slider Modes (ON/OFF toggles for gyro and dterm sliders)
const gyroSliderMode = computed({
    get: () => FC.TUNING_SLIDERS.slider_gyro_filter_mode ?? 1,
    set: (value) => (FC.TUNING_SLIDERS.slider_gyro_filter_mode = value),
});

const dtermSliderMode = computed({
    get: () => FC.TUNING_SLIDERS.slider_dterm_filter_mode ?? 1,
    set: (value) => (FC.TUNING_SLIDERS.slider_dterm_filter_mode = value),
});

// Filter Sliders
// Note: slider_gyro_filter_multiplier is stored as 0-200 (100 = 1.0x)
// UI displays as 0.1-2.0 for user convenience
const gyroFilterMultiplier = computed({
    get: () => (FC.TUNING_SLIDERS.slider_gyro_filter_multiplier || 100) / 100,
    set: (value) => (FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = Math.round(value * 100)),
});

const dtermFilterMultiplier = computed({
    get: () => (FC.TUNING_SLIDERS.slider_dterm_filter_multiplier || 100) / 100,
    set: (value) => (FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = Math.round(value * 100)),
});

// Check if filter sliders are in danger zone (too little filtering)
const filterSlidersInDangerZone = computed(() => {
    const WARNING_FILTER_GYRO_LOW_GAIN = 0.45;
    const WARNING_FILTER_GYRO_HIGH_GAIN = 1.55;
    const WARNING_FILTER_DTERM_LOW_GAIN = 0.75;
    const WARNING_FILTER_DTERM_HIGH_GAIN = 1.25;

    return (
        gyroFilterMultiplier.value >= WARNING_FILTER_GYRO_HIGH_GAIN ||
        gyroFilterMultiplier.value <= WARNING_FILTER_GYRO_LOW_GAIN ||
        dtermFilterMultiplier.value >= WARNING_FILTER_DTERM_HIGH_GAIN ||
        dtermFilterMultiplier.value <= WARNING_FILTER_DTERM_LOW_GAIN
    );
});

// Gyro Lowpass Mode (0 = static, 1 = dynamic)
const gyroLowpassMode = computed({
    get: () => (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz !== 0 ? 1 : 0),
    set: (value) => {
        if (value === 1) {
            // Switch to dynamic - cache static value first
            if (FC.FILTER_CONFIG.gyro_lowpass_hz > 0) {
                previousValues.value.gyroLowpassHz = FC.FILTER_CONFIG.gyro_lowpass_hz;
            }
            FC.FILTER_CONFIG.gyro_lowpass_hz = 0;
            // Restore or initialize dynamic values
            if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz === 0) {
                FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = previousValues.value.gyroLowpassDynMin || 200;
                FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = previousValues.value.gyroLowpassDynMax || 500;
            }
        } else {
            // Switch to static - cache dynamic values first
            if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0) {
                previousValues.value.gyroLowpassDynMin = FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz;
                previousValues.value.gyroLowpassDynMax = FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz;
            }
            FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 0;
            FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = 0;
            // Restore or initialize static value
            if (FC.FILTER_CONFIG.gyro_lowpass_hz === 0) {
                FC.FILTER_CONFIG.gyro_lowpass_hz = previousValues.value.gyroLowpassHz || 100;
            }
        }
    },
});

// D-term Lowpass Mode (0 = static, 1 = dynamic)
const dtermLowpassMode = computed({
    get: () => (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz !== 0 ? 1 : 0),
    set: (value) => {
        if (value === 1) {
            // Switch to dynamic - cache static value first
            if (FC.FILTER_CONFIG.dterm_lowpass_hz > 0) {
                previousValues.value.dtermLowpassHz = FC.FILTER_CONFIG.dterm_lowpass_hz;
            }
            FC.FILTER_CONFIG.dterm_lowpass_hz = 0;
            // Restore or initialize dynamic values
            if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz === 0) {
                FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = previousValues.value.dtermLowpassDynMin || 100;
                FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = previousValues.value.dtermLowpassDynMax || 250;
            }
        } else {
            // Switch to static - cache dynamic values first
            if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0) {
                previousValues.value.dtermLowpassDynMin = FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz;
                previousValues.value.dtermLowpassDynMax = FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz;
            }
            FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = 0;
            FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = 0;
            // Restore or initialize static value
            if (FC.FILTER_CONFIG.dterm_lowpass_hz === 0) {
                FC.FILTER_CONFIG.dterm_lowpass_hz = previousValues.value.dtermLowpassHz || 100;
            }
        }
    },
});

// Gyro Lowpass
const gyroLowpassEnabled = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_hz !== 0 || FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore based on explicitly saved mode
            if (previousValues.value.lastGyroLowpassMode === 1) {
                // Restore dynamic mode
                FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = previousValues.value.gyroLowpassDynMin;
                FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = previousValues.value.gyroLowpassDynMax;
                FC.FILTER_CONFIG.gyro_lowpass_hz = 0;
            } else {
                // Restore static mode
                FC.FILTER_CONFIG.gyro_lowpass_hz = previousValues.value.gyroLowpassHz;
                FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 0;
                FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = 0;
            }
        } else {
            // Disabling: save current mode and values explicitly
            if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0) {
                previousValues.value.lastGyroLowpassMode = 1; // Was dynamic
                previousValues.value.gyroLowpassDynMin = FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz;
                previousValues.value.gyroLowpassDynMax = FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz;
            } else if (FC.FILTER_CONFIG.gyro_lowpass_hz > 0) {
                previousValues.value.lastGyroLowpassMode = 0; // Was static
                previousValues.value.gyroLowpassHz = FC.FILTER_CONFIG.gyro_lowpass_hz;
            }
            FC.FILTER_CONFIG.gyro_lowpass_hz = 0;
            FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 0;
            FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = 0;
        }
    },
});

const gyro_lowpass_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_hz = value),
});

const gyro_lowpass_type = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_type || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_type = value),
});

const gyro_lowpass_dyn_min_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = value),
});

const gyro_lowpass_dyn_max_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = value),
});

// Gyro Lowpass 2
const gyroLowpass2Enabled = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass2_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous value or use default
            FC.FILTER_CONFIG.gyro_lowpass2_hz = previousValues.value.gyroLowpass2Hz;
        } else {
            // Disabling: save current value before setting to 0
            if (FC.FILTER_CONFIG.gyro_lowpass2_hz > 0) {
                previousValues.value.gyroLowpass2Hz = FC.FILTER_CONFIG.gyro_lowpass2_hz;
            }
            FC.FILTER_CONFIG.gyro_lowpass2_hz = 0;
        }
    },
});

const gyro_lowpass2_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass2_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass2_hz = value),
});

const gyro_lowpass2_type = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass2_type || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass2_type = value),
});

// Gyro Notch Filters
const gyroNotch1Enabled = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous values or use defaults
            FC.FILTER_CONFIG.gyro_notch_hz = previousValues.value.gyroNotch1Hz;
            FC.FILTER_CONFIG.gyro_notch_cutoff = previousValues.value.gyroNotch1Cutoff;
        } else {
            // Disabling: save current values before setting to 0
            if (FC.FILTER_CONFIG.gyro_notch_hz > 0) {
                previousValues.value.gyroNotch1Hz = FC.FILTER_CONFIG.gyro_notch_hz;
            }
            if (FC.FILTER_CONFIG.gyro_notch_cutoff > 0) {
                previousValues.value.gyroNotch1Cutoff = FC.FILTER_CONFIG.gyro_notch_cutoff;
            }
            FC.FILTER_CONFIG.gyro_notch_hz = 0;
            FC.FILTER_CONFIG.gyro_notch_cutoff = 0;
        }
    },
});

const gyro_notch_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch_hz = value),
});

const gyro_notch_cutoff = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch_cutoff || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch_cutoff = value),
});

const gyroNotch2Enabled = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch2_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous values or use defaults
            FC.FILTER_CONFIG.gyro_notch2_hz = previousValues.value.gyroNotch2Hz;
            FC.FILTER_CONFIG.gyro_notch2_cutoff = previousValues.value.gyroNotch2Cutoff;
        } else {
            // Disabling: save current values before setting to 0
            if (FC.FILTER_CONFIG.gyro_notch2_hz > 0) {
                previousValues.value.gyroNotch2Hz = FC.FILTER_CONFIG.gyro_notch2_hz;
            }
            if (FC.FILTER_CONFIG.gyro_notch2_cutoff > 0) {
                previousValues.value.gyroNotch2Cutoff = FC.FILTER_CONFIG.gyro_notch2_cutoff;
            }
            FC.FILTER_CONFIG.gyro_notch2_hz = 0;
            FC.FILTER_CONFIG.gyro_notch2_cutoff = 0;
        }
    },
});

const gyro_notch2_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch2_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch2_hz = value),
});

const gyro_notch2_cutoff = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch2_cutoff || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch2_cutoff = value),
});

// RPM Filter
const dshotTelemetryEnabled = computed(() => FC.MOTOR_CONFIG.use_dshot_telemetry || false);

const rpmFilterEnabled = computed({
    get: () => FC.FILTER_CONFIG.gyro_rpm_notch_harmonics !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous harmonics value
            FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = previousValues.value.rpmFilterHarmonics;
        } else {
            // Disabling: save current harmonics value
            if (FC.FILTER_CONFIG.gyro_rpm_notch_harmonics > 0) {
                previousValues.value.rpmFilterHarmonics = FC.FILTER_CONFIG.gyro_rpm_notch_harmonics;
            }
            FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = 0;
        }
    },
});

const gyro_rpm_notch_harmonics = computed({
    get: () => FC.FILTER_CONFIG.gyro_rpm_notch_harmonics || 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = value),
});

const gyro_rpm_notch_min_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_rpm_notch_min_hz || 100,
    set: (value) => (FC.FILTER_CONFIG.gyro_rpm_notch_min_hz = value),
});

// Dynamic Notch Filter
const dynamicNotchEnabled = computed({
    get: () => FC.FILTER_CONFIG.dyn_notch_count !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous notch count
            FC.FILTER_CONFIG.dyn_notch_count = previousValues.value.dynNotchCount;
        } else {
            // Disabling: save current notch count
            if (FC.FILTER_CONFIG.dyn_notch_count > 0) {
                previousValues.value.dynNotchCount = FC.FILTER_CONFIG.dyn_notch_count;
            }
            FC.FILTER_CONFIG.dyn_notch_count = 0;
        }
    },
});

const dyn_notch_count = computed({
    get: () => FC.FILTER_CONFIG.dyn_notch_count || 0,
    set: (value) => (FC.FILTER_CONFIG.dyn_notch_count = value),
});

const dyn_notch_q = computed({
    get: () => FC.FILTER_CONFIG.dyn_notch_q || 120,
    set: (value) => (FC.FILTER_CONFIG.dyn_notch_q = value),
});

const dyn_notch_min_hz = computed({
    get: () => FC.FILTER_CONFIG.dyn_notch_min_hz || 150,
    set: (value) => (FC.FILTER_CONFIG.dyn_notch_min_hz = value),
});

const dyn_notch_max_hz = computed({
    get: () => FC.FILTER_CONFIG.dyn_notch_max_hz || 600,
    set: (value) => (FC.FILTER_CONFIG.dyn_notch_max_hz = value),
});

// D-term Lowpass
const dtermLowpassEnabled = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_hz !== 0 || FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore based on explicitly saved mode
            if (previousValues.value.lastDtermLowpassMode === 1) {
                // Restore dynamic mode
                FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = previousValues.value.dtermLowpassDynMin;
                FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = previousValues.value.dtermLowpassDynMax;
                FC.FILTER_CONFIG.dterm_lowpass_hz = 0;
            } else {
                // Restore static mode
                FC.FILTER_CONFIG.dterm_lowpass_hz = previousValues.value.dtermLowpassHz;
                FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = 0;
                FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = 0;
            }
        } else {
            // Disabling: save current mode and values explicitly
            if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0) {
                previousValues.value.lastDtermLowpassMode = 1; // Was dynamic
                previousValues.value.dtermLowpassDynMin = FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz;
                previousValues.value.dtermLowpassDynMax = FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz;
            } else if (FC.FILTER_CONFIG.dterm_lowpass_hz > 0) {
                previousValues.value.lastDtermLowpassMode = 0; // Was static
                previousValues.value.dtermLowpassHz = FC.FILTER_CONFIG.dterm_lowpass_hz;
            }
            FC.FILTER_CONFIG.dterm_lowpass_hz = 0;
            FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = 0;
            FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = 0;
        }
    },
});

const dterm_lowpass_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_hz = value),
});

const dterm_lowpass_type = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_type || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_type = value),
});

const dterm_lowpass_dyn_min_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = value),
});

const dterm_lowpass_dyn_max_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = value),
});

const dyn_lpf_curve_expo = computed({
    get: () => FC.FILTER_CONFIG.dyn_lpf_curve_expo ?? 5,
    set: (value) => (FC.FILTER_CONFIG.dyn_lpf_curve_expo = value),
});

// D-term Lowpass 2
const dtermLowpass2Enabled = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass2_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous value or use default
            FC.FILTER_CONFIG.dterm_lowpass2_hz = previousValues.value.dtermLowpass2Hz;
        } else {
            // Disabling: save current value before setting to 0
            if (FC.FILTER_CONFIG.dterm_lowpass2_hz > 0) {
                previousValues.value.dtermLowpass2Hz = FC.FILTER_CONFIG.dterm_lowpass2_hz;
            }
            FC.FILTER_CONFIG.dterm_lowpass2_hz = 0;
        }
    },
});

const dterm_lowpass2_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass2_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass2_hz = value),
});

const dterm_lowpass2_type = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass2_type || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass2_type = value),
});

// D-term Notch Filter
const dtermNotchEnabled = computed({
    get: () => FC.FILTER_CONFIG.dterm_notch_hz !== 0,
    set: (value) => {
        if (value) {
            // Re-enabling: restore previous values or use defaults
            FC.FILTER_CONFIG.dterm_notch_hz = previousValues.value.dtermNotchHz;
            FC.FILTER_CONFIG.dterm_notch_cutoff = previousValues.value.dtermNotchCutoff;
        } else {
            // Disabling: save current values before setting to 0
            if (FC.FILTER_CONFIG.dterm_notch_hz > 0) {
                previousValues.value.dtermNotchHz = FC.FILTER_CONFIG.dterm_notch_hz;
            }
            if (FC.FILTER_CONFIG.dterm_notch_cutoff > 0) {
                previousValues.value.dtermNotchCutoff = FC.FILTER_CONFIG.dterm_notch_cutoff;
            }
            FC.FILTER_CONFIG.dterm_notch_hz = 0;
            FC.FILTER_CONFIG.dterm_notch_cutoff = 0;
        }
    },
});

const dterm_notch_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_notch_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_notch_hz = value),
});

const dterm_notch_cutoff = computed({
    get: () => FC.FILTER_CONFIG.dterm_notch_cutoff || 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_notch_cutoff = value),
});

// Yaw Lowpass Filter
const yaw_lowpass_hz = computed({
    get: () => FC.FILTER_CONFIG.yaw_lowpass_hz || 0,
    set: (value) => (FC.FILTER_CONFIG.yaw_lowpass_hz = value),
});

// Flags to prevent recursive watcher triggers during MSP calculations
const isCalculatingGyroFilters = ref(false);
const isCalculatingDtermFilters = ref(false);

// Watchers for filter sliders to trigger MSP calculations
// When slider changes, send MSP command to firmware to calculate new filter values
watch(
    () => gyroFilterMultiplier.value,
    (newValue, oldValue) => {
        // Prevent recursive triggers
        if (isCalculatingGyroFilters.value) {
            return;
        }

        // Only trigger if value actually changed (avoid programmatic updates)
        if (Math.abs(newValue - oldValue) < 0.001) {
            return;
        }

        isCalculatingGyroFilters.value = true;

        // Update slider_gyro_filter to indicate slider is active
        FC.TUNING_SLIDERS.slider_gyro_filter = 1;

        // Send MSP command to calculate new gyro filter values based on multiplier
        // The firmware will multiply base filter frequencies by this multiplier
        MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO))
            .catch((error) => {
                console.error("Failed to calculate simplified gyro filters:", error);
            })
            .finally(() => {
                isCalculatingGyroFilters.value = false;
            });
    },
);

watch(
    () => dtermFilterMultiplier.value,
    (newValue, oldValue) => {
        // Prevent recursive triggers
        if (isCalculatingDtermFilters.value) {
            return;
        }

        // Only trigger if value actually changed (avoid programmatic updates)
        if (Math.abs(newValue - oldValue) < 0.001) {
            return;
        }

        isCalculatingDtermFilters.value = true;

        // Update slider_dterm_filter to indicate slider is active
        FC.TUNING_SLIDERS.slider_dterm_filter = 1;

        // Send MSP command to calculate new dterm filter values based on multiplier
        // The firmware will multiply base filter frequencies by this multiplier
        MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM))
            .catch((error) => {
                console.error("Failed to calculate simplified dterm filters:", error);
            })
            .finally(() => {
                isCalculatingDtermFilters.value = false;
            });
    },
);
</script>

<style scoped>
.subtab-filter {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.gui_box.grey {
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    padding: 15px;
    background: var(--surface-50);
}

.gui_box.grey h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: var(--text-primary);
    font-size: 16px;
}

.checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}

.checkbox input[type="checkbox"] {
    width: 16px;
    height: 16px;
}

.suboption {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 24px;
}

.suboption label {
    font-weight: 500;
    color: var(--text-primary);
    margin-top: 8px;
}

.suboption input[type="number"],
.suboption select {
    padding: 6px 10px;
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    background: var(--surface-0);
    color: var(--text-primary);
    max-width: 200px;
}

.slider-container {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

.slider-container label {
    min-width: 200px;
    font-weight: 500;
}

.tuningSlider {
    width: 100%;
    max-width: none;
}

.slider-container span {
    min-width: 50px;
    font-weight: bold;
    color: var(--accent-color);
}

.notch-filter {
    border-left: 2px solid var(--surface-300);
    padding-left: 12px;
    margin-bottom: 12px;
}

.notch-filter:last-child {
    margin-bottom: 0;
}
</style>
