<template>
    <BaseTab tab-name="pid_tuning">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabPidTuning") }}</div>
            <WikiButton docUrl="PID-Tuning" />

            <div class="content_wrapper_header">
                <!-- Profile Selector -->
                <div class="profile single-field">
                    <div class="helpicon cf_tip" :title="$t('pidTuningProfileTip')"></div>
                    <div class="head">{{ $t("pidTuningProfile") }}</div>
                    <div>
                        <select v-model.number="currentProfile" @change="onProfileChange">
                            <option v-for="i in 3" :key="i" :value="i - 1">{{ i }}</option>
                        </select>
                    </div>
                </div>

                <!-- Rate Profile Selector -->
                <div class="rate_profile single-field">
                    <div class="helpicon cf_tip" :title="$t('pidTuningRateProfileTip')"></div>
                    <div class="head">{{ $t("pidTuningRateProfile") }}</div>
                    <div>
                        <select v-model.number="currentRateProfile" @change="onRateProfileChange">
                            <option v-for="i in 6" :key="i" :value="i - 1">{{ i }}</option>
                        </select>
                    </div>
                </div>

                <!-- PID Controller (Hidden for API >= 1.41) -->
                <div class="controller single-field" v-if="showPidController">
                    <div class="helpicon cf_tip" :title="$t('pidTuningPidControllerTip')"></div>
                    <div class="head">{{ $t("pidTuningControllerHead") }}</div>
                    <div>
                        <select v-model.number="pidController">
                            <option v-for="controller in pidControllers" :key="controller" :value="controller">
                                {{ controller }}
                            </option>
                        </select>
                    </div>
                </div>

                <!-- Header Buttons -->
                <div class="content_wrapper_header_btns">
                    <div class="default_btn copyprofilebtn">
                        <a href="#" @click.prevent="copyProfile">{{ $t("pidTuningCopyProfile") }}</a>
                    </div>
                    <div class="default_btn copyrateprofilebtn">
                        <a href="#" @click.prevent="copyRateProfile">{{ $t("pidTuningCopyRateProfile") }}</a>
                    </div>
                    <div class="default_btn resetbt">
                        <a href="#" @click.prevent="resetProfile">{{ $t("pidTuningResetPidProfile") }}</a>
                    </div>
                    <div class="default_btn show showAllPids">
                        <a href="#" @click.prevent="toggleShowAllPids">{{ $t("pidTuningShowAllPids") }}</a>
                    </div>
                </div>
            </div>

            <!-- Sub-tab Navigation -->
            <div class="tab-container">
                <div class="tab pid" :class="{ active: activeSubtab === 'pid' }" @click="activeSubtab = 'pid'">
                    <a href="#">{{ $t("pidTuningSubTabPid") }}</a>
                </div>
                <div class="tab rates" :class="{ active: activeSubtab === 'rates' }" @click="activeSubtab = 'rates'">
                    <a href="#">{{ $t("pidTuningSubTabRates") }}</a>
                </div>
                <div class="tab filter" :class="{ active: activeSubtab === 'filter' }" @click="activeSubtab = 'filter'">
                    <a href="#">{{ $t("pidTuningSubTabFilter") }}</a>
                </div>
            </div>

            <!-- Tab Content -->
            <div class="tabarea">
                <form name="pid-tuning" id="pid-tuning">
                    <PidSubTab
                        ref="pidSubTab"
                        v-if="activeSubtab === 'pid'"
                        :expert-mode="expertModeEnabled"
                        :show-all-pids="showAllPids"
                    />
                    <RatesSubTab ref="ratesSubTab" v-if="activeSubtab === 'rates'" />
                    <FilterSubTab v-if="activeSubtab === 'filter'" />
                </form>
            </div>

            <!-- Save/Revert Buttons -->
            <div class="content_toolbar">
                <div class="btn save_btn">
                    <a href="#" @click.prevent="save" :class="{ disabled: !hasChanges }">
                        <span>{{ $t("pidTuningButtonSave") }}</span>
                    </a>
                </div>
                <div class="btn refresh_btn">
                    <a href="#" @click.prevent="revert" :class="{ disabled: !hasChanges }">
                        <span>{{ $t("pidTuningButtonRefresh") }}</span>
                    </a>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import PidSubTab from "./pid-tuning/PidSubTab.vue";
