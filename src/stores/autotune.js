import { defineStore } from "pinia";
import { ref, reactive } from "vue";
import { PHASE_MARGIN_PRESETS } from "@/js/blackbox/spectral_analysis";

/**
 * Pinia store for Autotune tab state.
 */
export const useAutotuneStore = defineStore("autotune", () => {
    /** Analysis result object (per-axis transfer functions, gains, etc.) or null */
    const analysisResult = ref(null);

    /**
     * Target open-loop phase margin in degrees. Gains are recomputed from the
     * stored transfer functions when this changes, so switching it does not
     * require re-importing the log.
     */
    const targetPhaseMarginDeg = ref(PHASE_MARGIN_PRESETS.NORMAL);

    /** Which axes are visible on the chart / table: { roll: true, pitch: true, yaw: true } */
    const visibleAxes = reactive({ roll: true, pitch: true, yaw: true });

    /** UI state machine: "idle" | "importing" | "analyzing" | "done" | "error" */
    const analysisState = ref("idle");

    /** Human-readable error message when analysisState === "error" */
    const errorMessage = ref("");

    /** Progress message shown during importing / analyzing phases */
    const progressMessage = ref("");

    function reset() {
        analysisResult.value = null;
        visibleAxes.roll = true;
        visibleAxes.pitch = true;
        visibleAxes.yaw = true;
        analysisState.value = "idle";
        errorMessage.value = "";
        progressMessage.value = "";
        targetPhaseMarginDeg.value = PHASE_MARGIN_PRESETS.NORMAL;
    }

    return {
        analysisResult,
        targetPhaseMarginDeg,
        visibleAxes,
        analysisState,
        errorMessage,
        progressMessage,
        reset,
    };
});
