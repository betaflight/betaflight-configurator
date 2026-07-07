<template>
    <div class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- SAS Table -->
        <UiBox :title="$t('psasMainSettings')" type="neutral">
            <span class="text-sm font-semibold" v-html="$t('psasTuningMainGainsGroup')"></span>
            <div class="grid grid-cols-[3rem_repeat(3,minmax(4rem,auto))] gap-x-3 gap-y-1 items-center min-w-0">
                <!-- Header -->
                <div></div>
                <div class="flex items-center justify-center gap-0.5 text-xs">
                    <span v-html="$t('psasTuningPilot')"></span>
                    <HelpIcon :text="$t('psasTuningPilotHelp')" />
                </div>
                <div class="flex items-center justify-center gap-0.5 text-xs">
                    <span v-html="$t('psasTuningDamping')"></span>
                    <HelpIcon :text="$t('psasTuningDampingHelp')" />
                </div>
                <div class="flex items-center justify-center gap-0.5 text-xs">
                    <span v-html="$t('psasTuningStability')"></span>
                    <HelpIcon :text="$t('psasTuningStabilityHelp')" />
                </div>

                <!-- ROLL -->
                <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">ROLL</div>

                <UInputNumber
                    v-model="psasRollPilot"
                    :step="1"
                    :min="5"
                    :max="200"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <UInputNumber
                    v-model="psasRollDamping"
                    :step="1"
                    :min="0"
                    :max="255"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <div>-</div>

                <!-- PITCH -->
                <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">PITCH</div>
                <UInputNumber
                    v-model="psasPitchPilot"
                    :step="1"
                    :min="5"
                    :max="255"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <UInputNumber
                    v-model="psasPitchDamping"
                    :step="1"
                    :min="0"
                    :max="1000"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <UInputNumber
                    v-model="psasPitchStability"
                    :step="1"
                    :min="0"
                    :max="300"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <!-- YAW -->
                <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">YAW</div>
                <UInputNumber
                    v-model="psasYawPilot"
                    :step="1"
                    :min="0"
                    :max="200"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <UInputNumber
                    v-model="psasYawDamping"
                    :step="1"
                    :min="0"
                    :max="1000"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />

                <UInputNumber
                    v-model="psasYawStability"
                    :step="1"
                    :min="0"
                    :max="300"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />
            </div>
            <span class="text-sm font-semibold" v-html="$t('psasTuningMainFiltersGroup')"></span>
            <div class="grid grid-cols-[2rem_repeat(2,minmax(4rem,auto))] gap-x-3 gap-y-1 items-center min-w-0">
                <!-- Header -->
                <div></div>
                <div class="flex items-center justify-center gap-0.5 text-xs">
                    <span v-html="$t('psasTuningMainGyroFilters')"></span>
                    <HelpIcon :text="$t('psasTuningMainGyroFiltersHelp')" />
                </div>
                <div class="flex items-center justify-center gap-0.5 text-xs">
                    <span v-html="$t('psasTuningMainAccelFilters')"></span>
                    <HelpIcon :text="$t('psasTuningMainAccelFiltersHelp')" />
                </div>

                <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">PITCH</div>
                <UInputNumber
                    v-model="psasPitchGyroHPF"
                    :step="1"
                    :min="0"
                    :max="1000"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />
                <UInputNumber
                    v-model="psasPitchAccelZLPF"
                    :step="1"
                    :min="0"
                    :max="100"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />
                <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">YAW</div>
                <UInputNumber
                    v-model="psasYawGyroHPF"
                    :step="1"
                    :min="0"
                    :max="100"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />
                <UInputNumber
                    v-model="psasYawAccelYLPF"
                    :step="1"
                    :min="0"
                    :max="100"
                    size="xs"
                    orientation="vertical"
                    class="w-full"
                />
            </div>
        </UiBox>

        <UiBox :title="$t('psasAccelZControllerSettings')" type="neutral">
            <!-- Controller Group -->
            <div class="flex flex-col gap-2">
                <span class="text-sm font-semibold" v-html="$t('psasTuningAccelZControllerGroup')"></span>
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAccelZControllerI')"></span>
                            <HelpIcon :text="$t('psasTuningAccelZControllerIHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasAccelI"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAccelZControllerP')"></span>
                            <HelpIcon :text="$t('psasTuningAccelZControllerPHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasAccelP"
                            :step="1"
                            :min="0"
                            :max="1000"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                </div>
                <span class="text-sm font-semibold" v-html="$t('psasTuningAccelZLimitGroup')"></span>
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAccelZLimitMax')"></span>
                            <HelpIcon :text="$t('psasTuningAccelZLimitMaxHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasGLoadMax"
                            :step="1"
                            :min="20"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAccelZLimitMin')"></span>
                            <HelpIcon :text="$t('psasTuningAccelZLimitMinHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasGLoadMin"
                            :step="1"
                            :min="20"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                </div>
                <span class="text-sm font-semibold" v-html="$t('psasTuningAccelZServosGroup')"></span>
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAccelZServoTime')"></span>
                            <HelpIcon :text="$t('psasTuningAccelZServoTimeHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasServoTime"
                            :step="1"
                            :min="5"
                            :max="1000"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                </div>
            </div>
        </UiBox>
        <UiBox :title="$t('psasAoALimiterSettings')" type="neutral">
            <!-- AoA estimation Group -->
            <div class="flex flex-col gap-2">
                <span class="text-sm font-semibold" v-html="$t('psasTuningAoAEstimationGroup')"></span>
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoAWingLoading')"></span>
                            <HelpIcon :text="$t('psasTuningAoAWingLoadingHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasWingLoading"
                            :step="1"
                            :min="0"
                            :max="1500"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoAAirDensity')"></span>
                            <HelpIcon :text="$t('psasTuningAoAAirDensityHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasAirDensity"
                            :step="10"
                            :min="800"
                            :max="1300"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoALiftCoefLPF')"></span>
                            <HelpIcon :text="$t('psasTuningAoALiftCoefLPFHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasLiftCoefLPF"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                </div>
                <span class="text-sm font-semibold" v-html="$t('psasTuningAoALimiterGroup')"></span>
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoAControllerI')"></span>
                            <HelpIcon :text="$t('psasTuningAoAControllerIHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasLimiterGain"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoALimitLiftCoef')"></span>
                            <HelpIcon :text="$t('psasTuningAoALimitLiftCoefHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasLimiterCliftLimit"
                            :step="1"
                            :min="5"
                            :max="20"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoAForecast')"></span>
                            <HelpIcon :text="$t('psasTuningAoAForecastHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasLimiterForecast"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningAoATauReturn')"></span>
                            <HelpIcon :text="$t('psasTuningAoATauReturnHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasLimiterTauReturn"
                            :step="1"
                            :min="1"
                            :max="50"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                </div>
            </div>
        </UiBox>
        <UiBox :title="$t('psasCrossLinkSettings')" type="neutral">
            <!-- Controller Group -->
            <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningCrossLinkGain')"></span>
                            <HelpIcon :text="$t('psasTuningCrossLinkGainHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasRollToYawLink"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningCrossLinkLiftCoefStart')"></span>
                            <HelpIcon :text="$t('psasTuningCrossLinkLiftCoefStartHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasRollToYawLiftCoefStart"
                            :step="1"
                            :min="0"
                            :max="20"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasTuningCrossLinkLiftCoefStop')"></span>
                            <HelpIcon :text="$t('psasTuningCrossLinkLiftCoefStopHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasRollToYawLiftCoefStop"
                            :step="1"
                            :min="0"
                            :max="20"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                </div>
            </div>
        </UiBox>

        <UiBox :title="$t('psasSpeedCurvesSettings')" type="neutral">
            <div class="flex flex-col gap-2">
                <span class="text-sm font-semibold" v-html="$t('psasSpeedCurvesEnableGroup')"></span>
                <div class="grid grid-cols-[2rem_repeat(2,minmax(4rem,auto))] gap-x-3 gap-y-1 items-center min-w-0">
                    <!-- Header -->
                    <div></div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t('psasSpeedCurvesEnableMain')"></span>
                    </div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t('psasSpeedCurvesEnableStick')"></span>
                    </div>
                    <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">ROLL</div>
                    <USwitch v-model="psasSpeedCurvesMainRollEnabled" size="sm" />
                    <USwitch v-model="psasSpeedCurvesPilotRollEnabled" size="sm" />
                    <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">PITCH</div>
                    <USwitch v-model="psasSpeedCurvesMainPitchEnabled" size="sm" />
                    <USwitch v-model="psasSpeedCurvesPilotPitchEnabled" size="sm" />
                    <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">YAW</div>
                    <USwitch v-model="psasSpeedCurvesMainYawEnabled" size="sm" />
                    <USwitch v-model="psasSpeedCurvesPilotYawEnabled" size="sm" />
                </div>
                <span class="text-sm font-semibold" v-html="$t('psasSpeedCurvesParametersGroup')"></span>
                <div class="flex flex-wrap items-end gap-3 pl-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesOptimumSpeed')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesOptimumSpeedHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesVref"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesMainPower')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesMainPowerHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesMainPower"
                            :step="1"
                            :min="5"
                            :max="30"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesRollPilotPower')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesRollPilotPowerHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesRollPilotPower"
                            :step="1"
                            :min="5"
                            :max="30"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesMainCurveMin')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesMainCurveMinHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesMainCurveMin"
                            :step="1"
                            :min="1"
                            :max="100"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesMainCurveMax')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesMainCurveMaxHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesMainCurveMax"
                            :step="1"
                            :min="100"
                            :max="500"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesPilotCurveMin')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesPilotCurveMinHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesPilotCurveMin"
                            :step="1"
                            :min="10"
                            :max="100"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesPilotCurveMax')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesPilotCurveMaxHelp')" />
                        </div>
                        <UInputNumber
                            v-model="psasSpeedCurvesPilotCurveMax"
                            :step="1"
                            :min="100"
                            :max="500"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('psasSpeedCurvesUseGps')"></span>
                            <HelpIcon :text="$t('psasSpeedCurvesUseGpsHelp')" />
                        </div>
                        <USwitch v-model="psasSpeedCurvesUseGps" size="sm" />
                    </div>
                </div>
            </div>
        </UiBox>
    </div>
