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
 *    picked by MSP_SELECT_SETTING, and profile data rewritten by MSP_SET_RESET_CURR_PID or
 *    MSP_COPY_PROFILE. All of it stays unsaved work until the tab writes EEPROM, so it has to
 *    survive the reload that a switch or a reset triggers.
 */
export const usePidTuningStore = defineStore("pidTuning", () => {
    /**
     * The slider positions, without the FC's `slider_*_valid` verdict on whether the stored values
     * still match what the sliders would produce. Nothing in the UI writes those flags — only
     * MSP_VALIDATE_SIMPLIFIED_TUNING does, which the tab re-runs after every save. Editing PIDs by
     * hand with the sliders off legitimately flips one, so leaving them in would report a save that
     * went through perfectly as still dirty.
     */
    const sliderPositions = () => {
        const positions = { ...FC.TUNING_SLIDERS };
        delete positions.slider_pids_valid;
        delete positions.slider_gyro_valid;
        delete positions.slider_dterm_valid;
        return positions;
    };

    /** The editable set: the same six objects the tab writes back over MSP, plus the profile names. */
    const serializeEdits = () =>
        JSON.stringify({
            pids: FC.PIDS,
            advancedTuning: FC.ADVANCED_TUNING,
            rcTuning: FC.RC_TUNING,
            filterConfig: FC.FILTER_CONFIG,
            tuningSliders: sliderPositions(),
            wingConfig: FC.WING_CONFIG,
            // Read the names off FC rather than taking them as arguments: the tab mirrors its
            // lifted refs into FC.CONFIG, and a second source would be free to drift (#5385).
            pidProfileName: FC.CONFIG.pidProfileNames?.[FC.CONFIG.profile] ?? "",
            rateProfileName: FC.CONFIG.rateProfileNames?.[FC.CONFIG.rateProfile] ?? "",
        });

    const {
        dirty: hasEdits,
        markClean: markEditsClean,
        takeSnapshot: takeEditsSnapshot,
    } = useDirtyState(serializeEdits);

    const { dirty: profileChanged, markClean: markProfileSelectionClean } = useDirtyState(
        () => `${FC.CONFIG.profile}:${FC.CONFIG.rateProfile}`,
    );

    // Rewriting profile data (MSP_SET_RESET_CURR_PID, MSP_COPY_PROFILE) needs a flag rather than a
    // baseline: switching back to the original profile really does undo a switch, but a reset or a
    // copy leaves nothing to compare against — the overwritten values are gone from the FC, and a
    // copy lands in a profile the tab is not even showing. Only an EEPROM write can settle those.
    const profileUnsaved = ref(false);

    const profileDirty = computed(() => profileChanged.value || profileUnsaved.value);

    /** Unsaved work of any kind: edited values, or a RAM-only profile switch / reset / copy. */
    const hasChanges = computed(() => hasEdits.value || profileDirty.value);

    /** Record a RAM-only rewrite of profile data: a reset of the current profile, or a copy. */
    function markProfileUnsaved() {
        profileUnsaved.value = true;
    }

    /** The FC-side profile state — the selection and any rewrite of it — is now what EEPROM holds. */
    function markProfileClean() {
        markProfileSelectionClean();
        profileUnsaved.value = false;
    }

    return {
        hasChanges,
        hasEdits,
        takeEditsSnapshot,
        markEditsClean,
        markProfileUnsaved,
        // Adopt a profile the FC picked for itself without claiming a pending reset or copy was
        // written: an external switch says nothing about whether EEPROM holds those.
        markProfileSelectionClean,
        markProfileClean,
    };
});
