<template>
    <BaseTab tab-name="auxiliary">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabAuxiliary") }}</div>
            <WikiButton docUrl="modes" />

            <div class="note">
                <p v-html="$t('auxiliaryHelp')"></p>
            </div>

            <div class="toolbox">
                <form>
                    <input
                        id="switch-toggle-unused"
                        v-model="hideUnused"
                        type="checkbox"
                        name="switch-toggle-unused"
                        class="toggle"
                    />
                    <label for="switch-toggle-unused">{{ $t("auxiliaryToggleUnused") }}</label>
                </form>
            </div>

            <div class="modes">
                <div v-for="mode in visibleModes" :key="mode.id" :class="['mode', modeState(mode)]">
                    <div class="info" :style="infoMinWidthStyle">
                        <div class="helpicon cf_tip" :title="$t(mode.helpKey)"></div>
                        <p class="name">
                            <span>{{ mode.displayName }}</span>
                            <template v-if="modeState(mode) === 'disabled'">
                                <br />
                                <span>{{ $t("auxiliaryDisabled") }}</span>
                            </template>
                        </p>
                        <div class="buttons">
                            <a v-if="mode.id !== 0" class="addLink sm-min" href="#" @click.prevent="addLink(mode)">
                                {{ $t("auxiliaryAddLink") }}
                            </a>
                            <a class="addRange sm-min" href="#" @click.prevent="addRange(mode)">
                                {{ $t("auxiliaryAddRange") }}
                            </a>
                            <a v-if="mode.id !== 0" class="addLink xs" href="#" @click.prevent="addLink(mode)">
                                <em class="fas fa-link"></em>
                            </a>
                            <a class="addRange xs" href="#" @click.prevent="addRange(mode)">
                                <em class="fas fa-plus"></em>
                            </a>
                        </div>
                    </div>

                    <div class="ranges">
                        <template v-if="mode.entries.length">
                            <template v-for="(entry, entryIndex) in mode.entries" :key="entry.uid">
                                <div v-if="entry.kind === 'range'" class="range">
                                    <div class="channelInfo">
                                        <div class="channelName">
                                            <select v-model.number="entry.auxChannelIndex" class="channel">
                                                <option
                                                    v-for="opt in channelOptions"
                                                    :key="opt.value"
                                                    :value="opt.value"
                                                >
                                                    {{ opt.label }}
                                                </option>
                                            </select>
                                        </div>
                                        <div class="rangeLogic" v-show="mode.entries.length > 1">
                                            <select v-model.number="entry.modeLogic" class="logic">
                                                <option
                                                    v-for="logic in logicOptions"
                                                    :key="logic.value"
                                                    :value="logic.value"
                                                >
                                                    {{ logic.label }}
                                                </option>
                                            </select>
                                        </div>
                                        <div class="limits">
                                            <p class="lowerLimit">
                                                <span>{{ $t("auxiliaryMin") }}</span
                                                >:
                                                <span class="lowerLimitValue">{{ entry.range.start }}</span>
                                            </p>
                                            <p class="upperLimit">
                                                <span>{{ $t("auxiliaryMax") }}</span
                                                >:
                                                <span class="upperLimitValue">{{ entry.range.end }}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div class="channel-slider">
                                        <div
                                            class="slider-wrapper"
                                            @mousedown="(e) => handleSliderClick(e, entry)"
                                            @touchstart="(e) => handleSliderClick(e, entry)"
                                        >
                                            <div class="track-background"></div>
                                            <div
                                                class="track-fill"
                                                :style="rangeFillStyle(entry)"
                                                @mousedown.stop="(e) => startDrag(e, entry, 'range')"
                                                @touchstart.stop="(e) => startDrag(e, entry, 'range')"
                                            ></div>
                                            <div
                                                class="range-handle handle-min"
                                                :style="{ left: channelPercent(entry.range.start) + '%' }"
                                                @mousedown.stop="(e) => startDrag(e, entry, 'start')"
                                                @touchstart.stop="(e) => startDrag(e, entry, 'start')"
                                            ></div>
                                            <div
                                                class="range-handle handle-max"
                                                :style="{ left: channelPercent(entry.range.end) + '%' }"
                                                @mousedown.stop="(e) => startDrag(e, entry, 'end')"
                                                @touchstart.stop="(e) => startDrag(e, entry, 'end')"
                                            ></div>
                                        </div>
                                        <div class="pips-channel-range">
                                            <div
                                                v-for="pip in sliderPipValues"
                                                :key="pip"
                                                class="pip"
                                                :style="pipStyle(pip)"
                                            >
                                                {{ pip }}
                                            </div>
                                            <div
                                                v-if="markerStyle(entry.auxChannelIndex)"
                                                class="pip-marker"
                                                :style="markerStyle(entry.auxChannelIndex)"
                                            ></div>
                                        </div>
                                    </div>

                                    <div class="delete">
                                        <a
                                            class="deleteRange invertable"
                                            href="#"
                                            @click.prevent="removeEntry(mode, entry.uid)"
                                        >
                                            &nbsp;
                                        </a>
                                    </div>
                                </div>

                                <div v-else class="link">
                                    <div class="modeInfo">
                                        <div class="modeLink">
                                            <select v-model.number="entry.linkedTo" class="linkedTo">
                                                <option
                                                    v-for="opt in linkOptions"
                                                    :key="opt.value"
                                                    :value="opt.value"
                                                    :disabled="opt.value === mode.id"
                                                >
                                                    {{ opt.label }}
                                                </option>
                                            </select>
                                        </div>
                                        <div class="linkLogic" v-show="mode.entries.length > 1">
                                            <select v-model.number="entry.modeLogic" class="logic">
                                                <option
                                                    v-for="logic in logicOptions"
                                                    :key="logic.value"
                                                    :value="logic.value"
                                                >
                                                    {{ logic.label }}
                                                </option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="delete">
                                        <a class="deleteLink" href="#" @click.prevent="removeEntry(mode, entry.uid)"
                                            >&nbsp;</a
                                        >
                                    </div>
                                </div>
                            </template>
                        </template>
                    </div>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn save_btn">
                <button type="button" class="save" @click="saveModes">{{ $t("auxiliaryButtonSave") }}</button>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
