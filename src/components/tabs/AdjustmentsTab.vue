<template>
    <BaseTab tab-name="adjustments">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabAdjustments") }}</div>
            <WikiButton docUrl="adjustments" />

            <div class="adjustments-container">
                <div class="adjustments-header">
                    <div class="header-enable">{{ $t("adjustmentsColumnEnable") }}</div>
                    <div class="header-channel">{{ $t("adjustmentsColumnWhenChannel") }}</div>
                    <div class="header-range">{{ $t("adjustmentsColumnIsInRange") }}</div>
                    <div class="header-function">{{ $t("adjustmentsColumnThenApplyFunction") }}</div>
                    <div class="header-center">{{ $t("adjustmentsColumnCenter") }}</div>
                    <div class="header-scale">{{ $t("adjustmentsColumnScale") }}</div>
                    <div class="header-via">{{ $t("adjustmentsColumnViaChannel") }}</div>
                </div>

                <div class="adjustments-list">
                    <div
                        v-for="(adjustment, index) in adjustments"
                        :key="index"
                        :id="`adjustment-${index}`"
                        class="adjustment"
                    >
                        <div class="adjustment-enable" :data-label="$t('adjustmentsColumnEnable')">
                            <div class="enabling">
                                <input
                                    type="checkbox"
                                    v-model="adjustment.enabled"
                                    @change="onEnableChange(adjustment)"
                                    class="enable toggle"
                                />
                            </div>
                        </div>

                        <div class="adjustment-channel" :data-label="$t('adjustmentsColumnWhenChannel')">
                            <select
                                v-model.number="adjustment.auxChannelIndex"
                                class="channel"
                                :disabled="!adjustment.enabled"
                            >
                                <option v-for="ch in auxChannelCount" :key="ch" :value="ch - 1">AUX {{ ch }}</option>
                            </select>
                            <div class="limits">
                                <p class="lowerLimit">
                                    <span>{{ $t("adjustmentsMin") }}</span
                                    >: <span class="lowerLimitValue">{{ adjustment.range.start }}</span>
                                </p>
                                <p class="upperLimit">
                                    <span>{{ $t("adjustmentsMax") }}</span
                                    >: <span class="upperLimitValue">{{ adjustment.range.end }}</span>
                                </p>
                            </div>
                        </div>

                        <div class="adjustment-range" :data-label="$t('adjustmentsColumnIsInRange')">
                            <div class="channel-slider">
                                <div
                                    class="slider-wrapper"
                                    @mousedown="(e) => handleSliderClick(e, adjustment)"
                                    @touchstart="(e) => handleSliderClick(e, adjustment)"
                                >
                                    <div class="track-background"></div>
                                    <div
                                        class="track-fill"
                                        :style="rangeFillStyle(adjustment)"
                                        @mousedown.stop="(e) => startDrag(e, adjustment, 'range')"
                                        @touchstart.stop="(e) => startDrag(e, adjustment, 'range')"
                                    ></div>
                                    <div
                                        class="range-handle handle-min"
                                        :style="{ left: channelPercent(adjustment.range.start) + '%' }"
                                        @mousedown.stop="(e) => startDrag(e, adjustment, 'start')"
                                        @touchstart.stop="(e) => startDrag(e, adjustment, 'start')"
                                    ></div>
                                    <div
                                        class="range-handle handle-max"
                                        :style="{ left: channelPercent(adjustment.range.end) + '%' }"
                                        @mousedown.stop="(e) => startDrag(e, adjustment, 'end')"
                                        @touchstart.stop="(e) => startDrag(e, adjustment, 'end')"
                                    ></div>
                                    <div class="marker" :style="markerStyle(adjustment.auxChannelIndex)"></div>
                                </div>
                                <div class="pips-channel-range">
                                    <div v-for="pip in pipValues" :key="pip" class="pip" :style="pipStyle(pip)">
                                        {{ pip }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="adjustment-function" :data-label="$t('adjustmentsColumnThenApplyFunction')">
                            <select
                                v-model.number="adjustment.adjustmentFunction"
                                class="function"
                                :disabled="!adjustment.enabled"
                            >
                                <option v-for="func in sortedFunctions" :key="func.value" :value="func.value">
                                    {{ func.label }}
                                </option>
                            </select>
                        </div>

                        <div class="adjustment-center" :data-label="$t('adjustmentsColumnCenter')">
                            <input
                                type="number"
                                v-model.number="adjustment.adjustmentCenter"
                                :disabled="!adjustment.enabled"
                                min="0"
                                max="255"
                                step="1"
                            />
                        </div>

                        <div class="adjustment-scale" :data-label="$t('adjustmentsColumnScale')">
                            <input
                                type="number"
                                v-model.number="adjustment.adjustmentScale"
                                :disabled="!adjustment.enabled"
                                min="0"
                                max="255"
                                step="1"
                            />
                        </div>

                        <div class="adjustment-via" :data-label="$t('adjustmentsColumnViaChannel')">
                            <select
                                v-model.number="adjustment.auxSwitchChannelIndex"
                                class="channel"
                                :disabled="!adjustment.enabled"
                            >
                                <option v-for="ch in auxChannelCount" :key="ch" :value="ch - 1">AUX {{ ch }}</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn save_btn">
                <a class="save" href="#" @click.prevent="saveAdjustments">{{ $t("adjustmentsSave") }}</a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, reactive, computed, onMounted, onUnmounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { i18n } from "../../js/localization";
import { gui_log } from "../../js/gui_log";
import { useFlightControllerStore } from "@/stores/fc";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const CHANNEL_STEP = 25;
const MIN_RANGE_GAP = 25;
const PIP_VALUES = [900, 1000, 1200, 1400, 1500, 1600, 1800, 2000, 2100];

export default defineComponent({
    name: "AdjustmentsTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const fcStore = useFlightControllerStore();

        const adjustments = reactive([]);
        const auxChannelCount = ref(0);
        const rcChannelData = reactive({});

        const pipValues = computed(() => PIP_VALUES);

        // Generate function options (0-31, 'LED Dimmer' is the last)
        const functionOptions = computed(() => {
            const options = [];
            for (let i = 0; i < 32; i++) {
                options.push({
                    value: i,
                    label: i18n.getMessage(`adjustmentsFunction${i}`),
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

        const clampChannel = (value) => {
            if (value === undefined || value === null || Number.isNaN(value)) {
                return 1500;
            }
            return Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, value));
        };

        const channelPercent = (value) => {
            const clamped = clampChannel(value);
            return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
        };

        const pipStyle = (value) => {
            return { left: `${channelPercent(value)}%` };
        };

        const markerStyle = (auxChannelIndex) => {
            const channelValue = rcChannelData[auxChannelIndex];
            if (channelValue === undefined) {
                return { display: "none" };
            }
            return { left: `${channelPercent(channelValue)}%` };
        };

        const rangeFillStyle = (adjustment) => {
            const start = channelPercent(adjustment.range.start);
            const end = channelPercent(adjustment.range.end);
            return {
                left: `${start}%`,
                width: `${Math.max(end - start, 0)}%`,
            };
        };

        const ensureRangeOrder = (adjustment) => {
            if (adjustment.range.start > adjustment.range.end - MIN_RANGE_GAP) {
                adjustment.range.start = Math.max(CHANNEL_MIN, adjustment.range.end - MIN_RANGE_GAP);
            }
            if (adjustment.range.end < adjustment.range.start + MIN_RANGE_GAP) {
                adjustment.range.end = Math.min(CHANNEL_MAX, adjustment.range.start + MIN_RANGE_GAP);
            }
        };

        // Drag handling
        let dragState = null;
        let cleanupDragListeners = null;

        const getEventX = (e) => {
            return e.touches ? e.touches[0].clientX : e.clientX;
        };

        const snapToStep = (value) => {
            return Math.round(value / CHANNEL_STEP) * CHANNEL_STEP;
        };

        const handleSliderClick = (e, adjustment) => {
            if (!adjustment.enabled || dragState) {
                return;
            }

            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = getEventX(e);
            const percent = ((clickX - rect.left) / rect.width) * 100;
            const value = snapToStep(CHANNEL_MIN + (percent / 100) * (CHANNEL_MAX - CHANNEL_MIN));

            const clamped = clampChannel(value);
            const midPoint = (adjustment.range.start + adjustment.range.end) / 2;

            if (clamped < midPoint) {
                adjustment.range.start = clamped;
            } else {
                adjustment.range.end = clamped;
            }
            ensureRangeOrder(adjustment);
        };

        const startDrag = (e, adjustment, dragType) => {
            if (!adjustment.enabled) {
                return;
            }

            e.preventDefault();

            const startX = getEventX(e);
            const startRange = {
                start: adjustment.range.start,
                end: adjustment.range.end,
            };

            // Measure the actual slider width from the wrapper element
            const sliderWrapper = e.target.closest(".slider-wrapper");
            const sliderWidth = sliderWrapper ? sliderWrapper.offsetWidth : 300;

            dragState = {
                adjustment,
                dragType,
                startX,
                startRange,
                sliderWidth,
            };

            const onMove = (e) => {
                if (!dragState) {
                    return;
                }

                const currentX = getEventX(e);
                const deltaX = currentX - dragState.startX;
                const deltaValue = (deltaX / dragState.sliderWidth) * (CHANNEL_MAX - CHANNEL_MIN);
                const snappedDelta = snapToStep(deltaValue);

                if (dragState.dragType === "start") {
                    let newStart = dragState.startRange.start + snappedDelta;
                    newStart = clampChannel(newStart);
                    if (newStart > dragState.adjustment.range.end - MIN_RANGE_GAP) {
                        newStart = dragState.adjustment.range.end - MIN_RANGE_GAP;
                    }
                    dragState.adjustment.range.start = newStart;
                } else if (dragState.dragType === "end") {
                    let newEnd = dragState.startRange.end + snappedDelta;
                    newEnd = clampChannel(newEnd);
                    if (newEnd < dragState.adjustment.range.start + MIN_RANGE_GAP) {
                        newEnd = dragState.adjustment.range.start + MIN_RANGE_GAP;
                    }
                    dragState.adjustment.range.end = newEnd;
                } else if (dragState.dragType === "range") {
                    const rangeSize = dragState.startRange.end - dragState.startRange.start;
                    let newStart = dragState.startRange.start + snappedDelta;
                    let newEnd = dragState.startRange.end + snappedDelta;

                    if (newStart < CHANNEL_MIN) {
                        newStart = CHANNEL_MIN;
                        newEnd = newStart + rangeSize;
                    }
                    if (newEnd > CHANNEL_MAX) {
                        newEnd = CHANNEL_MAX;
                        newStart = newEnd - rangeSize;
                    }

                    dragState.adjustment.range.start = clampChannel(newStart);
                    dragState.adjustment.range.end = clampChannel(newEnd);
                }
            };

            const cleanup = () => {
                if (cleanupDragListeners) {
                    cleanupDragListeners();
                    cleanupDragListeners = null;
                }
            };

            const onEnd = () => {
                cleanup();
            };

            // Store cleanup function
            cleanupDragListeners = () => {
                dragState = null;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onEnd);
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", onEnd);
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onEnd);
            document.addEventListener("touchmove", onMove);
            document.addEventListener("touchend", onEnd);
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
                adjustments.push(
                    reactive({
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
                    }),
                );
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
                        adjustmentCenter: adjustment.adjustmentCenter,
                        adjustmentScale: adjustment.adjustmentScale,
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
                });
            }

            mspHelper.sendAdjustmentRanges(() => {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, () => {
                    gui_log(i18n.getMessage("adjustmentsEepromSaved"));
                });
            });
        };

        onMounted(async () => {
            await loadMSPData();
            initializeAdjustments();
            await nextTick();
            GUI.switchery();
            startRcDataPolling();
            GUI.content_ready();
        });

        onUnmounted(() => {
            stopRcDataPolling();
            if (cleanupDragListeners) {
                cleanupDragListeners();
            }
        });

        return {
            adjustments,
            auxChannelCount,
            sortedFunctions,
            pipValues,
            pipStyle,
            markerStyle,
            rangeFillStyle,
            channelPercent,
            onEnableChange,
            handleSliderClick,
            startDrag,
            saveAdjustments,
        };
    },
});
</script>

