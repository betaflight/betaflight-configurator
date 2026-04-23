<template>
    <div class="p-5 flex flex-col gap-5">
        <!-- Filter Sliders -->
        <UiBox type="neutral">
            <!-- Scale labels above sliders — aligned with the slider column -->
            <div class="flex items-center gap-3">
                <div class="shrink-0 invisible" style="width: 40px"></div>
                <div class="min-w-32 shrink-0"></div>
                <span class="min-w-10"></span>
                <div class="flex-1 flex justify-between text-xs text-dimmed">
                    <span>{{ $t("pidTuningSliderHighFiltering") }}</span>
                    <span>{{ $t("pidTuningSliderDefaultFiltering") }}</span>
                    <span>{{ $t("pidTuningSliderLowFiltering") }}</span>
                </div>
                <div class="invisible"><HelpIcon text="" /></div>
            </div>

            <!-- Gyro Filter Slider -->
            <div class="flex items-center gap-3 py-1">
                <USwitch v-model="gyroSliderEnabled" size="sm" />
                <div class="min-w-32 text-xs shrink-0" v-html="$t('pidTuningGyroFilterSlider')"></div>
                <span class="min-w-10 text-center text-sm font-semibold">{{ gyroFilterMultiplier.toFixed(2) }}</span>
                <USlider
                    v-model="gyroFilterMultiplier"
                    :min="0.1"
                    :max="2.0"
                    :step="0.05"
                    :disabled="gyroSliderDisabled"
                    class="flex-1"
                />
                <HelpIcon :text="$t('pidTuningGyroFilterSliderHelp')" />
            </div>

            <!-- DTerm Filter Slider -->
            <div class="flex items-center gap-3 py-1">
                <USwitch v-model="dtermSliderEnabled" size="sm" />
                <div class="min-w-32 text-xs shrink-0" v-html="$t('pidTuningDTermFilterSlider')"></div>
                <span class="min-w-10 text-center text-sm font-semibold">{{ dtermFilterMultiplier.toFixed(2) }}</span>
                <USlider
                    v-model="dtermFilterMultiplier"
                    :min="0.1"
                    :max="2.0"
                    :step="0.05"
                    :disabled="dtermSliderDisabled"
                    class="flex-1"
                />
                <HelpIcon :text="$t('pidTuningDTermFilterSliderHelp')" />
            </div>

            <!-- Danger Zone Warning -->
            <UiBox v-if="filterSlidersInDangerZone" type="error" highlight>
                <p v-html="$t('pidTuningSliderWarning')"></p>
            </UiBox>

            <!-- Non-expert mode range restriction note -->
            <UiBox v-if="!props.expertMode && (gyroSliderMode || dtermSliderMode)" type="warning" highlight>
                <p v-html="$t('pidTuningFilterSlidersNonExpertMode')"></p>
            </UiBox>

            <!-- Expert settings detected warning -->
            <UiBox v-if="showGyroExpertSettingsWarning || showDtermExpertSettingsWarning" type="warning" highlight>
                <p v-html="$t('pidTuningSlidersExpertSettingsDetectedNote')"></p>
            </UiBox>
        </UiBox>

        <!-- Two Column Layout -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- LEFT COLUMN: Non-Profile Filter Settings -->
            <UiBox :title="$t('pidTuningNonProfileFilterSettings')" type="neutral">
                <!-- Gyro Lowpass Filters Section -->
                <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                    <span>{{ $t("pidTuningGyroLowpassFiltersGroup") }}</span>
                    <HelpIcon :text="$t('pidTuningGyroLowpassFilterHelp')" />
                </div>

                <!-- Gyro Lowpass 1 -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningGyroLowpass')" :help="$t('pidTuningGyroLowpassHelp')">
                        <USwitch v-model="gyroLowpassEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="gyroLowpassEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningGyroLowpassMode") }}</span>
                            <USelect v-model="gyroLowpassMode" :items="lowpassModeItems" class="w-28" />
                        </div>
                        <div v-if="gyroLowpassMode === 0" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_lowpass_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="gyroInputsDisabled"
                            />
                        </div>
                        <div v-if="gyroLowpassMode === 1" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningMinCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_lowpass_dyn_min_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="gyroInputsDisabled"
                            />
                        </div>
                        <div v-if="gyroLowpassMode === 1" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningMaxCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_lowpass_dyn_max_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="gyroInputsDisabled"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningLowpassFilterType") }}</span>
                            <USelect v-model="gyro_lowpass_type" :items="filterTypeItems" class="w-24" />
                        </div>
                    </div>
                </div>

                <!-- Gyro Lowpass 2 -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningGyroLowpass2')" :help="$t('pidTuningGyroLowpass2Help')">
                        <USwitch v-model="gyroLowpass2Enabled" size="sm" />
                    </SettingRow>
                    <div v-if="gyroLowpass2Enabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_lowpass2_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="gyroInputsDisabled"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningLowpassFilterType") }}</span>
                            <USelect v-model="gyro_lowpass2_type" :items="filterTypeItems" class="w-24" />
                        </div>
                    </div>
                </div>

                <!-- Gyro Notch Filters Section -->
                <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                    <span>{{ $t("pidTuningGyroNotchFiltersGroup") }}</span>
                    <HelpIcon :text="$t('pidTuningNotchFilterHelp')" />
                </div>

                <!-- Gyro Notch Filter 1 -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningGyroNotchFilter')" :help="$t('pidTuningGyroNotchFilterHelp')">
                        <USwitch v-model="gyroNotch1Enabled" size="sm" />
                    </SettingRow>
                    <div v-if="gyroNotch1Enabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningCenterFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_notch_hz"
                                :step="1"
                                :min="1"
                                :max="16000"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_notch_cutoff"
                                :step="1"
                                :min="0"
                                :max="16000"
                            />
                        </div>
                    </div>
                </div>

                <!-- Gyro Notch Filter 2 -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningGyroNotchFilter2')" :help="$t('pidTuningGyroNotchFilter2Help')">
                        <USwitch v-model="gyroNotch2Enabled" size="sm" />
                    </SettingRow>
                    <div v-if="gyroNotch2Enabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningCenterFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_notch2_hz"
                                :step="1"
                                :min="1"
                                :max="16000"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="gyro_notch2_cutoff"
                                :step="1"
                                :min="0"
                                :max="16000"
                            />
                        </div>
                    </div>
                </div>

                <!-- RPM Filter Section -->
                <template v-if="dshotTelemetryEnabled">
                    <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                        <span>{{ $t("pidTuningRpmFilterGroup") }}</span>
                        <HelpIcon :text="$t('pidTuningRpmFilterHelp')" />
                    </div>

                    <div class="flex flex-col gap-2">
                        <SettingRow :label="$t('pidTuningRpmFilterGroup')" :help="$t('pidTuningRpmFilterHelp')">
                            <USwitch v-model="rpmFilterEnabled" size="sm" />
                        </SettingRow>
                        <div v-if="rpmFilterEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                            <div class="flex flex-col gap-1">
                                <span class="text-xs text-dimmed">{{ $t("pidTuningRpmHarmonics") }}</span>
                                <UInputNumber
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                    v-model="gyro_rpm_notch_harmonics"
                                    :step="1"
                                    :min="1"
                                    :max="3"
                                />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="text-xs text-dimmed">{{ $t("pidTuningRpmMinHz") }}</span>
                                <UInputNumber
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                    v-model="gyro_rpm_notch_min_hz"
                                    :step="1"
                                    :min="50"
                                    :max="200"
                                />
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Dynamic Notch Filter Section -->
                <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                    <span>{{ $t("pidTuningDynamicNotchFilterGroup") }}</span>
                    <HelpIcon :text="$t('pidTuningDynamicNotchFilterHelp')" />
                </div>

                <div class="flex flex-col gap-2">
                    <SettingRow
                        :label="$t('pidTuningDynamicNotchFilterGroup')"
                        :help="$t('pidTuningDynamicNotchFilterHelp')"
                    >
                        <USwitch v-model="dynamicNotchEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="dynamicNotchEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningDynamicNotchCount") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                                v-model="dyn_notch_count"
                                :step="1"
                                :min="1"
                                :max="5"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningDynamicNotchQ") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dyn_notch_q"
                                :step="1"
                                :min="1"
                                :max="1000"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningDynamicNotchMinHz") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                                v-model="dyn_notch_min_hz"
                                :step="1"
                                :min="60"
                                :max="250"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningDynamicNotchMaxHz") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dyn_notch_max_hz"
                                :step="1"
                                :min="200"
                                :max="1000"
                            />
                        </div>
                    </div>
                </div>
            </UiBox>

            <!-- RIGHT COLUMN: Profile-dependent Filter Settings -->
            <UiBox :title="$t('pidTuningFilterSettings')" type="neutral">
                <!-- D-Term Lowpass Filters Section -->
                <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                    <span>{{ $t("pidTuningDTermLowpassFiltersGroup") }}</span>
                    <HelpIcon :text="$t('pidTuningDTermLowpassFilterHelp')" />
                </div>

                <!-- DTerm Lowpass 1 -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningDTermLowpass')" :help="$t('pidTuningDTermLowpassHelp')">
                        <USwitch v-model="dtermLowpassEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="dtermLowpassEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningGyroLowpassMode") }}</span>
                            <USelect v-model="dtermLowpassMode" :items="lowpassModeItems" class="w-28" />
                        </div>
                        <div v-if="dtermLowpassMode === 0" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dterm_lowpass_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="dtermInputsDisabled"
                            />
                        </div>
                        <div v-if="dtermLowpassMode === 1" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningMinCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dterm_lowpass_dyn_min_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="dtermInputsDisabled"
                            />
                        </div>
                        <div v-if="dtermLowpassMode === 1" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningMaxCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dterm_lowpass_dyn_max_hz"
                                :step="10"
                                :min="200"
                                :max="2000"
                                :disabled="dtermInputsDisabled"
                            />
                        </div>
                        <div v-if="dtermLowpassMode === 1" class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningDTermLowpassDynExpo") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                                v-model="dyn_lpf_curve_expo"
                                :step="1"
                                :min="0"
                                :max="10"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningLowpassFilterType") }}</span>
                            <USelect v-model="dterm_lowpass_type" :items="filterTypeItems" class="w-24" />
                        </div>
                    </div>
                </div>

                <!-- DTerm Lowpass 2 -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningDTermLowpass2')" :help="$t('pidTuningDTermLowpass2Help')">
                        <USwitch v-model="dtermLowpass2Enabled" size="sm" />
                    </SettingRow>
                    <div v-if="dtermLowpass2Enabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dterm_lowpass2_hz"
                                :step="1"
                                :min="1"
                                :max="1000"
                                :disabled="dtermInputsDisabled"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningLowpassFilterType") }}</span>
                            <USelect v-model="dterm_lowpass2_type" :items="filterTypeItems" class="w-24" />
                        </div>
                    </div>
                </div>

                <!-- D-Term Notch Filter Section -->
                <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                    <span>{{ $t("pidTuningDTermNotchFiltersGroup") }}</span>
                    <HelpIcon :text="$t('pidTuningDTermNotchFiltersGroupHelp')" />
                </div>

                <div class="flex flex-col gap-2">
                    <SettingRow
                        :label="$t('pidTuningDTermNotchFiltersGroup')"
                        :help="$t('pidTuningDTermNotchFiltersGroupHelp')"
                    >
                        <USwitch v-model="dtermNotchEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="dtermNotchEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningCenterFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dterm_notch_hz"
                                :step="1"
                                :min="1"
                                :max="16000"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                                v-model="dterm_notch_cutoff"
                                :step="1"
                                :min="0"
                                :max="16000"
                            />
                        </div>
                    </div>
                </div>

                <!-- Yaw Lowpass Filter Section -->
                <div class="flex items-center gap-2 font-semibold text-sm border-b border-default pb-1 mt-2">
                    <span>{{ $t("pidTuningYawLowpassFiltersGroup") }}</span>
                    <HelpIcon :text="$t('pidTuningYawLowpassFiltersGroupHelp')" />
                </div>

                <div class="flex flex-col gap-2">
                    <SettingRow
                        :label="$t('pidTuningYawLowpassFiltersGroup')"
                        :help="$t('pidTuningYawLowpassFiltersGroupHelp')"
                    >
                        <USwitch v-model="yawLowpassEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="yawLowpassEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed">{{ $t("pidTuningStaticCutoffFrequency") }}</span>
                            <UInputNumber
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                                v-model="yaw_lowpass_hz"
                                :step="1"
                                :min="1"
                                :max="500"
                            />
                        </div>
                    </div>
                </div>
            </UiBox>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useTranslation } from "i18next-vue";
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
import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import SettingRow from "@/components/elements/SettingRow.vue";