</template>

<script setup>
import { computed, watch } from "vue";
import { useTranslation } from "i18next-vue";
import FC from "@/js/fc";

import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";

const { t } = useTranslation();

const emit = defineEmits(["change"]);

// PSAS - Individual per-cell computed properties to avoid array destruction.
// v-model.number writes a single number, so using array-level computeds would
// replace the sub-array reference with that number. Instead, read/write each
// element directly.

// Main settings
// Roll
const psasRollPilot = computed({
    get: () => FC.PSAS_CONFIG.stick_gain[0],
    set: (val) => {
        FC.PSAS_CONFIG.stick_gain[0] = val;
    },
});

const psasRollDamping = computed({
    get: () => FC.PSAS_CONFIG.damping_gain[0],
    set: (val) => {
        FC.PSAS_CONFIG.damping_gain[0] = val;
    },
});

// Pitch
const psasPitchPilot = computed({
    get: () => FC.PSAS_CONFIG.stick_gain[1],
    set: (val) => {
        FC.PSAS_CONFIG.stick_gain[1] = val;
    },
});

const psasPitchDamping = computed({
    get: () => FC.PSAS_CONFIG.damping_gain[1],
    set: (val) => {
        FC.PSAS_CONFIG.damping_gain[1] = val;
    },
});

