import { defineStore } from "pinia";
import { ref, reactive } from "vue";

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

    function reset() {
        analysisResult.value = null;
        visibleAxes.roll = true;
        visibleAxes.pitch = true;
        visibleAxes.yaw = true;
        analysisState.value = "idle";
        errorMessage.value = "";
        progressMessage.value = "";
    }

    return {
        analysisResult,
        visibleAxes,
        analysisState,
        errorMessage,
        progressMessage,
        reset,
    };
});
