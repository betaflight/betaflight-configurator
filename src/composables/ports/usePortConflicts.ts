import { type MaybeRef, unref } from "vue";
import { i18n } from "../../js/localization";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import { useDialog } from "../useDialog";

/**
 * A port a feature is being moved onto that another feature already holds, as `useFeaturePort`
 * reports it: the port's display name and the features that currently claim it.
 */
export interface PortConflict {
    port: string;
    heldBy: string[];
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
 */
export function usePortConflicts(getConflicts: () => Array<MaybeRef<PortConflict | null>>): {
    confirmPortConflicts: () => Promise<boolean>;
    collectConflicts: () => PortConflict[];
} {
    const { showYesNo } = useDialog();

    function collectConflicts(): PortConflict[] {
        const conflicts: PortConflict[] = [];
        const seen = new Set<string>();

        for (const entry of getConflicts() ?? []) {
            const conflict = unref(entry);
            // Two features on one tab can point at the same busy port; name it once.
            if (!conflict || seen.has(conflict.port)) {
                continue;
            }
            seen.add(conflict.port);
            conflicts.push(conflict);
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
