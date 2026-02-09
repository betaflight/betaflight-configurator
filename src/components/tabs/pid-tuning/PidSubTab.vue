<template>
    <div class="subtab-pid">
        <div class="clear-both"></div>

        <!-- LEFT COLUMN: PID Table and Sliders -->
        <div class="cf_column">
            <!-- Profile Name (API 1.45+) -->
            <div class="profile_name" v-if="showProfileName">
                <div class="number">
                    <label>
                        <input type="text" v-model="profileName" maxlength="8" style="width: 100px" />
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
                                    <div class="xs">Proportional</div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningProportionalHelp')"
                                        v-html="$t('pidTuningProportional')"
                                    ></div>
                                </div>
                            </th>
                            <th class="integral">
                                <div class="name-helpicon-flex">
                                    <div class="xs">Integral</div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningIntegralHelp')"
                                        v-html="$t('pidTuningIntegral')"
                                    ></div>
                                </div>
                            </th>
                            <th class="derivative">
                                <div class="name-helpicon-flex">
                                    <div class="xs">Derivative</div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningDerivativeHelp')"
                                        v-html="$t('pidTuningDerivative')"
                                    ></div>
                                </div>
                            </th>
                            <th class="dmax">
                                <div class="name-helpicon-flex">
                                    <div class="xs">D Max</div>
                                    <div
                                        class="cf_tip sm-min"
                                        :title="$t('pidTuningDMaxHelp')"
                                        v-html="$t('pidTuningDMax')"
                                    ></div>
                                </div>
                            </th>
                            <th class="feedforward">
                                <div class="name-helpicon-flex">
                                    <div class="xs">Feedforward</div>
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
                                <input type="number" v-model.number="pidRoll[0]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidRoll[1]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidRoll[2]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.dMaxRoll"
                                    step="1"
                                    min="0"
                                    max="250"
                                />
                            </td>
                            <td class="pid_data">
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.feedforwardRoll"
                                    step="1"
                                    min="0"
                                    max="2000"
                                />
                            </td>
                        </tr>

                        <!-- PITCH -->
                        <tr class="PITCH">
                            <td class="pid_pitch" style="background-color: #49c747">PITCH</td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidPitch[0]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidPitch[1]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidPitch[2]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.dMaxPitch"
                                    step="1"
                                    min="0"
                                    max="250"
                                />
                            </td>
                            <td class="pid_data">
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.feedforwardPitch"
                                    step="1"
                                    min="0"
                                    max="2000"
                                />
                            </td>
                        </tr>

                        <!-- YAW -->
                        <tr class="YAW">
                            <td class="pid_yaw" style="background-color: #477ac7">YAW</td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidYaw[0]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidYaw[1]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input type="number" v-model.number="pidYaw[2]" step="1" min="0" max="250" />
                            </td>
                            <td class="pid_data">
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.dMaxYaw"
                                    step="1"
                                    min="0"
                                    max="250"
                                />
                            </td>
                            <td class="pid_data">
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.feedforwardYaw"
                                    step="1"
                                    min="0"
                                    max="2000"
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
                <div class="slider-row advancedSlider" v-show="showDMaxSlider">
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
                            :disabled="!sliderPidsMode"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningDMaxGainSliderHelp')"></div>
                </div>

                <div class="slider-row advancedSlider" v-show="showIGainSlider">
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
                            :disabled="!sliderPidsMode"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningIGainSliderHelp')"></div>
                </div>

                <div class="slider-row advancedSlider" v-show="showRPRatioSlider">
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
                            :disabled="!sliderPidsMode"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningRollPitchRatioSliderHelp')"></div>
                </div>

                <div class="slider-row advancedSlider" v-show="showPitchPISlider">
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
                            :disabled="!sliderPidsMode"
                        />
                    </div>
                    <div class="helpicon cf_tip" :title="$t('pidTuningPitchPIGainSliderHelp')"></div>
                </div>

                <div class="slider-row advancedSlider" v-show="showMasterSlider">
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
                            :disabled="!sliderPidsMode"
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
                                <input type="number" v-model.number="pidLevel[0]" step="1" min="0" max="255" />
                            </td>
                            <td class="third"></td>
                        </tr>
                        <tr>
                            <td class="third">{{ $t("pidTuningHorizon") }}</td>
                            <td class="third">
                                <input type="number" v-model.number="pidLevel[1]" step="1" min="0" max="255" />
                            </td>
                            <td class="third">
                                <input type="number" v-model.number="pidLevel[2]" step="1" min="0" max="255" />
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
                                <input
                                    type="number"
                                    v-model.number="advancedTuning.levelAngleLimit"
                                    step="1"
                                    min="10"
                                    max="200"
                                />
                            </td>
                            <td class="third"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
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
                                    <input
                                        type="number"
                                        name="feedforwardJitterFactor"
                                        v-model.number="advancedTuning.feedforward_jitter_factor"
                                        step="1"
                                        min="0"
                                        max="20"
                                    />
                                    <label>
                                        <span v-html="$t('pidTuningFeedforwardJitter')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningFeedforwardJitterHelp')"></div>
                                </span>

                                <span class="feedforwardOption feedforwardSmoothFactor suboption">
                                    <input
                                        type="number"
                                        name="feedforwardSmoothFactor"
                                        v-model.number="advancedTuning.feedforward_smooth_factor"
                                        step="1"
                                        min="0"
                                        max="95"
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
                                    <input
                                        type="number"
                                        name="feedforwardBoost"
                                        v-model.number="advancedTuning.feedforward_boost"
                                        step="1"
                                        min="0"
                                        max="50"
                                    />
                                    <label for="feedforwardBoost">
                                        <span v-html="$t('pidTuningFeedforwardBoost')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningFeedforwardBoostHelp')"></div>
                                </span>

                                <span class="feedforwardOption feedforwardMaxRateLimit suboption">
                                    <input
                                        type="number"
                                        name="feedforwardMaxRateLimit"
                                        v-model.number="advancedTuning.feedforward_max_rate_limit"
                                        step="1"
                                        min="0"
                                        max="150"
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
                                    <input
                                        type="number"
                                        name="feedforwardTransition-number"
                                        v-model.number="feedforwardTransitionValue"
                                        step="0.01"
                                        min="0.00"
                                        max="1.00"
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
                                    <input
                                        type="number"
                                        name="itermRelaxCutoff"
                                        v-model.number="advancedTuning.itermRelaxCutoff"
                                        step="1"
                                        min="1"
                                        max="50"
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
                                    <input
                                        type="number"
                                        name="itermAcceleratorGain"
                                        v-model.number="antiGravityGainValue"
                                        step="0.1"
                                        min="0.1"
                                        max="30"
                                    />
                                    <label for="antiGravityGain">
                                        <span v-html="$t('pidTuningAntiGravityGain')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningAntiGravityGainHelp')"></div>
                                </span>

                                <span class="suboption antiGravityThres" v-if="antiGravityEnabled">
                                    <input
                                        type="number"
                                        name="itermThrottleThreshold"
                                        v-model.number="advancedTuning.itermThrottleThreshold"
                                        step="10"
                                        min="20"
                                        max="1000"
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
                                    <input
                                        type="number"
                                        name="dMaxGain"
                                        v-model.number="advancedTuning.dMaxGain"
                                        step="1"
                                        min="0"
                                        max="100"
                                    />
                                    <label for="dMaxGain">
                                        <span v-html="$t('pidTuningDMaxGain')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningDMaxGainHelp')"></div>
                                </span>
                                <span class="suboption">
                                    <input
                                        type="number"
                                        name="dMaxAdvance"
                                        v-model.number="advancedTuning.dMaxAdvance"
                                        step="1"
                                        min="0"
                                        max="200"
                                    />
                                    <label for="dMaxAdvance">
                                        <span v-html="$t('pidTuningDMaxAdvance')"></span>
                                    </label>
                                    <div class="helpicon cf_tip" :title="$t('pidTuningDMaxAdvanceHelp')"></div>
                                </span>
                            </td>
                        </tr>

                        <!-- Dynamic Damping (if API >= 1.48) -->
                        <!-- TODO: Not yet implemented in firmware - keys don't exist
                    <tr class="dynamicDamping" v-if="showDynamicDamping">
                        <td>
                            <span v-html="$t('pidTuningDynamicDamping')"></span>
                        </td>
                        <td colspan="3">
                            <span class="suboption">
                                <input
                                    type="number"
                                    name="dynamicDampingGain"
                                    v-model.number="rcTuning.dynamicDampingGain"
                                    step="1"
                                    min="0"
                                    max="250"
                                />
                                <label>
                                    <span v-html="$t('pidTuningDynamicDampingGain')"></span>
                                </label>
                            </span>
                            <span class="suboption">
                                <input
                                    type="number"
                                    name="dynamicDampingAdvance"
                                    v-model.number="rcTuning.dynamicDampingAdvance"
                                    step="1"
                                    min="0"
                                    max="250"
                                />
                                <label>
                                    <span v-html="$t('pidTuningDynamicDampingAdvance')"></span>
                                </label>
                            </span>
                        </td>
                    </tr>
                    --></tbody>
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
                                <input
                                    type="number"
                                    name="throttleBoost-number"
                                    v-model.number="advancedTuning.throttleBoost"
                                    step="1"
                                    min="0"
                                    max="100"
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
                                <input
                                    type="number"
                                    name="motorLimit"
                                    v-model.number="advancedTuning.motorOutputLimit"
                                    step="1"
                                    min="1"
                                    max="100"
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
                                    <input
                                        type="number"
                                        name="vbatSagValue"
                                        v-model.number="advancedTuning.vbat_sag_compensation"
                                        step="1"
                                        min="1"
                                        max="150"
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
                                    <input
                                        type="number"
                                        name="thrustLinearValue"
                                        v-model.number="advancedTuning.thrustLinearization"
                                        step="1"
                                        min="1"
                                        max="150"
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
                                <input type="number" id="tpaRate" v-model.number="tpaRate" step="1" min="0" max="100" />
                            </td>
                            <td class="tpa-breakpoint">
                                <input
                                    type="number"
                                    id="tpaBreakpoint"
                                    v-model.number="tpaBreakpoint"
                                    step="10"
                                    min="750"
                                    max="2250"
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
                                <input
                                    type="number"
                                    name="acroTrainerAngleLimit-number"
                                    v-model.number="advancedTuning.acroTrainerAngleLimit"
                                    step="1"
                                    min="10"
                                    max="80"
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

                        <!-- Smart Feedforward -->
                        <tr class="smartfeedforward">
                            <td>
                                <input
                                    type="checkbox"
                                    id="smartfeedforward"
                                    class="toggle"
                                    v-model="smartFeedforwardEnabled"
                                />
                            </td>
                            <td colspan="2">
                                <span v-html="$t('pidTuningSmartFeedforward')"></span>
                                <div class="helpicon cf_tip" :title="$t('pidTuningSmartFeedforwardHelp')"></div>
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
                                <input
                                    type="number"
                                    name="absoluteControlGain-number"
                                    v-model.number="advancedTuning.absoluteControlGain"
                                    step="1"
                                    min="0"
                                    max="20"
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
import TuningSliders from "@/js/TuningSliders";
import semver from "semver";
import { API_VERSION_1_45 } from "@/js/data_storage";

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

