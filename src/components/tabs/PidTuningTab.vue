<template>
    <BaseTab tab-name="pid_tuning">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabPidTuning") }}</div>
            <WikiButton docUrl="PID-Tuning" />

            <div class="flex items-start gap-3 flex-wrap mb-2">
                <!-- Profile Selector -->
                <div class="flex flex-col gap-1 min-w-[130px]">
                    <SettingRow :label="$t('pidTuningProfile')" :help="$t('pidTuningProfileTip')">
                        <USelect
                            v-model="currentProfile"
                            :items="profileItems"
                            class="min-w-20"
                            :disabled="hasChanges"
                            @update:model-value="onProfileChange"
                        />
                    </SettingRow>
                </div>

                <!-- Rate Profile Selector -->
                <div class="flex flex-col gap-1 min-w-[130px]">
                    <SettingRow :label="$t('pidTuningRateProfile')" :help="$t('pidTuningRateProfileTip')">
                        <USelect
                            v-model="currentRateProfile"
                            :items="rateProfileItems"
                            class="min-w-20"
                            :disabled="hasChanges"
                            @update:model-value="onRateProfileChange"
                        />
                    </SettingRow>
                </div>

                <!-- Header Buttons (scoped per subtab) -->
                <div class="flex gap-2 flex-wrap ml-auto">
                    <UButton
                        v-if="activeSubtab === 'pid'"
                        :label="$t('pidTuningCopyProfile')"
                        color="neutral"
                        variant="outline"
                        @click="copyProfile"
                    />
                    <UButton
                        v-if="activeSubtab === 'rates'"
                        :label="$t('pidTuningCopyRateProfile')"
                        color="neutral"
                        variant="outline"
                        @click="copyRateProfile"
                    />
                    <UButton
                        v-if="activeSubtab === 'pid'"
                        :label="$t('pidTuningResetPidProfile')"
                        color="neutral"
                        variant="outline"
                        @click="resetProfile"
                    />
                    <UButton
                        v-if="activeSubtab === 'pid'"
                        :label="showAllPids ? $t('pidTuningHideUnusedPids') : $t('pidTuningShowAllPids')"
                        color="neutral"
                        variant="outline"
                        @click="toggleShowAllPids"
                    />
                </div>
            </div>

            <!-- Sub-tab Navigation -->
            <div class="subtab-nav">
                <UTabs
                    :items="subtabItems"
                    :model-value="activeSubtab"
                    :content="false"
                    color="primary"
                    variant="link"
                    @update:model-value="activeSubtab = $event"
                />
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
                        @change="onFormChanged"
                    />
                    <FilterSubTab
                        ref="filterSubTab"
                        v-if="activeSubtab === 'filter'"
                        :expert-mode="expertModeEnabled"
                        @change="onFormChanged"
                    />
                </form>
            </div>

            <!-- Save/Revert Buttons -->
            <div class="content_toolbar toolbar_fixed_bottom flex items-center gap-2">
                <UButton
                    :label="$t('pidTuningButtonSave')"
                    :color="hasChanges ? 'success' : 'primary'"
                    :disabled="!hasChanges"
                    @click="save"
                />
                <UButton
                    :label="$t('pidTuningButtonRefresh')"
                    :color="hasChanges ? 'primary' : 'neutral'"
                    :disabled="!hasChanges"
                    @click="refresh"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { usePidTuningStore } from "@/stores/pidTuning";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import PidSubTab from "./pid-tuning/PidSubTab.vue";
import RatesSubTab from "./pid-tuning/RatesSubTab.vue";
import FilterSubTab from "./pid-tuning/FilterSubTab.vue";
import SettingRow from "../elements/SettingRow.vue";
import GUI from "@/js/gui";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import FC from "@/js/fc";
import { i18n } from "@/js/localization";
import { validateTuningSliders } from "@/composables/useTuningSliders";
import { mspHelper } from "@/js/msp/MSPHelper";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";
import { isExpertModeEnabled } from "@/js/utils/isExpertModeEnabled";
import { useNavigationStore } from "@/stores/navigation";
import { useDialog } from "@/composables/useDialog";
import { useTranslation } from "i18next-vue";
import { gui_log } from "@/js/gui_log";

const { t } = useTranslation();
const pidTuningStore = usePidTuningStore();
const navigationStore = useNavigationStore();
const dialog = useDialog();

// State - use navigation store for expert mode
const expertModeEnabled = computed(() => navigationStore.expertMode);
const activeSubtab = ref("pid");
const showAllPids = ref(false);
const currentProfile = ref(FC.CONFIG.profile);
const currentRateProfile = ref(0);
const isMounted = ref(false);
const pidSubTab = ref(null);
const filterSubTab = ref(null);
const ratesSubTab = ref(null);

