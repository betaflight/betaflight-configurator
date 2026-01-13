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
                                        <div class="rangeLogic" v-show="entryIndex > 0">
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
                                        <div class="slider-wrapper" @mousedown="(e) => handleSliderClick(e, entry)">
                                            <div class="track-background"></div>
                                            <div
                                                class="track-fill"
                                                :style="rangeFillStyle(entry)"
                                                @mousedown.stop="(e) => startDrag(e, entry, 'range')"
                                            ></div>
                                            <div
                                                class="range-handle handle-min"
                                                :style="{ left: channelPercent(entry.range.start) + '%' }"
                                                @mousedown.stop="(e) => startDrag(e, entry, 'start')"
                                            ></div>
                                            <div
                                                class="range-handle handle-max"
                                                :style="{ left: channelPercent(entry.range.end) + '%' }"
                                                @mousedown.stop="(e) => startDrag(e, entry, 'end')"
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
                                        <div class="linkLogic" v-show="entryIndex > 0">
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
                <a class="save" href="#" @click.prevent="saveModes">{{ $t("auxiliaryButtonSave") }}</a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useConnectionStore } from "@/stores/connection";
import { useNavigationStore } from "@/stores/navigation";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
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
        const connectionStore = useConnectionStore();
        const navigationStore = useNavigationStore();

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
            if (typeof window !== "undefined" && window.innerWidth < 575) {
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
            if (value === undefined || value === null || Number.isNaN(value)) return 1500;
            if (value < CHANNEL_MIN) return CHANNEL_MIN;
            if (value > CHANNEL_MAX) return CHANNEL_MAX;
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
            if (percent === undefined) return null;
            return { left: `${percent}%` };
        };

        const markerLineStyle = (auxChannelIndex) => {
            const percent = rcMarkers[auxChannelIndex];
            if (percent === undefined) return null;
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
            if (armingDisableCount <= 0) return false;
            const armSwitchMask = 1 << (armingDisableCount - 1);
            return (armingDisableFlags & armSwitchMask) > 0;
        };

        const modeState = (mode) => {
            if (!mode.entries.length) return "";
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

        const startDrag = (e, entry, type) => {
            e.preventDefault();
            const slider = e.target.closest(".slider-wrapper");
            const rect = slider.getBoundingClientRect();
            const startX = e.clientX;
            const initialStart = entry.range.start;
            const initialEnd = entry.range.end;
            dragState = { entry, type, slider, startX, initialStart, initialEnd };
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", stopDrag);
        };

        const onDragMove = (e) => {
            if (!dragState) return;

            const rect = dragState.slider.getBoundingClientRect();

            if (dragState.type === "range") {
                // Dragging the entire range - move both handles together
                const deltaX = e.clientX - dragState.startX;
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
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
            dragState = null;
        };

        const handleSliderClick = (e, entry) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
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
                const helpKey = `auxiliaryHelpMode_${inflection.camelize(rawName.replace(/\s+/g, ""))}`;
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
                if (!target) continue;
                const modeLogic = extra?.modeLogic ?? 0;
                const linkedTo = extra?.linkedTo ?? 0;

                if (range.id === 0 || linkedTo === 0) {
                    if (range.range.start >= range.range.end) continue;
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
            const largest = diffs.reduce((x, y) => (x > y ? x : y), 0);
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
                        if (start >= end) return;
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
                        if (!entry.linkedTo) return;
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

        const localIntervals = [];
        const addLocalInterval = (name, code, period, first = false) => {
            GUI.interval_add(name, code, period, first);
            localIntervals.push(name);
        };

        onMounted(() => {
            const stored = getConfig("hideUnusedModes") || {};
            hideUnused.value = !!stored.hideUnusedModes;

            loadData();
            addLocalInterval("aux_data_pull", () => MSP.send_message(MSPCodes.MSP_RC, false, false, updateMarkers), 50);
            addLocalInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);
        });

        onUnmounted(() => {
            // Clean up drag event listeners if drag is in progress
            if (dragState) {
                document.removeEventListener("mousemove", onDragMove);
                document.removeEventListener("mouseup", stopDrag);
                dragState = null;
            }

            // Clean up polling intervals
            localIntervals.forEach((name) => GUI.interval_remove(name));
            localIntervals.length = 0;
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
            markerLineStyle,
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

<style scoped>
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
</style>