// Profile name
const profileName = computed({
    get: () => props.profileName,
    set: (value) => emit("update:profileName", value),
});
const showProfileName = computed(() => {
    return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);
});

// PIDs - Direct reactive references to FC.PIDS
const pidRoll = computed({
    get: () => FC.PIDS[0],
    set: (val) => {
        FC.PIDS[0] = val;
    },
});

const pidPitch = computed({
    get: () => FC.PIDS[1],
    set: (val) => {
        FC.PIDS[1] = val;
    },
});

const pidYaw = computed({
    get: () => FC.PIDS[2],
    set: (val) => {
        FC.PIDS[2] = val;
    },
});

const pidLevel = computed({
    get: () => FC.PIDS[3],
    set: (val) => {
        FC.PIDS[3] = val;
    },
});

// Advanced tuning - reactive reference
const advancedTuning = computed(() => FC.ADVANCED_TUNING);

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

// RC Tuning - reactive reference
const rcTuning = computed(() => FC.RC_TUNING);

// Feedforward transition display value (divided by 100 for display)
const feedforwardTransitionValue = computed({
    get: () => (FC.ADVANCED_TUNING.feedforwardTransition / 100).toFixed(2),
    set: (val) => {
        FC.ADVANCED_TUNING.feedforwardTransition = Math.round(parseFloat(val) * 100);
    },
});

