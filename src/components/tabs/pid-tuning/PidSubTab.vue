<template>
    <div class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- LEFT COLUMN: PID Table and Sliders -->
        <div class="flex flex-col gap-4">
            <!-- Profile Name (API 1.45+) -->
            <SettingRow v-if="showProfileName" :label="$t('pidProfileName')" :help="$t('pidProfileNameHelp')">
                <UInput v-model="localProfileName" maxlength="8" class="w-28" />
            </SettingRow>

            <!-- PID Table -->
            <UiBox type="neutral">
                <div class="grid grid-cols-[3rem_repeat(5,minmax(4rem,auto))] gap-x-3 gap-y-1 items-center min-w-0">
                    <!-- Header -->
                    <div></div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t('pidTuningProportional')"></span>
                        <HelpIcon :text="$t('pidTuningProportionalHelp')" />
                    </div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t('pidTuningIntegral')"></span>
                        <HelpIcon :text="$t('pidTuningIntegralHelp')" />
                    </div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t(derivativeLabel)"></span>
                        <HelpIcon :text="$t(derivativeHelp)" />
                    </div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t(dMaxLabel)"></span>
                        <HelpIcon :text="$t(dMaxHelp)" />
                    </div>
                    <div class="flex items-center justify-center gap-0.5 text-xs">
                        <span v-html="$t('pidTuningFeedforward')"></span>
                        <HelpIcon :text="$t('pidTuningFeedforwardHelp')" />
                    </div>

                    <!-- Section label -->
                    <div class="col-span-6 text-xs text-dimmed">{{ $t("pidTuningBasic") }}</div>

                    <!-- ROLL -->
                    <div class="font-bold text-white text-center py-0.5 px-1 bg-[#e24761] rounded text-xs">ROLL</div>
                    <UInputNumber
                        v-model="pidRollP"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidRollI"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidRollD"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="advancedTuning.dMaxRoll"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="advancedTuning.feedforwardRoll"
                        :step="1"
                        :min="0"
                        :max="2000"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />

                    <!-- PITCH -->
                    <div class="font-bold text-white text-center py-0.5 px-1 bg-[#49c747] rounded text-xs">PITCH</div>
                    <UInputNumber
                        v-model="pidPitchP"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidPitchI"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidPitchD"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="advancedTuning.dMaxPitch"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="advancedTuning.feedforwardPitch"
                        :step="1"
                        :min="0"
                        :max="2000"
                        :disabled="rollPitchDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />

                    <!-- YAW -->
                    <div class="font-bold text-white text-center py-0.5 px-1 bg-[#477ac7] rounded text-xs">YAW</div>
                    <UInputNumber
                        v-model="pidYawP"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="yawDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidYawI"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="yawDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidYawD"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="yawDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="advancedTuning.dMaxYaw"
                        :step="1"
                        :min="0"
                        :max="250"
                        :disabled="yawDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="advancedTuning.feedforwardYaw"
                        :step="1"
                        :min="0"
                        :max="2000"
                        :disabled="yawDisabled"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                </div>
            </UiBox>

            <!-- Tuning Sliders Section -->
            <UiBox type="neutral">
                <!-- Slider Header: Mode select + range labels -->
                <div class="flex items-center gap-3 mb-2">
                    <div class="flex items-center gap-2 min-w-44 shrink-0">
                        <span class="text-xs whitespace-nowrap">{{ $t("pidTuningSliderPidsMode") }}</span>
                        <USelect
                            v-model="sliderPidsMode"
                            :items="pidsModeItems"
                            class="w-24"
                            @update:model-value="onSliderModeChange"
                        />
                        <HelpIcon :text="$t('pidTuningSliderModeHelp')" />
                    </div>
                    <div class="flex justify-between flex-1 text-xs text-dimmed">
                        <span>{{ $t("pidTuningSliderLow") }}</span>
                        <span>{{ $t("pidTuningSliderDefault") }}</span>
                        <span>{{ $t("pidTuningSliderHigh") }}</span>
                    </div>
                    <HelpIcon :text="$t('pidTuningPidSlidersHelp')" />
                </div>

                <!-- Basic Sliders -->
                <div
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': sliderDGainDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningDGainSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderDGainDisplay }}</span>
                    <USlider
                        v-model="sliderDGain"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="sliderDGainDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange('sliderDGain')"
                    />
                    <HelpIcon :text="$t('pidTuningDGainSliderHelp')" />
                </div>

                <div
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': sliderPIGainDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningPIGainSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderPIGainDisplay }}</span>
                    <USlider
                        v-model="sliderPIGain"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="sliderPIGainDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange('sliderPIGain')"
                    />
                    <HelpIcon :text="$t('pidTuningPIGainSliderHelp')" />
                </div>

                <div
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': sliderFFGainDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningResponseSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderFFGainDisplay }}</span>
                    <USlider
                        v-model="sliderFeedforwardGain"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="sliderFFGainDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange('sliderFeedforwardGain')"
                    />
                    <HelpIcon :text="$t('pidTuningResponseSliderHelp')" />
                </div>

                <!-- Divider before advanced sliders -->
                <hr v-show="showAdvancedSliders" class="border-default my-2" />

                <!-- Advanced Sliders -->
                <div
                    v-show="showDMaxSlider"
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': dMaxSliderDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningDMaxGainSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderDMaxGainDisplay }}</span>
                    <USlider
                        v-model="sliderDMaxGain"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="dMaxSliderDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange()"
                    />
                    <HelpIcon :text="$t('pidTuningDMaxGainSliderHelp')" />
                </div>

                <div
                    v-show="showIGainSlider"
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': iGainSliderDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningIGainSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderIGainDisplay }}</span>
                    <USlider
                        v-model="sliderIGain"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="iGainSliderDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange()"
                    />
                    <HelpIcon :text="$t('pidTuningIGainSliderHelp')" />
                </div>

                <div
                    v-show="showRPRatioSlider"
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': rpRatioSliderDisabled }"
                >
                    <div
                        class="min-w-32 text-right text-xs shrink-0"
                        v-html="$t('pidTuningRollPitchRatioSlider')"
                    ></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderRPRatioDisplay }}</span>
                    <USlider
                        v-model="sliderRollPitchRatio"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="rpRatioSliderDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange()"
                    />
                    <HelpIcon :text="$t('pidTuningRollPitchRatioSliderHelp')" />
                </div>

                <div
                    v-show="showPitchPISlider"
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': pitchPISliderDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningPitchPIGainSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderPitchPIDisplay }}</span>
                    <USlider
                        v-model="sliderPitchPIGain"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="pitchPISliderDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange()"
                    />
                    <HelpIcon :text="$t('pidTuningPitchPIGainSliderHelp')" />
                </div>

                <div
                    v-show="showMasterSlider"
                    class="flex items-center gap-3 py-1"
                    :class="{ 'opacity-50 pointer-events-none': masterSliderDisabled }"
                >
                    <div class="min-w-32 text-right text-xs shrink-0" v-html="$t('pidTuningMasterSlider')"></div>
                    <span class="min-w-10 text-center text-sm font-semibold">{{ sliderMasterDisplay }}</span>
                    <USlider
                        v-model="sliderMasterMultiplier"
                        :min="0"
                        :max="2.0"
                        :step="0.05"
                        :disabled="masterSliderDisabled"
                        class="flex-1"
                        @update:model-value="onSliderChange()"
                    />
                    <HelpIcon :text="$t('pidTuningMasterSliderHelp')" />
                </div>

                <!-- Danger Zone Warning -->
                <UiBox v-if="slidersInDangerZone" type="error" highlight>
                    <p v-html="$t('pidTuningSliderWarning')"></p>
                </UiBox>

                <!-- Non-Expert Mode Warning -->
                <UiBox v-if="!props.expertMode && sliderPidsMode > 0" type="warning" highlight>
                    <p v-html="$t('pidTuningPidSlidersNonExpertMode')"></p>
                </UiBox>

                <!-- Expert Settings Detected Warning -->
                <UiBox v-if="showExpertSettingsWarning" type="warning" highlight>
                    <p v-html="$t('pidTuningSlidersExpertSettingsDetectedNote')"></p>
                </UiBox>
            </UiBox>

            <!-- BARO, MAG, GPS Optional PIDs -->
            <UiBox v-if="showAllLocal && hasBaroMagGpsPids" type="neutral">
                <div class="grid grid-cols-[3rem_repeat(3,4rem)] gap-x-2 gap-y-1 items-center min-w-0">
                    <!-- Header -->
                    <div></div>
                    <div class="text-xs text-center" v-html="$t('pidTuningProportional')"></div>
                    <div class="text-xs text-center" v-html="$t('pidTuningIntegral')"></div>
                    <div class="text-xs text-center" v-html="$t('pidTuningDerivative')"></div>

                    <!-- Altitude (Baro) PIDs -->
                    <template v-if="hasPidName('ALT') || hasPidName('VEL')">
                        <div class="col-span-4 text-xs text-dimmed">{{ $t("pidTuningAltitude") }}</div>
                        <template v-if="hasPidName('ALT')">
                            <div></div>
                            <UInputNumber
                                v-model="pidAltP"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidAltI"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidAltD"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                        </template>
                        <template v-if="hasPidName('VEL')">
                            <div></div>
                            <UInputNumber
                                v-model="pidVelP"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidVelI"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidVelD"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                        </template>
                    </template>

                    <!-- Mag PIDs -->
                    <template v-if="hasPidName('MAG')">
                        <div class="col-span-4 text-xs text-dimmed">{{ $t("pidTuningMag") }}</div>
                        <div></div>
                        <UInputNumber
                            v-model="pidMagP"
                            :step="1"
                            :min="0"
                            :max="255"
                            size="xs"
                            orientation="vertical"
                            class="w-full"
                        />
                        <div></div>
                        <div></div>
                    </template>

                    <!-- GPS PIDs -->
                    <template v-if="hasPidName('Pos') || hasPidName('PosR') || hasPidName('NavR')">
                        <div class="col-span-4 text-xs text-dimmed">{{ $t("pidTuningGps") }}</div>
                        <template v-if="hasPidName('Pos')">
                            <div></div>
                            <UInputNumber
                                v-model="pidPosP"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <div></div>
                            <div></div>
                        </template>
                        <template v-if="hasPidName('PosR')">
                            <div></div>
                            <UInputNumber
                                v-model="pidPosRP"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidPosRI"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidPosRD"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                        </template>
                        <template v-if="hasPidName('NavR')">
                            <div></div>
                            <UInputNumber
                                v-model="pidNavRP"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidNavRI"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                            <UInputNumber
                                v-model="pidNavRD"
                                :step="1"
                                :min="0"
                                :max="255"
                                size="xs"
                                orientation="vertical"
                                class="w-full"
                            />
                        </template>
                    </template>
                </div>
            </UiBox>

            <!-- Angle/Horizon Section -->
            <UiBox type="neutral">
                <div class="grid grid-cols-[4rem_repeat(2,4rem)] gap-x-2 gap-y-1 items-center min-w-0">
                    <!-- Header -->
                    <div></div>
                    <div class="text-xs text-center">{{ $t("pidTuningStrength") }}</div>
                    <div class="text-xs text-center">{{ $t("pidTuningTransition") }}</div>

                    <!-- Angle -->
                    <div class="text-xs">{{ $t("pidTuningAngle") }}</div>
                    <UInputNumber
                        v-model="pidLevelAngle"
                        :step="1"
                        :min="0"
                        :max="255"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <div></div>

                    <!-- Horizon -->
                    <div class="text-xs">{{ $t("pidTuningHorizon") }}</div>
                    <UInputNumber
                        v-model="pidLevelHorizon"
                        :step="1"
                        :min="0"
                        :max="255"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <UInputNumber
                        v-model="pidLevelTransition"
                        :step="1"
                        :min="0"
                        :max="255"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />

                    <!-- Level Angle Limit -->
                    <div></div>
                    <div class="text-xs text-center">{{ $t("pidTuningLevelAngleLimit") }}</div>
                    <div></div>

                    <div></div>
                    <UInputNumber
                        v-model="advancedTuning.levelAngleLimit"
                        :step="1"
                        :min="10"
                        :max="200"
                        size="xs"
                        orientation="vertical"
                        class="w-full"
                    />
                    <div></div>
                </div>
            </UiBox>
        </div>

        <!-- RIGHT COLUMN: PID Controller Settings -->
        <div class="flex flex-col gap-4">
            <!-- PID Settings -->
            <UiBox :title="$t('pidTuningPidSettings')" type="neutral">
                <!-- Feedforward Group -->
                <div class="flex flex-col gap-2">
                    <span class="text-sm font-semibold" v-html="$t('pidTuningFeedforwardGroup')"></span>
                    <div class="flex flex-wrap items-end gap-3 pl-4">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningFeedforwardJitter')"></span>
                                <HelpIcon :text="$t('pidTuningFeedforwardJitterHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.feedforward_jitter_factor"
                                :step="1"
                                :min="0"
                                :max="20"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span
                                    class="text-xs text-dimmed"
                                    v-html="$t('pidTuningFeedforwardSmoothFactor')"
                                ></span>
                                <HelpIcon :text="$t('pidTuningFeedforwardSmoothnessHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.feedforward_smooth_factor"
                                :step="1"
                                :min="0"
                                :max="95"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningFeedforwardAveraging')"></span>
                                <HelpIcon :text="$t('pidTuningFeedforwardAveragingHelp')" />
                            </div>
                            <USelect
                                v-model="advancedTuning.feedforward_averaging"
                                :items="feedforwardAveragingItems"
                                class="w-28"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningFeedforwardBoost')"></span>
                                <HelpIcon :text="$t('pidTuningFeedforwardBoostHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.feedforward_boost"
                                :step="1"
                                :min="0"
                                :max="50"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span
                                    class="text-xs text-dimmed"
                                    v-html="$t('pidTuningFeedforwardMaxRateLimit')"
                                ></span>
                                <HelpIcon :text="$t('pidTuningFeedforwardMaxRateLimitHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.feedforward_max_rate_limit"
                                :step="1"
                                :min="0"
                                :max="150"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningFeedforwardTransition')"></span>
                                <HelpIcon :text="$t('pidTuningFeedforwardTransitionHelp')" />
                            </div>
                            <UInputNumber
                                v-model="feedforwardTransitionValue"
                                :step="0.01"
                                :min="0"
                                :max="1"
                                :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                    </div>
                </div>

                <!-- I-term Relax -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningItermRelax')" :help="$t('pidTuningItermRelaxHelp')">
                        <USwitch v-model="itermRelaxEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="itermRelaxEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('pidTuningItermRelaxAxes')"></span>
                            <USelect v-model="advancedTuning.itermRelax" :items="itermRelaxAxesItems" class="w-28" />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('pidTuningItermRelaxType')"></span>
                            <USelect
                                v-model="advancedTuning.itermRelaxType"
                                :items="itermRelaxTypeItems"
                                class="w-28"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningItermRelaxCutoff')"></span>
                                <HelpIcon :text="$t('pidTuningItermRelaxCutoffHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.itermRelaxCutoff"
                                :step="1"
                                :min="1"
                                :max="50"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                    </div>
                </div>

                <!-- Anti Gravity -->
                <div class="flex flex-col gap-2">
                    <SettingRow :label="$t('pidTuningAntiGravity')" :help="$t('pidTuningAntiGravityHelp')">
                        <USwitch v-model="antiGravityEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="antiGravityEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('pidTuningAntiGravityMode')"></span>
                            <USelect
                                v-model="advancedTuning.antiGravityMode"
                                :items="antiGravityModeItems"
                                class="w-28"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningAntiGravityGain')"></span>
                                <HelpIcon :text="$t('pidTuningAntiGravityGainHelp')" />
                            </div>
                            <UInputNumber
                                v-model="antiGravityGainValue"
                                :step="0.1"
                                :min="0.1"
                                :max="30"
                                :format-options="{ minimumFractionDigits: 1, maximumFractionDigits: 1 }"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('pidTuningAntiGravityThres')"></span>
                            <UInputNumber
                                v-model="advancedTuning.itermThrottleThreshold"
                                :step="10"
                                :min="20"
                                :max="1000"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                    </div>
                </div>

                <!-- I-term Rotation -->
                <SettingRow :label="$t('pidTuningItermRotation')" :help="$t('pidTuningItermRotationHelp')">
                    <USwitch v-model="itermRotationEnabled" size="sm" />
                </SettingRow>

                <!-- D-Max Group -->
                <div class="flex flex-col gap-2">
                    <span class="text-sm font-semibold" v-html="$t('pidTuningDMaxSettingTitle')"></span>
                    <div class="flex flex-wrap items-end gap-3 pl-4">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningDMaxGain')"></span>
                                <HelpIcon :text="$t('pidTuningDMaxGainHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.dMaxGain"
                                :step="1"
                                :min="0"
                                :max="100"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-dimmed" v-html="$t('pidTuningDMaxAdvance')"></span>
                                <HelpIcon :text="$t('pidTuningDMaxAdvanceHelp')" />
                            </div>
                            <UInputNumber
                                v-model="advancedTuning.dMaxAdvance"
                                :step="1"
                                :min="0"
                                :max="200"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                    </div>
                </div>
            </UiBox>

            <!-- Motor Settings -->
            <UiBox :title="$t('pidTuningMotorSettings')" type="neutral">
                <SettingRow :label="$t('pidTuningThrottleBoost')" :help="$t('pidTuningThrottleBoostHelp')">
                    <UInputNumber
                        v-model="advancedTuning.throttleBoost"
                        :step="1"
                        :min="0"
                        :max="100"
                        size="xs"
                        orientation="vertical"
                        class="w-16"
                    />
                </SettingRow>

                <SettingRow :label="$t('pidTuningMotorOutputLimit')" :help="$t('pidTuningMotorLimitHelp')">
                    <UInputNumber
                        v-model="advancedTuning.motorOutputLimit"
                        :step="1"
                        :min="1"
                        :max="100"
                        size="xs"
                        orientation="vertical"
                        class="w-16"
                    />
                </SettingRow>

                <SettingRow
                    :label="dshotTelemetryEnabled ? $t('pidTuningIdleMinRpm') : $t('pidTuningIdleMinRpmDisabled')"
                    :help="$t('pidTuningIdleMinRpmHelp')"
                >
                    <UInputNumber
                        v-model="advancedTuning.idleMinRpm"
                        :step="1"
                        :min="0"
                        :max="idleMinRpmMax"
                        :disabled="!dshotTelemetryEnabled"
                        size="xs"
                        orientation="vertical"
                        class="w-16"
                    />
                </SettingRow>

                <!-- VBat Sag Compensation -->
                <div class="flex flex-col gap-2">
                    <SettingRow
                        :label="$t('pidTuningVbatSagCompensation')"
                        :help="$t('pidTuningVbatSagCompensationHelp')"
                    >
                        <USwitch v-model="vbatSagEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="vbatSagEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('pidTuningVbatSagValue')"></span>
                            <UInputNumber
                                v-model="advancedTuning.vbat_sag_compensation"
                                :step="1"
                                :min="1"
                                :max="150"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                    </div>
                </div>

                <!-- Thrust Linearization -->
                <div class="flex flex-col gap-2">
                    <SettingRow
                        :label="$t('pidTuningThrustLinearization')"
                        :help="$t('pidTuningThrustLinearizationHelp')"
                    >
                        <USwitch v-model="thrustLinearEnabled" size="sm" />
                    </SettingRow>
                    <div v-if="thrustLinearEnabled" class="flex flex-wrap items-end gap-3 pl-8">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs text-dimmed" v-html="$t('pidTuningThrustLinearValue')"></span>
                            <UInputNumber
                                v-model="advancedTuning.thrustLinearization"
                                :step="1"
                                :min="1"
                                :max="150"
                                size="xs"
                                orientation="vertical"
                                class="w-16"
                            />
                        </div>
                    </div>
                </div>
            </UiBox>

            <!-- TPA Settings -->
            <UiBox type="neutral">
                <div class="flex flex-wrap items-end gap-3">
                    <div v-if="usesAdvancedTpa" class="flex flex-col gap-1">
                        <span class="text-xs text-dimmed">{{ $t("pidTuningTPAMode") }}</span>
                        <USelect v-model="tpaMode" :items="tpaModeItems" class="w-24" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs text-dimmed">{{ $t("pidTuningTPARate") }}</span>
                        <UInputNumber
                            v-model="tpaRate"
                            :step="1"
                            :min="0"
                            :max="100"
                            size="xs"
                            orientation="vertical"
                            class="w-16"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs text-dimmed">{{ $t("pidTuningTPABreakPoint") }}</span>
                        <UInputNumber
                            v-model="tpaBreakpoint"
                            :step="10"
                            :min="750"
                            :max="2250"
                            size="xs"
                            orientation="vertical"
                            class="w-16"
                        />
                    </div>
                </div>
            </UiBox>

            <!-- Misc Settings -->
            <UiBox :title="$t('pidTuningMiscSettings')" type="neutral">
                <SettingRow :label="$t('pidTuningCellCount')" :help="$t('pidTuningCellCountHelp')">
                    <USelect v-model="advancedTuning.autoProfileCellCount" :items="cellCountItems" class="w-32" />
                </SettingRow>

                <SettingRow
                    :label="$t('pidTuningAcroTrainerAngleLimit')"
                    :help="$t('pidTuningAcroTrainerAngleLimitHelp')"
                >
                    <UInputNumber
                        v-model="advancedTuning.acroTrainerAngleLimit"
                        :step="1"
                        :min="10"
                        :max="80"
                        size="xs"
                        orientation="vertical"
                        class="w-16"
                    />
                </SettingRow>

                <div class="flex flex-col gap-1">
                    <SettingRow :label="$t('pidTuningIntegratedYaw')" :help="$t('pidTuningIntegratedYawHelp')">
                        <USwitch v-model="integratedYawEnabled" size="sm" />
                    </SettingRow>
                    <span
                        v-if="integratedYawEnabled"
                        class="text-xs text-warning pl-8"
                        v-html="$t('pidTuningIntegratedYawCaution')"
                    ></span>
                </div>

                <SettingRow :label="$t('pidTuningAbsoluteControlGain')" :help="$t('pidTuningAbsoluteControlGainHelp')">
                    <UInputNumber
                        v-model="advancedTuning.absoluteControlGain"
                        :step="1"
                        :min="0"
                        :max="20"
                        size="xs"
                        orientation="vertical"
                        class="w-16"
                    />
                </SettingRow>
            </UiBox>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useTranslation } from "i18next-vue";
