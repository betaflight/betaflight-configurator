<template>
    <BaseTab tab-name="auxiliary">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabAuxiliary") }}</div>
            <WikiButton docUrl="modes" />

            <div class="flex flex-col gap-4">
                <UiBox highlight>
                    <p v-html="$t('auxiliaryHelp')"></p>
                </UiBox>
                <SettingRow :label="$t('auxiliaryToggleUnused')">
                    <USwitch v-model="hideUnused" />
                </SettingRow>

                <div class="flex flex-col gap-2">
                    <div
                        v-for="{ mode, state, stateUi, buttonSolid } in visibleModesWithState"
                        :key="mode.id"
                        class="flex flex-col md:flex-row md:min-h-24 bg-muted rounded-md group"
                    >
                        <div
                            class="flex flex-row md:flex-col bg-elevated min-h-full p-3 rounded-md md:rounded-r-none items-center relative gap-2"
                            :class="stateUi.solid"
                        >
                            <HelpIcon class="absolute top-2.5 right-2.5" :text="$t(mode.helpKey)" />

                            <!-- Negative margin for mobile where the minWidthStyle is computed a little too wide -->
                            <div
                                class="text-xs font-bold md:w-full pr-4 md:text-center -mr-10 md:mr-0"
                                :style="infoMinWidthStyle"
                            >
                                {{ mode.displayName }}
                            </div>
                            <div class="text-xs font-bold" v-if="state === 'disabled'">
                                {{ $t("auxiliaryDisabled") }}
                            </div>

                            <div class="flex flex-row md:flex-col gap-2 md:gap-1 w-full mt-auto">
                                <UButton
                                    icon="i-lucide-link"
                                    size="xs"
                                    class="md:w-full w-fit"
                                    v-if="mode.id !== 0"
                                    @click="addLink(mode)"
                                    :color="stateUi.color"
                                    :variant="buttonSolid ? 'solid' : 'soft'"
                                    :ui="{
                                        base: buttonSolid ? '' : 'bg-accented',
                                    }"
                                >
                                    {{ $t("auxiliaryAddLink") }}
                                </UButton>
                                <UButton
                                    icon="i-lucide-plus"
                                    size="xs"
                                    class="md:w-full w-fit"
                                    @click="addRange(mode)"
                                    :color="stateUi.color"
                                    :variant="buttonSolid ? 'solid' : 'soft'"
                                    :ui="{
                                        base: buttonSolid ? '' : 'bg-accented',
                                    }"
                                >
                                    {{ $t("auxiliaryAddRange") }}
                                </UButton>
                            </div>
                        </div>
                        <div class="w-full">
                            <template v-if="mode.entries.length">
                                <template v-for="(entry, entryIndex) in mode.entries" :key="entry.uid">
                                    <div
                                        v-if="entry.kind === 'range'"
                                        class="flex flex-col md:flex-row w-full relative"
                                    >
                                        <div class="flex flex-row md:flex-col gap-1 p-3 pb-3 md:pb-2 items-center">
                                            <USelect
                                                v-model="entry.auxChannelIndex"
                                                :items="channelOptions"
                                                class="min-w-22"
                                            />
                                            <USelect
                                                v-model="entry.modeLogic"
                                                :items="logicOptions"
                                                v-if="mode.entries.length > 1"
                                                class="min-w-22"
                                            />
                                            <p class="text-xs">{{ $t("auxiliaryMin") }}: {{ entry.sliderRange[0] }}</p>
                                            <p class="text-xs">{{ $t("auxiliaryMax") }}: {{ entry.sliderRange[1] }}</p>
                                        </div>
                                        <div
                                            class="w-full h-full flex flex-col items-center justify-center p-3 md:pr-12 md:pb-0"
                                        >
                                            <DraggableMultiSlider
                                                v-model="entry.sliderRange"
                                                :min="CHANNEL_MIN"
                                                :max="CHANNEL_MAX"
                                                :step="CHANNEL_STEP"
                                                :min-range-gap="MIN_RANGE_GAP"
                                            />
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
                                        <UButton
                                            icon="i-lucide-x"
                                            size="xs"
                                            color="neutral"
                                            variant="soft"
                                            :ui="{
                                                base: 'bg-accented absolute top-3 right-3 rounded-full',
                                            }"
                                            @click="removeEntry(mode, entry.uid)"
                                        />
                                    </div>
                                    <div v-else class="flex w-full relative">
                                        <div class="flex flex-col gap-2 p-3 items-start">
                                            <USelect
                                                v-model="entry.linkedTo"
                                                :items="linkItemsForMode(mode)"
                                                class="min-w-52"
                                            />
                                            <USelect
                                                v-model="entry.modeLogic"
                                                :items="logicOptions"
                                                v-if="mode.entries.length > 1"
                                                class="min-w-22"
                                            />
                                        </div>
                                        <UButton
                                            icon="i-lucide-x"
                                            size="xs"
                                            color="neutral"
                                            variant="soft"
                                            :ui="{
                                                base: 'bg-accented absolute top-3 right-3 rounded-full',
                                            }"
                                            @click="removeEntry(mode, entry.uid)"
                                        />
                                    </div>
                                </template>
                            </template>
                        </div>
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
import { defineComponent, reactive, ref, computed, onMounted, watch, nextTick } from "vue";
import { useWindowSize } from "@vueuse/core";
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
import UiBox from "../elements/UiBox.vue";
import HelpIcon from "../elements/HelpIcon.vue";
import SettingRow from "../elements/SettingRow.vue";
import DraggableMultiSlider from "../elements/DraggableMultiSlider.vue";

