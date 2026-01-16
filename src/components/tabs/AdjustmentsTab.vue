<template>
    <BaseTab tab-name="adjustments">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabAdjustments") }}</div>
            <WikiButton docUrl="adjustments" />

            <div class="overflow">
                <table class="adjustments">
                    <thead>
                        <tr>
                            <td class="column-enable">{{ $t("adjustmentsColumnEnable") }}</td>
                            <td>{{ $t("adjustmentsColumnWhenChannel") }}</td>
                            <td class="range">{{ $t("adjustmentsColumnIsInRange") }}</td>
                            <td>{{ $t("adjustmentsColumnThenApplyFunction") }}</td>
                            <td>{{ $t("adjustmentsColumnViaChannel") }}</td>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(adjustment, index) in adjustments"
                            :key="index"
                            :id="`adjustment-${index}`"
                            class="adjustment"
                            :data-label-enable="$t('adjustmentsColumnEnable')"
                            :data-label-channel="$t('adjustmentsColumnWhenChannel')"
                            :data-label-range="$t('adjustmentsColumnIsInRange')"
                            :data-label-function="$t('adjustmentsColumnThenApplyFunction')"
                            :data-label-via="$t('adjustmentsColumnViaChannel')"
                        >
                            <td class="info" :data-label="$t('adjustmentsColumnEnable')">
                                <div class="enabling">
                                    <input
                                        type="checkbox"
                                        v-model="adjustment.enabled"
                                        @change="onEnableChange(adjustment)"
                                        class="enable toggle"
                                    />
                                </div>
                            </td>
                            <td class="channelInfo" :data-label="$t('adjustmentsColumnWhenChannel')">
                                <div>
                                    <select
                                        v-model.number="adjustment.auxChannelIndex"
                                        class="channel"
                                        :disabled="!adjustment.enabled"
                                    >
                                        <option v-for="ch in auxChannelCount" :key="ch" :value="ch - 1">
                                            AUX {{ ch }}
                                        </option>
                                    </select>
                                </div>
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
                            </td>
                            <td class="range" :data-label="$t('adjustmentsColumnIsInRange')">
                                <div
                                    class="channel-slider"
                                    :ref="(el) => setSliderRef(el, index)"
                                    :data-index="index"
                                >
                                    <div
                                        class="marker"
                                        :style="markerStyle(adjustment.auxChannelIndex)"
                                    ></div>
                                </div>
                                <div class="pips-channel-range">
                                    <div
                                        v-for="pip in pipValues"
                                        :key="pip"
                                        class="pip"
                                        :style="pipStyle(pip)"
                                    >
                                        {{ pip }}
                                    </div>
                                </div>
                            </td>
                            <td class="functionSelection" :data-label="$t('adjustmentsColumnThenApplyFunction')">
                                <select
                                    v-model.number="adjustment.adjustmentFunction"
                                    class="function"
                                    :disabled="!adjustment.enabled"
                                >
                                    <option
                                        v-for="func in sortedFunctions"
                                        :key="func.value"
                                        :value="func.value"
                                    >
                                        {{ func.label }}
                                    </option>
                                </select>
                            </td>
                            <td class="functionSwitchChannel" :data-label="$t('adjustmentsColumnViaChannel')">
                                <select
                                    v-model.number="adjustment.auxSwitchChannelIndex"
                                    class="channel"
                                    :disabled="!adjustment.enabled"
                                >
                                    <option v-for="ch in auxChannelCount" :key="ch" :value="ch - 1">
                                        AUX {{ ch }}
                                    </option>
                                </select>
                            </td>
                        </tr>
                    </tbody>
                </table>
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
import FC from "../../js/fc";
import { i18n } from "../../js/localization";
import { gui_log } from "../../js/gui_log";
import $ from "jquery";
import "jquery-nouislider";
import wNumb from "wnumb";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const PIP_VALUES = [900, 1000, 1200, 1400, 1500, 1600, 1800, 2000, 2100];

