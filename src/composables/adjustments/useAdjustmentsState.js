import { reactive, ref, computed } from "vue";
import { useDirtyState } from "../useDirtyState";

export function useAdjustmentsState() {
    const adjustments = reactive([]);
    const showAllSlots = ref(false);

    function serializeAdjustments() {
        return JSON.stringify(
            adjustments.map((a) => ({
                auxChannelIndex: Number(a.auxChannelIndex),
                range: { start: Number(a.range.start), end: Number(a.range.end) },
                adjustmentFunction: Number(a.adjustmentFunction),
                auxSwitchChannelIndex: Number(a.auxSwitchChannelIndex),
                adjustmentCenter: Number(a.adjustmentCenter || 0),
                adjustmentScale: Number(a.adjustmentScale || 0),
                enabled: !!a.enabled,
            })),
        );
    }

    // `hasChanges` is this tab's name for the shared dirty flag. Because it is a computed
    // over the same serialization, the deep watcher the old manually-maintained ref needed is
    // no longer necessary — it re-evaluates whenever a slot it read actually changes.
    const { dirty: hasChanges, markClean } = useDirtyState(serializeAdjustments);

    /** Adopt the current slots as the clean baseline. Wrapped so a caller passing an event
     *  object (e.g. used directly as a click handler) cannot be mistaken for a snapshot. */
    const storeOriginals = () => markClean();

    const activeCount = computed(() => adjustments.filter((a) => a.enabled).length);

    const visibleAdjustments = computed(() => {
        if (showAllSlots.value) {
            return adjustments.map((a, i) => ({ adjustment: a, originalIndex: i }));
        }
        const result = [];
        let firstDisabledAdded = false;
        for (let i = 0; i < adjustments.length; i++) {
            if (adjustments[i].enabled) {
                result.push({ adjustment: adjustments[i], originalIndex: i });
            } else if (!firstDisabledAdded) {
                result.push({ adjustment: adjustments[i], originalIndex: i });
                firstDisabledAdded = true;
            }
        }
        return result;
    });

    return { adjustments, hasChanges, storeOriginals, showAllSlots, activeCount, visibleAdjustments };
}