const psasPitchGyroHPF = computed({
    get: () => FC.PSAS_CONFIG.pitch_damping_filter_freq,
    set: (val) => {
        FC.PSAS_CONFIG.pitch_damping_filter_freq = val;
    },
});

const psasPitchStability = computed({
    get: () => FC.PSAS_CONFIG.pitch_stability_gain,
    set: (val) => {
        FC.PSAS_CONFIG.pitch_stability_gain = val;
    },
});

const psasPitchAccelZLPF = computed({
    get: () => FC.PSAS_CONFIG.accel_z_filter_freq,
    set: (val) => {
        FC.PSAS_CONFIG.accel_z_filter_freq = val;
    },
});

// Yaw
const psasYawPilot = computed({
    get: () => FC.PSAS_CONFIG.stick_gain[2],
    set: (val) => {
        FC.PSAS_CONFIG.stick_gain[2] = val;
    },
});

const psasYawDamping = computed({
    get: () => FC.PSAS_CONFIG.damping_gain[2],
    set: (val) => {
        FC.PSAS_CONFIG.damping_gain[2] = val;
    },
});

const psasYawGyroHPF = computed({
    get: () => FC.PSAS_CONFIG.yaw_damping_filter_freq,
    set: (val) => {
        FC.PSAS_CONFIG.yaw_damping_filter_freq = val;
    },
});

