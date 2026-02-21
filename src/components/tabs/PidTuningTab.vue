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
                <form name="pid-tuning" id="pid-tuning" @input="onFormChanged" @change="onFormChanged">
                    <PidSubTab
                        ref="pidSubTab"
                        v-if="activeSubtab === 'pid'"
                        :expert-mode="expertModeEnabled"
                        :show-all-pids="showAllPids"
                        v-model:profile-name="pidProfileName"
                        @change="onFormChanged"
                    />
                    <RatesSubTab
                        ref="ratesSubTab"
                        v-if="activeSubtab === 'rates'"
                        v-model:rate-profile-name="rateProfileName"
                    />
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
import { usePidTuningStore } from "@/stores/pidTuning";
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
import { useDialog } from "@/composables/useDialog";

const pidTuningStore = usePidTuningStore();
const dialog = useDialog();

// State - use global reactive state for expert mode
const expertModeEnabled = computed(() => tabState.expertMode);
const activeSubtab = ref("pid");
const showAllPids = ref(false);
const currentProfile = ref(0);
const currentRateProfile = ref(0);
const pidController = ref(0);
const isMounted = ref(false);
const pidSubTab = ref(null);
const ratesSubTab = ref(null);

// Profile name state lifted from child components
const pidProfileName = ref("");
const rateProfileName = ref("");

// Guard flag: suppress onFormChanged during revert to prevent watchers from
// immediately re-flagging hasChanges while we restore values.
const isReverting = ref(false);

// hasChanges is owned by the Pinia store
const hasChanges = computed(() => pidTuningStore.hasChanges);

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
        if (!isMounted.value) {
            return;
        }

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

        // Initialize profile names from FC.CONFIG
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            pidProfileName.value = FC.CONFIG.pidProfileNames?.[FC.CONFIG.profile] || "";
            rateProfileName.value = FC.CONFIG.rateProfileNames?.[FC.CONFIG.rateProfile] || "";
        }

        if (!isMounted.value) {
            return;
        }

        // Initialize UI state
        initializeUI();

        // Initialize TuningSliders.js (must happen before snapshot so
        // slider-validated values are captured as originals)
        TuningSliders.initialize();

        // Store original values for revert
        storeOriginalValues();

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
    pidTuningStore.storeOriginals(pidProfileName.value, rateProfileName.value);
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
        if (i !== currentProfile.value) {
            const name = FC.CONFIG.pidProfileNames?.[i] || `Profile ${i + 1}`;
            options.push({ value: i, label: name });
        }
    }

    if (options.length === 0) {
        console.warn("[PidTuningTab] No other profiles available to copy to");
        return;
    }

    // Show profile selection dialog
    dialog.openProfileSelection(
        $t("pidTuningCopyProfileDialogTitle"),
        $t("pidTuningCopyProfileDialogPrompt"),
        options,
        async (selectedIndex) => {
            // User confirmed selection
            const targetProfile = selectedIndex;

            // Set up copy profile data
            FC.COPY_PROFILE = FC.COPY_PROFILE || {};
            FC.COPY_PROFILE.type = 0; // 0 = PID profile
            FC.COPY_PROFILE.srcProfile = currentProfile.value;
            FC.COPY_PROFILE.dstProfile = targetProfile;

            try {
                await MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
                console.log(`[PidTuningTab] Copied profile ${currentProfile.value} to ${targetProfile}`);
                // Optionally reload data or show success message
            } catch (error) {
                console.error("[PidTuningTab] Failed to copy profile:", error);
            }
        },
        () => {
            // User cancelled - do nothing
        },
    );
}

