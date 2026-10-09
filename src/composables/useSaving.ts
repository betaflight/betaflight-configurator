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

import { ref, type Ref } from "vue";
import { isMspCancelled } from "../js/msp/mspErrors";
import { gui_log } from "../js/gui_log";
import { i18n } from "../js/localization";

/** An error carrying the message runSave shows in place of the generic one. */
export interface SaveFailureTagged {
    saveFailureMessage?: string;
}

/**
 * Attach the message the user should see for this failure and hand the error back for the
 * caller to rethrow. runSave shows it in place of the generic "failed to save configuration",
 * so a step that knows exactly what went wrong (a refused port assignment, say) says so without
 * raising a toast of its own on top of the shared one. The error is tagged, not wrapped, so its
 * type stays visible to isMspCancelled; the innermost message wins because it is the most
 * specific. A primitive throw is wrapped in an Error, since a property cannot be set on it.
 * @param error the caught error, to be rethrown by the caller
 * @param message localised text for the log toast
 */
export function withSaveFailureMessage<T>(
    error: T,
    message: string,
): (T extends object ? T : Error) & SaveFailureTagged {
    const tagged = (
        error !== null && typeof error === "object" ? error : new Error(String(error), { cause: error })
    ) as (T extends object ? T : Error) & SaveFailureTagged;
    tagged.saveFailureMessage ??= message;
    return tagged;
}

function saveFailureMessageOf(error: unknown): string | undefined {
    return error !== null && typeof error === "object" ? (error as SaveFailureTagged).saveFailureMessage : undefined;
}

export interface RunSaveOptions {
    /** Tab-specific follow-up after a genuine failure; the user has already been notified. */
    onError?: (error: unknown) => void;
}

export interface Saving {
    isSaving: Ref<boolean>;
    runSave: (fn: () => Promise<void>, options?: RunSaveOptions) => Promise<void>;
}

/**
 * Shared save discipline for the config tabs: owns the `isSaving` flag, prevents concurrent
 * saves, centrally swallows benign MSP cancellations and reports genuine failures to the user,
 * so no tab has to reimplement any of it.
 */
export function useSaving(): Saving {
    const isSaving = ref(false);

    /**
     * Run one save operation while `isSaving` is held true. A benign MspCancelledError
     * (queue cleared by a tab switch / reboot-disconnect) is swallowed silently. Any other
     * error is logged to the console and surfaced to the user once in the log toast — with
     * the step's own words when it was tagged via withSaveFailureMessage, otherwise as the
     * uniform "save failed" message; `onError` then runs for tab-specific follow-up (state
     * rollback, re-enabling controls) — it does not need to log or notify again.
     * @param fn the async save work (marshal + MSP writes + persist)
     * @param options optional tab-specific follow-up
     */
    async function runSave(fn: () => Promise<void>, { onError }: RunSaveOptions = {}): Promise<void> {
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
            gui_log(saveFailureMessageOf(e) ?? i18n.getMessage("configurationSaveFailed"));
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
