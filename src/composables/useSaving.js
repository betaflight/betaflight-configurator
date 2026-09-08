import { ref } from "vue";
import { isMspCancelled } from "../js/msp/mspErrors.js";
import { gui_log } from "../js/gui_log.js";
import { i18n } from "../js/localization.js";

/**
 * Shared save discipline for the config tabs: owns the `isSaving` flag, prevents concurrent
 * saves, centrally swallows benign MSP cancellations and reports genuine failures to the user,
 * so no tab has to reimplement any of it.
 * @returns {{ isSaving: import("vue").Ref<boolean>, runSave: (fn: () => Promise<void>, options?: { onError?: (error: unknown) => void }) => Promise<void> }}
 */
export function useSaving() {
    const isSaving = ref(false);

    /**
     * Run one save operation while `isSaving` is held true. A benign MspCancelledError
     * (queue cleared by a tab switch / reboot-disconnect) is swallowed silently. Any other
     * error is logged to the console and surfaced to the user as a uniform "save failed"
     * message in the log toast; `onError` then runs for tab-specific follow-up (state
     * rollback, re-enabling controls) — it does not need to log or notify again.
     * @param {() => Promise<void>} fn - the async save work (marshal + MSP writes + persist)
     * @param {{ onError?: (error: unknown) => void }} [options] - optional tab-specific follow-up
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
            // One user-visible failure path for every save flow (#5276): the console keeps the
            // details, the log toast tells the user the configuration did not stick.
            console.error("Save failed:", e);
            gui_log(i18n.getMessage("configurationSaveFailed"));
            onError?.(e);
        } finally {
            isSaving.value = false;
        }
    }

    return {
        isSaving,
        runSave,
    };
}