const CHANNEL_MIN = 900;
const CHANNEL_MAX = 2100;
const CHANNEL_STEP = 25;
const MIN_RANGE_GAP = 25;
const DEFAULT_RANGE = { start: 1300, end: 1700 };

function getModeStateColors(state) {
    switch (state) {
        case "on":
            return {
                color: "primary",
                solid: "bg-primary/80",
            };
        case "off":
            return {
                color: "neutral",
                solid: "bg-accented",
            };
        case "disabled":
            return {
                color: "error",
                solid: "bg-error/20",
            };
        default:
            return {
                color: "neutral",
                solid: "bg-accented",
            };
    }
}

export default defineComponent({
    name: "AuxiliaryTab",
    components: {
        BaseTab,
        WikiButton,
        UiBox,
        HelpIcon,
        SettingRow,
        DraggableMultiSlider,
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

        const { width: windowWidth } = useWindowSize();

        const sliderPipValues = computed(() => {
            if (windowWidth.value < 575) {
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
            const none = { value: 0, label: i18n.getMessage("auxiliaryLinkNone") };
            const rest = [];
            for (let index = 1; index < fcStore.auxConfig.length; index++) {
                rest.push({ value: fcStore.auxConfigIds[index], label: fcStore.auxConfig[index] });
            }
            rest.sort((a, b) => a.label.localeCompare(b.label));
            return [none, ...rest];
        });

        const linkItemsForMode = (mode) =>
            linkOptions.value.map((opt) => ({
                ...opt,
                disabled: opt.value === mode.id,
            }));

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

        const snapChannel = (value) => {
            const numericValue = Number(value);
            if (Number.isNaN(numericValue)) {
                return DEFAULT_RANGE.start;
            }
            return clampChannel(Math.round(numericValue / CHANNEL_STEP) * CHANNEL_STEP);
        };

        const pipStyle = (value) => {
            return { left: `${channelPercent(value)}%` };
        };

        const normalizeRangeValues = (values) => {
            const [rawStart = DEFAULT_RANGE.start, rawEnd = DEFAULT_RANGE.end] = Array.isArray(values) ? values : [];
            let start = snapChannel(rawStart);
            let end = snapChannel(rawEnd);

            if (start > end) {
                [start, end] = [end, start];
            }

            if (end - start < MIN_RANGE_GAP) {
                if (start <= CHANNEL_MIN) {
                    end = Math.min(CHANNEL_MAX, start + MIN_RANGE_GAP);
                } else {
                    start = Math.max(CHANNEL_MIN, end - MIN_RANGE_GAP);
                }
            }

            return [start, end];
        };

        const addRange = (mode, auxChannelIndex = -1, modeLogic = 0, range = DEFAULT_RANGE) => {
            const sliderRange = normalizeRangeValues([range.start, range.end]);
            mode.entries.push({
                uid: ++entryUid,
                kind: "range",
                auxChannelIndex,
                modeLogic,
                sliderRange,
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

        const visibleModesWithState = computed(() =>
            visibleModes.value.map((mode) => {
                const state = modeState(mode);
                return {
                    mode,
                    state,
                    stateUi: getModeStateColors(state),
                    buttonSolid: state === "on" || state === "disabled",
                };
            }),
        );

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
            const nextAuxChannelCount = Math.max(0, activeChannels - 4);

            auxChannelCount.value = nextAuxChannelCount;

            for (let idx = 0; idx < nextAuxChannelCount; idx++) {
                const nextPercent = channelPercent(channels[idx + 4]);
                if (rcMarkers[idx] !== nextPercent) {
                    rcMarkers[idx] = nextPercent;
                }
            }

            const existingMarkerCount = Object.keys(rcMarkers).length;
            for (let idx = nextAuxChannelCount; idx < existingMarkerCount; idx++) {
                delete rcMarkers[idx];
            }

            autoSelectChannel(channels, activeChannels, fcStore.rssiConfig?.channel || 0);
        };

        const saveModes = () => {
            const nextModeRanges = [];
            const nextModeRangesExtra = [];

            modes.forEach((mode) => {
                mode.entries.forEach((entry) => {
                    if (entry.kind === "range") {
                        const [start, end] = normalizeRangeValues(entry.sliderRange);
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
                await nextTick();
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

        watch(hideUnused, (value) => setConfig({ hideUnusedModes: value }));

        return {
            modes,
            hideUnused,
            visibleModesWithState,
            logicOptions,
            channelOptions,
            linkItemsForMode,
            rcMarkers,
            infoMinWidthStyle,
            sliderPipValues,
            CHANNEL_MIN,
            CHANNEL_MAX,
            CHANNEL_STEP,
            MIN_RANGE_GAP,
            getModeStateColors,
            addRange,
            addLink,
            removeEntry,
            markerStyle,
            pipStyle,
            saveModes,
        };
    },
});
</script>

<style lang="less">
.tab-auxiliary {
    min-height: 100%;

    .pips-channel-range {
        position: relative;
        height: 24px;
        margin-top: 16px;
        // 20px is the width of the slider thumbs in DraggableMultiSlider, taking 10px from each side of the pip range makes the thumbs align cleanly
        width: calc(100% - 20px);
    }

    .pip {
        position: absolute;
        top: 12px;
        transform: translateX(-50%);
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .pip::before {
        content: "";
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 16px;
        background: var(--surface-600);
    }

    .pip-marker {
        position: absolute;
        bottom: 12px;
        transform: translateX(-50%);
        width: 6px;
        height: 20px;
        background: var(--primary-500);
        box-shadow: 0 0 6px rgba(255, 187, 0, 0.9);
        pointer-events: none;
        z-index: 10;
        border-radius: 9999px;
    }
}
</style>