import RatesSubTab from "./pid-tuning/RatesSubTab.vue";
import FilterSubTab from "./pid-tuning/FilterSubTab.vue";
import GUI from "@/js/gui";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import FC from "@/js/fc";
import TuningSliders from "@/js/TuningSliders";
import { mspHelper } from "@/js/msp/MSPHelper";
import semver from "semver";
import { API_VERSION_1_41, API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";
import { isExpertModeEnabled } from "@/js/utils/isExpertModeEnabled";
import { tabState } from "@/js/tab_state";

const fcStore = useFlightControllerStore();

// State - use global reactive state for expert mode
const expertModeEnabled = computed(() => tabState.expertMode);
const activeSubtab = ref("pid");
const showAllPids = ref(false);
const currentProfile = ref(0);
const currentRateProfile = ref(0);
const pidController = ref(0);
const hasChanges = ref(false);
const isMounted = ref(false);
const pidSubTab = ref(null);
const ratesSubTab = ref(null);

// Original values for revert
const originalPids = ref([]);
const originalAdvancedTuning = ref({});
const originalRcTuning = ref({});
const originalFilterConfig = ref({});
const originalTuningSliders = ref({});

// Computed
const showPidController = computed(() => {
    return semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_41);
});

const pidControllers = computed(() => {
    return FC.PID_CONTROLLER_TYPES || [];
});

// MSP Data Loading
async function loadData() {
    try {
        if (!isMounted.value) return;

        // Load all PID tuning related MSP data
        await MSP.promise(MSPCodes.MSP_PID_CONTROLLER);
        await MSP.promise(MSPCodes.MSP_PIDNAMES);
        await MSP.promise(MSPCodes.MSP_PID);
        await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
        await MSP.promise(MSPCodes.MSP_RC_TUNING);
        await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC_DEADBAND);
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);

        // Profile names (API 1.45+)
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PID_PROFILE_NAME),
            );
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.RATE_PROFILE_NAME),
            );
        }

        // Status EX (API 1.47+)
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            await MSP.promise(MSPCodes.MSP_STATUS_EX);
        }

        await MSP.promise(MSPCodes.MSP_SIMPLIFIED_TUNING);
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);

        if (!isMounted.value) return;

        // Initialize UI state
        initializeUI();

        // Store original values for revert
        storeOriginalValues();

        // Initialize TuningSliders.js
        TuningSliders.initialize();

        // Initialize Switchery AFTER data loaded and DOM updated
        await nextTick();
        GUI.switchery();
        GUI.content_ready();
    } catch (e) {
        console.error("[PidTuning] Failed to load data:", e);
        GUI.content_ready();
    }
}

function initializeUI() {
    // Set current profiles
    currentProfile.value = FC.CONFIG.profile;
    currentRateProfile.value = FC.CONFIG.rateProfile;
    pidController.value = FC.PID.controller;

    // Get expert mode from global checkbox (in header) and sync to global state
    tabState.expertMode = isExpertModeEnabled();

    // Update TuningSliders expert mode
    TuningSliders.setExpertMode(tabState.expertMode);
}

function storeOriginalValues() {
    // Deep clone original values for revert functionality
    originalPids.value = FC.PIDS.map((pid) => [...pid]);
    originalAdvancedTuning.value = { ...FC.ADVANCED_TUNING };
    originalRcTuning.value = { ...FC.RC_TUNING };
    originalFilterConfig.value = { ...FC.FILTER_CONFIG };
    originalTuningSliders.value = { ...FC.TUNING_SLIDERS };
}