import FC from "@/js/fc";
import {
    NON_EXPERT_SLIDER_MIN,
    NON_EXPERT_SLIDER_MAX,
    calculateNewPids,
    readPidSliderPositions,
} from "@/composables/useTuningSliders";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";
import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import SettingRow from "@/components/elements/SettingRow.vue";

const { t } = useTranslation();

const props = defineProps({
    expertMode: {
        type: Boolean,
        required: true,
    },
    showAllPids: {
        type: Boolean,
        default: false,
    },
    profileName: {
        type: String,
        default: "",
    },
});

const emit = defineEmits(["update:profileName", "change"]);

// USelect item arrays
const pidsModeItems = computed(() => [
    { value: 0, label: t("pidTuningOptionOff") },
    { value: 1, label: t("pidTuningOptionRP") },
    { value: 2, label: t("pidTuningOptionRPY") },
]);

const feedforwardAveragingItems = computed(() => [
    { value: 0, label: t("pidTuningOptionOff") },
    { value: 1, label: t("pidTuningFeedforwardAveragingOption2Point") },
    { value: 2, label: t("pidTuningFeedforwardAveragingOption3Point") },
    { value: 3, label: t("pidTuningFeedforwardAveragingOption4Point") },
]);

const itermRelaxAxesItems = computed(() => [
    { value: 1, label: t("pidTuningOptionRP") },
    { value: 2, label: t("pidTuningOptionRPY") },
    { value: 3, label: t("pidTuningItermRelaxAxesOptionRPInc") },
    { value: 4, label: t("pidTuningItermRelaxAxesOptionRPYInc") },
]);

