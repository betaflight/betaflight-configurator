import { defineStore } from "pinia";
import { computed, ref } from "vue";
import FC from "@/js/fc";
import { useDirtyState } from "@/composables/useDirtyState";

/**
 * Pinia store for PID Tuning tab change tracking.
 *
 * Everything the tab can edit ends up in FC — a Vue reactive() object (see fc.js) — so the
 * baselines below are taken with the shared `useDirtyState` helper and compare against live FC
 * state. The tab needs two of them because they are cleared at different moments:
 *
 *  - `hasEdits` covers the values, and is re-baselined by every load (including the reload that
 *    follows a profile switch, which pulls in a whole different set of values).
 *  - `profileDirty` covers what the FC itself holds in RAM only: the active PID / rate profile
 *    picked by MSP_SELECT_SETTING, and a MSP_SET_RESET_CURR_PID reset of the current profile.
 *    Both stay unsaved work until the tab writes EEPROM, so they have to survive the reload that
 *    each of them triggers.
 */
export const usePidTuningStore = defineStore("pidTuning", () => {
    /** The editable set: the same five objects the tab writes back over MSP, plus the profile names. */
    const serializeEdits = () =>
        JSON.stringify({
            pids: FC.PIDS,
            advancedTuning: FC.ADVANCED_TUNING,
            rcTuning: FC.RC_TUNING,
            filterConfig: FC.FILTER_CONFIG,
            tuningSliders: FC.TUNING_SLIDERS,
            // Read the names off FC rather than taking them as arguments: the tab mirrors its
            // lifted refs into FC.CONFIG, and a second source would be free to drift (#5385).
            pidProfileName: FC.CONFIG.pidProfileNames?.[FC.CONFIG.profile] ?? "",
            rateProfileName: FC.CONFIG.rateProfileNames?.[FC.CONFIG.rateProfile] ?? "",
        });

    const { dirty: hasEdits, markClean: markEditsClean } = useDirtyState(serializeEdits);

    const { dirty: profileChanged, markClean: markProfileSelectionClean } = useDirtyState(
        () => `${FC.CONFIG.profile}:${FC.CONFIG.rateProfile}`,
    );

    // A reset needs a flag rather than a baseline: switching back to the original profile really
    // does undo a switch, but the pre-reset values are gone from the FC, so nothing is left to
    // compare against and only an EEPROM write can settle it.
    const profileReset = ref(false);

    const profileDirty = computed(() => profileChanged.value || profileReset.value);

    /** Unsaved work of any kind: edited values, or a profile switch / reset that is RAM-only. */
    const hasChanges = computed(() => hasEdits.value || profileDirty.value);

    /** Record that MSP_SET_RESET_CURR_PID rewrote the current profile in RAM. */
    function markProfileReset() {
        profileReset.value = true;
    }

    /** The FC-side profile state — the selection and any reset of it — is now what EEPROM holds. */
    function markProfileClean() {
        markProfileSelectionClean();
        profileReset.value = false;
    }

    return {
        hasChanges,
        hasEdits,
        markEditsClean,
        markProfileReset,
        markProfileClean,
    };
});