// Rate profile count — matches original loadRateProfilesList() logic
const numberOfRateProfiles = computed(() => {
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        return FC.CONFIG.numberOfRateProfiles ?? 4;
    }
    return 4;
});

// Items arrays for USelect / UTabs
const profileItems = computed(() => {
    const items = [];
    for (let i = 0; i < 3; i++) {
        items.push({ label: i18n.getMessage("pidTuningProfileOption", [i + 1]), value: i });
    }
    return items;
});

const rateProfileItems = computed(() => {
    const items = [];
    for (let i = 0; i < numberOfRateProfiles.value; i++) {
        items.push({ label: i18n.getMessage("pidTuningRateProfileOption", [i + 1]), value: i });
    }
    return items;
});

const subtabItems = computed(() => [
    { label: t("pidTuningSubTabPid"), value: "pid", icon: "i-lucide-sliders-horizontal" },
    { label: t("pidTuningSubTabRates"), value: "rates", icon: "i-lucide-gauge" },
    { label: t("pidTuningSubTabFilter"), value: "filter", icon: "i-lucide-filter" },
]);

// Profile name state lifted from child components
const pidProfileName = ref("");
const rateProfileName = ref("");

// hasChanges is owned by the Pinia store
const hasChanges = computed(() => pidTuningStore.hasChanges);

// MSP Data Loading
async function loadData() {
    try {
        if (!isMounted.value) {
            return false;
        }

        // Load all PID tuning related MSP data
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

        // Validate slider positions against FC state (determines whether
        // sliders are valid and should be enabled).  Must happen before
        // snapshot so slider-validated values are captured as originals.
        await validateTuningSliders();

        // Force sub-tabs to sync their local slider refs from FC state
        if (pidSubTab.value?.forceUpdateSliders) {
            pidSubTab.value.forceUpdateSliders();
        }
        if (filterSubTab.value?.forceUpdateSliders) {
            filterSubTab.value.forceUpdateSliders();
        }

        // Store original values for revert
        storeOriginalValues();

        GUI.content_ready();
        return true;
    } catch (e) {
        console.error("[PidTuning] Failed to load data:", e);
        GUI.content_ready();
        return false;
    }
}

function initializeUI() {
    // Set current profiles
    currentProfile.value = FC.CONFIG.profile;
    currentRateProfile.value = FC.CONFIG.rateProfile;
    // Get expert mode from global checkbox (in header) and sync to global state
    navigationStore.expertMode = isExpertModeEnabled();
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
            const name = i18n.getMessage("pidTuningProfileOption", [i + 1]);
            options.push({ value: i, label: name });
        }
    }

    if (options.length === 0) {
        console.warn("[PidTuningTab] No other profiles available to copy to");
        return;
    }

    // Show copy profile dialog (Vue component with profile + rate selects)
    dialog.openCopyProfile(
        t("dialogCopyProfileTitle"),
        t("dialogCopyProfileNote"),
        options,
        [],
        async (selected) => {
            // selected: { profile, rateProfile }
            if (selected && typeof selected.profile === "number") {
                const targetProfile = selected.profile;

                FC.COPY_PROFILE = FC.COPY_PROFILE || {};
                FC.COPY_PROFILE.type = 0; // 0 = PID profile
                FC.COPY_PROFILE.srcProfile = currentProfile.value;
                FC.COPY_PROFILE.dstProfile = targetProfile;

                try {
                    await MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
                    console.log(`[PidTuningTab] Copied profile ${currentProfile.value} to ${targetProfile}`);
                } catch (error) {
                    console.error("[PidTuningTab] Failed to copy profile:", error);
                }
            }
        },
        () => {
            // cancelled
        },
    );
}

async function copyRateProfile() {
    // Create options for rate profiles excluding current one
    const options = [];
    for (let i = 0; i < numberOfRateProfiles.value; i++) {
        if (i !== currentRateProfile.value) {
            const name = i18n.getMessage("pidTuningRateProfileOption", [i + 1]);
            options.push({ value: i, label: name });
        }
    }

    if (options.length === 0) {
        console.warn("[PidTuningTab] No other rate profiles available to copy to");
        return;
    }

    // Show copy rate profile dialog (use same Vue dialog but only rate options)
    dialog.openCopyProfile(
        t("dialogCopyProfileTitle"),
        t("dialogCopyProfileNote"),
        [],
        options,
        async (selected) => {
            if (selected && typeof selected.rateProfile === "number") {
                const targetProfile = selected.rateProfile;

                FC.COPY_PROFILE = FC.COPY_PROFILE || {};
                FC.COPY_PROFILE.type = 1; // 1 = Rate profile
                FC.COPY_PROFILE.srcProfile = currentRateProfile.value;
                FC.COPY_PROFILE.dstProfile = targetProfile;

                try {
                    await MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
                    console.log(`[PidTuningTab] Copied rate profile ${currentRateProfile.value} to ${targetProfile}`);
                } catch (error) {
                    console.error("[PidTuningTab] Failed to copy rate profile:", error);
                }
            }
        },
        () => {
            // cancelled
        },
    );
}

