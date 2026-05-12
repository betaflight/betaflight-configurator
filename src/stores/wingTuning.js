import { defineStore } from "pinia";
import { ref } from "vue";
import FC from "@/js/fc";

/**
 * Pinia store for Wing Tuning tab change tracking.
 *
 * Mirrors the pattern in `pidTuning.js`: keeps a plain-object snapshot of the
 * field values at load time, and exposes `hasChanges` + `checkForChanges()` so
 * the tab has a single source of truth for its dirty state. FC.WING_TUNING
 * itself remains the wire-facing data — this store only owns dirty tracking.
 */
export const useWingTuningStore = defineStore("wingTuning", () => {
    const hasChanges = ref(false);
    const originalsReady = ref(false);

    const originalWingTuning = ref({});

    /**
     * Snapshot the current FC.WING_TUNING values. Call after every successful
     * MSP load (reload) and after every successful save.
     */
    function storeOriginals() {
        originalWingTuning.value = JSON.parse(JSON.stringify(FC.WING_TUNING));
        originalsReady.value = true;
        hasChanges.value = false;
    }

    /**
     * Compare the tab's current field values against the stored originals
     * and update `hasChanges`. The tab passes its local working copy because
     * fields are bound to a local reactive (not FC.WING_TUNING directly).
     */
    function checkForChanges(currentFields) {
        if (!originalsReady.value) {
            hasChanges.value = false;
            return;
        }
        hasChanges.value = JSON.stringify(currentFields) !== JSON.stringify(originalWingTuning.value);
    }

    return {
        hasChanges,
        storeOriginals,
        checkForChanges,
    };
});
