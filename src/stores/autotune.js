import { defineStore } from "pinia";
import { ref, reactive, watch } from "vue";
import FC from "../js/fc";

/**
 * Pinia store for Autotune tab state.
 */
export const useAutotuneStore = defineStore("autotune", () => {
    /** Analysis result object (per-axis transfer functions, gains, etc.) or null */
    const analysisResult = ref(null);

    /** Which axes are visible on the chart / table: { roll: true, pitch: true, yaw: true } */
    const visibleAxes = reactive({ roll: true, pitch: true, yaw: true });

    /** UI state machine: "idle" | "importing" | "analyzing" | "done" | "error" */
    const analysisState = ref("idle");

    /** Human-readable error message when analysisState === "error" */
    const errorMessage = ref("");

    /** Progress message shown during importing / analyzing phases */
    const progressMessage = ref("");

    /** Profile selected for comparison / apply: "logged" or a profile index (number) */
    const comparisonProfile = ref("logged");

    /** Cache of loaded profile data: { [profileIndex]: ProfileData } */
    const profileCache = reactive({});

    /**
     * True while a profile-switching MSP sequence (load or apply) is in flight, so the
     * UI can disable profile selection / apply instead of letting two sequences race.
     */
    const profileOperationInFlight = ref(false);

    function setComparisonProfile(profile) {
        comparisonProfile.value = profile;
    }

    function cacheProfile(index, data) {
        profileCache[index] = data;
    }

    function clearProfileCache() {
        for (const key of Object.keys(profileCache)) {
            delete profileCache[key];
        }
    }

    function setProfileOperationInFlight(value) {
        profileOperationInFlight.value = value;
    }

    // FC.CONFIG.profile also changes as a side effect of our own load/apply sequences
    // (select target -> ... -> select back to original). Those internal switches happen
    // while profileOperationInFlight is true, so only an external switch (e.g. the user
    // changing profiles on the PID Tuning tab while Autotune stays open) reaches here and
    // invalidates the cache — see the "gotchas" note in the per-axis-apply plan doc.
    watch(
        () => FC.CONFIG.profile,
        () => {
            if (!profileOperationInFlight.value) {
                clearProfileCache();
            }
        },
    );

    function reset() {
        analysisResult.value = null;
        visibleAxes.roll = true;
        visibleAxes.pitch = true;
        visibleAxes.yaw = true;
        analysisState.value = "idle";
        errorMessage.value = "";
        progressMessage.value = "";
        comparisonProfile.value = "logged";
        clearProfileCache();
    }

    return {
        analysisResult,
        visibleAxes,
        analysisState,
        errorMessage,
        progressMessage,
        comparisonProfile,
        profileCache,
        profileOperationInFlight,
        setComparisonProfile,
        cacheProfile,
        clearProfileCache,
        setProfileOperationInFlight,
        reset,
    };
});