async function resetProfile() {
    try {
        await MSP.promise(MSPCodes.MSP_SET_RESET_CURR_PID);
        await loadData();
        gui_log(t("pidTuningPidProfileReset"));
    } catch (error) {
        console.error("[PidTuningTab] Failed to reset profile:", error);
    }
}

function toggleShowAllPids() {
    showAllPids.value = !showAllPids.value;
}

// Save/Refresh
async function save() {
    if (!hasChanges.value) {
        return;
    }

    try {
        // Normalize profile names before saving
        pidProfileName.value = pidProfileName.value.trim();
        rateProfileName.value = rateProfileName.value.trim();

        // Save profile names to FC.CONFIG (API 1.45+)
        if (FC.CONFIG.pidProfileNames) {
            FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = pidProfileName.value;
        }
        if (FC.CONFIG.rateProfileNames) {
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = rateProfileName.value;
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

        // Re-validate sliders after save
        await validateTuningSliders();

        // Force Vue components to update slider displays
        if (pidSubTab.value?.forceUpdateSliders) {
            pidSubTab.value.forceUpdateSliders();
        }
        if (filterSubTab.value?.forceUpdateSliders) {
            filterSubTab.value.forceUpdateSliders();
        }

        // Update original values
        storeOriginalValues();
    } catch (e) {
        console.error("[PidTuning] Save failed:", e);
    }
}

async function refresh() {
    try {
        if (await loadData()) {
            gui_log(t("pidTuningDataRefreshed"));
        }
    } catch (error) {
        console.error("[PidTuningTab] Failed to refresh data:", error);
    }
}

// Notify the store to re-check for changes.
// Called by form @input/@change (covers all user-driven edits) and by child
// @change emits (covers programmatic FC mutations such as slider calculations).
function onFormChanged() {
    if (!isMounted.value) {
        return;
    }
    pidTuningStore.checkForChanges(pidProfileName.value, rateProfileName.value);
}

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

<style>
/* ====================================================================
   PID Tuning Tab — global (unscoped) styles
   Scoped under .tab-pid_tuning to avoid leaking into other tabs.
   Migrated from src/css/tabs/pid_tuning.less
   ==================================================================== */

/* ── Table base ───────────────────────────────────────────────────── */
.tab-pid_tuning table {
    float: left;
    margin: 0;
    border-collapse: collapse;
    width: 100%;
    table-layout: fixed;
    padding: 1px;
    border-bottom: 0 solid var(--surface-500);
}
.tab-pid_tuning .cf tr {
    background-color: var(--surface-400);
}
.tab-pid_tuning .cf th {
    border-right: solid 1px var(--surface-500);
    height: 19px;
    font-weight: normal;
    padding: 4px;
    color: var(--text);
    text-align: left;
    background: var(--surface-300);
}
.tab-pid_tuning .cf th:first-child {
    border-top-left-radius: 3px;
}
.tab-pid_tuning .cf th:last-child {
    border-right: 0;
    border-top-right-radius: 3px;
}
.tab-pid_tuning .cf td:first-child {
    border-bottom-left-radius: 3px;
}
.tab-pid_tuning .cf td:last-child {
    border-bottom-right-radius: 3px;
    border-right: 0;
    padding-bottom: 0;
}
.tab-pid_tuning .cf input {
    margin: 4px;
    width: calc(100% - 10px);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
}
.tab-pid_tuning .cf select {
    margin: 4px;
    width: calc(100% - 10px);
    border: 1px solid var(--surface-500);
}
.tab-pid_tuning .cf .throttleCurvePreview {
    padding: 0;
}
/* ── Curves & canvas ──────────────────────────────────────────────── */
.tab-pid_tuning .throttle_curve {
    float: right;
    width: 100%;
    background-size: 200%;
    height: 164px;
}
.tab-pid_tuning .curves {
    float: left;
    margin-right: 10px;
}
.tab-pid_tuning .rate_curve {
    height: 362px;
    min-width: 200px;
}

.tab-pid_tuning table .inputBackground {
    background: white;
}
.tab-pid_tuning table td {
    border-bottom: 0 solid var(--surface-500);
    padding: 0.5rem;
    border-right: 1px solid var(--surface-500);
}
.tab-pid_tuning table th {
    padding: 0;
    border: 0;
    font-weight: normal;
    text-overflow: ellipsis;
    overflow: hidden;
    color: var(--text);
}
.tab-pid_tuning table tr td:first-child {
    text-align: left;
}
.tab-pid_tuning table tr td:last-child {
    border-right: 0 solid var(--surface-500);
    text-align: left;
}
.tab-pid_tuning table .groupSwitchValue {
    display: inline-flex;
}
.tab-pid_tuning table .groupSwitchValue .inputValue {
    width: 80px;
}
.tab-pid_tuning table input {
    display: block;
    width: calc(100% - 0px);
    height: 20px;
    line-height: 20px;
    border: 1px solid var(--surface-500);
    border-radius: 3px;
}

/* ── gui_box ──────────────────────────────────────────────────────── */
.tab-pid_tuning .gui_box {
    padding: 0;
    overflow: hidden;
    gap: 0;
}
.tab-pid_tuning .gui_box span {
    font-style: normal;
    font-weight: normal;
    line-height: 19px;
    font-size: 11px;
}
.tab-pid_tuning .note,
.tab-pid_tuning .danger {
    margin-bottom: 0;
}

/* ── Filter sub-tab ───────────────────────────────────────────────── */
.tab-pid_tuning .subtab-filter .gui_box {
    float: none;
}
.tab-pid_tuning .subtab-filter table select {
    display: inline-block;
}
.tab-pid_tuning .subtab-filter .newFilter .helpicon {
    margin-top: 2px;
}
.tab-pid_tuning .subtab-filter .sliderLabels tr td:first-child {
    width: 10%;
}

/* ── Slider divider ───────────────────────────────────────────────── */
.tab-pid_tuning .sliderDivider {
    padding: 3px;
    border-top: 1px solid var(--surface-500);
    border-bottom: 1px solid var(--surface-500);
}

/* ── PID titlebar ─────────────────────────────────────────────────── */
.tab-pid_tuning .pid_titlebar {
    color: #fff;
    background-color: var(--surface-300);
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
}
.tab-pid_tuning .pid_titlebar th {
    padding: 0.5rem;
    text-align: center;
    border-right: 1px solid var(--surface-500);
}
.tab-pid_tuning .pid_titlebar th:first-child {
    text-align: left;
    border-top-left-radius: 3px;
}
.tab-pid_tuning .pid_titlebar th:last-child {
    border-right: none;
    border-top-right-radius: 3px;
}
.tab-pid_tuning .pid_titlebar td:first-child {
    text-align: left;
}
.tab-pid_tuning .pid_titlebar .name-helpicon-flex {
    display: flex;
    flex-flow: row wrap;
    justify-content: space-around;
}
.tab-pid_tuning .pid_titlebar .name-helpicon-flex .helpicon {
    margin-right: 0;
}

/* ── Optional / accel PID sections ────────────────────────────────── */
.tab-pid_tuning #pid_optional table th,
.tab-pid_tuning .pid_optional table th,
.tab-pid_tuning #pid_optional table td,
.tab-pid_tuning .pid_optional table td {
    width: 25%;
}
.tab-pid_tuning #pid_accel table th,
.tab-pid_tuning #pid_accel table td {
    width: 33%;
}