async function copyRateProfile() {
    // Create options for rate profiles excluding current one
    const options = [];
    for (let i = 0; i < 6; i++) {
        if (i !== currentRateProfile.value) {
            const name = FC.CONFIG.rateProfileNames?.[i] || `Rate Profile ${i + 1}`;
            options.push({ value: i, label: name });
        }
    }

    if (options.length === 0) {
        console.warn("[PidTuningTab] No other rate profiles available to copy to");
        return;
    }

    // Show rate profile selection dialog
    dialog.openProfileSelection(
        $t("pidTuningCopyRateProfileDialogTitle"),
        $t("pidTuningCopyRateProfileDialogPrompt"),
        options,
        async (selectedIndex) => {
            // User confirmed selection
            const targetProfile = selectedIndex;

            // Set up copy profile data
            FC.COPY_PROFILE = FC.COPY_PROFILE || {};
            FC.COPY_PROFILE.type = 1; // 1 = Rate profile
            FC.COPY_PROFILE.srcProfile = currentRateProfile.value;
            FC.COPY_PROFILE.dstProfile = targetProfile;

            try {
                await MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
                console.log(`[PidTuningTab] Copied rate profile ${currentRateProfile.value} to ${targetProfile}`);
                // Optionally reload data or show success message
            } catch (error) {
                console.error("[PidTuningTab] Failed to copy rate profile:", error);
            }
        },
        () => {
            // User cancelled - do nothing
        },
    );
}

async function resetProfile() {
    const confirmed = confirm("Reset current PID profile to defaults?");
    if (!confirmed) {
        return;
    }

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
    if (!hasChanges.value) {
        return;
    }

    try {
        // Save profile names to FC.CONFIG (API 1.45+)
        if (FC.CONFIG.pidProfileNames) {
            FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = pidProfileName.value.trim();
        }
        if (FC.CONFIG.rateProfileNames) {
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = rateProfileName.value.trim();
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

        // Save profile names to firmware (API 1.45+)
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            if (FC.CONFIG.pidProfileNames) {
                await MSP.promise(
                    MSPCodes.MSP2_SET_TEXT,
                    mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.PID_PROFILE_NAME),
                );
            }
            if (FC.CONFIG.rateProfileNames) {
                await MSP.promise(
                    MSPCodes.MSP2_SET_TEXT,
                    mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.RATE_PROFILE_NAME),
                );
            }
        }

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
    } catch (e) {
        console.error("[PidTuning] Save failed:", e);
    }
}

function revert() {
    if (!hasChanges.value) {
        return;
    }

    if (confirm("Revert all changes?")) {
        // Suppress watchers from re-flagging hasChanges while we restore.
        isReverting.value = true;

        const origNames = pidTuningStore.revertToOriginals();
        pidProfileName.value = origNames.pidProfileName;
        rateProfileName.value = origNames.rateProfileName;

        // Reinitialize sliders
        TuningSliders.initialize();

        // Force PidSubTab to sync its local slider refs from TuningSliders.js
        if (pidSubTab.value && pidSubTab.value.forceUpdateSliders) {
            pidSubTab.value.forceUpdateSliders();
        }

        isReverting.value = false;
    }
}

// Notify the store to re-check for changes.
// Called by form @input/@change (covers all user-driven edits) and by child
// @change emits (covers programmatic FC mutations such as slider calculations).
function onFormChanged() {
    if (!isMounted.value || isReverting.value) {
        return;
    }
    pidTuningStore.checkForChanges(pidProfileName.value, rateProfileName.value);
}

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

// Watch pidController changes and sync to FC.PID.controller
watch(
    () => pidController.value,
    (newValue) => {
        FC.PID.controller = newValue;
    },
);

// Watch profile name changes: sync to FC.CONFIG and re-check for changes
watch(
    () => pidProfileName.value,
    (newValue) => {
        if (FC.CONFIG.pidProfileNames) {
            FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = newValue;
        }
        onFormChanged();
    },
);

watch(
    () => rateProfileName.value,
    (newValue) => {
        if (FC.CONFIG.rateProfileNames) {
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = newValue;
        }
        onFormChanged();
    },
);

// Cleanup callback - called from gui.js tab_switch_cleanup when switching away from this tab
function cleanup(callback) {
    // Any cleanup needed before unmounting
    // Call the callback to signal cleanup is complete
    if (callback) {
        callback();
    }
}

defineExpose({ cleanup });

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
