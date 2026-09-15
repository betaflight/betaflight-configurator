import { ref } from "vue";
import { isMspCancelled } from "../js/msp/mspErrors.js";
import { gui_log } from "../js/gui_log.js";
import { i18n } from "../js/localization.js";

/**
 * Attach the message the user should see for this failure and hand the error back for the
 * caller to rethrow. runSave shows it in place of the generic "failed to save configuration",
 * so a step that knows exactly what went wrong (a refused port assignment, say) says so without
 * raising a toast of its own on top of the shared one. The error is tagged, not wrapped, so its
 * type stays visible to isMspCancelled; the innermost message wins because it is the most
 * specific. A primitive throw is wrapped in an Error, since a property cannot be set on it.
 * @template T
 * @param {T} error - the caught error, to be rethrown by the caller
 * @param {string} message - localised text for the log toast
 * @returns {T | Error}
 */
export function withSaveFailureMessage(error, message) {
    const tagged = error !== null && typeof error === "object" ? error : new Error(String(error), { cause: error });
    if (tagged.saveFailureMessage === undefined) {
        tagged.saveFailureMessage = message;
    }
    return tagged;
}

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
     * error is logged to the console and surfaced to the user once in the log toast — with
     * the step's own words when it was tagged via withSaveFailureMessage, otherwise as the
     * uniform "save failed" message; `onError` then runs for tab-specific follow-up (state
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
            // details, the log toast tells the user the configuration did not stick — in the
            // step's own words when it tagged the error, so nothing else needs to toast.
            console.error("Save failed:", e);
            gui_log(e?.saveFailureMessage ?? i18n.getMessage("configurationSaveFailed"));
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