/* ── Compensation table ───────────────────────────────────────────── */
.tab-pid_tuning table.compensation tr {
    height: 30px;
    border-bottom: 1px solid var(--surface-500);
}
.tab-pid_tuning table.compensation tr:last-child {
    border-bottom: none;
}
.tab-pid_tuning table.compensation td {
    padding: 0 0.5rem;
}
.tab-pid_tuning table.compensation td:first-child:not(.filterTable) {
    width: 110px;
    text-align: center;
    vertical-align: top;
    padding-top: 4px;
}
.tab-pid_tuning table.compensation td:last-child {
    width: 100%;
}
.tab-pid_tuning table.compensation .helpicon {
    margin-left: auto;
    margin-right: 0;
}
.tab-pid_tuning table.compensation .suboption {
    margin-left: 2%;
    display: flex;
    flex-flow: row wrap-reverse;
    align-items: center;
    padding-bottom: 2px;
}
.tab-pid_tuning table.compensation .suboption select {
    width: 80px;
    text-align-last: right;
    font-size: 1.1em;
    box-sizing: border-box;
}
.tab-pid_tuning table.compensation .suboption input {
    width: 80px;
    box-sizing: border-box;
}
.tab-pid_tuning table.compensation .suboption label {
    margin-left: 5px;
}
.tab-pid_tuning table.filterTable.compensation td:first-child {
    width: 5%;
}

