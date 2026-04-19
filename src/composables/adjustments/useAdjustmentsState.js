import { reactive, ref, computed, watch } from "vue";

export function useAdjustmentsState() {
    const adjustments = reactive([]);
    const originalSnapshot = ref(null);
    const hasChanges = ref(false);
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

    function storeOriginals() {
        originalSnapshot.value = serializeAdjustments();
        hasChanges.value = false;
    }

    function checkForChanges() {
        if (!originalSnapshot.value) {
            hasChanges.value = false;
            return;
        }
        hasChanges.value = serializeAdjustments() !== originalSnapshot.value;
    }

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

    watch(adjustments, checkForChanges, { deep: true });

    return { adjustments, hasChanges, storeOriginals, showAllSlots, activeCount, visibleAdjustments };
}
