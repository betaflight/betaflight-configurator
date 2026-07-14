import { ref } from "vue";
import { isMspCancelled } from "../js/msp/mspErrors.js";

export function useSaving() {
    const isSaving = ref(false);

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