/* ── TPA settings ─────────────────────────────────────────────────── */
.tab-pid_tuning table.tpa-settings tr {
    height: 30px;
}

/* ── PID tuning features ──────────────────────────────────────────── */
.tab-pid_tuning .pidTuningFeatures td {
    padding: 5px;
    width: 20%;
}
.tab-pid_tuning .pidTuningFeatures td:first-child {
    width: 20%;
    padding-bottom: 6px;
    padding-top: 5px;
}
.tab-pid_tuning .pidTuningFeatures td:last-child {
    width: 80%;
}
.tab-pid_tuning .pidTuningFeatures .slider input {
    writing-mode: horizontal-tb;
}

/* ── Rates type ───────────────────────────────────────────────────── */
.tab-pid_tuning .rates_type table select {
    text-align-last: left;
}

/* ── New rates ────────────────────────────────────────────────────── */
.tab-pid_tuning .new_rates {
    text-align: center;
}
.tab-pid_tuning .new_rates td:first-child {
    border-bottom-left-radius: 0;
    padding-left: 10px;
}
.tab-pid_tuning .new_rates td:last-child span {
    margin-right: auto;
}

/* ── Misc helpers ─────────────────────────────────────────────────── */
.tab-pid_tuning .fixed_band {
    position: absolute;
    width: 100%;
    bottom: 0;
}
.tab-pid_tuning .pid_mode .helpicon {
    margin-top: 0;
}
.tab-pid_tuning .pid_titlebar.pid_titlebar_extended {
    border-radius: 0;
}
.tab-pid_tuning .helpicon {
    margin-top: 1px;
}
.tab-pid_tuning .number .helpicon {
    margin-top: 3px;
    margin-right: 0;
}
.tab-pid_tuning .number {
    margin-bottom: 5px;
    clear: left;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--surface-500);
    width: 100%;
    float: left;
}
.tab-pid_tuning .number:last-child {
    padding-bottom: 5px;
    border-bottom: 0;
}
.tab-pid_tuning .number input {
    height: 20px;
    line-height: 20px;
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    font-weight: normal;
}
.tab-pid_tuning .gui_box_titlebar .helpicon {
    margin-top: 5px;
    margin-right: 5px;
}
.tab-pid_tuning .spacer_left {
    padding-left: 0;
    float: right;
    width: calc(100% - 20px);
}
.tab-pid_tuning .numberspacer {
    float: left;
    width: 65px;
    height: 21px;
}
.tab-pid_tuning .right {
    float: right;
}
.tab-pid_tuning .pids {
    float: left;
    width: 25%;
}
.tab-pid_tuning .roll {
    border-bottom-left-radius: 3px;
}
.tab-pid_tuning .pidTuningLevel {
    float: left;
}
.tab-pid_tuning .borderleft {
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
}
.tab-pid_tuning .textleft {
    width: 25%;
    float: left;
    text-align: left;
}
.tab-pid_tuning .topspacer {
    margin-top: 5px;
}

/* ── Bracket icon ─────────────────────────────────────────────────── */
.tab-pid_tuning .bracket {
    background-image: url(../../images/icons/icon_bracket.svg);
    background-repeat: no-repeat;
    height: 35px;
    width: 14px;
    margin-top: -23px;
    margin-left: 8px;
}

/* ── Rates preview ────────────────────────────────────────────────── */
.tab-pid_tuning .rates_preview_cell {
    position: relative;
    width: 100%;
    height: 362px;
}
.tab-pid_tuning .rates_preview {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-size: 100%;
}

/* ── PID tuning table ─────────────────────────────────────────────── */
.tab-pid_tuning .pidTuning td {
    padding: 5px;
    width: 40%;
}
.tab-pid_tuning .pidTuning td:first-child {
    width: 10%;
    padding-bottom: 6px;
    padding-top: 5px;
}
.tab-pid_tuning .pidTuning td:last-child {
    width: 40%;
}
.tab-pid_tuning .pidTuning tr {
    width: 100%;
    border-bottom: 1px solid var(--surface-500);
    padding: 0;
}

/* ── RC curve ─────────────────────────────────────────────────────── */
.tab-pid_tuning .rc_curve .cf tr td {
    padding: 0;
}
.tab-pid_tuning .rc_curve_bg {
    float: left;
}
.tab-pid_tuning .new_rates_last-child {
    border-bottom: none;
}
.tab-pid_tuning .filter {
    padding-left: 5px;
}

