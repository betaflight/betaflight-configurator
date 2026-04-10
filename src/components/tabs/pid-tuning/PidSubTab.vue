<template>
    <div class="subtab-pid">
        <div class="clear-both"></div>

        <!-- LEFT COLUMN: PID Table and Sliders -->
        <div class="cf_column">
            <!-- Profile Name (API 1.45+) -->
            <div class="profile_name" v-if="showProfileName">
                <div class="number">
                    <label>
                        <input type="text" v-model="localProfileName" maxlength="8" style="width: 100px" />
                        <span>{{ $t("pidProfileName") }}</span>
                    </label>
                    <div class="helpicon cf_tip" :title="$t('pidProfileNameHelp')"></div>
                </div>
            </div>

            <!-- PID Table -->
            <div class="gui_box grey">
                <table id="pid_main" class="pid_tuning">
                    <tbody>
                        <tr class="pid_titlebar">
                            <th class="name"></th>
                            <th class="proportional">
                                <div class="name-helpicon-flex">
                                    <div class="xs" v-html="$t('pidTuningProportional')"></div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningProportionalHelp')"
                                        v-html="$t('pidTuningProportional')"
                                    ></div>
                                </div>
                            </th>
                            <th class="integral">
                                <div class="name-helpicon-flex">
                                    <div class="xs" v-html="$t('pidTuningIntegral')"></div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningIntegralHelp')"
                                        v-html="$t('pidTuningIntegral')"
                                    ></div>
                                </div>
                            </th>
                            <th class="derivative">
                                <div class="name-helpicon-flex">
                                    <div class="xs" v-html="$t(derivativeLabel)"></div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t(derivativeHelp)"
                                        v-html="$t(derivativeLabel)"
                                    ></div>
                                </div>
                            </th>
                            <th class="dmax">
                                <div class="name-helpicon-flex">
                                    <div class="xs" v-html="$t(dMaxLabel)"></div>
                                    <div class="cf_tip sm-min" :title="$t(dMaxHelp)" v-html="$t(dMaxLabel)"></div>
                                </div>
                            </th>
                            <th class="feedforward">
                                <div class="name-helpicon-flex">
                                    <div class="xs" v-html="$t('pidTuningFeedforward')"></div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningFeedforwardHelp')"
                                        v-html="$t('pidTuningFeedforward')"
                                    ></div>
                                </div>
                            </th>
                        </tr>
                        <tr class="pid_titlebar2">
                            <th colspan="6">
                                <div class="pid_mode">
                                    <div class="float-left">{{ $t("pidTuningBasic") }}</div>
                                </div>
                            </th>
                        </tr>

                        <!-- ROLL -->
                        <tr class="ROLL">
                            <td class="pid_roll" style="background-color: #e24761">ROLL</td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="pidRollP"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="pidRollI"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="pidRollD"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="advancedTuning.dMaxRoll"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="advancedTuning.feedforwardRoll"
                                    :step="1"
                                    :min="0"
                                    :max="2000"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                        </tr>

                        <!-- PITCH -->
                        <tr class="PITCH">
                            <td class="pid_pitch" style="background-color: #49c747">PITCH</td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="pidPitchP"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="pidPitchI"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="pidPitchD"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="advancedTuning.dMaxPitch"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="advancedTuning.feedforwardPitch"
                                    :step="1"
                                    :min="0"
                                    :max="2000"
                                    :disabled="rollPitchDisabled"
                                />
                            </td>
                        </tr>

                        <!-- YAW -->
                        <tr class="YAW">
                            <td class="pid_yaw" style="background-color: #477ac7">YAW</td>
                            <td class="pid_data">
                                <UInputNumber v-model="pidYawP" :step="1" :min="0" :max="250" :disabled="yawDisabled" />
                            </td>
                            <td class="pid_data">
                                <UInputNumber v-model="pidYawI" :step="1" :min="0" :max="250" :disabled="yawDisabled" />
                            </td>
                            <td class="pid_data">
                                <UInputNumber v-model="pidYawD" :step="1" :min="0" :max="250" :disabled="yawDisabled" />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="advancedTuning.dMaxYaw"
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    :disabled="yawDisabled"
                                />
                            </td>
                            <td class="pid_data">
                                <UInputNumber
                                    v-model="advancedTuning.feedforwardYaw"
                                    :step="1"
                                    :min="0"
                                    :max="2000"
                                    :disabled="yawDisabled"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Tuning Sliders Section -->
            <div id="slidersPidsBox" class="gui_box grey tuningPIDSliders">
                <div class="slider-header">
                    <div class="slider-mode-section">
                        <div class="sm-min">{{ $t("pidTuningSliderPidsMode") }}</div>
                        <select
                            id="sliderPidsModeSelect"
                            class="sliderMode"
                            v-model.number="sliderPidsMode"
                            @change="onSliderModeChange"
                        >
                            <option :value="0">{{ $t("pidTuningOptionOff") }}</option>
                            <option :value="1">{{ $t("pidTuningOptionRP") }}</option>
                            <option :value="2">{{ $t("pidTuningOptionRPY") }}</option>
                        </select>
                        <div class="helpicon cf_tip" :title="$t('pidTuningSliderModeHelp')"></div>
                    </div>
                    <div class="slider-range-labels">
                        <span>{{ $t("pidTuningSliderLow") }}</span>
                        <span>{{ $t("pidTuningSliderDefault") }}</span>
                        <span>{{ $t("pidTuningSliderHigh") }}</span>
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningPidSlidersHelp')"></div>
                </div>

                <!-- Basic Sliders -->
                <div class="slider-row baseSlider" :class="{ disabledSliders: sliderDGainDisabled }">
                    <div class="slider-label" v-html="$t('pidTuningDGainSlider')"></div>
                    <div class="slider-value">{{ sliderDGainDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderDGain"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderDGain"
                            @input="onSliderChange"
                            :disabled="sliderDGainDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningDGainSliderHelp')"></div>
                </div>

                <div class="slider-row baseSlider" :class="{ disabledSliders: sliderPIGainDisabled }">
                    <div class="slider-label" v-html="$t('pidTuningPIGainSlider')"></div>
                    <div class="slider-value">{{ sliderPIGainDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderPIGain"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderPIGain"
                            @input="onSliderChange"
                            :disabled="sliderPIGainDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningPIGainSliderHelp')"></div>
                </div>

                <div class="slider-row baseSlider" :class="{ disabledSliders: sliderFFGainDisabled }">
                    <div class="slider-label" v-html="$t('pidTuningResponseSlider')"></div>
                    <div class="slider-value">{{ sliderFFGainDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderFeedforwardGain"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderFeedforwardGain"
                            @input="onSliderChange"
                            :disabled="sliderFFGainDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningResponseSliderHelp')"></div>
                </div>

                <!-- Divider before advanced sliders -->
                <div class="sliderDivider" v-show="showAdvancedSliders">
                    <hr />
                </div>

                <!-- Advanced Sliders -->
                <div
                    class="slider-row advancedSlider"
                    :class="{ disabledSliders: dMaxSliderDisabled }"
                    v-show="showDMaxSlider"
                >
                    <div class="slider-label" v-html="$t('pidTuningDMaxGainSlider')"></div>
                    <div class="slider-value">{{ sliderDMaxGainDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderDMaxGain"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderDMaxGain"
                            @input="onSliderChange"
                            :disabled="dMaxSliderDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningDMaxGainSliderHelp')"></div>
                </div>

                <div
                    class="slider-row advancedSlider"
                    :class="{ disabledSliders: iGainSliderDisabled }"
                    v-show="showIGainSlider"
                >
                    <div class="slider-label" v-html="$t('pidTuningIGainSlider')"></div>
                    <div class="slider-value">{{ sliderIGainDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderIGain"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderIGain"
                            @input="onSliderChange"
                            :disabled="iGainSliderDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningIGainSliderHelp')"></div>
                </div>

                <div
                    class="slider-row advancedSlider"
                    :class="{ disabledSliders: rpRatioSliderDisabled }"
                    v-show="showRPRatioSlider"
                >
                    <div class="slider-label" v-html="$t('pidTuningRollPitchRatioSlider')"></div>
                    <div class="slider-value">{{ sliderRPRatioDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderRollPitchRatio"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderRollPitchRatio"
                            @input="onSliderChange"
                            :disabled="rpRatioSliderDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningRollPitchRatioSliderHelp')"></div>
                </div>

                <div
                    class="slider-row advancedSlider"
                    :class="{ disabledSliders: pitchPISliderDisabled }"
                    v-show="showPitchPISlider"
                >
                    <div class="slider-label" v-html="$t('pidTuningPitchPIGainSlider')"></div>
                    <div class="slider-value">{{ sliderPitchPIDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderPitchPIGain"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderPitchPIGain"
                            @input="onSliderChange"
                            :disabled="pitchPISliderDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningPitchPIGainSliderHelp')"></div>
                </div>

                <div
                    class="slider-row advancedSlider"
                    :class="{ disabledSliders: masterSliderDisabled }"
                    v-show="showMasterSlider"
                >
                    <div class="slider-label" v-html="$t('pidTuningMasterSlider')"></div>
                    <div class="slider-value">{{ sliderMasterDisplay }}</div>
                    <div class="slider-control">
                        <input
                            type="range"
                            class="tuningSlider"
                            id="sliderMasterMultiplier"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            v-model.number="sliderMasterMultiplier"
                            @input="onSliderChange"
                            :disabled="masterSliderDisabled"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningMasterSliderHelp')"></div>
                </div>

                <!-- Danger Zone Warning -->
                <div v-if="slidersInDangerZone" class="danger slidersWarning">
                    <p v-html="$t('pidTuningSliderWarning')"></p>
                </div>

                <!-- Warning Messages (Non-Expert Mode) -->
                <!-- Always show range restriction note when not in expert mode and sliders are on -->
                <div v-if="!props.expertMode && sliderPidsMode > 0" class="note expertSettingsDetectedNote">
                    <p v-html="$t('pidTuningPidSlidersNonExpertMode')"></p>
                </div>

                <!-- Show disabled warning when values are outside basic range -->
                <div v-if="showExpertSettingsWarning" class="note expertSettingsDetectedNote">
                    <p v-html="$t('pidTuningSlidersExpertSettingsDetectedNote')"></p>
                </div>
            </div>

            <!-- BARO, MAG, GPS Optional PIDs -->
            <div
                v-if="showAllLocal && hasBaroMagGpsPids"
                id="pid_baro_mag_gps"
                class="pid_optional gui_box grey pid_tuning"
            >
                <table class="pid_titlebar">
                    <tbody>
                        <tr>
                            <th class="name"></th>
                            <th class="proportional" v-html="$t('pidTuningProportional')"></th>
                            <th class="integral" v-html="$t('pidTuningIntegral')"></th>
                            <th class="derivative" v-html="$t('pidTuningDerivative')"></th>
                        </tr>
                    </tbody>
                </table>

                <!-- Altitude (Baro) PIDs -->
                <template v-if="hasPidName('ALT') || hasPidName('VEL')">
                    <table class="pid_tuning">
                        <tbody>
                            <tr>
                                <th colspan="4">
                                    <div class="pid_mode">{{ $t("pidTuningAltitude") }}</div>
                                </th>
                            </tr>
                            <tr v-if="hasPidName('ALT')" class="ALT">
                                <td></td>
                                <td><UInputNumber v-model="pidAltP" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidAltI" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidAltD" :step="1" :min="0" :max="255" /></td>
                            </tr>
                            <tr v-if="hasPidName('VEL')" class="VEL">
                                <td></td>
                                <td><UInputNumber v-model="pidVelP" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidVelI" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidVelD" :step="1" :min="0" :max="255" /></td>
                            </tr>
                        </tbody>
                    </table>
                </template>

                <!-- Mag PIDs -->
                <template v-if="hasPidName('MAG')">
                    <table class="pid_tuning">
                        <tbody>
                            <tr>
                                <th colspan="4">
                                    <div class="pid_mode">{{ $t("pidTuningMag") }}</div>
                                </th>
                            </tr>
                            <tr class="MAG">
                                <td></td>
                                <td><UInputNumber v-model="pidMagP" :step="1" :min="0" :max="255" /></td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </template>

                <!-- GPS PIDs -->
                <template v-if="hasPidName('Pos') || hasPidName('PosR') || hasPidName('NavR')">
                    <table class="pid_tuning">
                        <tbody>
                            <tr>
                                <th colspan="4">
                                    <div class="pid_mode">{{ $t("pidTuningGps") }}</div>
                                </th>
                            </tr>
                            <tr v-if="hasPidName('Pos')" class="Pos">
                                <td></td>
                                <td><UInputNumber v-model="pidPosP" :step="1" :min="0" :max="255" /></td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr v-if="hasPidName('PosR')" class="PosR">
                                <td></td>
                                <td><UInputNumber v-model="pidPosRP" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidPosRI" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidPosRD" :step="1" :min="0" :max="255" /></td>
                            </tr>
                            <tr v-if="hasPidName('NavR')" class="NavR">
                                <td></td>
                                <td><UInputNumber v-model="pidNavRP" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidNavRI" :step="1" :min="0" :max="255" /></td>
                                <td><UInputNumber v-model="pidNavRD" :step="1" :min="0" :max="255" /></td>
                            </tr>
                        </tbody>
                    </table>
                </template>
            </div>

            <!-- Angle/Horizon Section -->
            <div class="gui_box grey">
                <table class="pid_titlebar">
                    <tbody>
                        <tr>
                            <th class="third"></th>
                            <th class="third" style="width: 33%">{{ $t("pidTuningStrength") }}</th>
                            <th class="third" style="width: 33%">{{ $t("pidTuningTransition") }}</th>
                        </tr>
                    </tbody>
                </table>
                <table class="pid_tuning">
                    <tbody>
                        <tr>
                            <td class="third">{{ $t("pidTuningAngle") }}</td>
                            <td class="third">
                                <UInputNumber v-model="pidLevelAngle" :step="1" :min="0" :max="255" />
                            </td>
                            <td class="third"></td>
                        </tr>
                        <tr>
                            <td class="third">{{ $t("pidTuningHorizon") }}</td>
                            <td class="third">
                                <UInputNumber v-model="pidLevelHorizon" :step="1" :min="0" :max="255" />
                            </td>
                            <td class="third">
                                <UInputNumber v-model="pidLevelTransition" :step="1" :min="0" :max="255" />
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table class="pid_titlebar pid_titlebar_extended pid_sensitivity">
                    <tbody>
                        <tr>
                            <th class="third"></th>
                            <th class="third" style="width: 33%">{{ $t("pidTuningLevelAngleLimit") }}</th>
                            <th class="third" style="width: 33%"></th>
                        </tr>
                    </tbody>
                </table>
                <table class="pid_tuning pid_sensitivity">
                    <tbody>
                        <tr>
                            <td class="third"></td>
                            <td class="third">
                                <UInputNumber v-model="advancedTuning.levelAngleLimit" :step="1" :min="10" :max="200" />
                            </td>
                            <td class="third"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <!-- END Angle/Horizon Settings-->
        </div>
        <!-- END LEFT COLUMN -->

        <!-- RIGHT COLUMN: PID Controller Settings -->
        <div class="cf_column_right">
            <div class="gui_box grey pidControllerAdvancedSettings spacer_left">
                <table class="pid_titlebar new_rates">
                    <thead>
                        <tr>
                            <th>{{ $t("pidTuningPidSettings") }}</th>
                        </tr>
                    </thead>
                </table>
                <table class="compensation">
                    <tbody>
                        <!-- Feedforward Group -->
                        <tr class="feedforwardGroup">
                            <td><span v-html="$t('pidTuningFeedforwardGroup')"></span></td>
                            <td colspan="2">
                                <span class="feedforwardOption feedforwardJitterFactor suboption">
                                    <UInputNumber
                                        name="feedforwardJitterFactor"
                                        v-model="advancedTuning.feedforward_jitter_factor"
                                        :step="1"
                                        :min="0"
                                        :max="20"
                                    />
                                    <label>
                                        <span v-html="$t('pidTuningFeedforwardJitter')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningFeedforwardJitterHelp')"></div>
                                </span>

                                <span class="feedforwardOption feedforwardSmoothFactor suboption">
                                    <UInputNumber
                                        name="feedforwardSmoothFactor"
                                        v-model="advancedTuning.feedforward_smooth_factor"
                                        :step="1"
                                        :min="0"
                                        :max="95"
                                    />
                                    <label for="feedforwardSmoothFactor">
                                        <span v-html="$t('pidTuningFeedforwardSmoothFactor')"></span>
                                    </label>
                                    <div
                                        class="helpicon cf_tip"
                                        :title="$t('pidTuningFeedforwardSmoothnessHelp')"
                                    ></div>
                                </span>

                                <span class="feedforwardOption feedforwardAveraging suboption">
                                    <select
                                        id="feedforwardAveraging"
                                        v-model.number="advancedTuning.feedforward_averaging"
                                    >
                                        <option :value="0">{{ $t("pidTuningOptionOff") }}</option>
                                        <option :value="1">
                                            {{ $t("pidTuningFeedforwardAveragingOption2Point") }}
                                        </option>
                                        <option :value="2">
                                            {{ $t("pidTuningFeedforwardAveragingOption3Point") }}
                                        </option>
                                        <option :value="3">
                                            {{ $t("pidTuningFeedforwardAveragingOption4Point") }}
                                        </option>
                                    </select>
                                    <label for="feedforwardAveraging">
                                        <span v-html="$t('pidTuningFeedforwardAveraging')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningFeedforwardAveragingHelp')"></div>
                                </span>

                                <span class="feedforwardOption feedforwardBoost suboption">
                                    <UInputNumber
                                        name="feedforwardBoost"
                                        v-model="advancedTuning.feedforward_boost"
                                        :step="1"
                                        :min="0"
                                        :max="50"
                                    />
                                    <label for="feedforwardBoost">
                                        <span v-html="$t('pidTuningFeedforwardBoost')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningFeedforwardBoostHelp')"></div>
                                </span>

                                <span class="feedforwardOption feedforwardMaxRateLimit suboption">
                                    <UInputNumber
                                        name="feedforwardMaxRateLimit"
                                        v-model="advancedTuning.feedforward_max_rate_limit"
                                        :step="1"
                                        :min="0"
                                        :max="150"
                                    />
                                    <label>
                                        <span v-html="$t('pidTuningFeedforwardMaxRateLimit')"></span>
                                    </label>
                                    <div
                                        class="helpicon cf_tip"
                                        :title="$t('pidTuningFeedforwardMaxRateLimitHelp')"
                                    ></div>
                                </span>

                                <span class="feedforwardTransition suboption">
                                    <UInputNumber
                                        name="feedforwardTransition-number"
                                        v-model="feedforwardTransitionValue"
                                        :step="0.01"
                                        :min="0"
                                        :max="1"
                                    />
                                    <label>
                                        <span v-html="$t('pidTuningFeedforwardTransition')"></span>
                                    </label>
                                    <div
                                        class="helpicon cf_tip"
                                        :title="$t('pidTuningFeedforwardTransitionHelp')"
                                    ></div>
                                </span>
                            </td>
                        </tr>

                        <!-- I-term Relax -->
                        <tr class="itermrelax">
                            <td>
                                <input type="checkbox" id="itermrelax" class="toggle" v-model="itermRelaxEnabled" />
                            </td>
                            <td colspan="2">
                                <div class="helpicon cf_tip" :title="$t('pidTuningItermRelaxHelp')"></div>
                                <span v-html="$t('pidTuningItermRelax')"></span>

                                <span class="suboption" v-if="itermRelaxEnabled">
                                    <select id="itermrelaxAxes" v-model.number="advancedTuning.itermRelax">
                                        <option :value="1">{{ $t("pidTuningOptionRP") }}</option>
                                        <option :value="2">{{ $t("pidTuningOptionRPY") }}</option>
                                        <option :value="3">{{ $t("pidTuningItermRelaxAxesOptionRPInc") }}</option>
                                        <option :value="4">{{ $t("pidTuningItermRelaxAxesOptionRPYInc") }}</option>
                                    </select>
                                    <label for="itermrelaxAxes">
                                        <span v-html="$t('pidTuningItermRelaxAxes')"></span>
                                    </label>
                                </span>

                                <span class="suboption" v-if="itermRelaxEnabled">
                                    <select id="itermrelaxType" v-model.number="advancedTuning.itermRelaxType">
                                        <option :value="0">{{ $t("pidTuningItermRelaxTypeOptionGyro") }}</option>
                                        <option :value="1">{{ $t("pidTuningItermRelaxTypeOptionSetpoint") }}</option>
                                    </select>
                                    <label for="itermrelaxType">
                                        <span v-html="$t('pidTuningItermRelaxType')"></span>
                                    </label>
                                </span>

                                <span class="itermRelaxCutoff suboption" v-if="itermRelaxEnabled">
                                    <UInputNumber
                                        name="itermRelaxCutoff"
                                        v-model="advancedTuning.itermRelaxCutoff"
                                        :step="1"
                                        :min="1"
                                        :max="50"
                                    />
                                    <label for="itermRelaxCutoff">
                                        <span v-html="$t('pidTuningItermRelaxCutoff')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningItermRelaxCutoffHelp')"></div>
                                </span>
                            </td>
                        </tr>

                        <!-- Anti Gravity -->
                        <tr class="antigravity">
                            <td>
                                <input
                                    type="checkbox"
                                    id="antiGravitySwitch"
                                    class="toggle"
                                    v-model="antiGravityEnabled"
                                />
                            </td>
                            <td colspan="3">
                                <div class="helpicon cf_tip" :title="$t('pidTuningAntiGravityHelp')"></div>
                                <span v-html="$t('pidTuningAntiGravity')"></span>

                                <span class="suboption antiGravityMode" v-if="antiGravityEnabled">
                                    <select id="antiGravityMode" v-model.number="advancedTuning.antiGravityMode">
                                        <option :value="0">{{ $t("pidTuningAntiGravityModeOptionSmooth") }}</option>
                                        <option :value="1">{{ $t("pidTuningAntiGravityModeOptionStep") }}</option>
                                    </select>
                                    <label for="antiGravityMode">
                                        <span v-html="$t('pidTuningAntiGravityMode')"></span>
                                    </label>
                                </span>

                                <span class="suboption" v-if="antiGravityEnabled">
                                    <UInputNumber
                                        name="itermAcceleratorGain"
                                        v-model="antiGravityGainValue"
                                        :step="0.1"
                                        :min="0.1"
                                        :max="30"
                                    />
                                    <label for="antiGravityGain">
                                        <span v-html="$t('pidTuningAntiGravityGain')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningAntiGravityGainHelp')"></div>
                                </span>

                                <span class="suboption antiGravityThres" v-if="antiGravityEnabled">
                                    <UInputNumber
                                        name="itermThrottleThreshold"
                                        v-model="advancedTuning.itermThrottleThreshold"
                                        :step="10"
                                        :min="20"
                                        :max="1000"
                                    />
                                    <label for="antiGravityThres">
                                        <span v-html="$t('pidTuningAntiGravityThres')"></span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- I-term Rotation -->
                        <tr class="itermrotation">
                            <td>
                                <input
                                    type="checkbox"
                                    id="itermrotation"
                                    class="toggle"
                                    v-model="itermRotationEnabled"
                                />
                            </td>
                            <td colspan="2">
                                <span v-html="$t('pidTuningItermRotation')"></span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningItermRotationHelp')"></div>
                            </td>
                        </tr>

                        <!-- D-Max Group -->
                        <tr class="dMaxGroup">
                            <td>
                                <span v-html="$t('pidTuningDMaxSettingTitle')"></span>
                            </td>
                            <td colspan="3">
                                <span class="suboption">
                                    <UInputNumber
                                        name="dMaxGain"
                                        v-model="advancedTuning.dMaxGain"
                                        :step="1"
                                        :min="0"
                                        :max="100"
                                    />
                                    <label for="dMaxGain">
                                        <span v-html="$t('pidTuningDMaxGain')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningDMaxGainHelp')"></div>
                                </span>
                                <span class="suboption">
                                    <UInputNumber
                                        name="dMaxAdvance"
                                        v-model="advancedTuning.dMaxAdvance"
                                        :step="1"
                                        :min="0"
                                        :max="200"
                                    />
                                    <label for="dMaxAdvance">
                                        <span v-html="$t('pidTuningDMaxAdvance')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningDMaxAdvanceHelp')"></div>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Motor Settings -->
            <div class="gui_box grey pidControllerAdvancedSettings spacer_left">
                <table class="pid_titlebar new_rates">
                    <tbody>
                        <tr>
                            <th>{{ $t("pidTuningMotorSettings") }}</th>
                        </tr>
                    </tbody>
                </table>
                <table class="compensation">
                    <tbody>
                        <!-- Throttle Boost -->
                        <tr class="throttleBoost">
                            <td>
                                <UInputNumber
                                    name="throttleBoost-number"
                                    v-model="advancedTuning.throttleBoost"
                                    :step="1"
                                    :min="0"
                                    :max="100"
                                />
                            </td>
                            <td colspan="2">
                                <div>
                                    <label>
                                        <span v-html="$t('pidTuningThrottleBoost')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningThrottleBoostHelp')"></div>
                                </div>
                            </td>
                        </tr>

                        <!-- Motor Output Limit -->
                        <tr class="motorOutputLimit">
                            <td>
                                <UInputNumber
                                    name="motorLimit"
                                    v-model="advancedTuning.motorOutputLimit"
                                    :step="1"
                                    :min="1"
                                    :max="100"
                                />
                            </td>
                            <td colspan="2">
                                <div>
                                    <label>
                                        <span v-html="$t('pidTuningMotorOutputLimit')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningMotorLimitHelp')"></div>
                                </div>
                            </td>
                        </tr>

                        <!-- Dynamic Idle Min RPM -->
                        <tr class="idleMinRpm">
                            <td>
                                <UInputNumber
                                    name="idleMinRpm-number"
                                    v-model="advancedTuning.idleMinRpm"
                                    :step="1"
                                    :min="0"
                                    :max="idleMinRpmMax"
                                    :disabled="!dshotTelemetryEnabled"
                                />
                            </td>
                            <td colspan="2">
                                <div>
                                    <label>
                                        <span v-if="dshotTelemetryEnabled" v-html="$t('pidTuningIdleMinRpm')"></span>
                                        <span v-else v-html="$t('pidTuningIdleMinRpmDisabled')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningIdleMinRpmHelp')"></div>
                                </div>
                            </td>
                        </tr>

                        <!-- VBat Sag Compensation -->
                        <tr class="vbatSagCompensation">
                            <td>
                                <input
                                    type="checkbox"
                                    id="vbatSagCompensation"
                                    class="toggle"
                                    v-model="vbatSagEnabled"
                                />
                            </td>
                            <td colspan="2">
                                <span v-html="$t('pidTuningVbatSagCompensation')"></span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningVbatSagCompensationHelp')"></div>

                                <span class="vbatSagValue suboption" v-if="vbatSagEnabled">
                                    <UInputNumber
                                        name="vbatSagValue"
                                        v-model="advancedTuning.vbat_sag_compensation"
                                        :step="1"
                                        :min="1"
                                        :max="150"
                                    />
                                    <label for="vbatSagValue">
                                        <span v-html="$t('pidTuningVbatSagValue')"></span>
                                    </label>
                                </span>
                            </td>
                        </tr>

                        <!-- Thrust Linearization -->
                        <tr class="thrustLinearization">
                            <td>
                                <input
                                    type="checkbox"
                                    id="thrustLinearization"
                                    class="toggle"
                                    v-model="thrustLinearEnabled"
                                />
                            </td>
                            <td colspan="2">
                                <span v-html="$t('pidTuningThrustLinearization')"></span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningThrustLinearizationHelp')"></div>

                                <span class="thrustLinearValue suboption" v-if="thrustLinearEnabled">
                                    <UInputNumber
                                        name="thrustLinearValue"
                                        v-model="advancedTuning.thrustLinearization"
                                        :step="1"
                                        :min="1"
                                        :max="150"
                                    />
                                    <label for="thrustLinearValue">
                                        <span v-html="$t('pidTuningThrustLinearValue')"></span>
                                    </label>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- TPA Settings -->
            <div class="gui_box grey tpa pidControllerAdvancedSettings spacer_left">
                <table class="pid_titlebar tpa-header" aria-labelledby="tpa-header">
                    <tbody>
                        <tr>
                            <th v-if="usesAdvancedTpa">{{ $t("pidTuningTPAMode") }}</th>
                            <th>{{ $t("pidTuningTPARate") }}</th>
                            <th>{{ $t("pidTuningTPABreakPoint") }}</th>
                        </tr>
                    </tbody>
                </table>
                <table class="tpa-settings" aria-labelledby="tpa-settings" role="presentation">
                    <tbody>
                        <tr>
                            <td v-if="usesAdvancedTpa">
                                <select id="tpaMode" v-model.number="tpaMode">
                                    <option :value="0">{{ $t("pidTuningTPAPD") }}</option>
                                    <option :value="1">{{ $t("pidTuningTPAD") }}</option>
                                </select>
                            </td>
                            <td>
                                <UInputNumber id="tpaRate" v-model="tpaRate" :step="1" :min="0" :max="100" />
                            </td>
                            <td class="tpa-breakpoint">
                                <UInputNumber
                                    id="tpaBreakpoint"
                                    v-model="tpaBreakpoint"
                                    :step="10"
                                    :min="750"
                                    :max="2250"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Misc Settings -->
            <div class="gui_box grey pidControllerAdvancedSettings spacer_left">
                <table class="pid_titlebar new_rates">
                    <tbody>
                        <tr>
                            <th>{{ $t("pidTuningMiscSettings") }}</th>
                        </tr>
                    </tbody>
                </table>
                <table class="compensation">
                    <tbody>
                        <!-- Cell Count -->
                        <tr class="cellCount">
                            <td>
                                <select name="cellCount" v-model.number="advancedTuning.autoProfileCellCount">
                                    <option :value="-1">{{ $t("pidTuningCellCountChange") }}</option>
                                    <option :value="0">{{ $t("pidTuningCellCountStay") }}</option>
                                    <option :value="1">{{ $t("pidTuningCellCount1S") }}</option>
                                    <option :value="2">{{ $t("pidTuningCellCount2S") }}</option>
                                    <option :value="3">{{ $t("pidTuningCellCount3S") }}</option>
                                    <option :value="4">{{ $t("pidTuningCellCount4S") }}</option>
                                    <option :value="5">{{ $t("pidTuningCellCount5S") }}</option>
                                    <option :value="6">{{ $t("pidTuningCellCount6S") }}</option>
                                    <option :value="7">{{ $t("pidTuningCellCount7S") }}</option>
                                    <option :value="8">{{ $t("pidTuningCellCount8S") }}</option>
                                </select>
                            </td>
                            <td colspan="2">
                                <div>
                                    <label>
                                        <span v-html="$t('pidTuningCellCount')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningCellCountHelp')"></div>
                                </div>
                            </td>
                        </tr>

                        <!-- Acro Trainer Angle Limit -->
                        <tr class="acroTrainerAngleLimit">
                            <td>
                                <UInputNumber
                                    name="acroTrainerAngleLimit-number"
                                    v-model="advancedTuning.acroTrainerAngleLimit"
                                    :step="1"
                                    :min="10"
                                    :max="80"
                                />
                            </td>
                            <td colspan="2">
                                <div>
                                    <label>
                                        <span v-html="$t('pidTuningAcroTrainerAngleLimit')"></span>
                                    </label>
                                    <div
                                        class="helpicon cf_tip"
                                        :title="$t('pidTuningAcroTrainerAngleLimitHelp')"
                                    ></div>
                                </div>
                            </td>
                        </tr>

                        <!-- Integrated Yaw -->
                        <tr class="integratedYaw">
                            <td>
                                <input
                                    type="checkbox"
                                    id="useIntegratedYaw"
                                    class="toggle"
                                    v-model="integratedYawEnabled"
                                />
                            </td>
                            <td colspan="2">
                                <div class="helpicon cf_tip" :title="$t('pidTuningIntegratedYawHelp')"></div>
                                <span v-html="$t('pidTuningIntegratedYaw')"></span>
                                <span class="spacer_left" v-html="$t('pidTuningIntegratedYawCaution')"></span>
                            </td>
                        </tr>

                        <!-- Absolute Control -->
                        <tr class="absoluteControlGain">
                            <td>
                                <UInputNumber
                                    name="absoluteControlGain-number"
                                    v-model="advancedTuning.absoluteControlGain"
                                    :step="1"
                                    :min="0"
                                    :max="20"
                                />
                            </td>
                            <td colspan="2">
                                <div>
                                    <label>
                                        <span v-html="$t('pidTuningAbsoluteControlGain')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningAbsoluteControlGainHelp')"></div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <!-- END RIGHT COLUMN -->
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import FC from "@/js/fc";
import {
    NON_EXPERT_SLIDER_MIN,
    NON_EXPERT_SLIDER_MAX,
    calculateNewPids,
    readPidSliderPositions,
} from "@/composables/useTuningSliders";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";

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
    get: () => (FC.ADVANCED_TUNING.feedforwardTransition / 100).toFixed(2),
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
    get: () => (FC.ADVANCED_TUNING.antiGravityGain / 10).toFixed(1),
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

// Slider change handler
async function onSliderChange(event) {
    isUserInteracting.value = true;

    // Clamp the slider the user is actually dragging to the non-expert range.
    // We only clamp the active slider — other sliders may legitimately be
    // outside range (loaded from FC via CLI) and must not be silently reset.
    if (!props.expertMode && event?.target?.id) {
        const refMap = {
            sliderDGain,
            sliderPIGain,
            sliderFeedforwardGain,
        };
        const active = refMap[event.target.id];
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

<style scoped>
/* Component-specific styles */
.disabledSliders {
    opacity: 0.5;
}

.pid_roll,
.pid_pitch,
.pid_yaw {
    font-weight: bold;
    color: white;
    text-align: center;
    padding: 5px;
}

.expertSettingsDetectedNote {
    margin: 10px;
    padding: 10px;
    background-color: #ffe4b5;
    border: 1px solid #ff8c00;
    border-radius: 3px;
    color: #333;
}

.expertSettingsDetectedNote p {
    margin: 0;
    color: #333;
}

.gui_box.grey {
    margin-bottom: 10px;
}

/* Slider Header */
.slider-header {
    display: grid;
    grid-template-columns: 20% 60px 1fr 30px;
    align-items: center;
    padding: 0.5rem 10px;
    background-color: var(--surface-300);
    color: #fff;
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
    gap: 10px;
}

.slider-mode-section {
    display: flex;
    align-items: center;
    gap: 8px;
    grid-column: 1 / 3;
}

.slider-mode-section .sm-min {
    white-space: nowrap;
    font-size: 12px;
}

.slider-range-labels {
    display: flex;
    justify-content: space-around;
    align-items: center;
    text-align: center;
    font-size: 12px;
}

.slider-range-labels span {
    flex: 1;
}

/* Slider Rows */
.slider-row {
    display: grid;
    grid-template-columns: 20% 60px 1fr 30px;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--surface-500);
    gap: 10px;
}

.slider-row:last-child {
    border-bottom: none;
}

.slider-label {
    text-align: right;
    font-size: 12px;
    line-height: 1.3;
    padding-right: 10px;
}

.slider-value {
    text-align: center;
    font-weight: bold;
    font-size: 13px;
}

.slider-control {
    display: flex;
    align-items: center;
}

.slider-control input[type="range"] {
    width: 100%;
}

.slider-row .helpicon {
    display: flex;
    justify-content: center;
    align-items: center;
}

/* Divider */
.sliderDivider {
    padding: 8px 0;
}

.sliderDivider hr {
    border: none;
    border-top: 1px solid var(--surface-500);
    border-bottom: 1px solid var(--surface-500);
    height: 2px;
    margin: 0;
}
</style>