const itermRelaxTypeItems = computed(() => [
    { value: 0, label: t("pidTuningItermRelaxTypeOptionGyro") },
    { value: 1, label: t("pidTuningItermRelaxTypeOptionSetpoint") },
]);

const antiGravityModeItems = computed(() => [
    { value: 0, label: t("pidTuningAntiGravityModeOptionSmooth") },
    { value: 1, label: t("pidTuningAntiGravityModeOptionStep") },
]);

const tpaModeItems = computed(() => [
    { value: 0, label: t("pidTuningTPAPD") },
    { value: 1, label: t("pidTuningTPAD") },
]);

const cellCountItems = computed(() => [
    { value: -1, label: t("pidTuningCellCountChange") },
    { value: 0, label: t("pidTuningCellCountStay") },
    { value: 1, label: t("pidTuningCellCount1S") },
    { value: 2, label: t("pidTuningCellCount2S") },
    { value: 3, label: t("pidTuningCellCount3S") },
    { value: 4, label: t("pidTuningCellCount4S") },
    { value: 5, label: t("pidTuningCellCount5S") },
    { value: 6, label: t("pidTuningCellCount6S") },
    { value: 7, label: t("pidTuningCellCount7S") },
    { value: 8, label: t("pidTuningCellCount8S") },
]);

