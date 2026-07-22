import { ref } from "vue";
import { isMspCancelled } from "../js/msp/mspErrors.js";

/**
 * Shared save discipline for the config tabs: owns the `isSaving` flag, prevents concurrent
 * saves, and centrally swallows benign MSP cancellations so no tab has to reimplement it.
 * @returns {{ isSaving: import("vue").Ref<boolean>, runSave: (fn: () => Promise<void>, options?: { onError?: (error: unknown) => void }) => Promise<void> }}
 */
export function useSaving() {
    const isSaving = ref(false);

    /**
     * Run one save operation while `isSaving` is held true. A benign MspCancelledError
     * (queue cleared by a tab switch / reboot-disconnect) is swallowed silently; any other
     * error is passed to `onError` (or `console.error` when none is given).
     * @param {() => Promise<void>} fn - the async save work (marshal + MSP writes + persist)
     * @param {{ onError?: (error: unknown) => void }} [options] - genuine-failure handler
     * @returns {Promise<void>}
     */
    async function runSave(fn, { onError } = {}) {
        if (isSaving.value) {
            return;
        }
        isSaving.value = true;
        try {
            await fn();
        } catch (e) {
            // A tab switch, or the reboot/disconnect that a Save-and-Reboot triggers, clears the
            // MSP queue and cancels the in-flight request. The save itself already went through (or
            // the user navigated away), so this is not a real failure — don't log it or surface a
            // "save failed" notification to the caller.
            if (isMspCancelled(e)) {
                return;
            }
            if (onError) {
                onError(e);
            } else {
                console.error(e);
            }
        } finally {
            isSaving.value = false;
        }
    }

    return {
        isSaving,
        runSave,
    };
}