/* ── Dialog ───────────────────────────────────────────────────────── */
.tab-pid_tuning dialog {
    width: 40em;
    border-radius: 5px;
}
.tab-pid_tuning dialog .buttons {
    position: static;
    margin-top: 2em;
}
.tab-pid_tuning dialog h3 {
    margin-bottom: 0.5em;
}
.tab-pid_tuning dialog select {
    border: 1px solid var(--surface-500);
    margin-left: 5px;
    width: 120px;
}

/* ── Tuning sliders ───────────────────────────────────────────────── */
.tab-pid_tuning .tuningSlider {
    -webkit-appearance: none;
    width: 100%;
    height: 1rem;
    border: none !important;
    outline: none !important;
    opacity: 0.8;
    transition: opacity 0.2s;
    background: var(--surface-200);
    background-color: transparent !important;
    padding: 0.25rem !important;
}
.tab-pid_tuning .tuningSlider:hover {
    opacity: 1;
}
.tab-pid_tuning .tuningSlider::-webkit-slider-runnable-track {
    -webkit-appearance: none;
    border: solid 1px var(--surface-500);
    border-radius: 4px;
    background: linear-gradient(90deg, var(--surface-300) 0%, var(--surface-400) 50%, var(--error-500) 100%);
    height: 15px;
}
.tab-pid_tuning .tuningSlider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 23px;
    height: 23px;
    border-radius: 50%;
    background: #ffbb2a;
    border: solid 1px var(--surface-300);
    cursor: pointer;
    position: relative;
    bottom: 5px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.tab-pid_tuning .nonExpertModeSliders .tuningSlider::-webkit-slider-runnable-track {
    background: linear-gradient(90deg, var(--surface-300) 0%, var(--surface-400) 50%, var(--error-500) 100%);
    background-size: 55%;
    background-position: 44%;
    background-repeat: no-repeat;
}
.tab-pid_tuning .disabledSliders .tuningSlider::-webkit-slider-runnable-track {
    background: linear-gradient(90deg, var(--surface-300) -50%, var(--surface-400) 50%, var(--surface-300) 150%);
    background-repeat: no-repeat;
}
.tab-pid_tuning .disabledSliders .tuningSlider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 23px;
    height: 23px;
    border-radius: 50%;
    background: transparent;
    border: solid 1px var(--surface-300);
    cursor: pointer;
    position: relative;
    bottom: 5px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

/* ── Slider labels ────────────────────────────────────────────────── */
.tab-pid_tuning .sliderLabels tr {
    border-bottom: 1px solid var(--surface-500);
}
.tab-pid_tuning .sliderLabels tr:last-child {
    border-bottom: none;
}
.tab-pid_tuning .sliderLabels tr td:first-child {
    text-align: right;
    width: 20%;
}
.tab-pid_tuning .sliderLabels tr td:nth-child(2) {
    text-align: center;
    width: 32px;
}
.tab-pid_tuning .sliderLabels tr td:last-child {
    width: 30px;
}
.tab-pid_tuning .sliderLabels span {
    color: var(--text);
    font-size: 12px;
}

/* ── Tuning PID sliders titlebar ──────────────────────────────────── */
.tab-pid_tuning .tuningPIDSliders .pid_titlebar th {
    text-align: center;
}
.tab-pid_tuning .tuningPIDSliders .pid_titlebar th:first-child {
    width: 20%;
    text-align: left;
}
.tab-pid_tuning .tuningPIDSliders .pid_titlebar th:first-child div {
    display: inline-block;
}
.tab-pid_tuning .tuningPIDSliders .pid_titlebar th:nth-child(2) {
    width: 32px;
}
.tab-pid_tuning .tuningPIDSliders .pid_titlebar th:last-child {
    width: 30px;
}

/* ── Tuning filter sliders titlebar ───────────────────────────────── */
.tab-pid_tuning .tuningFilterSliders .pid_titlebar th {
    text-align: center;
}
.tab-pid_tuning .tuningFilterSliders .pid_titlebar th:first-child {
    width: 10%;
    border-right: none;
}
.tab-pid_tuning .tuningFilterSliders .pid_titlebar th:nth-child(2) {
    width: 30px;
}
.tab-pid_tuning .tuningFilterSliders .pid_titlebar th:last-child {
    width: 30px;
}