const psasYawStability = computed({
    get: () => FC.PSAS_CONFIG.yaw_stability_gain,
    set: (val) => {
        FC.PSAS_CONFIG.yaw_stability_gain = val;
    },
});

const psasYawAccelYLPF = computed({
    get: () => FC.PSAS_CONFIG.accel_y_filter_freq,
    set: (val) => {
        FC.PSAS_CONFIG.accel_y_filter_freq = val;
    },
});

// Accel Z controller
const psasAccelI = computed({
    get: () => FC.PSAS_CONFIG.pitch_accel_i_gain,
    set: (val) => {
        FC.PSAS_CONFIG.pitch_accel_i_gain = val;
    },
});

const psasAccelP = computed({
    get: () => FC.PSAS_CONFIG.pitch_accel_p_gain,
    set: (val) => {
        FC.PSAS_CONFIG.pitch_accel_p_gain = val;
    },
});

const psasGLoadMax = computed({
    get: () => FC.PSAS_CONFIG.pitch_accel_max,
    set: (val) => {
        FC.PSAS_CONFIG.pitch_accel_max = val;
    },
});

const psasGLoadMin = computed({
    get: () => FC.PSAS_CONFIG.pitch_accel_min,
    set: (val) => {
        FC.PSAS_CONFIG.pitch_accel_min = val;
    },
});

const psasServoTime = computed({
    get: () => FC.PSAS_CONFIG.servo_time,
    set: (val) => {
        FC.PSAS_CONFIG.servo_time = val;
    },
});

// AoA limiter
const psasWingLoading = computed({
    get: () => FC.PSAS_CONFIG.wing_load,
    set: (val) => {
        FC.PSAS_CONFIG.wing_load = val;
    },
});

const psasAirDensity = computed({
    get: () => FC.PSAS_CONFIG.air_density,
    set: (val) => {
        FC.PSAS_CONFIG.air_density = val;
    },
});

const psasLiftCoefLPF = computed({
    get: () => FC.PSAS_CONFIG.lift_coef_filter_freq,
    set: (val) => {
        FC.PSAS_CONFIG.lift_coef_filter_freq = val;
    },
});

const psasLimiterGain = computed({
    get: () => FC.PSAS_CONFIG.aoa_limiter_gain,
    set: (val) => {
        FC.PSAS_CONFIG.aoa_limiter_gain = val;
    },
});

const psasLimiterCliftLimit = computed({
    get: () => FC.PSAS_CONFIG.lift_c_limit,
    set: (val) => {
        FC.PSAS_CONFIG.lift_c_limit = val;
    },
});

const psasLimiterForecast = computed({
    get: () => FC.PSAS_CONFIG.aoa_limiter_forecast_time,
    set: (val) => {
        FC.PSAS_CONFIG.aoa_limiter_forecast_time = val;
    },
});

const psasLimiterTauReturn = computed({
    get: () => FC.PSAS_CONFIG.aoa_limiter_tau_return,
    set: (val) => {
        FC.PSAS_CONFIG.aoa_limiter_tau_return = val;
    },
});