// Profile name (local writable computed to avoid duplicate key with prop)
const localProfileName = computed({
    get: () => props.profileName,
    set: (value) => emit("update:profileName", value),
});
const showProfileName = computed(() => {
    return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);
});

// For API < 1.47, derivative and dmax column headers are swapped (PR #4173)
const isPreApi147 = computed(() => semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_47));
const derivativeLabel = computed(() => (isPreApi147.value ? "pidTuningDMax" : "pidTuningDerivative"));
const derivativeHelp = computed(() => (isPreApi147.value ? "pidTuningDMaxHelp" : "pidTuningDerivativeHelp"));
const dMaxLabel = computed(() => (isPreApi147.value ? "pidTuningDerivative" : "pidTuningDMax"));
const dMaxHelp = computed(() => (isPreApi147.value ? "pidTuningDerivativeHelp" : "pidTuningDMaxHelp"));

// Local show-all state in sync with prop
const showAllLocal = ref(props.showAllPids);

// Keep local state in sync with prop
watch(
    () => props.showAllPids,
    (v) => {
        showAllLocal.value = v;
    },
);

// PIDs - Individual per-cell computed properties to avoid array destruction.
// v-model.number writes a single number, so using array-level computeds would
// replace the sub-array reference with that number. Instead, read/write each
// element directly.
const pidRollP = computed({
    get: () => FC.PIDS[0][0],
    set: (val) => {
        FC.PIDS[0][0] = val;
    },
});
const pidRollI = computed({
    get: () => FC.PIDS[0][1],
    set: (val) => {
        FC.PIDS[0][1] = val;
    },
});
const pidRollD = computed({
    get: () => FC.PIDS[0][2],
    set: (val) => {
        FC.PIDS[0][2] = val;
    },
});

