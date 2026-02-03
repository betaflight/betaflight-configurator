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
                            <input type="number" v-model.number="advancedTuning.dMaxRoll" step="1" min="0" max="250" />
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
                            <input type="number" v-model.number="advancedTuning.dMaxPitch" step="1" min="0" max="250" />
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
                            <input type="number" v-model.number="advancedTuning.dMaxYaw" step="1" min="0" max="250" />
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
                <p style="padding: 20px">{{ $t("pidTuningPidControllerAdvancedSettings") }} - Coming soon...</p>
            </div>
        </div>
        <!-- END RIGHT COLUMN -->
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
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
});

// Profile name
const profileName = ref("");
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

// Advanced tuning - reactive reference
const advancedTuning = computed(() => FC.ADVANCED_TUNING);

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
    console.log("[PidSubTab] initializeSliders - TuningSliders.sliderDGain:", TuningSliders.sliderDGain);
    console.log("[PidSubTab] initializeSliders - Before: sliderDGain.value:", sliderDGain.value);

    sliderPidsMode.value = TuningSliders.sliderPidsMode;
    sliderDGain.value = TuningSliders.sliderDGain;
    sliderPIGain.value = TuningSliders.sliderPIGain;
    sliderFeedforwardGain.value = TuningSliders.sliderFeedforwardGain;
    sliderDMaxGain.value = TuningSliders.sliderDMaxGain;
    sliderIGain.value = TuningSliders.sliderIGain;
    sliderRollPitchRatio.value = TuningSliders.sliderRollPitchRatio;
    sliderPitchPIGain.value = TuningSliders.sliderPitchPIGain;
    sliderMasterMultiplier.value = TuningSliders.sliderMasterMultiplier;

    if (showProfileName.value && FC.CONFIG.pidProfileNames) {
        profileName.value = FC.CONFIG.pidProfileNames[FC.CONFIG.profile] || "";
    }

    // Force Vue to update the DOM
    await nextTick();

    console.log("[PidSubTab] initializeSliders - After: sliderDGain.value:", sliderDGain.value);
    console.log("[PidSubTab] initializeSliders - Computed display:", sliderDGainDisplay.value);
}

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

    // Reset flag after a longer delay to prevent watcher interference
    setTimeout(() => {
        isUserInteracting.value = false;
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
    console.log("[PidSubTab] onMounted - Initializing sliders");
    initializeSliders();
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