const psasRollToYawLink = computed({
    get: () => FC.PSAS_CONFIG.roll_to_yaw_link,
    set: (val) => {
        FC.PSAS_CONFIG.roll_to_yaw_link = val;
    },
});

const psasRollToYawLiftCoefStart = computed({
    get: () => FC.PSAS_CONFIG.roll_yaw_clift_start,
    set: (val) => {
        FC.PSAS_CONFIG.roll_yaw_clift_start = val;
    },
});

const psasRollToYawLiftCoefStop = computed({
    get: () => FC.PSAS_CONFIG.roll_yaw_clift_stop,
    set: (val) => {
        FC.PSAS_CONFIG.roll_yaw_clift_stop = val;
    },
});

const psasSpeedCurvesMainRollEnabled = computed({
    get: () => FC.PSAS_CONFIG.speed_main_curve_enable[0] !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_main_curve_enable[0] = val ? 1 : 0;
    },
});

const psasSpeedCurvesPilotRollEnabled = computed({
    get: () => FC.PSAS_CONFIG.speed_stick_curve_enable[0] !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_stick_curve_enable[0] = val ? 1 : 0;
    },
});

const psasSpeedCurvesMainPitchEnabled = computed({
    get: () => FC.PSAS_CONFIG.speed_main_curve_enable[1] !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_main_curve_enable[1] = val ? 1 : 0;
    },
});

const psasSpeedCurvesPilotPitchEnabled = computed({
    get: () => FC.PSAS_CONFIG.speed_stick_curve_enable[1] !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_stick_curve_enable[1] = val ? 1 : 0;
    },
});

const psasSpeedCurvesMainYawEnabled = computed({
    get: () => FC.PSAS_CONFIG.speed_main_curve_enable[2] !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_main_curve_enable[2] = val ? 1 : 0;
    },
});

const psasSpeedCurvesPilotYawEnabled = computed({
    get: () => FC.PSAS_CONFIG.speed_stick_curve_enable[2] !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_stick_curve_enable[2] = val ? 1 : 0;
    },
});

const psasSpeedCurvesVref = computed({
    get: () => FC.PSAS_CONFIG.speed_optimum_vref,
    set: (val) => {
        FC.PSAS_CONFIG.speed_optimum_vref = val;
    },
});

const psasSpeedCurvesMainPower = computed({
    get: () => FC.PSAS_CONFIG.speed_main_curve_power,
    set: (val) => {
        FC.PSAS_CONFIG.speed_main_curve_power = val;
    },
});

const psasSpeedCurvesRollPilotPower = computed({
    get: () => FC.PSAS_CONFIG.speed_roll_stick_curve_power,
    set: (val) => {
        FC.PSAS_CONFIG.speed_roll_stick_curve_power = val;
    },
});

const psasSpeedCurvesMainCurveMin = computed({
    get: () => FC.PSAS_CONFIG.speed_main_curve_min,
    set: (val) => {
        FC.PSAS_CONFIG.speed_main_curve_min = val;
    },
});

const psasSpeedCurvesMainCurveMax = computed({
    get: () => FC.PSAS_CONFIG.speed_main_curve_max,
    set: (val) => {
        FC.PSAS_CONFIG.speed_main_curve_max = val;
    },
});

const psasSpeedCurvesPilotCurveMin = computed({
    get: () => FC.PSAS_CONFIG.speed_stick_curve_min,
    set: (val) => {
        FC.PSAS_CONFIG.speed_stick_curve_min = val;
    },
});

const psasSpeedCurvesPilotCurveMax = computed({
    get: () => FC.PSAS_CONFIG.speed_stick_curve_max,
    set: (val) => {
        FC.PSAS_CONFIG.speed_stick_curve_max = val;
    },
});

const psasSpeedCurvesUseGps = computed({
    get: () => FC.PSAS_CONFIG.speed_use_gps !== 0,
    set: (val) => {
        FC.PSAS_CONFIG.speed_use_gps = val ? 1 : 0;
    },
});

// Watch for changes to mark tab dirty state in parent component
watch(
    () => JSON.stringify(FC.PSAS_CONFIG),
    () => emit("change"),
);
</script>