const pidPitchP = computed({
    get: () => FC.PIDS[1][0],
    set: (val) => {
        FC.PIDS[1][0] = val;
    },
});
const pidPitchI = computed({
    get: () => FC.PIDS[1][1],
    set: (val) => {
        FC.PIDS[1][1] = val;
    },
});
const pidPitchD = computed({
    get: () => FC.PIDS[1][2],
    set: (val) => {
        FC.PIDS[1][2] = val;
    },
});

const pidYawP = computed({
    get: () => FC.PIDS[2][0],
    set: (val) => {
        FC.PIDS[2][0] = val;
    },
});
const pidYawI = computed({
    get: () => FC.PIDS[2][1],
    set: (val) => {
        FC.PIDS[2][1] = val;
    },
});
const pidYawD = computed({
    get: () => FC.PIDS[2][2],
    set: (val) => {
        FC.PIDS[2][2] = val;
    },
});

const pidLevelAngle = computed({
    get: () => FC.PIDS[3][0],
    set: (val) => {
        FC.PIDS[3][0] = val;
    },
});
const pidLevelHorizon = computed({
    get: () => FC.PIDS[3][1],
    set: (val) => {
        FC.PIDS[3][1] = val;
    },
});
const pidLevelTransition = computed({
    get: () => FC.PIDS[3][2],
    set: (val) => {
        FC.PIDS[3][2] = val;
    },
});

// Helper to check if a PID name exists in firmware PID_NAMES
function hasPidName(name) {
    return FC.PID_NAMES && FC.PID_NAMES.includes(name);
}

// Helper to create a computed property for an optional PID value by name and component index
function createPidComputed(pidName, component) {
    return computed({
        get: () => {
            const idx = FC.PID_NAMES ? FC.PID_NAMES.indexOf(pidName) : -1;
            return idx >= 0 && FC.PIDS[idx] ? FC.PIDS[idx][component] : 0;
        },
        set: (val) => {
            const idx = FC.PID_NAMES ? FC.PID_NAMES.indexOf(pidName) : -1;
            if (idx >= 0 && FC.PIDS[idx]) {
                FC.PIDS[idx][component] = val;
            }
        },
    });
}