// Show Dynamic Damping for API >= 1.48
const showDynamicDamping = computed(() => {
    return semver.gte(FC.CONFIG.apiVersion, "1.48.0");
});

// PID Controller Settings - Checkbox computed refs
const itermRelaxEnabled = computed({
    get: () => FC.ADVANCED_TUNING.itermRelax !== 0,
    set: (val) => {
        FC.ADVANCED_TUNING.itermRelax = val ? FC.ADVANCED_TUNING.itermRelax || 1 : 0;
    },
});

const antiGravityEnabled = computed({
    get: () => FC.ADVANCED_TUNING.antiGravityGain !== 0,
    set: (val) => {
        if (val) {
            FC.ADVANCED_TUNING.antiGravityGain = FC.ADVANCED_TUNING.antiGravityGain || 80;
        } else {
            FC.ADVANCED_TUNING.antiGravityGain = 0;
        }
    },
});

// Anti-gravity gain display value (divided by 10 for display)
const antiGravityGainValue = computed({
    get: () => (FC.ADVANCED_TUNING.antiGravityGain / 10).toFixed(1),
    set: (val) => {
        FC.ADVANCED_TUNING.antiGravityGain = Math.round(parseFloat(val) * 10);
    },
});

const itermRotationEnabled = computed({
    get: () => FC.ADVANCED_TUNING.itermRotation !== 0,
    set: (val) => {
        FC.ADVANCED_TUNING.itermRotation = val ? 1 : 0;
    },
});

