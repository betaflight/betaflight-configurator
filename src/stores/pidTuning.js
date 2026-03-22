import { defineStore } from "pinia";
import { ref } from "vue";
import FC from "@/js/fc";

/**
 * Pinia store for PID Tuning tab change tracking.
 *
 * FC is already a Vue reactive() object (see fc.js), but watching deeply nested
 * properties across five large objects (PIDS, ADVANCED_TUNING, RC_TUNING,
 * FILTER_CONFIG, TUNING_SLIDERS) with a single deep watcher is fragile and
 * expensive.  Instead this store keeps plain-object snapshots taken at load time
 * and exposes an explicit `checkForChanges()` that the parent tab calls in
 * response to DOM input/change events and child "change" emits.
 */
export const usePidTuningStore = defineStore("pidTuning", () => {
    // ---- reactive state ----
    const hasChanges = ref(false);
    const originalsReady = ref(false);

    // Set by external tools (e.g. AeroTune) that write PIDs to FC hardware
    // before navigating to this tab.  While true, storeOriginals() keeps
    // hasChanges = true so the Save button stays enabled across Refresh calls.
    // Only cleared when the user explicitly saves (clearExternalChange()).
    const externalChangeFlag = ref(false);

    // Original value snapshots (deep-cloned plain objects)
    const originalPids = ref([]);
    const originalAdvancedTuning = ref({});
    const originalRcTuning = ref({});
    const originalFilterConfig = ref({});
    const originalTuningSliders = ref({});
    const originalPidProfileName = ref("");
    const originalRateProfileName = ref("");

    // ---- actions ----

    /**
     * Snapshot the current FC data so we can detect future changes.
     * Call after every MSP load / profile switch.
     *
     * When externalChangeFlag is set (AeroTune applied PIDs), hasChanges is
     * forced true so the Save button stays enabled after Refresh as well.
     */
    function storeOriginals(pidProfileName = "", rateProfileName = "") {
        // Use JSON-based cloning instead of structuredClone because FC is a Vue reactive() proxy
        // which structuredClone cannot handle (throws DataCloneError)
        originalPids.value = JSON.parse(JSON.stringify(FC.PIDS));
        originalAdvancedTuning.value = JSON.parse(JSON.stringify(FC.ADVANCED_TUNING));
        originalRcTuning.value = JSON.parse(JSON.stringify(FC.RC_TUNING));
        originalFilterConfig.value = JSON.parse(JSON.stringify(FC.FILTER_CONFIG));
        originalTuningSliders.value = JSON.parse(JSON.stringify(FC.TUNING_SLIDERS));
        originalPidProfileName.value = pidProfileName;
        originalRateProfileName.value = rateProfileName;
        originalsReady.value = true;
        // If an external tool wrote values to FC, keep hasChanges = true until
        // the user saves (clearExternalChange is called before storeOriginals
        // in the save path).
        hasChanges.value = externalChangeFlag.value ? true : false;
    }

    /**
     * Signal that an external tool has already written values to FC hardware.
     * hasChanges will be kept true by storeOriginals() until clearExternalChange()
     * is called (i.e. until the user saves).
     */
    function markExternalChange() {
        externalChangeFlag.value = true;
    }

    /**
     * Clear the external-change flag.  Call this at the start of the save
     * path so that the post-save storeOriginals() call resets hasChanges to
     * false as normal.
     */
    function clearExternalChange() {
        externalChangeFlag.value = false;
    }

    /**
     * Compare current FC data against the stored originals and update
     * `hasChanges`.  Accepts the current (lifted) profile-name strings
     * so the comparison covers those edits too.
     */
    function checkForChanges(currentPidProfileName = "", currentRateProfileName = "") {
        if (!originalsReady.value) {
            hasChanges.value = false;
            return;
        }

        // If an external change is pending, always report dirty.
        if (externalChangeFlag.value) {
            hasChanges.value = true;
            return;
        }

        const pidsChanged = JSON.stringify(FC.PIDS) !== JSON.stringify(originalPids.value);
        const advancedChanged = JSON.stringify(FC.ADVANCED_TUNING) !== JSON.stringify(originalAdvancedTuning.value);
        const rcTuningChanged = JSON.stringify(FC.RC_TUNING) !== JSON.stringify(originalRcTuning.value);
        const filterChanged = JSON.stringify(FC.FILTER_CONFIG) !== JSON.stringify(originalFilterConfig.value);
        const slidersChanged = JSON.stringify(FC.TUNING_SLIDERS) !== JSON.stringify(originalTuningSliders.value);
        const pidNameChanged = currentPidProfileName !== originalPidProfileName.value;
        const rateNameChanged = currentRateProfileName !== originalRateProfileName.value;

        hasChanges.value =
            pidsChanged ||
            advancedChanged ||
            rcTuningChanged ||
            filterChanged ||
            slidersChanged ||
            pidNameChanged ||
            rateNameChanged;
    }

    return {
        hasChanges,
        storeOriginals,
        checkForChanges,
        markExternalChange,
        clearExternalChange,
    };
});