// Check if any baro/mag/gps PID names exist
const hasBaroMagGpsPids = computed(() => {
    return (
        hasPidName("ALT") ||
        hasPidName("VEL") ||
        hasPidName("MAG") ||
        hasPidName("Pos") ||
        hasPidName("PosR") ||
        hasPidName("NavR")
    );
});

// Optional PID computed properties (ALT = Altitude)
const pidAltP = createPidComputed("ALT", 0);
const pidAltI = createPidComputed("ALT", 1);
const pidAltD = createPidComputed("ALT", 2);

// VEL = Velocity
const pidVelP = createPidComputed("VEL", 0);
const pidVelI = createPidComputed("VEL", 1);
const pidVelD = createPidComputed("VEL", 2);

// MAG = Magnetometer
const pidMagP = createPidComputed("MAG", 0);

// Pos = GPS Position
const pidPosP = createPidComputed("Pos", 0);

// PosR = GPS Position Rate
const pidPosRP = createPidComputed("PosR", 0);
const pidPosRI = createPidComputed("PosR", 1);
const pidPosRD = createPidComputed("PosR", 2);

// NavR = GPS Navigation Rate
const pidNavRP = createPidComputed("NavR", 0);
const pidNavRI = createPidComputed("NavR", 1);
const pidNavRD = createPidComputed("NavR", 2);

// Advanced tuning - reactive reference
const advancedTuning = computed(() => FC.ADVANCED_TUNING);

// Dynamic Idle visibility and state
const dshotTelemetryEnabled = computed(() => FC.MOTOR_CONFIG.use_dshot_telemetry ?? false);
const idleMinRpmMax = computed(() => (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? 200 : 100));

// TPA settings with API version gating
// API >= 1.45: Use ADVANCED_TUNING (tpaMode, tpaRate, tpaBreakpoint)
// API < 1.45: Use RC_TUNING (dynamic_THR_PID, dynamic_THR_breakpoint)
const usesAdvancedTpa = computed(() => {
    return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);
});

const tpaMode = computed({
    get: () => {
        if (usesAdvancedTpa.value) {
            return FC.ADVANCED_TUNING?.tpaMode ?? 0;
        }
        // For API < 1.45, tpaMode doesn't exist - always return 0 (PD mode)
        return 0;
    },
    set: (val) => {
        if (usesAdvancedTpa.value && FC.ADVANCED_TUNING) {
            FC.ADVANCED_TUNING.tpaMode = val;
        }
        // For API < 1.45, tpaMode is not supported
    },
});

const tpaRate = computed({
    get: () => {
        if (usesAdvancedTpa.value) {
            // API >= 1.45: tpaRate is stored as decimal (0-1), display as percentage (0-100)
            return Math.round((FC.ADVANCED_TUNING?.tpaRate ?? 0) * 100);
        } else {
            // API < 1.45: dynamic_THR_PID is stored as decimal, display as percentage
            return Math.round((FC.RC_TUNING?.dynamic_THR_PID ?? 0) * 100);
        }
    },
    set: (val) => {
        if (usesAdvancedTpa.value && FC.ADVANCED_TUNING) {
            // Store as decimal (0-1)
            FC.ADVANCED_TUNING.tpaRate = val / 100;
        } else if (FC.RC_TUNING) {
            // Store as decimal
            FC.RC_TUNING.dynamic_THR_PID = val / 100;
        }
    },
});

const tpaBreakpoint = computed({
    get: () => {
        if (usesAdvancedTpa.value) {
            return FC.ADVANCED_TUNING?.tpaBreakpoint ?? 1500;
        } else {
            return FC.RC_TUNING?.dynamic_THR_breakpoint ?? 1500;
        }
    },
    set: (val) => {
        if (usesAdvancedTpa.value && FC.ADVANCED_TUNING) {
            FC.ADVANCED_TUNING.tpaBreakpoint = val;
        } else if (FC.RC_TUNING) {
            FC.RC_TUNING.dynamic_THR_breakpoint = val;
        }
    },
});

// Feedforward transition display value (divided by 100 for display)
const feedforwardTransitionValue = computed({
    get: () => FC.ADVANCED_TUNING.feedforwardTransition / 100,
    set: (val) => (FC.ADVANCED_TUNING.feedforwardTransition = Math.round(Number.parseFloat(val) * 100)),
});

// PID Controller Settings - Checkbox computed refs
const itermRelaxEnabled = computed({
    get: () => FC.ADVANCED_TUNING.itermRelax !== 0,
    set: (val) => (FC.ADVANCED_TUNING.itermRelax = val ? FC.ADVANCED_TUNING.itermRelax || 1 : 0),
});

const antiGravityEnabled = computed({
    get: () => FC.ADVANCED_TUNING.antiGravityGain !== 0,
    set: (val) => (FC.ADVANCED_TUNING.antiGravityGain = val ? FC.ADVANCED_TUNING.antiGravityGain || 80 : 0),
});

// Anti-gravity gain display value (divided by 10 for display)
const antiGravityGainValue = computed({
    get: () => FC.ADVANCED_TUNING.antiGravityGain / 10,
    set: (val) => (FC.ADVANCED_TUNING.antiGravityGain = Math.round(Number.parseFloat(val) * 10)),
});

const itermRotationEnabled = computed({
    get: () => FC.ADVANCED_TUNING.itermRotation !== 0,
    set: (val) => (FC.ADVANCED_TUNING.itermRotation = val ? 1 : 0),
});

const vbatSagEnabled = computed({
    get: () => FC.ADVANCED_TUNING.vbat_sag_compensation !== 0,
    set: (val) =>
        (FC.ADVANCED_TUNING.vbat_sag_compensation = val ? FC.ADVANCED_TUNING.vbat_sag_compensation || 100 : 0),
});

const thrustLinearEnabled = computed({
    get: () => FC.ADVANCED_TUNING.thrustLinearization !== 0,
    set: (val) => (FC.ADVANCED_TUNING.thrustLinearization = val ? FC.ADVANCED_TUNING.thrustLinearization || 100 : 0),
});

