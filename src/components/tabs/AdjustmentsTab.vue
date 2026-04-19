<template>
    <BaseTab tab-name="adjustments">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabAdjustments") }}</div>
            <WikiButton docUrl="adjustments" />

            <div class="adjustments-container">
                <div class="adjustments-header">
                    <div>{{ $t("adjustmentsColumnEnable") }}</div>
                    <div>{{ $t("adjustmentsColumnWhenChannel") }}</div>
                    <div>{{ $t("adjustmentsColumnIsInRange") }}</div>
                    <div>{{ $t("adjustmentsColumnThenApplyFunction") }}</div>
                    <div>{{ $t("adjustmentsColumnViaChannel") }}</div>
                    <div class="flex items-center gap-1">
                        {{ $t("adjustmentsColumnAdjustmentCenter") }}
                        <HelpIcon :text="$t('adjustmentsCenterHelp')" />
                    </div>
                    <div class="flex items-center gap-1">
                        {{ $t("adjustmentsColumnAdjustmentScale") }}
                        <HelpIcon :text="$t('adjustmentsScaleHelp')" />
                    </div>
                </div>

                <div class="adjustments-list">
                    <div
                        v-for="(adjustment, index) in adjustments"
                        :key="index"
                        :id="`adjustment-${index}`"
                        class="adjustment"
                        :class="{ 'adjustment-disabled': !adjustment.enabled }"
                    >
                        <div class="adjustment-enable" :data-label="$t('adjustmentsColumnEnable')">
                            <span class="row-index">#{{ index + 1 }}</span>
                            <USwitch
                                v-model="adjustment.enabled"
                                size="sm"
                                @update:model-value="onEnableChange(adjustment)"
                            />
                        </div>

                        <div class="adjustment-channel" :data-label="$t('adjustmentsColumnWhenChannel')">
                            <USelect
                                v-model="adjustment.auxChannelIndex"
                                :items="auxChannelOptions"
                                :disabled="!adjustment.enabled"
                            />
                        </div>

                        <div class="adjustment-range" :data-label="$t('adjustmentsColumnIsInRange')">
                            <div class="range-row">
                                <span class="range-value">{{ adjustment.range.start }}</span>
                                <div class="range-slider">
                                    <USlider
                                        v-model="adjustment.rangeArray"
                                        :min="900"
                                        :max="2100"
                                        :step="25"
                                        :disabled="!adjustment.enabled"
                                    />
                                    <div
                                        v-if="rcChannelData[adjustment.auxChannelIndex] !== undefined"
                                        class="marker"
                                        :style="{
                                            left: channelPercent(rcChannelData[adjustment.auxChannelIndex]) + '%',
                                        }"
                                    ></div>
                                </div>
                                <span class="range-value">{{ adjustment.range.end }}</span>
                            </div>
                            <div class="pips-channel-range">
                                <span
                                    v-for="pip in pipValues"
                                    :key="pip"
                                    class="pip"
                                    :style="{ left: channelPercent(pip) + '%' }"
                                    >{{ pip }}</span
                                >
                            </div>
                        </div>

                        <div class="adjustment-function" :data-label="$t('adjustmentsColumnThenApplyFunction')">
                            <USelectMenu
                                v-model="adjustment.adjustmentFunction"
                                value-key="value"
                                :items="sortedFunctions"
                                :disabled="!adjustment.enabled"
                                searchable
                            />
                        </div>

                        <div class="adjustment-via" :data-label="$t('adjustmentsColumnViaChannel')">
                            <USelect
                                v-model="adjustment.auxSwitchChannelIndex"
                                :items="auxChannelOptions"
                                :disabled="!adjustment.enabled"
                            />
                        </div>

                        <div class="adjustment-center" :data-label="$t('adjustmentsColumnAdjustmentCenter')">
                            <UInputNumber
                                v-model="adjustment.adjustmentCenter"
                                size="xs"
                                orientation="vertical"
                                class="w-20"
                                :disabled="!adjustment.enabled"
                                :min="0"
                                :max="2000"
                                :step="1"
                            />
                        </div>

                        <div class="adjustment-scale" :data-label="$t('adjustmentsColumnAdjustmentScale')">
                            <UInputNumber
                                v-model="adjustment.adjustmentScale"
                                size="xs"
                                orientation="vertical"
                                class="w-20"
                                :disabled="!adjustment.enabled"
                                :min="0"
                                :max="2000"
                                :step="1"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <UButton
                :label="$t('adjustmentsSave')"
                :color="hasChanges ? 'success' : 'neutral'"
                :disabled="!hasChanges"
                @click="saveAdjustments"
            />
        </div>
    </BaseTab>