<style scoped>
/* Adjustments container layout */
.adjustments-container {
    width: 100%;
    margin: 20px 0;
}

.adjustments-header {
    display: grid;
    grid-template-columns: 80px 200px 1fr 180px 100px 100px 120px;
    gap: 16px;
    padding: 12px 16px;
    background: var(--surface-700);
    border-bottom: 2px solid var(--surface-600);
    font-weight: 600;
    color: var(--text-primary);
}

.adjustments-header > div {
    text-align: left;
}

.adjustments-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--surface-600);
}

.adjustment {
    display: grid;
    grid-template-columns: 80px 200px 1fr 180px 100px 100px 120px;
    gap: 16px;
    padding: 16px;
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

.adjustment-channel select {
    width: 100%;
}

.limits {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary);
}

.limits p {
    margin: 0;
}

.adjustment-range {
    min-width: 0;
}

.adjustment-function select,
.adjustment-via select {
    width: 100%;
}

.adjustment-center input,
.adjustment-scale input {
    width: 100%;
    background: var(--surface-700);
    border: 1px solid var(--surface-600);
    color: var(--text-primary);
    padding: 6px 8px;
    border-radius: 4px;
}

.adjustment-center input:disabled,
.adjustment-scale input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

select {
    background: var(--surface-700);
    border: 1px solid var(--surface-600);
    color: var(--text-primary);
    padding: 6px 8px;
    border-radius: 4px;
}