const integratedYawEnabled = computed({
    get: () => FC.ADVANCED_TUNING.useIntegratedYaw !== 0,
    set: (val) => (FC.ADVANCED_TUNING.useIntegratedYaw = val ? 1 : 0),
});

// PID table input disabled states — matches original updatePidSlidersDisplay()
// Roll & Pitch disabled when slider mode is RP (1) or RPY (2)
const rollPitchDisabled = computed(() => sliderPidsMode.value > 0);
// Yaw disabled only in RPY mode (2)
const yawDisabled = computed(() => sliderPidsMode.value === 2);

// Sliders (values are 0.0-2.0)
const sliderPidsMode = ref(2);
const sliderDGain = ref(1);
const sliderPIGain = ref(1);
const sliderFeedforwardGain = ref(1);
const sliderDMaxGain = ref(1);
const sliderIGain = ref(1);
const sliderRollPitchRatio = ref(1);
const sliderPitchPIGain = ref(1);
const sliderMasterMultiplier = ref(1);

// Flag to prevent watcher from overriding user input
const isUserInteracting = ref(false);

// Non-expert range constants (decimal form)
const NON_EXPERT_MIN = NON_EXPERT_SLIDER_MIN / 100; // 0.7
const NON_EXPERT_MAX = NON_EXPERT_SLIDER_MAX / 100; // 1.4

// Per-slider out-of-range flags (matches original updateExpertModePidSlidersDisplay)
const dGainOutsideRange = computed(() => {
    const v = Math.round(sliderDGain.value * 100);
    return v < NON_EXPERT_SLIDER_MIN || v > NON_EXPERT_SLIDER_MAX;
});
const piGainOutsideRange = computed(() => {
    const v = Math.round(sliderPIGain.value * 100);
    return v < NON_EXPERT_SLIDER_MIN || v > NON_EXPERT_SLIDER_MAX;
});
const ffGainOutsideRange = computed(() => {
    const v = Math.round(sliderFeedforwardGain.value * 100);
    return v < NON_EXPERT_SLIDER_MIN || v > NON_EXPERT_SLIDER_MAX;
});

// Advanced slider non-default flags — compare against FC.DEFAULT_TUNING_SLIDERS (matches original)
const dMaxGainChanged = computed(
    () => Math.round(sliderDMaxGain.value * 100) !== FC.DEFAULT_TUNING_SLIDERS.slider_dmax_gain,
);
const iGainChanged = computed(() => Math.round(sliderIGain.value * 100) !== FC.DEFAULT_TUNING_SLIDERS.slider_i_gain);
const rpRatioChanged = computed(
    () => Math.round(sliderRollPitchRatio.value * 100) !== FC.DEFAULT_TUNING_SLIDERS.slider_roll_pitch_ratio,
);
const pitchPIChanged = computed(
    () => Math.round(sliderPitchPIGain.value * 100) !== FC.DEFAULT_TUNING_SLIDERS.slider_pitch_pi_gain,
);
const masterChanged = computed(
    () => Math.round(sliderMasterMultiplier.value * 100) !== FC.DEFAULT_TUNING_SLIDERS.slider_master_multiplier,
);

// Computed display values to ensure reactivity
const sliderDGainDisplay = computed(() => sliderDGain.value.toFixed(2));
const sliderPIGainDisplay = computed(() => sliderPIGain.value.toFixed(2));
const sliderFFGainDisplay = computed(() => sliderFeedforwardGain.value.toFixed(2));
const sliderDMaxGainDisplay = computed(() => sliderDMaxGain.value.toFixed(2));
const sliderIGainDisplay = computed(() => sliderIGain.value.toFixed(2));
const sliderRPRatioDisplay = computed(() => sliderRollPitchRatio.value.toFixed(2));
const sliderPitchPIDisplay = computed(() => sliderPitchPIGain.value.toFixed(2));
const sliderMasterDisplay = computed(() => sliderMasterMultiplier.value.toFixed(2));

// Slider disabled states — matches original updateExpertModePidSlidersDisplay()
// Disable when mode is OFF, or when slider is outside non-expert range and not in expert mode
const sliderDGainDisabled = computed(() => {
    return !sliderPidsMode.value || (dGainOutsideRange.value && !props.expertMode);
});

const sliderPIGainDisabled = computed(() => {
    return !sliderPidsMode.value || (piGainOutsideRange.value && !props.expertMode);
});

const sliderFFGainDisabled = computed(() => {
    return !sliderPidsMode.value || (ffGainOutsideRange.value && !props.expertMode);
});

// Advanced slider disabled states — disabled when mode is OFF, or not in expert mode
// Matches original: disabled = !sliderPidsMode || (changed && !expertMode)
const dMaxSliderDisabled = computed(() => !sliderPidsMode.value || (dMaxGainChanged.value && !props.expertMode));
const iGainSliderDisabled = computed(() => !sliderPidsMode.value || (iGainChanged.value && !props.expertMode));
const rpRatioSliderDisabled = computed(() => !sliderPidsMode.value || (rpRatioChanged.value && !props.expertMode));
const pitchPISliderDisabled = computed(() => !sliderPidsMode.value || (pitchPIChanged.value && !props.expertMode));
const masterSliderDisabled = computed(() => !sliderPidsMode.value || (masterChanged.value && !props.expertMode));

// Advanced sliders visibility — show in expert mode OR when changed from default (matches original)
const showAdvancedSliders = computed(() => {
    return (
        props.expertMode ||
        dMaxGainChanged.value ||
        iGainChanged.value ||
        rpRatioChanged.value ||
        pitchPIChanged.value ||
        masterChanged.value
    );
});

const showDMaxSlider = computed(() => props.expertMode || dMaxGainChanged.value);
const showIGainSlider = computed(() => props.expertMode || iGainChanged.value);
const showRPRatioSlider = computed(() => props.expertMode || rpRatioChanged.value);
const showPitchPISlider = computed(() => props.expertMode || pitchPIChanged.value);
const showMasterSlider = computed(() => props.expertMode || masterChanged.value);

