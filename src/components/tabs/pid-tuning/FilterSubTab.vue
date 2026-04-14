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
                            <div class="helpicon cf_tip" :title="$t('pidTuningGyroFilterSliderHelp')"></div>
                        </td>
                    </tr>
                    <tr class="sliderGyroFilter" :class="{ disabledSliders: gyroSliderDisabled }">
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
                                :disabled="gyroSliderDisabled"
                            />
                        </td>
                        <td></td>
                    </tr>
                    <tr class="xs sliderHeaders">
                        <td colspan="5">
                            <span>{{ $t("pidTuningDTermFilterSlider") }}</span>
                            <div class="helpicon cf_tip" :title="$t('pidTuningDTermFilterSliderHelp')"></div>
                        </td>
                    </tr>
                    <tr class="sliderDTermFilter" :class="{ disabledSliders: dtermSliderDisabled }">
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
                                :disabled="dtermSliderDisabled"
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

            <!-- Non-expert mode range restriction note -->
            <div
                v-if="!props.expertMode && (gyroSliderMode || dtermSliderMode)"
                class="note expertSettingsDetectedNote nonExpertModeSlidersNote"
            >
                <p v-html="$t('pidTuningFilterSlidersNonExpertMode')"></p>
            </div>

            <!-- Expert settings detected warning -->
            <div
                v-if="showGyroExpertSettingsWarning || showDtermExpertSettingsWarning"
                class="note expertSettingsDetectedNote"
            >
                <p v-html="$t('pidTuningSlidersExpertSettingsDetectedNote')"></p>
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
                                    <option :value="0">{{ $t("pidTuningOptionOff") }}</option>
                                    <option :value="1">{{ $t("pidTuningOptionOn") }}</option>
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
                                    <div class="float-left" v-text="$t('pidTuningGyroLowpassFiltersGroup')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningGyroLowpassFilterHelp')"></div>
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
                                <div class="helpicon cf_tip" :title="$t('pidTuningGyroLowpassHelp')"></div>

                                <span v-if="gyroLowpassEnabled" class="suboption gyroLowpassFilterModeGroup">
                                    <span class="inputValue">
                                        <select v-model.number="gyroLowpassMode">
                                            <option :value="0">{{ $t("pidTuningLowpassStatic") }}</option>
                                            <option :value="1">{{ $t("pidTuningLowpassDynamic") }}</option>
                                        </select>
                                    </span>
                                    <label>
                                        <span>{{ $t("pidTuningGyroLowpassMode") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled && gyroLowpassMode === 0" class="suboption static">
                                    <UInputNumber
                                        v-model="gyro_lowpass_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="gyroInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled && gyroLowpassMode === 1" class="suboption dynamic">
                                    <UInputNumber
                                        v-model="gyro_lowpass_dyn_min_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="gyroInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningMinCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled && gyroLowpassMode === 1" class="suboption dynamic">
                                    <UInputNumber
                                        v-model="gyro_lowpass_dyn_max_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="gyroInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningMaxCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpassEnabled" class="suboption">
                                    <select v-model.number="gyro_lowpass_type">
                                        <option :value="0">PT1</option>
                                        <option :value="1">BIQUAD</option>
                                        <option :value="2">PT2</option>
                                        <option :value="3">PT3</option>
                                    </select>
                                    <label>
                                        <span>{{ $t("pidTuningLowpassFilterType") }}</span>
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
                                <div class="helpicon cf_tip" :title="$t('pidTuningGyroLowpass2Help')"></div>

                                <span v-if="gyroLowpass2Enabled" class="suboption">
                                    <UInputNumber
                                        v-model="gyro_lowpass2_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="gyroInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroLowpass2Enabled" class="suboption">
                                    <select v-model.number="gyro_lowpass2_type">
                                        <option :value="0">PT1</option>
                                        <option :value="1">BIQUAD</option>
                                        <option :value="2">PT2</option>
                                        <option :value="3">PT3</option>
                                    </select>
                                    <label>
                                        <span>{{ $t("pidTuningLowpassFilterType") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Gyro Notch Filters Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div class="float-left" v-text="$t('pidTuningGyroNotchFiltersGroup')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningNotchFilterHelp')"></div>
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
                                <span>{{ $t("pidTuningGyroNotchFilter") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningGyroNotchFilterHelp')"></div>

                                <span v-if="gyroNotch1Enabled" class="suboption">
                                    <UInputNumber v-model="gyro_notch_hz" :step="1" :min="1" :max="16000" />
                                    <label>
                                        <span>{{ $t("pidTuningCenterFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroNotch1Enabled" class="suboption">
                                    <UInputNumber v-model="gyro_notch_cutoff" :step="1" :min="0" :max="16000" />
                                    <label>
                                        <span>{{ $t("pidTuningCutoffFrequency") }}</span>
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
                                <span>{{ $t("pidTuningGyroNotchFilter2") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningGyroNotchFilter2Help')"></div>

                                <span v-if="gyroNotch2Enabled" class="suboption">
                                    <UInputNumber v-model="gyro_notch2_hz" :step="1" :min="1" :max="16000" />
                                    <label>
                                        <span>{{ $t("pidTuningCenterFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="gyroNotch2Enabled" class="suboption">
                                    <UInputNumber v-model="gyro_notch2_cutoff" :step="1" :min="0" :max="16000" />
                                    <label>
                                        <span>{{ $t("pidTuningCutoffFrequency") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- RPM Filter Header -->
                        <tr v-if="dshotTelemetryEnabled" class="newFilter rpmFilter">
                            <th class="rpmFilter" colspan="2">
                                <div class="pid_mode rpmFilter">
                                    <div class="float-left" v-text="$t('pidTuningRpmFilterGroup')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningRpmFilterHelp')"></div>
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
                                <span>{{ $t("pidTuningRpmFilterGroup") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningRpmFilterHelp')"></div>

                                <span v-if="rpmFilterEnabled" class="suboption">
                                    <UInputNumber v-model="gyro_rpm_notch_harmonics" :step="1" :min="1" :max="3" />
                                    <label>
                                        <span>{{ $t("pidTuningRpmHarmonics") }}</span>
                                    </label>
                                </span>

                                <span v-if="rpmFilterEnabled" class="suboption">
                                    <UInputNumber v-model="gyro_rpm_notch_min_hz" :step="1" :min="50" :max="200" />
                                    <label>
                                        <span>{{ $t("pidTuningRpmMinHz") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Dynamic Notch Filter Header -->
                        <tr class="newFilter dynamicNotch">
                            <th class="dynamicNotch" colspan="2">
                                <div class="pid_mode dynamicNotch">
                                    <div class="float-left" v-text="$t('pidTuningDynamicNotchFilterGroup')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningDynamicNotchFilterHelp')"></div>
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
                                <span>{{ $t("pidTuningDynamicNotchFilterGroup") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningDynamicNotchFilterHelp')"></div>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <UInputNumber v-model="dyn_notch_count" :step="1" :min="1" :max="5" />
                                    <label>
                                        <span>{{ $t("pidTuningDynamicNotchCount") }}</span>
                                    </label>
                                </span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <UInputNumber v-model="dyn_notch_q" :step="1" :min="1" :max="1000" />
                                    <label>
                                        <span>{{ $t("pidTuningDynamicNotchQ") }}</span>
                                    </label>
                                </span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <UInputNumber v-model="dyn_notch_min_hz" :step="1" :min="60" :max="250" />
                                    <label>
                                        <span>{{ $t("pidTuningDynamicNotchMinHz") }}</span>
                                    </label>
                                </span>

                                <span v-if="dynamicNotchEnabled" class="suboption">
                                    <UInputNumber v-model="dyn_notch_max_hz" :step="1" :min="200" :max="1000" />
                                    <label>
                                        <span>{{ $t("pidTuningDynamicNotchMaxHz") }}</span>
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
                                    <option :value="0">{{ $t("pidTuningOptionOff") }}</option>
                                    <option :value="1">{{ $t("pidTuningOptionOn") }}</option>
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
                                    <div class="float-left" v-text="$t('pidTuningDTermLowpassFiltersGroup')"></div>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningDTermLowpassFilterHelp')"></div>
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
                                <span>{{ $t("pidTuningDTermLowpass") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningDTermLowpassHelp')"></div>

                                <span v-if="dtermLowpassEnabled" class="suboption dtermLowpassFilterModeGroup">
                                    <span class="inputValue">
                                        <select v-model.number="dtermLowpassMode">
                                            <option :value="0">{{ $t("pidTuningLowpassStatic") }}</option>
                                            <option :value="1">{{ $t("pidTuningLowpassDynamic") }}</option>
                                        </select>
                                    </span>
                                    <label>
                                        <span>{{ $t("pidTuningGyroLowpassMode") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 0" class="suboption static">
                                    <UInputNumber
                                        v-model="dterm_lowpass_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="dtermInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 1" class="suboption dynamic">
                                    <UInputNumber
                                        v-model="dterm_lowpass_dyn_min_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="dtermInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningMinCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 1" class="suboption dynamic">
                                    <UInputNumber
                                        v-model="dterm_lowpass_dyn_max_hz"
                                        :step="10"
                                        :min="200"
                                        :max="2000"
                                        :disabled="dtermInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningMaxCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled && dtermLowpassMode === 1" class="suboption dynamic">
                                    <UInputNumber v-model="dyn_lpf_curve_expo" :step="1" :min="0" :max="10" />
                                    <label>
                                        <span>{{ $t("pidTuningDTermLowpassDynExpo") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpassEnabled" class="suboption">
                                    <select v-model.number="dterm_lowpass_type">
                                        <option :value="0">PT1</option>
                                        <option :value="1">BIQUAD</option>
                                        <option :value="2">PT2</option>
                                        <option :value="3">PT3</option>
                                    </select>
                                    <label>
                                        <span>{{ $t("pidTuningLowpassFilterType") }}</span>
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
                                <span>{{ $t("pidTuningDTermLowpass2") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningDTermLowpass2Help')"></div>

                                <span v-if="dtermLowpass2Enabled" class="suboption">
                                    <UInputNumber
                                        v-model="dterm_lowpass2_hz"
                                        :step="1"
                                        :min="1"
                                        :max="1000"
                                        :disabled="dtermInputsDisabled"
                                    />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermLowpass2Enabled" class="suboption">
                                    <select v-model.number="dterm_lowpass2_type">
                                        <option :value="0">PT1</option>
                                        <option :value="1">BIQUAD</option>
                                        <option :value="2">PT2</option>
                                        <option :value="3">PT3</option>
                                    </select>
                                    <label>
                                        <span>{{ $t("pidTuningLowpassFilterType") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- D Term Notch Filter Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div class="float-left" v-text="$t('pidTuningDTermNotchFiltersGroup')"></div>
                                    <div
                                        class="helpicon cf_tip"
                                        :title="$t('pidTuningDTermNotchFiltersGroupHelp')"
                                    ></div>
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
                                <span>{{ $t("pidTuningDTermNotchFiltersGroup") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningDTermNotchFiltersGroupHelp')"></div>

                                <span v-if="dtermNotchEnabled" class="suboption">
                                    <UInputNumber v-model="dterm_notch_hz" :step="1" :min="1" :max="16000" />
                                    <label>
                                        <span>{{ $t("pidTuningCenterFrequency") }}</span>
                                    </label>
                                </span>

                                <span v-if="dtermNotchEnabled" class="suboption">
                                    <UInputNumber v-model="dterm_notch_cutoff" :step="1" :min="0" :max="16000" />
                                    <label>
                                        <span>{{ $t("pidTuningCutoffFrequency") }}</span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Yaw Lowpass Filter Header -->
                        <tr>
                            <th colspan="2">
                                <div class="pid_mode">
                                    <div class="float-left" v-text="$t('pidTuningYawLowpassFiltersGroup')"></div>
                                    <div
                                        class="helpicon cf_tip"
                                        :title="$t('pidTuningYawLowpassFiltersGroupHelp')"
                                    ></div>
                                </div>
                            </th>
                        </tr>

                        <!-- Yaw Lowpass Filter -->
                        <tr class="yawLowpass">
                            <td colspan="3">
                                <span>{{ $t("pidTuningYawLowpassFiltersGroup") }}</span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningYawLowpassFiltersGroupHelp')"></div>

                                <span class="suboption">
                                    <UInputNumber v-model="yaw_lowpass_hz" :step="1" :min="0" :max="500" />
                                    <label>
                                        <span>{{ $t("pidTuningStaticCutoffFrequency") }}</span>
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
import {
    NON_EXPERT_SLIDER_MIN_GYRO,
    NON_EXPERT_SLIDER_MAX_GYRO,
    NON_EXPERT_SLIDER_MIN_DTERM,
    NON_EXPERT_SLIDER_MAX_DTERM,
} from "@/composables/useTuningSliders";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";

const props = defineProps({
    expertMode: {
        type: Boolean,
        default: true,
    },
});

const emit = defineEmits(["change"]);

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
// Uses the MSP-backed fields slider_gyro_filter / slider_dterm_filter (see fc.js, MSPHelper.js)
const gyroSliderMode = computed({
    get: () => FC.TUNING_SLIDERS.slider_gyro_filter ?? 1,
    set: (value) => (FC.TUNING_SLIDERS.slider_gyro_filter = value),
});

const dtermSliderMode = computed({
    get: () => FC.TUNING_SLIDERS.slider_dterm_filter ?? 1,
    set: (value) => (FC.TUNING_SLIDERS.slider_dterm_filter = value),
});

// Filter Sliders
// Local refs for slider positions — decoupled from FC state so MSP responses
// writing back to FC.TUNING_SLIDERS don't cause the slider to bounce.
const gyroFilterMultiplier = ref((FC.TUNING_SLIDERS.slider_gyro_filter_multiplier || 100) / 100);
const dtermFilterMultiplier = ref((FC.TUNING_SLIDERS.slider_dterm_filter_multiplier || 100) / 100);

// Guard flag — prevents watchers from firing MSP calls during programmatic updates
// (matches isUserInteracting pattern in PidSubTab.vue)
let isUpdatingSliders = false;

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

// Gyro slider outside expert mode range — matches original updateExpertModeFilterSlidersDisplay()
const gyroSliderOutsideExpertRange = computed(() => {
    const multInt = Math.round(gyroFilterMultiplier.value * 100);
    return (multInt < NON_EXPERT_SLIDER_MIN_GYRO || multInt > NON_EXPERT_SLIDER_MAX_GYRO) && !props.expertMode;
});

const dtermSliderOutsideExpertRange = computed(() => {
    const multInt = Math.round(dtermFilterMultiplier.value * 100);
    return (multInt < NON_EXPERT_SLIDER_MIN_DTERM || multInt > NON_EXPERT_SLIDER_MAX_DTERM) && !props.expertMode;
});

// Gyro lowpass all-disabled check
const gyroLowPassAllDisabled = computed(
    () =>
        FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz === 0 &&
        FC.FILTER_CONFIG.gyro_lowpass_hz === 0 &&
        FC.FILTER_CONFIG.gyro_lowpass2_hz === 0,
);
const dtermLowPassAllDisabled = computed(
    () =>
        FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz === 0 &&
        FC.FILTER_CONFIG.dterm_lowpass_hz === 0 &&
        FC.FILTER_CONFIG.dterm_lowpass2_hz === 0,
);

// Filter slider disabled states — matches original updateGyroFilterSliderDisplay / updateDTermFilterSliderDisplay
const gyroSliderDisabled = computed(
    () => !gyroSliderMode.value || gyroSliderOutsideExpertRange.value || gyroLowPassAllDisabled.value,
);
const dtermSliderDisabled = computed(
    () => !dtermSliderMode.value || dtermSliderOutsideExpertRange.value || dtermLowPassAllDisabled.value,
);

// Disable filter frequency inputs when respective slider mode is ON
// Matches original: gyroLowpassFrequency.prop("disabled", this.sliderGyroFilter)
const gyroInputsDisabled = computed(() => gyroSliderMode.value === 1);
const dtermInputsDisabled = computed(() => dtermSliderMode.value === 1);

// Show expert settings detected note
const showGyroExpertSettingsWarning = computed(() => gyroSliderOutsideExpertRange.value);
const showDtermExpertSettingsWarning = computed(() => dtermSliderOutsideExpertRange.value);

// Gyro Lowpass Mode (0 = static, 1 = dynamic)
const gyroLowpassMode = computed({
    get: () => (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz === 0 ? 0 : 1),
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
    get: () => (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz === 0 ? 0 : 1),
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
    get: () => FC.FILTER_CONFIG.gyro_lowpass_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_hz = value),
});

const gyro_lowpass_type = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_type ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_type = value),
});

const gyro_lowpass_dyn_min_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = value),
});

const gyro_lowpass_dyn_max_hz = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz ?? 0,
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
    get: () => FC.FILTER_CONFIG.gyro_lowpass2_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_lowpass2_hz = value),
});

const gyro_lowpass2_type = computed({
    get: () => FC.FILTER_CONFIG.gyro_lowpass2_type ?? 0,
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
    get: () => FC.FILTER_CONFIG.gyro_notch_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch_hz = value),
});

const gyro_notch_cutoff = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch_cutoff ?? 0,
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
    get: () => FC.FILTER_CONFIG.gyro_notch2_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch2_hz = value),
});

const gyro_notch2_cutoff = computed({
    get: () => FC.FILTER_CONFIG.gyro_notch2_cutoff ?? 0,
    set: (value) => (FC.FILTER_CONFIG.gyro_notch2_cutoff = value),
});

// RPM Filter
const dshotTelemetryEnabled = computed(() => FC.MOTOR_CONFIG.use_dshot_telemetry ?? false);

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
    get: () => FC.FILTER_CONFIG.gyro_rpm_notch_harmonics ?? 0,
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
    get: () => FC.FILTER_CONFIG.dyn_notch_count ?? 0,
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
    get: () => FC.FILTER_CONFIG.dterm_lowpass_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_hz = value),
});

const dterm_lowpass_type = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_type ?? 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_type = value),
});

const dterm_lowpass_dyn_min_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = value),
});

const dterm_lowpass_dyn_max_hz = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz ?? 0,
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
    get: () => FC.FILTER_CONFIG.dterm_lowpass2_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_lowpass2_hz = value),
});

const dterm_lowpass2_type = computed({
    get: () => FC.FILTER_CONFIG.dterm_lowpass2_type ?? 0,
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
    get: () => FC.FILTER_CONFIG.dterm_notch_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_notch_hz = value),
});

const dterm_notch_cutoff = computed({
    get: () => FC.FILTER_CONFIG.dterm_notch_cutoff ?? 0,
    set: (value) => (FC.FILTER_CONFIG.dterm_notch_cutoff = value),
});

// Yaw Lowpass Filter
const yaw_lowpass_hz = computed({
    get: () => FC.FILTER_CONFIG.yaw_lowpass_hz ?? 0,
    set: (value) => (FC.FILTER_CONFIG.yaw_lowpass_hz = value),
});

// Watchers for filter sliders to trigger MSP calculations
// Master fires MSP directly on every input — MSP's serial queue handles sequencing
watch(gyroFilterMultiplier, (newValue, oldValue) => {
    if (isUpdatingSliders) {
        return;
    }

    // Clamp to safe zone in non-expert mode (matches original pid_tuning.js)
    if (!props.expertMode) {
        const min = NON_EXPERT_SLIDER_MIN_GYRO / 100;
        const max = NON_EXPERT_SLIDER_MAX_GYRO / 100;
        if (newValue > max) {
            gyroFilterMultiplier.value = max;
            return;
        }
        if (newValue < min) {
            gyroFilterMultiplier.value = min;
            return;
        }
    }

    if (Math.abs(newValue - oldValue) < 0.001) {
        return;
    }

    // Sync local slider position → FC state before MSP send (like master)
    FC.TUNING_SLIDERS.slider_gyro_filter = 1;
    FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = Math.round(newValue * 100);

    MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO))
        .then(() => emit("change"))
        .catch((error) => {
            console.error("Failed to calculate simplified gyro filters:", error);
        });
});

watch(dtermFilterMultiplier, (newValue, oldValue) => {
    if (isUpdatingSliders) {
        return;
    }

    // Clamp to safe zone in non-expert mode (matches original pid_tuning.js)
    if (!props.expertMode) {
        const min = NON_EXPERT_SLIDER_MIN_DTERM / 100;
        const max = NON_EXPERT_SLIDER_MAX_DTERM / 100;
        if (newValue > max) {
            dtermFilterMultiplier.value = max;
            return;
        }
        if (newValue < min) {
            dtermFilterMultiplier.value = min;
            return;
        }
    }

    if (Math.abs(newValue - oldValue) < 0.001) {
        return;
    }

    // Sync local slider position → FC state before MSP send (like master)
    FC.TUNING_SLIDERS.slider_dterm_filter = 1;
    FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = Math.round(newValue * 100);

    MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM))
        .then(() => emit("change"))
        .catch((error) => {
            console.error("Failed to calculate simplified dterm filters:", error);
        });
});

watch(
    () => JSON.stringify(FC.FILTER_CONFIG),
    () => emit("change"),
);

// Re-sync local slider refs from FC state (called by parent after loadData/refresh)
function forceUpdateSliders() {
    isUpdatingSliders = true;
    gyroFilterMultiplier.value = (FC.TUNING_SLIDERS.slider_gyro_filter_multiplier || 100) / 100;
    dtermFilterMultiplier.value = (FC.TUNING_SLIDERS.slider_dterm_filter_multiplier || 100) / 100;
    isUpdatingSliders = false;
}

defineExpose({
    forceUpdateSliders,
});
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

.suboption :deep(input),
.suboption select {
    padding: 6px 10px;
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    background: var(--surface-0);
    color: var(--text-primary);
    min-width: fit-content;
    width: auto;
    max-width: none;
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
