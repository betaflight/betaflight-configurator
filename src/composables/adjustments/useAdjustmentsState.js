import { reactive, ref, watch } from "vue";

export function useAdjustmentsState() {
    const adjustments = reactive([]);
    const originalSnapshot = ref(null);
    const hasChanges = ref(false);

    function serializeAdjustments() {
        return JSON.stringify(
            adjustments.map((a) => ({
                auxChannelIndex: a.auxChannelIndex,
                range: { start: a.range.start, end: a.range.end },
                adjustmentFunction: a.adjustmentFunction,
                auxSwitchChannelIndex: a.auxSwitchChannelIndex,
                adjustmentCenter: a.adjustmentCenter,
                adjustmentScale: a.adjustmentScale,
                enabled: a.enabled,
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

    watch(adjustments, checkForChanges, { deep: true });

    return { adjustments, hasChanges, storeOriginals };
}