select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

/* Custom Vue slider styling - replaces noUiSlider */
.channel-slider {
    position: relative;
    width: 100%;
}

.slider-wrapper {
    position: relative;
    height: 18px;
    cursor: pointer;
    user-select: none;
}

.track-background {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 8px;
    background: var(--surface-600);
    transform: translateY(-50%);
    border-radius: 4px;
    z-index: 0;
    pointer-events: none;
}

.track-fill {
    position: absolute;
    top: 50%;
    height: 8px;
    background: var(--primary-500);
    transform: translateY(-50%);
    border-radius: 4px;
    cursor: grab;
    z-index: 1;
}

.track-fill:active {
    cursor: grabbing;
}

.range-handle {
    position: absolute;
    top: 50%;
    width: 18px;
    height: 18px;
    background: var(--surface-200);
    border: 3px solid var(--primary-500);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    cursor: grab;
    z-index: 10;
}

.range-handle:hover {
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%) scale(1.1);
}

.range-handle:active {
    cursor: grabbing;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
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
    margin-top: 8px;
}

.pip {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--text-tertiary);
    white-space: nowrap;
}

/* Disable pointer events when adjustment is disabled */
.adjustment:has(input.enable:not(:checked)) .slider-wrapper,
.adjustment:has(input.enable:not(:checked)) .range-handle,
.adjustment:has(input.enable:not(:checked)) .track-fill {
    pointer-events: none;
    opacity: 0.5;
}
</style>
