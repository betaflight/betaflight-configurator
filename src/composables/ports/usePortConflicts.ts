import { type MaybeRef, unref } from "vue";
import { i18n } from "../../js/localization";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import { useDialog } from "../useDialog";
import { PORT_NONE, getPortDisplayName } from "./portNames";

/**
 * A port a feature is being moved onto that another feature already holds, as `useFeaturePort`
 * reports it: the port's display name and the features that currently claim it.
 */
export interface PortConflict {
    port: string;
    heldBy: string[];
}

/**
 * A feature's pending port assignment, as `useFeaturePort.selection` exposes it: the port it would
 * write, whether that is a change, and the feature's own label.
 */
export interface PendingPortSelection {
    identifier: number;
    changed: boolean;
    label: string;
}

/**
 * Guards a save against port assignments that would take a port away from another feature.
 *
 * The firmware silently drops the loser when two features claim one port, so a pick that lands on
 * a port another feature already holds quietly resets that feature's configuration. Expert mode
 * takes the user at their word and saves without asking; otherwise a save that would cause this
 * raises a confirmation, so the reset is a choice rather than a surprise.
 *
 * @param getConflicts returns the `conflict` value of each feature port on the tab, as
 *   `useFeaturePort` exposes it; refs and plain values are both accepted, so a tab can pass its
 *   ports however it holds them
 * @param getSelections returns the `selection` value of each feature port on the tab, so two of
 *   the tab's features picking the same port in one save are caught even when that port is free —
 *   a clash the claim labels cannot show, since nothing holds the port until the save goes through
 */
export function usePortConflicts(
    getConflicts: () => Array<MaybeRef<PortConflict | null>>,
    getSelections: () => Array<MaybeRef<PendingPortSelection | null>> = () => [],
): {
    confirmPortConflicts: () => Promise<boolean>;
    collectConflicts: () => PortConflict[];
} {
    const { showYesNo } = useDialog();

    function collectConflicts(): PortConflict[] {
        const conflicts: PortConflict[] = [];
        const seen = new Set<string>();

        const add = (conflict: PortConflict) => {
            // A port already named — a duplicate pick that also happens to be persisted-held, or
            // two features clashing on one port — is listed once.
            if (seen.has(conflict.port)) {
                return;
            }
            seen.add(conflict.port);
            conflicts.push(conflict);
        };

        for (const entry of getConflicts() ?? []) {
            const conflict = unref(entry);
            if (conflict) {
                add(conflict);
            }
        }

        // Group the pending assignments by the port they would take; a port two features are both
        // moving onto is a clash the save has to be stopped for, whether or not it is free today.
        const byIdentifier = new Map<number, string[]>();
        for (const entry of getSelections() ?? []) {
            const selection = unref(entry);
            if (!selection || !selection.changed || selection.identifier === PORT_NONE) {
                continue;
            }
            const labels = byIdentifier.get(selection.identifier) ?? [];
            labels.push(selection.label);
            byIdentifier.set(selection.identifier, labels);
        }
        for (const [identifier, labels] of byIdentifier) {
            if (labels.length > 1) {
                add({ port: getPortDisplayName(identifier), heldBy: labels });
            }
        }

        return conflicts;
    }

    /**
     * @returns true to go ahead with the save, false to abort it
     */
    async function confirmPortConflicts(): Promise<boolean> {
        // Expert mode is the opt-out: a user who has turned it on has said they will manage the
        // conflicts themselves, so the save proceeds without a prompt.
        if (isExpertModeEnabled()) {
            return true;
        }

        const conflicts = collectConflicts();
        if (!conflicts.length) {
            return true;
        }

        const items = conflicts
            .map((conflict) =>
                i18n.getMessage("portsConflictItem", {
                    port: conflict.port,
                    features: conflict.heldBy.join(", "),
                }),
            )
            .map((line) => `<li>${line}</li>`)
            .join("");
        const text = `<p>${i18n.getMessage("portsConflictWarning")}</p><ul class="list-disc ps-6 my-2">${items}</ul><p>${i18n.getMessage(
            "portsConflictQuestion",
        )}</p>`;

        return showYesNo(i18n.getMessage("portsConflictTitle"), text, {
            yesText: i18n.getMessage("portsConflictSaveAnyway"),
            noText: i18n.getMessage("portsConflictCancel"),
            destructive: true,
        });
    }

    return { confirmPortConflicts, collectConflicts };
}