export default defineComponent({
    name: "AdjustmentsTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const adjustments = reactive([]);
        const auxChannelCount = ref(0);
        const rcChannelData = reactive({});
        const sliderRefs = reactive({});

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

        const channelPercent = (value) => {
            const clamped = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, value));
            return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
        };

        const pipStyle = (value) => {
            return { left: `${channelPercent(value)}%` };
        };

        const markerStyle = (auxChannelIndex) => {
            const channelValue = rcChannelData[auxChannelIndex];
            if (channelValue === undefined) {
                return {};
            }
            return { left: `${channelPercent(channelValue)}%` };
        };

        const setSliderRef = (el, index) => {
            if (el) {
                sliderRefs[index] = el;
            }
        };

        const initializeSliders = async () => {
            await nextTick();

            adjustments.forEach((adjustment, index) => {
                const sliderElement = sliderRefs[index];
                if (!sliderElement || !$(sliderElement).length) {
                    return;
                }

                const $slider = $(sliderElement);

                // Destroy existing slider if it exists
                if ($slider.hasClass("noUi-target")) {
                    $slider[0].noUiSlider.destroy();
                }

                const rangeValues = [adjustment.range.start, adjustment.range.end];

                $slider.noUiSlider({
                    start: rangeValues,
                    behaviour: "snap-drag",
                    margin: 25,
                    step: 25,
                    connect: true,
                    range: {
                        min: [CHANNEL_MIN],
                        max: [CHANNEL_MAX],
                    },
                    format: wNumb({
                        decimals: 0,
                    }),
                });

                // Update adjustment when slider changes
                $slider[0].noUiSlider.on("update", (values) => {
                    adjustment.range.start = parseInt(values[0]);
                    adjustment.range.end = parseInt(values[1]);
                });

                // Disable slider if not enabled
                if (!adjustment.enabled) {
                    $slider.attr("disabled", "disabled");
                }
            });
        };

        const onEnableChange = (adjustment) => {
            const index = adjustments.indexOf(adjustment);
            const sliderElement = sliderRefs[index];

            if (!sliderElement) {
                return;
            }

            const $slider = $(sliderElement);

            if (adjustment.enabled) {
                $slider.removeAttr("disabled");
                // Set default range if both start and end are the same
                if (adjustment.range.start === adjustment.range.end) {
                    adjustment.range.start = 1300;
                    adjustment.range.end = 1700;
                    if ($slider[0].noUiSlider) {
                        $slider[0].noUiSlider.set([1300, 1700]);
                    }
                }
            } else {
                $slider.attr("disabled", "disabled");
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
            auxChannelCount.value = FC.RC.active_channels - 4;

            // Clear existing adjustments
            adjustments.splice(0, adjustments.length);

            // Populate adjustments from FC data
            FC.ADJUSTMENT_RANGES.forEach((range) => {
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
                        enabled: isEnabled,
                    }),
                );
            });
        };

        const updateRcData = () => {
            const auxCount = FC.RC.active_channels - 4;
            for (let auxChannelIndex = 0; auxChannelIndex < auxCount; auxChannelIndex++) {
                rcChannelData[auxChannelIndex] = FC.RC.channels[auxChannelIndex + 4];
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
            const requiredAdjustmentRangeCount = FC.ADJUSTMENT_RANGES.length;

            FC.ADJUSTMENT_RANGES = [];

            const defaultAdjustmentRange = {
                slotIndex: 0,
                auxChannelIndex: 0,
                range: {
                    start: 900,
                    end: 900,
                },
                adjustmentFunction: 0,
                auxSwitchChannelIndex: 0,
            };

            adjustments.forEach((adjustment) => {
                if (adjustment.enabled) {
                    FC.ADJUSTMENT_RANGES.push({
                        slotIndex: 0,
                        auxChannelIndex: adjustment.auxChannelIndex,
                        range: {
                            start: adjustment.range.start,
                            end: adjustment.range.end,
                        },
                        adjustmentFunction: adjustment.adjustmentFunction,
                        auxSwitchChannelIndex: adjustment.auxSwitchChannelIndex,
                    });
                } else {
                    FC.ADJUSTMENT_RANGES.push(defaultAdjustmentRange);
                }
            });

            // Fill remaining slots if needed
            for (let i = FC.ADJUSTMENT_RANGES.length; i < requiredAdjustmentRangeCount; i++) {
                FC.ADJUSTMENT_RANGES.push(defaultAdjustmentRange);
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
            await initializeSliders();
            startRcDataPolling();
            GUI.content_ready();
        });

        onUnmounted(() => {
            stopRcDataPolling();

            // Clean up all sliders
            Object.values(sliderRefs).forEach((sliderElement) => {
                if (sliderElement) {
                    const $slider = $(sliderElement);
                    if ($slider.hasClass("noUi-target")) {
                        try {
                            $slider[0].noUiSlider.destroy();
                        } catch (e) {
                            // Ignore errors during cleanup
                        }
                    }
                }
            });
        });

        return {
            adjustments,
            auxChannelCount,
            sortedFunctions,
            pipValues,
            pipStyle,
            markerStyle,
            setSliderRef,
            onEnableChange,
            saveAdjustments,
        };
    },
});
</script>

<style scoped>
/* Inherit styles from existing adjustments.html via global CSS */
</style>