</template>

<script setup>
import { onMounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import GUI from "../../js/gui";
import { useTranslation } from "i18next-vue";
import { useAdjustmentsState } from "@/composables/adjustments/useAdjustmentsState";
import { useAdjustmentsData } from "@/composables/adjustments/useAdjustmentsData";
import { useAdjustmentsSave } from "@/composables/adjustments/useAdjustmentsSave";
import { useAdjustmentsPolling } from "@/composables/adjustments/useAdjustmentsPolling";

const { t } = useTranslation();

const { adjustments, hasChanges, storeOriginals } = useAdjustmentsState();
const {
    auxChannelOptions,
    sortedFunctions,
    pipValues,
    channelPercent,
    onEnableChange,
    loadMSPData,
    initializeAdjustments,
} = useAdjustmentsData(adjustments, t);
const { saveAdjustments } = useAdjustmentsSave(adjustments, storeOriginals, t);
const { rcChannelData, startRcDataPolling } = useAdjustmentsPolling();

onMounted(async () => {
    await loadMSPData();
    initializeAdjustments();
    storeOriginals();
    await nextTick();
    startRcDataPolling();
    GUI.content_ready();
});
</script>

<style scoped>
.adjustments-container {
    width: 100%;
    margin: 20px 0;
}

.adjustments-header,
.adjustment {
    display: grid;
    grid-template-columns: 3.5rem 5rem 1fr 7rem 5rem 4.5rem 4.5rem;
    gap: 12px;
    padding: 12px 16px;
}

.adjustments-header {
    background: var(--surface-700);
    border-bottom: 2px solid var(--surface-600);
    font-weight: 600;
    font-size: 13px;
    color: var(--text-primary);
    position: sticky;
    top: 0;
    z-index: 10;
}

.adjustments-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--surface-600);
}

.adjustment {
    background: var(--surface-200);
    align-items: center;
}

.adjustment:hover {
    background: var(--surface-750);
}

.adjustment:nth-child(even) {
    background: var(--surface-300);
}

.adjustment-disabled {
    opacity: 0.4;
}

.adjustment-disabled .adjustment-channel,
.adjustment-disabled .adjustment-range,
.adjustment-disabled .adjustment-function,
.adjustment-disabled .adjustment-via,
.adjustment-disabled .adjustment-center,
.adjustment-disabled .adjustment-scale {
    pointer-events: none;
}

.adjustment-enable {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
}

.row-index {
    font-size: 11px;
    color: var(--text-tertiary);
    font-weight: 600;
    min-width: 1.2rem;
}

.adjustment-range {
    min-width: 0;
}

.range-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.range-value {
    font-size: 10px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    min-width: 2rem;
    text-align: center;
}

.range-slider {
    position: relative;
    flex: 1;
    min-width: 0;
}

.marker {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 24px;
    background: #ff0;
    transform: translate(-50%, -50%);
    z-index: 3;
    pointer-events: none;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
}

.pips-channel-range {
    position: relative;
    height: 20px;
    margin-top: 4px;
}

.pip {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--text-tertiary);
    white-space: nowrap;
}

/* Responsive layout */
@media (max-width: 1200px) {
    .adjustments-header {
        display: none;
    }

    .adjustment {
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 16px;
    }

    .adjustment > div::before {
        content: attr(data-label);
        font-weight: 600;
        display: block;
        margin-bottom: 8px;
        color: var(--text-secondary);
    }

    .adjustment-enable {
        justify-content: flex-start;
    }
}
</style>
