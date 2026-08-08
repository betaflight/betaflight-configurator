import { computed, ref } from "vue";

/**
 * Shared dirty tracking for the config tabs.
 *
 * Every tab answers "is there anything to save?" the same way: serialize the editable state
 * to a string, keep the string from the last FC sync as a baseline, and compare the two.
 * This owns that pattern so no tab has to restate it — and, more importantly, so the
 * baseline can only ever be produced by the same `serialize` the comparison uses. A tab that
 * rebuilds its baseline some other way can silently drift out of step and leave the Save
 * button lit after a successful save (issue #5385).
 *
 * The baseline starts out null, meaning "not tracking yet", so a tab whose load failed never
 * reports dirty and its Save button stays disabled.
 *
 * @param {() => string} serialize - serializes the editable state; must be side-effect free,
 *   since `dirty` calls it during render
 * @returns {{ dirty: import("vue").ComputedRef<boolean>, markClean: (snapshot?: string) => void, takeSnapshot: () => string }}
 */
export function useDirtyState(serialize) {
    const baseline = ref(null);

    const dirty = computed(() => baseline.value !== null && baseline.value !== serialize());

    /**
     * Adopt the current state as the clean baseline. Pass a snapshot taken earlier with
     * `takeSnapshot()` to adopt that instead: during an async save this pins the state the
     * payload was built from, so an edit made while the write is in flight stays dirty.
     * @param {string} [snapshot]
     */
    function markClean(snapshot) {
        baseline.value = snapshot === undefined ? serialize() : snapshot;
    }

    /** Serialize the current state without adopting it — see `markClean`. */
    const takeSnapshot = () => serialize();

    return { dirty, markClean, takeSnapshot };
}
