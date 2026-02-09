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
     */
    function storeOriginals(pidProfileName = "", rateProfileName = "") {
        originalPids.value = JSON.parse(JSON.stringify(FC.PIDS));
        originalAdvancedTuning.value = JSON.parse(JSON.stringify(FC.ADVANCED_TUNING));
        originalRcTuning.value = JSON.parse(JSON.stringify(FC.RC_TUNING));
        originalFilterConfig.value = JSON.parse(JSON.stringify(FC.FILTER_CONFIG));
        originalTuningSliders.value = JSON.parse(JSON.stringify(FC.TUNING_SLIDERS));
        originalPidProfileName.value = pidProfileName;
        originalRateProfileName.value = rateProfileName;
        hasChanges.value = false;
    }

    /**
     * Compare current FC data against the stored originals and update
     * `hasChanges`.  Accepts the current (lifted) profile-name strings
     * so the comparison covers those edits too.
     */
    function checkForChanges(currentPidProfileName = "", currentRateProfileName = "") {
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

    /**
     * Restore FC data from the stored originals.
     * Returns the original profile names so the caller can reset its local refs.
     */
    function revertToOriginals() {
        FC.PIDS = JSON.parse(JSON.stringify(originalPids.value));
        Object.assign(FC.ADVANCED_TUNING, JSON.parse(JSON.stringify(originalAdvancedTuning.value)));
        Object.assign(FC.RC_TUNING, JSON.parse(JSON.stringify(originalRcTuning.value)));
        Object.assign(FC.FILTER_CONFIG, JSON.parse(JSON.stringify(originalFilterConfig.value)));
        Object.assign(FC.TUNING_SLIDERS, JSON.parse(JSON.stringify(originalTuningSliders.value)));
        hasChanges.value = false;

        return {
            pidProfileName: originalPidProfileName.value,
            rateProfileName: originalRateProfileName.value,
        };
    }

    return {
        hasChanges,
        storeOriginals,
        checkForChanges,
        revertToOriginals,
    };
});
