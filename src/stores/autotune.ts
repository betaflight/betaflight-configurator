/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { defineStore } from "pinia";
import { ref, reactive } from "vue";
import { PHASE_MARGIN_PRESETS } from "@/js/blackbox/spectral_analysis";
import type { AnalysisResult, AxisName } from "@/composables/useAutotune";

export type AnalysisState = "idle" | "importing" | "analyzing" | "done" | "error";

/**
 * Pinia store for Autotune tab state.
 */
export const useAutotuneStore = defineStore("autotune", () => {
    /** Analysis result (per-axis transfer functions, gains, etc.) or null */
    const analysisResult = ref<AnalysisResult | null>(null);

    /**
     * Target open-loop phase margin in degrees. Gains are recomputed from the
     * stored transfer functions when this changes, so switching it does not
     * require re-importing the log.
     */
    const targetPhaseMarginDeg = ref<number>(PHASE_MARGIN_PRESETS.NORMAL);

    /** Which axes are visible on the chart / table */
    const visibleAxes = reactive<Record<AxisName, boolean>>({ roll: true, pitch: true, yaw: true });

    /** UI state machine */
    const analysisState = ref<AnalysisState>("idle");

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