const vbatSagEnabled = computed({
    get: () => FC.ADVANCED_TUNING.vbat_sag_compensation !== 0,
    set: (val) => {
        FC.ADVANCED_TUNING.vbat_sag_compensation = val ? FC.ADVANCED_TUNING.vbat_sag_compensation || 75 : 0;
    },
});

const thrustLinearEnabled = computed({
    get: () => FC.ADVANCED_TUNING.thrustLinearization !== 0,
    set: (val) => {
        FC.ADVANCED_TUNING.thrustLinearization = val ? FC.ADVANCED_TUNING.thrustLinearization || 100 : 0;
    },
});

const smartFeedforwardEnabled = computed({
    get: () => FC.ADVANCED_TUNING.smartFeedforward !== 0,
    set: (val) => {
        FC.ADVANCED_TUNING.smartFeedforward = val ? 1 : 0;
    },
});

const integratedYawEnabled = computed({
    get: () => FC.ADVANCED_TUNING.useIntegratedYaw !== 0,
    set: (val) => {
        FC.ADVANCED_TUNING.useIntegratedYaw = val ? 1 : 0;
    },
});

// Sliders - bridge to TuningSliders.js (values are 0.0-2.0)
const sliderPidsMode = ref(2);
const sliderDGain = ref(1.0);
const sliderPIGain = ref(1.0);
const sliderFeedforwardGain = ref(1.0);
const sliderDMaxGain = ref(1.0);
const sliderIGain = ref(1.0);
const sliderRollPitchRatio = ref(1.0);
const sliderPitchPIGain = ref(1.0);
const sliderMasterMultiplier = ref(1.0);

// Flag to prevent watcher from overriding user input
const isUserInteracting = ref(false);

// Computed display values to ensure reactivity
const sliderDGainDisplay = computed(() => sliderDGain.value.toFixed(2));
const sliderPIGainDisplay = computed(() => sliderPIGain.value.toFixed(2));
const sliderFFGainDisplay = computed(() => sliderFeedforwardGain.value.toFixed(2));
const sliderDMaxGainDisplay = computed(() => sliderDMaxGain.value.toFixed(2));
const sliderIGainDisplay = computed(() => sliderIGain.value.toFixed(2));
const sliderRPRatioDisplay = computed(() => sliderRollPitchRatio.value.toFixed(2));
const sliderPitchPIDisplay = computed(() => sliderPitchPIGain.value.toFixed(2));
const sliderMasterDisplay = computed(() => sliderMasterMultiplier.value.toFixed(2));

// Slider disabled states - only disable when mode is OFF
const sliderDGainDisabled = computed(() => {
    return !sliderPidsMode.value;
});

const sliderPIGainDisabled = computed(() => {
    return !sliderPidsMode.value;
});

const sliderFFGainDisabled = computed(() => {
    return !sliderPidsMode.value;
});

// Advanced sliders visibility - ONLY show in expert mode
const showAdvancedSliders = computed(() => {
    return props.expertMode;
});

const showDMaxSlider = computed(() => {
    return props.expertMode;
});

const showIGainSlider = computed(() => {
    return props.expertMode;
});

const showRPRatioSlider = computed(() => {
    return props.expertMode;
});

const showPitchPISlider = computed(() => {
    return props.expertMode;
});

const showMasterSlider = computed(() => {
    return props.expertMode;
});