import { useInterval } from "../../composables/useInterval";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { bit_check } from "../../js/bit";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import adjustBoxNameIfPeripheralWithModeID from "../../js/peripherals";
import { i18n } from "../../js/localization";
import { getTextWidth } from "../../js/utils/common";
import inflection from "inflection";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const CHANNEL_STEP = 25;
const MIN_RANGE_GAP = 25;
const DEFAULT_RANGE = { start: 1300, end: 1700 };

export default defineComponent({
    name: "AuxiliaryTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        // Initialize Pinia stores
        const fcStore = useFlightControllerStore();

        // Reactive State
        const modes = reactive([]);
        const hideUnused = ref(false);
        const auxChannelCount = ref(0);
        const requiredModeRangeCount = ref(0);
        const infoMinWidth = ref(0);
        const rcMarkers = reactive({});
        let prevChannelsValues = null;
        let entryUid = 0;

        const logicOptions = computed(() => [
            { value: 0, label: i18n.getMessage("auxiliaryModeLogicOR") },
            { value: 1, label: i18n.getMessage("auxiliaryModeLogicAND") },
        ]);

        const sliderPipValues = computed(() => {
            if (globalThis.window !== undefined && globalThis.window.innerWidth < 575) {
                return [1000, 1200, 1400, 1600, 1800, 2000];
            }
            return [900, 1000, 1200, 1400, 1500, 1600, 1800, 2000, 2100];
        });

        const channelOptions = computed(() => {
            const options = [{ value: -1, label: i18n.getMessage("auxiliaryAutoChannelSelect") }];
            for (let channelIndex = 0; channelIndex < auxChannelCount.value; channelIndex++) {
                options.push({ value: channelIndex, label: `AUX ${channelIndex + 1}` });
            }
            return options;
        });

        const linkOptions = computed(() => {
            const opts = [{ value: 0, label: "" }];
            for (let index = 1; index < fcStore.auxConfig.length; index++) {
                opts.push({ value: fcStore.auxConfigIds[index], label: fcStore.auxConfig[index] });
            }
            return opts.sort((a, b) => a.label.localeCompare(b.label));
        });

        const anyUsedMode = computed(() => modes.some((mode) => mode.entries.length));

        const visibleModes = computed(() => {
            if (hideUnused.value && anyUsedMode.value) {
                return modes.filter((mode) => mode.entries.length);
            }
            return modes;
        });

        const infoMinWidthStyle = computed(() => {
            return infoMinWidth.value ? { minWidth: `${infoMinWidth.value}px` } : {};
        });

        const clampChannel = (value) => {
            if (value === undefined || value === null || Number.isNaN(value)) {
                return 1500;
            }
            if (value < CHANNEL_MIN) {
                return CHANNEL_MIN;
            }
            if (value > CHANNEL_MAX) {
                return CHANNEL_MAX;
            }
            return value;
        };

        const channelPercent = (value) => {
            const clamped = clampChannel(value);
            return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
        };

        const updateInfoWidth = () => {
            const longestName = modes.reduce((max, mode) => Math.max(max, mode.displayName.length), 0);
            infoMinWidth.value = Math.round(longestName * getTextWidth("A"));
        };

        const markerStyle = (auxChannelIndex) => {
            const percent = rcMarkers[auxChannelIndex];
            if (percent === undefined) {
                return null;
            }
            return { left: `${percent}%` };
        };

        const rangeFillStyle = (entry) => {
            const start = channelPercent(entry.range.start);
            const end = channelPercent(entry.range.end);
            return {
                left: `${start}%`,
                width: `${Math.max(end - start, 0)}%`,
            };
        };

        const pipStyle = (value) => {
            return { left: `${channelPercent(value)}%` };
        };

        const addRange = (mode, auxChannelIndex = -1, modeLogic = 0, range = DEFAULT_RANGE) => {
            mode.entries.push({
                uid: ++entryUid,
                kind: "range",
                auxChannelIndex,
                modeLogic,
                range: { start: range.start, end: range.end },
            });
        };

        const addLink = (mode, modeLogic = 0, linkedTo = 0) => {
            mode.entries.push({
                uid: ++entryUid,
                kind: "link",
                modeLogic,
                linkedTo,
            });
        };

        const removeEntry = (mode, uid) => {
            const index = mode.entries.findIndex((entry) => entry.uid === uid);
            if (index >= 0) {
                mode.entries.splice(index, 1);
            }
        };

        const isArmSwitchDisabled = () => {
            const { armingDisableCount = 0, armingDisableFlags = 0 } = fcStore.config || {};
            if (armingDisableCount <= 0) {
                return false;
            }
            const armSwitchMask = 1 << (armingDisableCount - 1);
            return (armingDisableFlags & armSwitchMask) > 0;
        };

        const modeState = (mode) => {
            if (!mode.entries.length) {
                return "";
            }
            if (bit_check(fcStore.config.mode, mode.index)) {
                return "on";
            }
            if (mode.index === 0) {
                return isArmSwitchDisabled() ? "disabled" : "off";
            }
            return "off";
        };

        const ensureRangeOrder = (entry) => {
            if (entry.range.start > entry.range.end - MIN_RANGE_GAP) {
                entry.range.start = Math.max(CHANNEL_MIN, entry.range.end - MIN_RANGE_GAP);
            }
            if (entry.range.end < entry.range.start + MIN_RANGE_GAP) {
                entry.range.end = Math.min(CHANNEL_MAX, entry.range.start + MIN_RANGE_GAP);
            }
        };

        const onRangeStartChange = (entry) => {
            entry.range.start = clampChannel(entry.range.start);
            entry.range.end = clampChannel(entry.range.end);
            if (entry.range.start > entry.range.end - MIN_RANGE_GAP) {
                entry.range.end = Math.min(CHANNEL_MAX, entry.range.start + MIN_RANGE_GAP);
            }
            ensureRangeOrder(entry);
        };

        const onRangeEndChange = (entry) => {
            entry.range.start = clampChannel(entry.range.start);
            entry.range.end = clampChannel(entry.range.end);
            if (entry.range.end < entry.range.start + MIN_RANGE_GAP) {
                entry.range.start = Math.max(CHANNEL_MIN, entry.range.end - MIN_RANGE_GAP);
            }
            ensureRangeOrder(entry);
        };

        let dragState = null;

        const getEventX = (e) => {
            return e.touches ? e.touches[0].clientX : e.clientX;
        };

        const startDrag = (e, entry, type) => {
            e.preventDefault();
            const slider = e.target.closest(".slider-wrapper");
            const startX = getEventX(e);
            const initialStart = entry.range.start;
            const initialEnd = entry.range.end;
            dragState = { entry, type, slider, startX, initialStart, initialEnd };
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", stopDrag);
            document.addEventListener("touchmove", onDragMove);
            document.addEventListener("touchend", stopDrag);
        };

        const onDragMove = (e) => {
            if (!dragState) {
                return;
            }

            const rect = dragState.slider.getBoundingClientRect();

            if (dragState.type === "range") {
                // Dragging the entire range - move both handles together
                const deltaX = getEventX(e) - dragState.startX;
                const deltaPercent = deltaX / rect.width;
                const deltaValue =
                    Math.round((deltaPercent * (CHANNEL_MAX - CHANNEL_MIN)) / CHANNEL_STEP) * CHANNEL_STEP;

                const newStart = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, dragState.initialStart + deltaValue));
                const newEnd = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, dragState.initialEnd + deltaValue));

                // Keep range width constant
                const rangeWidth = dragState.initialEnd - dragState.initialStart;
                if (newStart >= CHANNEL_MIN && newEnd <= CHANNEL_MAX) {
                    dragState.entry.range.start = newStart;
                    dragState.entry.range.end = newEnd;
                } else if (newStart < CHANNEL_MIN) {
                    dragState.entry.range.start = CHANNEL_MIN;
                    dragState.entry.range.end = CHANNEL_MIN + rangeWidth;
                } else if (newEnd > CHANNEL_MAX) {
                    dragState.entry.range.end = CHANNEL_MAX;
                    dragState.entry.range.start = CHANNEL_MAX - rangeWidth;
                }
            } else {
                // Dragging individual handle
                const percent = Math.max(0, Math.min(1, (getEventX(e) - rect.left) / rect.width));
                const rawValue = CHANNEL_MIN + percent * (CHANNEL_MAX - CHANNEL_MIN);
                const value = Math.round(rawValue / CHANNEL_STEP) * CHANNEL_STEP;

                if (dragState.type === "start") {
                    dragState.entry.range.start = value;
                    onRangeStartChange(dragState.entry);
                } else {
                    dragState.entry.range.end = value;
                    onRangeEndChange(dragState.entry);
                }
            }
        };

        const stopDrag = () => {
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", stopDrag);
            document.removeEventListener("touchmove", onDragMove);
            document.removeEventListener("touchend", stopDrag);
            dragState = null;
        };

        const handleSliderClick = (e, entry) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (getEventX(e) - rect.left) / rect.width;
            const rawValue = CHANNEL_MIN + percent * (CHANNEL_MAX - CHANNEL_MIN);
            const value = Math.round(rawValue / CHANNEL_STEP) * CHANNEL_STEP;

            const distToStart = Math.abs(value - entry.range.start);
            const distToEnd = Math.abs(value - entry.range.end);

            if (distToStart < distToEnd) {
                entry.range.start = value;
                onRangeStartChange(entry);
            } else {
                entry.range.end = value;
                onRangeEndChange(entry);
            }
        };

        const buildModesFromFC = () => {
            modes.length = 0;
            entryUid = 0;

            const modeMap = new Map();
            for (let index = 0; index < fcStore.auxConfig.length; index++) {
                const modeId = fcStore.auxConfigIds[index];
                const rawName = fcStore.auxConfig[index];
                const adjustedName = adjustBoxNameIfPeripheralWithModeID(modeId, rawName);
                const helpKey = `auxiliaryHelpMode_${inflection.camelize(rawName.replaceAll(/\s+/g, ""))}`;
                modeMap.set(modeId, {
                    id: modeId,
                    index,
                    name: rawName,
                    displayName: adjustedName,
                    helpKey,
                    entries: [],
                });
            }

            const pairedRanges = fcStore.modeRanges.map((range, idx) => ({
                range,
                extra: fcStore.modeRangesExtra[idx],
            }));

            for (const { range, extra } of pairedRanges) {
                const target = modeMap.get(range.id);
                if (!target) {
                    continue;
                }
                const modeLogic = extra?.modeLogic ?? 0;
                const linkedTo = extra?.linkedTo ?? 0;

                if (range.id === 0 || linkedTo === 0) {
                    if (range.range.start >= range.range.end) {
                        continue;
                    }
                    addRange(target, range.auxChannelIndex, modeLogic, range.range);
                } else {
                    addLink(target, modeLogic, linkedTo);
                }
            }

            fcStore.auxConfigIds.forEach((modeId) => {
                const mode = modeMap.get(modeId);
                if (mode) {
                    modes.push(mode);
                }
            });

            updateInfoWidth();
        };

        const autoSelectChannel = (rcChannels, activeChannels, rssiChannel) => {
            const autoRanges = [];
            modes.forEach((mode) => {
                mode.entries.forEach((entry) => {
                    if (entry.kind === "range" && entry.auxChannelIndex === -1) {
                        autoRanges.push(entry);
                    }
                });
            });

            if (!autoRanges.length) {
                prevChannelsValues = null;
                return;
            }

            const fillPrev = () => {
                prevChannelsValues = rcChannels.slice(0);
            };

            if (!prevChannelsValues || !rcChannels.length) {
                return fillPrev();
            }

            const diffs = rcChannels
                .map((value, idx) => Math.abs(prevChannelsValues[idx] - value))
                .slice(0, activeChannels);
            const largest = diffs.reduce((x, y) => Math.max(x, y), 0);
            if (largest < 100) {
                return fillPrev();
            }

            const indexOfMaxValue = diffs.indexOf(largest);
            const rssiIndex = rssiChannel ? rssiChannel - 1 : -1;
            if (indexOfMaxValue >= 4 && indexOfMaxValue !== rssiIndex) {
                const auxIndex = indexOfMaxValue - 4;
                autoRanges.forEach((entry) => {
                    entry.auxChannelIndex = auxIndex;
                });
            }

            fillPrev();
        };

        const updateMarkers = () => {
            const rc = fcStore.rc || {};
            const channels = rc.channels || [];
            const activeChannels = rc.active_channels || 0;
            auxChannelCount.value = Math.max(0, activeChannels - 4);

            Object.keys(rcMarkers).forEach((key) => delete rcMarkers[key]);
            for (let idx = 0; idx < auxChannelCount.value; idx++) {
                rcMarkers[idx] = channelPercent(channels[idx + 4]);
            }

            autoSelectChannel(channels, activeChannels, fcStore.rssiConfig?.channel || 0);
        };

        const saveModes = () => {
            const nextModeRanges = [];
            const nextModeRangesExtra = [];

            modes.forEach((mode) => {
                mode.entries.forEach((entry) => {
                    if (entry.kind === "range") {
                        const start = clampChannel(entry.range.start);
                        const end = clampChannel(entry.range.end);
                        if (start >= end) {
                            return;
                        }
                        nextModeRanges.push({
                            id: mode.id,
                            auxChannelIndex: entry.auxChannelIndex,
                            range: { start, end },
                        });
                        nextModeRangesExtra.push({
                            id: mode.id,
                            modeLogic: entry.modeLogic,
                            linkedTo: 0,
                        });
                    } else if (entry.kind === "link") {
                        if (!entry.linkedTo) {
                            return;
                        }
                        nextModeRanges.push({
                            id: mode.id,
                            auxChannelIndex: 0,
                            range: { start: CHANNEL_MIN, end: CHANNEL_MIN },
                        });
                        nextModeRangesExtra.push({
                            id: mode.id,
                            modeLogic: entry.modeLogic,
                            linkedTo: entry.linkedTo,
                        });
                    }
                });
            });

            const required = requiredModeRangeCount.value || 0;
            while (nextModeRanges.length < required) {
                nextModeRanges.push({ id: 0, auxChannelIndex: 0, range: { start: CHANNEL_MIN, end: CHANNEL_MIN } });
                nextModeRangesExtra.push({ id: 0, modeLogic: 0, linkedTo: 0 });
            }

            fcStore.modeRanges = nextModeRanges;
            fcStore.modeRangesExtra = nextModeRangesExtra;

            mspHelper.sendModeRanges(() => {
                mspHelper.writeConfiguration(false);
            });
        };

        const loadData = async () => {
            try {
                await MSP.promise(MSPCodes.MSP_BOXNAMES);
                await MSP.promise(MSPCodes.MSP_MODE_RANGES);
                await MSP.promise(MSPCodes.MSP_MODE_RANGES_EXTRA);
                await MSP.promise(MSPCodes.MSP_BOXIDS);
                await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
                await MSP.promise(MSPCodes.MSP_RC);
                await new Promise((resolve) => mspHelper.loadSerialConfig(resolve));

                requiredModeRangeCount.value = fcStore.modeRanges.length;
                auxChannelCount.value = Math.max(0, (fcStore.rc?.active_channels || 0) - 4);
                buildModesFromFC();
                updateMarkers();
            } catch (error) {
                console.error("Failed to load auxiliary data", error);
            } finally {
                GUI.content_ready();
            }
        };

        const { addInterval } = useInterval();

        onMounted(() => {
            const stored = getConfig("hideUnusedModes") || {};
            hideUnused.value = !!stored.hideUnusedModes;

            loadData();
            addInterval("aux_data_pull", () => MSP.send_message(MSPCodes.MSP_RC, false, false, updateMarkers), 50);
            addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);
        });

        onUnmounted(() => {
            // Clean up drag event listeners if drag is in progress
            if (dragState) {
                document.removeEventListener("mousemove", onDragMove);
                document.removeEventListener("mouseup", stopDrag);
                dragState = null;
            }
            // Interval cleanup handled automatically by useInterval on unmount
        });

        watch(hideUnused, (value) => setConfig({ hideUnusedModes: value }));

        return {
            modes,
            hideUnused,
            visibleModes,
            logicOptions,
            channelOptions,
            linkOptions,
            infoMinWidthStyle,
            sliderPipValues,
            CHANNEL_MIN,
            CHANNEL_MAX,
            CHANNEL_STEP,
            addRange,
            addLink,
            removeEntry,
            modeState,
            markerStyle,
            rangeFillStyle,
            onRangeStartChange,
            onRangeEndChange,
            pipStyle,
            saveModes,
            startDrag,
            handleSliderClick,
            channelPercent,
        };
    },
});
</script>