// Profile Management
async function onProfileChange() {
    FC.CONFIG.profile = currentProfile.value;

    // Select profile via MSP
    await MSP.promise(MSPCodes.MSP_SELECT_SETTING, [currentProfile.value]);

    // Reload data
    await loadData();
}

async function onRateProfileChange() {
    FC.CONFIG.rateProfile = currentRateProfile.value;

    // Select rate profile via MSP (use high bit to indicate rate profile)
    await MSP.promise(MSPCodes.MSP_SELECT_SETTING, [currentRateProfile.value | 128]);

    // Reload data
    await loadData();
}

async function copyProfile() {
    // Create options for profiles excluding current one
    const options = [];
    for (let i = 0; i < 3; i++) {
        if (i !== profile.value) {
            const name = FC.CONFIG.pidProfileNames?.[i] || `Profile ${i + 1}`;
            options.push({ value: i, label: name });
        }
    }

    if (options.length === 0) {
        console.warn("[PidTuningTab] No other profiles available to copy to");
        return;
    }

    // For now, copy to the first available profile (next profile)
    // TODO: Show dialog to let user select target profile
    const targetProfile = options[0].value;

    // Set up copy profile data
    FC.COPY_PROFILE = FC.COPY_PROFILE || {};
    FC.COPY_PROFILE.type = 0; // 0 = PID profile
    FC.COPY_PROFILE.srcProfile = profile.value;
    FC.COPY_PROFILE.dstProfile = targetProfile;

    try {
        await MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
        console.log(`[PidTuningTab] Copied profile ${profile.value} to ${targetProfile}`);
        // Optionally reload data or show success message
    } catch (error) {
        console.error("[PidTuningTab] Failed to copy profile:", error);
    }
}

async function copyRateProfile() {
    // Create options for rate profiles excluding current one
    const options = [];
    for (let i = 0; i < 6; i++) {
        if (i !== rateProfile.value) {
            const name = FC.CONFIG.rateProfileNames?.[i] || `Rate Profile ${i + 1}`;
            options.push({ value: i, label: name });
        }
    }

    if (options.length === 0) {
        console.warn("[PidTuningTab] No other rate profiles available to copy to");
        return;
    }

    // For now, copy to the first available profile (next profile)
    // TODO: Show dialog to let user select target rate profile
    const targetProfile = options[0].value;

    // Set up copy profile data
    FC.COPY_PROFILE = FC.COPY_PROFILE || {};
    FC.COPY_PROFILE.type = 1; // 1 = Rate profile
    FC.COPY_PROFILE.srcProfile = rateProfile.value;
    FC.COPY_PROFILE.dstProfile = targetProfile;

    try {
        await MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
        console.log(`[PidTuningTab] Copied rate profile ${rateProfile.value} to ${targetProfile}`);
        // Optionally reload data or show success message
    } catch (error) {
        console.error("[PidTuningTab] Failed to copy rate profile:", error);
    }
}

async function resetProfile() {
    // TODO: Show confirmation dialog
    // For now, proceed directly with reset
    const confirmed = confirm("Reset current PID profile to defaults?");
    if (!confirmed) return;

    try {
        await MSP.promise(MSPCodes.MSP_SET_RESET_CURR_PID);
        console.log("[PidTuningTab] PID profile reset to defaults");

        // Reload data to show reset values
        await loadData();
    } catch (error) {
        console.error("[PidTuningTab] Failed to reset profile:", error);
    }
}

function toggleShowAllPids() {
    showAllPids.value = !showAllPids.value;
}