/* ── Notes ────────────────────────────────────────────────────────── */
.tab-pid_tuning .nonExpertModeSlidersNote,
.tab-pid_tuning .expertSettingsDetectedNote {
    text-align: center;
    padding-top: 2px;
    padding-bottom: 2px;
}
.tab-pid_tuning .dynamicNotchNyquistWarningNote {
    margin: 0;
}
.tab-pid_tuning .note-button td:nth-child(n) {
    padding-left: 7px;
    padding-right: 7px;
    text-align: center;
}
.tab-pid_tuning .note-button td:first-child {
    width: 75%;
    border-right: none;
}
.tab-pid_tuning .note-button .regular-button {
    display: block;
    overflow-wrap: break-word;
    margin: 2px;
}

/* ── Sub-tab layouts ──────────────────────────────────────────────── */
.tab-pid_tuning .subtab-rates {
    display: flex;
    flex-flow: row wrap;
    align-items: flex-start;
    justify-content: center;
    gap: 0 10px;
}
.tab-pid_tuning .subtab-rates .cf_column {
    min-width: 380px;
    flex: 1;
}
.tab-pid_tuning .subtab-pid {
    display: flex;
    flex-flow: row wrap;
    align-items: flex-start;
    justify-content: center;
    gap: 0 10px;
}
.tab-pid_tuning .subtab-pid .cf_column {
    min-width: 450px;
    flex: 1.3;
}
.tab-pid_tuning .subtab-pid .cf_column_right {
    min-width: 300px;
    margin-left: 15px;
    flex: 1;
}
.tab-pid_tuning .subtab-pid .note {
    flex: 0 0 100%;
}

/* ── Filter table ─────────────────────────────────────────────────── */
.tab-pid_tuning table.filterTable {
    table-layout: auto;
}

/* ── Rates logo ───────────────────────────────────────────────────── */
.tab-pid_tuning .cf .rates_logo_bg {
    background-color: #ebeced;
}
.tab-pid_tuning .rates_logo_div {
    margin-top: -10%;
    text-align: center;
}
.tab-pid_tuning .rates_logo {
    width: 80%;
    height: 80%;
}
.tab-pid_tuning .float-left {
    float: left;
}

/* ── Fancy header (not under .tab-pid_tuning) ─────────────────────── */
.fancy.header {
    background-color: #d6d6d6;
    padding-top: 8px;
    font-size: 12px;
    border-bottom: 1px solid var(--surface-500);
    color: #595959;
    background-image: linear-gradient(
        315deg,
        rgba(255, 255, 255, 0.2) 10%,
        transparent 10%,
        transparent 20%,
        rgba(255, 255, 255, 0.2) 20%,
        rgba(255, 255, 255, 0.2) 30%,
        transparent 30%,
        transparent 40%,
        rgba(255, 255, 255, 0.2) 40%,
        rgba(255, 255, 255, 0.2) 50%,
        transparent 50%,
        transparent 60%,
        rgba(255, 255, 255, 0.2) 60%,
        rgba(255, 255, 255, 0.2) 70%,
        transparent 70%,
        transparent 80%,
        rgba(255, 255, 255, 0.2) 80%,
        rgba(255, 255, 255, 0.2) 90%,
        transparent 90%,
        transparent 100%,
        rgba(255, 255, 255, 0.2) 100%,
        transparent
    );
}
.fancy.header th {
    padding-bottom: 4px;
    padding-top: 4px;
    padding-left: 5px;
}

/* ── pid_mode (not under .tab-pid_tuning) ─────────────────────────── */
.pid_mode {
    background-color: var(--surface-400);
    margin: 0;
    text-align: left;
    padding: 0.25rem 0.5rem;
    font-size: 12px;
    border-bottom: 1px solid var(--surface-500);
    color: var(--text);
    font-weight: normal;
    display: grid;
    grid-template-columns: auto auto;
    background-image: linear-gradient(
        315deg,
        rgba(255, 255, 255, 0.2) 10%,
        transparent 10%,
        transparent 20%,
        rgba(255, 255, 255, 0.2) 20%,
        rgba(255, 255, 255, 0.2) 30%,
        transparent 30%,
        transparent 40%,
        rgba(255, 255, 255, 0.2) 40%,
        rgba(255, 255, 255, 0.2) 50%,
        transparent 50%,
        transparent 60%,
        rgba(255, 255, 255, 0.2) 60%,
        rgba(255, 255, 255, 0.2) 70%,
        transparent 70%,
        transparent 80%,
        rgba(255, 255, 255, 0.2) 80%,
        rgba(255, 255, 255, 0.2) 90%,
        transparent 90%,
        transparent 100%,
        rgba(255, 255, 255, 0.2) 100%,
        transparent
    );
}

/* ── PID row colors (not under .tab-pid_tuning) ──────────────────── */
.pid_roll {
    background-color: #e24761;
}
.pid_pitch {
    background-color: #97d800;
}
.pid_yaw {
    background-color: #1fb1f0;
}
.pid_roll,
.pid_pitch,
.pid_yaw {
    color: black;
}