const { t } = useTranslation();

const props = defineProps({
    expertMode: {
        type: Boolean,
        default: true,
    },
});

const emit = defineEmits(["change"]);

// USelect item arrays
const lowpassModeItems = computed(() => [
    { value: 0, label: t("pidTuningLowpassStatic") },
    { value: 1, label: t("pidTuningLowpassDynamic") },
]);

const filterTypeItems = [
    { value: 0, label: "PT1" },
    { value: 1, label: "BIQUAD" },
    { value: 2, label: "PT2" },
    { value: 3, label: "PT3" },
];

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
    yawLowpassHz: 100,
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

// Boolean wrappers for USwitch binding
const gyroSliderEnabled = computed({
    get: () => gyroSliderMode.value === 1,
    set: (value) => (gyroSliderMode.value = value ? 1 : 0),
});

const dtermSliderEnabled = computed({
    get: () => dtermSliderMode.value === 1,
    set: (value) => (dtermSliderMode.value = value ? 1 : 0),
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
const yawLowpassEnabled = computed({
    get: () => FC.FILTER_CONFIG.yaw_lowpass_hz !== 0,
    set: (value) => {
        if (value) {
            FC.FILTER_CONFIG.yaw_lowpass_hz = previousValues.value.yawLowpassHz;
        } else {
            if (FC.FILTER_CONFIG.yaw_lowpass_hz > 0) {
                previousValues.value.yawLowpassHz = FC.FILTER_CONFIG.yaw_lowpass_hz;
            }
            FC.FILTER_CONFIG.yaw_lowpass_hz = 0;
        }
    },
});

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

watch(gyroSliderMode, () => emit("change"));
watch(dtermSliderMode, () => emit("change"));

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