<style lang="less">
.tab-auxiliary {
    /* Slider UI component styles */
    .slider-wrapper {
        position: relative;
        height: 40px;
        margin: 10px 0;
    }

    .track-background {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        left: 0;
        right: 0;
        height: 8px;
        background: var(--surface-700);
        border-radius: 4px;
        z-index: 0;
        pointer-events: none;
    }

    .track-fill {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 8px;
        background: var(--primary-500);
        border-radius: 4px;
        z-index: 1;
        cursor: grab;
    }

    .track-fill:active {
        cursor: grabbing;
    }

    .slider-input {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: transparent;
        pointer-events: auto;
        touch-action: none;
        -webkit-appearance: none;
        appearance: none;
        z-index: 3;
    }

    .slider-input-min {
        z-index: 4;
    }

    .slider-input-max {
        z-index: 3;
    }

    .slider-input::-webkit-slider-thumb {
        pointer-events: auto;
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--surface-200);
        border: 3px solid var(--primary-500);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        cursor: grab;
    }

    .slider-input::-webkit-slider-thumb:active {
        cursor: grabbing;
    }

    .slider-input::-moz-range-thumb {
        pointer-events: auto;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--surface-200);
        border: 3px solid var(--primary-500);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        cursor: grab;
    }

    .slider-input::-moz-range-thumb:active {
        cursor: grabbing;
    }

    .slider-input::-webkit-slider-runnable-track {
        background: transparent;
        border: none;
    }

    .slider-input::-moz-range-track {
        background: transparent;
        border: none;
    }

    .slider-inputs {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 8px;
    }

    .range-value {
        width: 80px;
        padding: 4px 8px;
        background: var(--surface-700);
        border: 1px solid var(--surface-600);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 12px;
    }

    .range-handle {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--surface-200);
        border: 3px solid var(--primary-500);
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

    .pips-channel-range {
        position: relative;
        height: 24px;
        margin-top: 8px;
    }

    .pip {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .pip::before {
        content: "";
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 8px;
        background: var(--surface-600);
    }

    .pip-marker {
        position: absolute;
        bottom: 12px;
        transform: translateX(-50%);
        width: 3px;
        height: 8px;
        background: var(--primary-500);
        box-shadow: 0 0 6px rgba(255, 187, 0, 0.9);
        pointer-events: none;
        z-index: 10;
    }

    /* Tab layout and mode styles */
    min-height: 100%;
    .help {
        padding: 10px;
        background-color: #ffcb18;
        margin-bottom: 10px;
    }
    .toolbox {
        font-weight: bold;
        padding: 1rem 0;
        form {
            display: flex;
            gap: 0.5rem;
        }
    }
    .range {
        .marker {
            background: var(--primary-500);
            border-radius: 3px;
            position: absolute;
            left: 50%;
            top: 2rem;
            height: 1rem;
            width: 6px;
            margin-left: -3px;
            z-index: 1000;
        }
        position: relative;
        padding-top: 1rem;
        padding-left: 0;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--surface-500);
        &:first-child {
            border-top: 0;
        }
        &:last-child {
            border-bottom: 0;
        }
        > .buttons {
            position: absolute;
            top: 0;
            right: 0;
            a {
                padding: 2px;
            }
        }
        .channel {
            border: 1px solid var(--surface-500);
            border-radius: 3px;
            margin-bottom: 3px;
        }
        .channel-slider {
            width: 100%;
            margin-right: 1.5rem;
        }
    }
    .mode.on {
        .info {
            background: var(--primary-500);
            color: black;
        }
        &:nth-child(odd) {
            .info {
                background: var(--primary-500);
            }
        }
        .buttons {
            a {
                background-color: var(--primary-300);
                color: black;
                &:hover {
                    background-color: var(--primary-200);
                    color: black;
                }
            }
        }
    }
    .mode.off {
        .info {
            background: var(--surface-300);
            color: var(--surface-950);
        }
        &:nth-child(odd) {
            .info {
                background: var(--surface-300);
            }
        }
        .buttons {
            a {
                background-color: var(--surface-400);
                color: var(--surface-950);
                &:hover {
                    background-color: var(--surface-500);
                    color: var(--surface-950);
                }
            }
        }
    }
    .mode.disabled {
        .info {
            background: var(--error-transparent-4);
            color: var(--text);
            .buttons {
                a {
                    background-color: var(--error-500);
                    &:hover {
                        background-color: var(--error-400);
                    }
                }
            }
        }
    }
    .modes {
        width: 100%;
    }
    .mode {
        background-color: var(--surface-200);
        vertical-align: top;
        display: flex;
        margin-bottom: 0.5rem;
        border-radius: 0.5rem;
        overflow: hidden;
        min-height: 6.5rem;
        .name {
            padding: 0.5rem;
        }
        .info {
            text-align: center;
            width: fit-content;
            white-space: nowrap;
            position: relative;
            background-color: var(--surface-300);
            padding: 0.5rem;
            .name {
                font-weight: bold;
                font-size: 1em;
            }
            .buttons {
                a {
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    margin: 3px;
                    display: block;
                }
            }
        }
        .range {
            display: flex;
            .channelInfo {
                padding: 0 1.5rem;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
        }
    }
    .ranges {
        width: 100%;
    }
    .link {
        padding-top: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--surface-500);
        background-color: var(--surface-200);
        display: flex;
        gap: 0.5rem;
        &:first-child {
            border-top: 0;
        }
        &:last-child {
            border-bottom: 0;
        }
        .delete {
            a {
                margin-top: 0.35rem;
            }
        }
        .modeInfo {
            padding: 0 1.5rem;
        }
        .linkLogic {
            margin-top: 0.25rem;
        }
    }
    .logic {
        border: 1px solid var(--surface-700);
        border-radius: 3px;
    }
    .buttons {
        a {
            text-align: center;
            font-weight: bold;
            background-color: var(--surface-400);
            color: var(--text);
            transition: all ease 0.3s;
            &:hover {
                background-color: var(--surface-500);
                opacity: 1;
                transition: all ease 0.3s;
            }
        }
    }
    .delete {
        a {
            height: 15px;
            width: 15px;
            transition: all ease 0.3s;
            opacity: 0.3;
            position: relative;
            margin-right: 5px;
            margin-top: -9px;
            background-image: url("../../images/icons/close1.svg");
            background-repeat: no-repeat;
            background-position: center 100%;
            display: block;
            &:hover {
                transition: all ease 0.3s;
                opacity: 0.6;
            }
        }
    }
}
#tab-auxiliary-templates {
    display: none;
}
@media all and (max-width: 575px) {
    .tab-auxiliary {
        .mode {
            flex-wrap: wrap;
            height: fit-content;
            .info {
                width: 100%;
                border-bottom: 0;
                display: flex;
                flex-direction: row-reverse;
                justify-content: space-between;
                align-items: center;
                .name {
                    text-align: left;
                    min-height: auto;
                    margin-right: auto;
                }
                .buttons {
                    right: 0;
                    width: auto;
                    display: flex;
                }
                .helpicon {
                    margin-top: 0;
                }
            }
            // offset "add" button for ARM mode since the "link" button is hidden
            // keeps the layout consistent with other modes
            &:first-of-type {
                .buttons {
                    margin-left: 2.5rem;
                }
            }
            .ranges {
                width: 100%;
                max-width: 100%;
            }
            .range {
                .channelInfo {
                    display: flex;
                    margin: 0 10px;
                    width: 100%;
                    flex-wrap: wrap;
                }
            }
        }
        .range {
            display: flex;
            height: auto;
            flex-wrap: wrap;
            .channel-slider {
                width: 100%;
                margin: 0.5rem 1rem 3.5rem 1rem;
            }
        }
        .limits {
            width: 100%;
            justify-content: space-between;
            display: flex;
        }
        .delete {
            a {
                margin-top: 15px;
                margin-right: 10px;
                position: absolute;
                top: 0;
                right: 0;
            }
        }
        .link {
            height: auto;
            display: flex;
            padding-bottom: 10px;
        }
    }
}
</style>
