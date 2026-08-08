import { computed, ref } from "vue";

/**
 * Shared dirty tracking for the config tabs: compare the editable state against a baseline
 * string taken at the last FC sync. Owning it here means the baseline can only be produced by
 * the same `serialize` the comparison uses — a second serializer drifting out of step is what
 * left Modes permanently dirty in #5385. A null baseline means "not tracking yet", so a tab
 * whose load failed never reports dirty.
 *
 * @param {() => string} serialize - side-effect free, since `dirty` calls it during render
 * @returns {{ dirty: import("vue").ComputedRef<boolean>, markClean: (snapshot?: string) => void, takeSnapshot: () => string }}
 */
export function useDirtyState(serialize) {
    const baseline = ref(null);

    const dirty = computed(() => baseline.value !== null && baseline.value !== serialize());

    /**
     * Adopt the current state as clean, or a snapshot from `takeSnapshot()` taken before an
     * async save — which keeps an edit made while the write is in flight dirty.
     * @param {string} [snapshot]
     */
    function markClean(snapshot) {
        baseline.value = snapshot === undefined ? serialize() : snapshot;
    }

    const takeSnapshot = () => serialize();

    return { dirty, markClean, takeSnapshot };
}