// Check if sliders are in danger zone (high PID/D values)
const slidersInDangerZone = computed(() => {
    const WARNING_P_GAIN = 70;
    const WARNING_D_MAX_GAIN = 60;
    const WARNING_I_GAIN = 2.5 * FC.PIDS[0][0];
    const WARNING_D_GAIN = 42;

    const enableWarning = semver.lt(FC.CONFIG.apiVersion, "1.47.0")
        ? FC.PIDS[0][0] > WARNING_P_GAIN ||
          FC.PIDS[0][1] > WARNING_I_GAIN ||
          FC.PIDS[0][2] > WARNING_D_MAX_GAIN ||
          FC.ADVANCED_TUNING.dMaxRoll > WARNING_D_GAIN
        : FC.PIDS[0][0] > WARNING_P_GAIN ||
          FC.PIDS[0][1] > WARNING_I_GAIN ||
          FC.PIDS[0][2] > WARNING_D_GAIN ||
          FC.ADVANCED_TUNING.dMaxRoll > WARNING_D_MAX_GAIN;

    return enableWarning && sliderPidsMode.value > 0;
});

// Check if any sliders are outside non-expert range
const hasBasicSlidersOutsideRange = computed(() => {
    const NON_EXPERT_MIN = TuningSliders.NON_EXPERT_SLIDER_MIN / 100; // 0.7
    const NON_EXPERT_MAX = TuningSliders.NON_EXPERT_SLIDER_MAX / 100; // 1.4

    return (
        sliderDGain.value < NON_EXPERT_MIN ||
        sliderDGain.value > NON_EXPERT_MAX ||
        sliderPIGain.value < NON_EXPERT_MIN ||
        sliderPIGain.value > NON_EXPERT_MAX ||
        sliderFeedforwardGain.value < NON_EXPERT_MIN ||
        sliderFeedforwardGain.value > NON_EXPERT_MAX
    );
});

const hasAdvancedSlidersChanged = computed(() => {
    return (
        sliderDMaxGain.value !== 1.0 ||
        sliderIGain.value !== 1.0 ||
        sliderRollPitchRatio.value !== 1.0 ||
        sliderPitchPIGain.value !== 1.0 ||
        sliderMasterMultiplier.value !== 1.0
    );
});

// Show warning when not in expert mode and sliders are outside range or changed
const showExpertSettingsWarning = computed(() => {
    if (props.expertMode) return false;
    if (!sliderPidsMode.value) return false;

    return hasBasicSlidersOutsideRange.value || hasAdvancedSlidersChanged.value;
});

// Initialize sliders from TuningSliders.js
async function initializeSliders() {
    sliderPidsMode.value = TuningSliders.sliderPidsMode;
    sliderDGain.value = TuningSliders.sliderDGain;
    sliderPIGain.value = TuningSliders.sliderPIGain;
    sliderFeedforwardGain.value = TuningSliders.sliderFeedforwardGain;
    sliderDMaxGain.value = TuningSliders.sliderDMaxGain;
    sliderIGain.value = TuningSliders.sliderIGain;
    sliderRollPitchRatio.value = TuningSliders.sliderRollPitchRatio;
    sliderPitchPIGain.value = TuningSliders.sliderPitchPIGain;
    sliderMasterMultiplier.value = TuningSliders.sliderMasterMultiplier;

    // Force Vue to update the DOM
    await nextTick();
}

// Track timeout to prevent race conditions
let userInteractionTimeout = null;

// Slider change handler
function onSliderChange() {
    isUserInteracting.value = true;

    // Update TuningSliders.js state
    TuningSliders.sliderDGain = sliderDGain.value;
    TuningSliders.sliderPIGain = sliderPIGain.value;
    TuningSliders.sliderFeedforwardGain = sliderFeedforwardGain.value;
    TuningSliders.sliderDMaxGain = sliderDMaxGain.value;
    TuningSliders.sliderIGain = sliderIGain.value;
    TuningSliders.sliderRollPitchRatio = sliderRollPitchRatio.value;
    TuningSliders.sliderPitchPIGain = sliderPitchPIGain.value;
    TuningSliders.sliderMasterMultiplier = sliderMasterMultiplier.value;

    // Calculate new PIDs
    TuningSliders.calculateNewPids();

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
    TuningSliders.sliderPidsMode = sliderPidsMode.value;
    onSliderChange();
}

// Watch expert mode changes
watch(
    () => props.expertMode,
    (newValue) => {
        if (newValue !== undefined) {
            TuningSliders.setExpertMode(newValue);
        }
    },
);

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
