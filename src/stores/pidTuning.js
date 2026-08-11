import { defineStore } from "pinia";
import { computed } from "vue";
import FC from "@/js/fc";
import { useDirtyState } from "@/composables/useDirtyState";

/**
 * Pinia store for PID Tuning tab change tracking.
 *
 * Everything the tab can edit ends up in FC — a Vue reactive() object (see fc.js) — so both
 * baselines below are taken with the shared `useDirtyState` helper and compare against live FC
 * state. The tab needs two of them because they are cleared at different moments:
 *
 *  - `hasEdits` covers the values, and is re-baselined by every load (including the reload that
 *    follows a profile switch, which pulls in a whole different set of values).
 *  - `profileChanged` covers the active PID / rate profile, which MSP_SELECT_SETTING switches in
 *    RAM only. That switch stays unsaved work until the tab writes EEPROM, so its baseline must
 *    survive the reload that a switch triggers.
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

    const { dirty: profileChanged, markClean: markProfileClean } = useDirtyState(
        () => `${FC.CONFIG.profile}:${FC.CONFIG.rateProfile}`,
    );

    /** Unsaved work of any kind: edited values, or a profile switch that has not been persisted. */
    const hasChanges = computed(() => hasEdits.value || profileChanged.value);

    return {
        hasChanges,
        hasEdits,
        markEditsClean,
        markProfileClean,
    };
});