// Save/Revert
async function save() {
    if (!hasChanges.value) return;

    try {
        // Save profile names (API 1.45+)
        if (pidSubTab.value?.profileName && FC.CONFIG.pidProfileNames) {
            FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = pidSubTab.value.profileName.trim();
        }
        if (ratesSubTab.value?.rateProfileName && FC.CONFIG.rateProfileNames) {
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = ratesSubTab.value.rateProfileName.trim();
        }

        // Save PID controller
        if (showPidController.value) {
            await MSP.promise(MSPCodes.MSP_SET_PID_CONTROLLER, mspHelper.crunch(MSPCodes.MSP_SET_PID_CONTROLLER));
        }

        // Save PIDs
        await MSP.promise(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID));

        // Save advanced tuning
        await MSP.promise(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED));

        // Save RC tuning
        await MSP.promise(MSPCodes.MSP_SET_RC_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING));

        // Save filter config
        await MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));

        // Save simplified tuning (sliders)
        await MSP.promise(MSPCodes.MSP_SET_SIMPLIFIED_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_SIMPLIFIED_TUNING));

        // Write to EEPROM
        await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);

        // Reinitialize sliders to update displayed values
        TuningSliders.initialize();

        // Force Vue component to update slider displays
        if (pidSubTab.value && pidSubTab.value.forceUpdateSliders) {
            pidSubTab.value.forceUpdateSliders();
        }

        // Update original values
        storeOriginalValues();
        hasChanges.value = false;
    } catch (e) {
        console.error("[PidTuning] Save failed:", e);
    }
}

function revert() {
    if (!hasChanges.value) return;

    if (confirm("Revert all changes?")) {
        // Restore original values
        FC.PIDS = originalPids.value.map((pid) => [...pid]);
        Object.assign(FC.ADVANCED_TUNING, originalAdvancedTuning.value);
        Object.assign(FC.RC_TUNING, originalRcTuning.value);
        Object.assign(FC.FILTER_CONFIG, originalFilterConfig.value);
        Object.assign(FC.TUNING_SLIDERS, originalTuningSliders.value);

        // Reinitialize sliders
        TuningSliders.initialize();

        hasChanges.value = false;
    }
}

// Watch for changes - detect when FC data is modified
watch(
    () => [FC.PIDS, FC.ADVANCED_TUNING, FC.RC_TUNING, FC.FILTER_CONFIG, FC.TUNING_SLIDERS],
    () => {
        if (!isMounted.value) return;

        // Check if anything changed from original values
        const pidsChanged = JSON.stringify(FC.PIDS) !== JSON.stringify(originalPids.value);
        const advancedChanged = JSON.stringify(FC.ADVANCED_TUNING) !== JSON.stringify(originalAdvancedTuning.value);
        const rcTuningChanged = JSON.stringify(FC.RC_TUNING) !== JSON.stringify(originalRcTuning.value);
        const filterChanged = JSON.stringify(FC.FILTER_CONFIG) !== JSON.stringify(originalFilterConfig.value);
        const slidersChanged = JSON.stringify(FC.TUNING_SLIDERS) !== JSON.stringify(originalTuningSliders.value);

        hasChanges.value = pidsChanged || advancedChanged || rcTuningChanged || filterChanged || slidersChanged;
    },
    { deep: true },
);

// Watch expert mode changes
watch(
    () => expertModeEnabled.value,
    (newValue) => {
        TuningSliders.setExpertMode(newValue);
    },
);

// Watch for sub-tab changes to re-initialize Switchery for new DOM elements
watch(
    () => activeSubtab.value,
    async () => {
        await nextTick();
        GUI.switchery();
    },
);

// Cleanup callback - called from gui.js tab_switch_cleanup when switching away from this tab
function cleanup(callback) {
    // Any cleanup needed before unmounting
    // Call the callback to signal cleanup is complete
    if (callback) callback();
}

// No need to expose methods - using global reactive state via tabState
// defineExpose is not needed anymore

// Lifecycle
onMounted(async () => {
    isMounted.value = true;

    await loadData();
});

onUnmounted(() => {
    isMounted.value = false;
});
</script>

<style scoped>
/* Component-specific styles if needed */
/* Most styles should come from existing CSS */
</style>
