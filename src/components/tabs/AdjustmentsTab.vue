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
                    >
                        <div class="adjustment-enable" :data-label="$t('adjustmentsColumnEnable')">
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
                            <div class="limits">
                                <span>{{ $t("adjustmentsMin") }}: {{ adjustment.range.start }}</span>
                                <span>{{ $t("adjustmentsMax") }}: {{ adjustment.range.end }}</span>
                            </div>
                        </div>

                        <div class="adjustment-range" :data-label="$t('adjustmentsColumnIsInRange')">
                            <div class="relative">
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
                                    :style="{ left: channelPercent(rcChannelData[adjustment.auxChannelIndex]) + '%' }"
                                ></div>
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
            <UButton :label="$t('adjustmentsSave')" color="neutral" @click="saveAdjustments" />
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { API_VERSION_1_48 } from "../../js/data_storage";
import { gui_log } from "../../js/gui_log";
import { useFlightControllerStore } from "@/stores/fc";
import { useTranslation } from "i18next-vue";

const { t } = useTranslation();
const fcStore = useFlightControllerStore();

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const PIP_VALUES = [1000, 1200, 1500, 1800, 2000];

const pipValues = PIP_VALUES;

const adjustments = reactive([]);
const auxChannelCount = ref(0);
const rcChannelData = reactive({});

const auxChannelOptions = computed(() => {
    const options = [];
    for (let i = 0; i < auxChannelCount.value; i++) {
        options.push({ value: i, label: `AUX ${i + 1}` });
    }
    return options;
});

// Generate function options (0-32 base, 33+ gated by API version)
const adjustmentFunctionCount = computed(() => {
    return fcStore.isApiVersionSupported(API_VERSION_1_48) ? 34 : 33;
});

const functionOptions = computed(() => {
    const options = [];
    for (let i = 0; i < adjustmentFunctionCount.value; i++) {
        options.push({
            value: i,
            label: t(`adjustmentsFunction${i}`),
        });
    }
    return options;
});

// Sort functions alphabetically, but keep first option at top
const sortedFunctions = computed(() => {
    const opts = [...functionOptions.value];
    const first = opts[0];
    const rest = opts.slice(1).sort((a, b) => a.label.localeCompare(b.label));
    return [first, ...rest];
});

const channelPercent = (value) => {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return 50;
    }
    const clamped = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, value));
    return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
};

const onEnableChange = (adjustment) => {
    if (adjustment.enabled) {
        // Set default range if both start and end are the same
        if (adjustment.range.start === adjustment.range.end) {
            adjustment.range.start = 1300;
            adjustment.range.end = 1700;
        }
    } else {
        // Reset to initial state when disabled
        adjustment.range.start = 900;
        adjustment.range.end = 900;
    }
};

const loadMSPData = async () => {
    return new Promise((resolve) => {
        MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false, () => {
            MSP.send_message(MSPCodes.MSP_ADJUSTMENT_RANGES, false, false, () => {
                MSP.send_message(MSPCodes.MSP_BOXIDS, false, false, () => {
                    MSP.send_message(MSPCodes.MSP_RC, false, false, resolve);
                });
            });
        });
    });
};

const initializeAdjustments = () => {
    auxChannelCount.value = fcStore.rc.active_channels - 4;

    // Clear existing adjustments
    adjustments.splice(0, adjustments.length);

    // Populate adjustments from fcStore
    fcStore.adjustmentRanges.forEach((range) => {
        const isEnabled = range.range?.start !== range.range?.end;
        const adj = reactive({
            slotIndex: range.slotIndex || 0,
            auxChannelIndex: range.auxChannelIndex || 0,
            range: {
                start: range.range?.start || 900,
                end: range.range?.end || 900,
            },
            adjustmentFunction: range.adjustmentFunction || 0,
            auxSwitchChannelIndex: range.auxSwitchChannelIndex || 0,
            adjustmentCenter: range.adjustmentCenter || 0,
            adjustmentScale: range.adjustmentScale || 0,
            enabled: isEnabled,
            // USlider range mode adapter
            get rangeArray() {
                return [this.range.start, this.range.end];
            },
            set rangeArray([start, end]) {
                this.range.start = start;
                this.range.end = end;
            },
        });
        adjustments.push(adj);
    });
};

const updateRcData = () => {
    const auxCount = fcStore.rc.active_channels - 4;
    for (let auxChannelIndex = 0; auxChannelIndex < auxCount; auxChannelIndex++) {
        rcChannelData[auxChannelIndex] = fcStore.rc.channels[auxChannelIndex + 4];
    }
};

let rcDataInterval = null;

const startRcDataPolling = () => {
    const getRcData = () => {
        MSP.send_message(MSPCodes.MSP_RC, false, false, updateRcData);
    };

    // Update immediately
    updateRcData();

    // Start polling
    rcDataInterval = setInterval(getRcData, 50);
};

const stopRcDataPolling = () => {
    if (rcDataInterval) {
        clearInterval(rcDataInterval);
        rcDataInterval = null;
    }
};

const saveAdjustments = () => {
    const requiredAdjustmentRangeCount = fcStore.adjustmentRanges.length;

    fcStore.adjustmentRanges = [];

    adjustments.forEach((adjustment) => {
        if (adjustment.enabled) {
            fcStore.adjustmentRanges.push({
                slotIndex: 0,
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

    // Fill remaining slots if needed
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

    mspHelper.sendAdjustmentRanges(() => {
        MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, () => {
            gui_log(t("adjustmentsEepromSaved"));
        });
    });
};

onMounted(async () => {
    await loadMSPData();
    initializeAdjustments();
    await nextTick();
    startRcDataPolling();
    GUI.content_ready();
});

onUnmounted(() => {
    stopRcDataPolling();
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

.adjustment-enable {
    display: flex;
    justify-content: center;
    align-items: center;
}

.adjustment-channel {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.limits {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary);
}

.adjustment-range {
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