/* ── Filter two-columns ───────────────────────────────────────────── */
.subtab-filter table tr td:first-child {
    text-align: right;
    padding-left: 5px;
    width: 1%;
}
.subtab-filter .two_columns {
    display: flex;
}
.subtab-filter .two_columns .two_columns_first {
    margin-right: 10px;
    height: fit-content;
}
.subtab-filter .two_columns .two_columns_second {
    margin-left: 10px;
    height: fit-content;
}

/* ── Sub-tab navigation ───────────────────────────────────────────── */
.subtab-nav {
    width: calc(100% - 22px);
    margin-bottom: 6px;
}

/* ── Tab area ─────────────────────────────────────────────────────── */
.tabarea {
    width: calc(100% - 22px);
    position: relative;
    padding: 10px;
    border: 1px solid var(--surface-500);
    border-bottom-right-radius: 8px;
    border-bottom-left-radius: 8px;
    border-top: 0 solid var(--surface-500);
    background: transparent;
}

/* ── Responsive: 575px ────────────────────────────────────────────── */
@media all and (max-width: 575px) {
    .tab-pid_tuning dialog {
        width: calc(100% - 2em);
        border-radius: unset;
    }
    .tab-pid_tuning .subtab-pid .cf_column {
        min-width: 100%;
        width: 100%;
    }
    .tab-pid_tuning .subtab-pid .cf_column_right {
        min-width: 100%;
        margin-left: 0;
    }
    .tab-pid_tuning .subtab-rates .cf_column {
        min-width: 100%;
        width: 100%;
    }
    .tab-pid_tuning .note-button td:first-child {
        width: 60%;
    }
    .tab-pid_tuning .spacer_left {
        width: 100%;
    }
    .tab-pid_tuning .sliderHeaders {
        height: 18px;
        background-color: #d6d6d6;
        line-height: 13px;
        font-size: 12px;
        border-bottom: 1px solid var(--surface-500);
        color: #595959;
        font-weight: normal;
        background-image: linear-gradient(
            315deg,
            rgba(255, 255, 255, 0.2) 10%,
            transparent 10%,
            transparent 20%,
            rgba(255, 255, 255, 0.2) 20%,
            rgba(255, 255, 255, 0.2) 30%,
            transparent 30%,
            transparent 40%,
            rgba(255, 255, 255, 0.2) 40%,
            rgba(255, 255, 255, 0.2) 50%,
            transparent 50%,
            transparent 60%,
            rgba(255, 255, 255, 0.2) 60%,
            rgba(255, 255, 255, 0.2) 70%,
            transparent 70%,
            transparent 80%,
            rgba(255, 255, 255, 0.2) 80%,
            rgba(255, 255, 255, 0.2) 90%,
            transparent 90%,
            transparent 100%,
            rgba(255, 255, 255, 0.2) 100%,
            transparent
        );
    }
    .tab-pid_tuning .sliderHeaders span {
        color: #595959;
    }
    .tab-pid_tuning .sliderLabels tr.sliderHeaders td:first-child {
        text-align: left;
    }
    .tab-pid_tuning .tuningPIDSliders .pid_titlebar th:last-child,
    .tab-pid_tuning .tuningPIDSliders .pid_titlebar th:nth-child(2) {
        width: 20%;
    }
    .tab-pid_tuning .tuningFilterSliders .pid_titlebar th:last-child,
    .tab-pid_tuning .tuningFilterSliders .pid_titlebar th:nth-child(2) {
        width: 20%;
    }
    .tab-pid_tuning .pid_titlebar th div .xs {
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
    }
    .subtab-filter .two_columns {
        flex-wrap: wrap;
    }
    .subtab-filter .two_columns .two_columns_first {
        margin-right: 0;
    }
    .subtab-filter .two_columns .two_columns_second {
        margin-left: 0;
    }
}

/* ── Responsive: 900px (rates column stacking) ────────────────────── */
@media all and (max-width: 900px) {
    .tab-pid_tuning .subtab-rates {
        flex-direction: column;
    }
}

/* ── Responsive: 1205px ───────────────────────────────────────────── */
@media only screen and (max-width: 1205px) {
    .tab-pid_tuning .subtab-pid .spacer_left {
        width: 100%;
    }
}

/* ── Responsive: 1405px ───────────────────────────────────────────── */
@media only screen and (max-width: 1405px) {
    .tab-pid_tuning .subtab-rates .ratePreview.spacer_left {
        width: 100%;
    }
}
</style>