// Check if sliders are in danger zone (high PID/D values)
const isPidValuesInDangerZone = computed(() => {
    const WARNING_P_GAIN = 70;
    const WARNING_D_MAX_GAIN = 60;
    const WARNING_I_GAIN = 2.5 * FC.PIDS[0][0];
    const WARNING_D_GAIN = 42;

    return semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_47)
        ? FC.PIDS[0][0] > WARNING_P_GAIN ||
              FC.PIDS[0][1] > WARNING_I_GAIN ||
              FC.PIDS[0][2] > WARNING_D_MAX_GAIN ||
              FC.ADVANCED_TUNING.dMaxRoll > WARNING_D_GAIN
        : FC.PIDS[0][0] > WARNING_P_GAIN ||
              FC.PIDS[0][1] > WARNING_I_GAIN ||
              FC.PIDS[0][2] > WARNING_D_GAIN ||
              FC.ADVANCED_TUNING.dMaxRoll > WARNING_D_MAX_GAIN;
});

// Show the danger-zone warning when PID values loaded from the FC already
// exceed safe thresholds.  The user cannot push sliders into the danger zone
// via the UI — slider changes are reverted when they would cross the threshold.
const slidersInDangerZone = computed(() => {
    return isPidValuesInDangerZone.value && sliderPidsMode.value > 0;
});

// Check if any basic sliders are outside non-expert range
const hasBasicSlidersOutsideRange = computed(() => {
    return dGainOutsideRange.value || piGainOutsideRange.value || ffGainOutsideRange.value;
});

// Check if any advanced sliders differ from defaults
const hasAdvancedSlidersChanged = computed(() => {
    return (
        dMaxGainChanged.value ||
        iGainChanged.value ||
        rpRatioChanged.value ||
        pitchPIChanged.value ||
        masterChanged.value
    );
});

// Show warning when not in expert mode and sliders are outside range or changed from defaults
// Matches original: toggle(!sliderPidsMode || ((basic || advanced) && !expertMode))
const showExpertSettingsWarning = computed(() => {
    if (props.expertMode) {
        return false;
    }
    if (!sliderPidsMode.value) {
        return false;
    }
    return hasBasicSlidersOutsideRange.value || hasAdvancedSlidersChanged.value;
});

// Initialize sliders from FC.TUNING_SLIDERS
async function initializeSliders() {
    const pos = readPidSliderPositions();
    sliderPidsMode.value = pos.pidsMode;
    sliderDGain.value = pos.dGain;
    sliderPIGain.value = pos.piGain;
    sliderFeedforwardGain.value = pos.feedforwardGain;
    sliderDMaxGain.value = pos.dMaxGain;
    sliderIGain.value = pos.iGain;
    sliderRollPitchRatio.value = pos.rollPitchRatio;
    sliderPitchPIGain.value = pos.pitchPIGain;
    sliderMasterMultiplier.value = pos.masterMultiplier;

    // Force Vue to update the DOM
    await nextTick();
}

// Track timeout to prevent race conditions
let userInteractionTimeout = null;

// Collect current slider ref values into an object for calculateNewPids()
function collectSliderValues() {
    return {
        pidsMode: sliderPidsMode.value,
        dGain: sliderDGain.value,
        piGain: sliderPIGain.value,
        feedforwardGain: sliderFeedforwardGain.value,
        dMaxGain: sliderDMaxGain.value,
        iGain: sliderIGain.value,
        rollPitchRatio: sliderRollPitchRatio.value,
        pitchPIGain: sliderPitchPIGain.value,
        masterMultiplier: sliderMasterMultiplier.value,
    };
}

// Slider change handler — accepts optional slider key for non-expert clamping
async function onSliderChange(activeSliderKey) {
    isUserInteracting.value = true;

    // Clamp the slider the user is actually dragging to the non-expert range.
    // We only clamp the active slider — other sliders may legitimately be
    // outside range (loaded from FC via CLI) and must not be silently reset.
    if (!props.expertMode && activeSliderKey) {
        const refMap = {
            sliderDGain,
            sliderPIGain,
            sliderFeedforwardGain,
        };
        const active = refMap[activeSliderKey];
        if (active) {
            if (active.value > NON_EXPERT_MAX) {
                active.value = NON_EXPERT_MAX;
            } else if (active.value < NON_EXPERT_MIN) {
                active.value = NON_EXPERT_MIN;
            }
        }
    }

    // Ask the FC to calculate PIDs from current slider positions
    await calculateNewPids(collectSliderValues());

    // Notify parent that FC data was mutated programmatically
    emit("change");

    // Clear previous timeout and set new one to prevent race conditions
    if (userInteractionTimeout !== null) {
        clearTimeout(userInteractionTimeout);
    }
    userInteractionTimeout = setTimeout(() => {
        isUserInteracting.value = false;
        userInteractionTimeout = null;
    }, 500);
}

function onSliderModeChange() {
    onSliderChange();
}

// Watch for changes in FC.TUNING_SLIDERS to reinitialize sliders after data loads
watch(
    () => FC.TUNING_SLIDERS,
    () => {
        // Don't reinitialize while user is actively changing sliders
        if (!isUserInteracting.value) {
            initializeSliders();
        }
    },
    { deep: true },
);

// Watch for changes to mark tab dirty state in parent component
watch(
    () => JSON.stringify(FC.PIDS),
    () => emit("change"),
);

watch(
    () => JSON.stringify(FC.ADVANCED_TUNING),
    () => emit("change"),
);

watch(
    () => JSON.stringify(FC.RC_TUNING),
    () => emit("change"),
);

// Expose method to parent component to force slider update after save
function forceUpdateSliders() {
    isUserInteracting.value = false; // Allow watcher to work
    initializeSliders();
}

defineExpose({
    forceUpdateSliders,
});

// Initialize sliders when component mounts
onMounted(() => {
    initializeSliders();
});

// Clean up timeout on component unmount
onUnmounted(() => {
    if (userInteractionTimeout !== null) {
        clearTimeout(userInteractionTimeout);
        userInteractionTimeout = null;
    }
});
</script>
