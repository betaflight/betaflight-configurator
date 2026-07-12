import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { useFlightControllerStore } from "@/stores/fc";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";

export function useAdjustmentsSave(adjustments, storeOriginals, t) {
    const fcStore = useFlightControllerStore();
    const { isSaving, runSave } = useSaving();
    const { saveToEeprom } = useReboot();

    const saveAdjustments = () =>
        runSave(
            async () => {
                const requiredAdjustmentRangeCount = fcStore.adjustmentRanges.length;

                fcStore.adjustmentRanges = [];

                adjustments.forEach((adjustment) => {
                    if (adjustment.enabled) {
                        fcStore.adjustmentRanges.push({
                            slotIndex: adjustment.slotIndex ?? 0,
                            auxChannelIndex: adjustment.auxChannelIndex,
                            range: {
                                start: adjustment.range.start,
                                end: adjustment.range.end,
                            },
                            adjustmentFunction: adjustment.adjustmentFunction,
                            auxSwitchChannelIndex: adjustment.auxSwitchChannelIndex,
                            adjustmentCenter: adjustment.adjustmentCenter || 0,
                            adjustmentScale: adjustment.adjustmentScale || 0,
                        });
                    } else {
                        fcStore.adjustmentRanges.push({
                            slotIndex: 0,
                            auxChannelIndex: 0,
                            range: {
                                start: 900,
                                end: 900,
                            },
                            adjustmentFunction: 0,
                            auxSwitchChannelIndex: 0,
                            adjustmentCenter: 0,
                            adjustmentScale: 0,
                        });
                    }
                });

                for (let i = fcStore.adjustmentRanges.length; i < requiredAdjustmentRangeCount; i++) {
                    fcStore.adjustmentRanges.push({
                        slotIndex: 0,
                        auxChannelIndex: 0,
                        range: {
                            start: 900,
                            end: 900,
                        },
                        adjustmentFunction: 0,
                        auxSwitchChannelIndex: 0,
                        adjustmentCenter: 0,
                        adjustmentScale: 0,
                    });
                }

                await mspHelper.sendAdjustmentRanges();
                await saveToEeprom();

                storeOriginals();
                gui_log(t("adjustmentsEepromSaved"));
            },
            {
                onError: (error) => {
                    console.error("Error saving adjustments configuration:", error);
                },
            },
        );

    return { saveAdjustments, isSaving, runSave };
}
