<template>
    <div class="receiver-msp" :class="{ 'flex-1': !enableTX }">
        <div class="flex w-full items-center gap-3">
            <span class="channel-name">{{ t("receiverMspSourceLabel") }}</span>
            <USelect v-model="source" :items="sourceItems" class="flex-1" size="sm" />
        </div>

        <div class="control-gimbals">
            <div
                v-for="(gimbal, index) in gimbals"
                :key="index"
                ref="gimbalElements"
                :class="['control-gimbal', index === 0 ? 'left' : 'right']"
                @mousedown.prevent="startGimbalDrag(index, $event)"
            >
                <span class="gimbal-label gimbal-label-vert">{{ t(`controlAxis${gimbal[0]}`) }}</span>
                <span class="gimbal-label gimbal-label-horz">{{ t(`controlAxis${gimbal[1]}`) }}</span>
                <span class="crosshair crosshair-vert"></span>
                <span class="crosshair crosshair-horz"></span>
                <div
                    class="control-stick"
                    :style="{
                        top: `${(1 - channelValueToStickPortion(stickValues[gimbal[0]])) * 100}%`,
                        left: `${channelValueToStickPortion(stickValues[gimbal[1]]) * 100}%`,
                    }"
                ></div>
            </div>
        </div>

        <div class="flex w-full flex-col gap-3">
            <div v-for="i in auxCount" :key="i" class="flex items-center gap-3">
                <span class="channel-name">{{ t(`controlAxisAux${i}`) }}</span>
                <USlider
                    v-model="stickValues[auxChannel(i)]"
                    :min="CHANNEL_MIN_VALUE"
                    :max="CHANNEL_MAX_VALUE"
                    :aria-label="t(`controlAxisAux${i}`)"
                    :disabled="isChannelBound(auxChannel(i))"
                    class="flex-1"
                />
                <span class="w-9 shrink-0 tabular-nums">{{ stickValues[auxChannel(i)] }}</span>
            </div>
        </div>

        <div v-if="source === 'gamepad'" class="flex w-full flex-col gap-3">
            <UiBox
                :title="pageFocused ? t('receiverMspGamepadTitle') : t('receiverMspGamepadUnfocusedTitle')"
                :type="pageFocused ? 'neutral' : 'warning'"
                :highlight="!pageFocused"
                class="w-full"
            >
                <div class="flex flex-col gap-3">
                    <p v-if="!gamepadList.length" class="hint-text">{{ t("receiverMspGamepadNone") }}</p>
                    <template v-else>
                        <div class="flex items-center gap-3">
                            <span class="channel-name">{{ t("receiverMspGamepadDevice") }}</span>
                            <USelect v-model="selectedGamepadModel" :items="gamepadItems" class="flex-1" size="sm" />
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="channel-name"></span>
                            <span class="hint-text flex-1">{{ t("receiverMspGamepadSetCenterHint") }}</span>
                            <UButton
                                size="sm"
                                class="shrink-0"
                                :label="t('receiverMspGamepadSetCenter')"
                                :disabled="!snapshot"
                                @click="setCenter"
                            />
                        </div>

                        <!-- One line per channel: what drives it and its live value. -->
                        <div v-for="name in activeChannels" :key="name" class="flex items-center gap-2">
                            <span class="channel-name">{{ t(`controlAxis${name}`) }}</span>
                            <span class="binding-text flex-1 truncate" :class="{ unassigned: !isChannelBound(name) }">
                                {{ describeChannel(name) }}
                            </span>
                            <div class="live-bar w-24 shrink-0">
                                <div class="live-bar-fill" :style="{ width: `${liveBarPercent(name)}%` }"></div>
                            </div>
                            <span class="w-9 shrink-0 tabular-nums text-right">{{ stickValues[name] }}</span>
                        </div>
                    </template>
                </div>
            </UiBox>
            <UiBox v-if="gamepadLost" :title="t('warningTitle')" type="error" highlight class="w-full">
                <p class="warning-text">{{ t("receiverMspGamepadLost") }}</p>
            </UiBox>
        </div>

        <div v-if="!enableTX" class="flex w-full flex-1 flex-col items-center gap-4">
            <UiBox :title="t('warningTitle')" type="error" highlight collapsible class="w-full">
                <p class="warning-text" v-html="t('receiverMspWarningText')"></p>
            </UiBox>
            <UButton class="mt-auto w-fit" :label="t('receiverMspEnableButton')" @click="enableControls" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { clamp } from "@/js/utils/common";
import UiBox from "@/components/elements/UiBox.vue";
import { get as getConfig, set as setConfig } from "@/js/ConfigStorage";
import type { StickWindowHost, StickWindowI18n } from "./stickWindow";
import {
    CHANNEL_MIN_VALUE,
    CHANNEL_MAX_VALUE,
    CHANNEL_NAMES,
    DEFAULT_AUX_COUNT,
    DEFAULT_CHANNEL_VALUES,
    activeChannelNames,
    channelsToMspArray,
    createProfile,
    describeSwitchControls,
    findPreset,
    applyStickCenters,
    mapGamepadToChannels,
    readStickCenters,
    releaseBoundChannels,
    snapshotGamepad,
    switchPositionCount,
    type ChannelName,
    type GamepadProfile,
    type GamepadSnapshot,
    type StickCenters,
} from "./gamepadMapping";

const host: typeof globalThis & StickWindowHost = globalThis;

// i18n instance handed to this window by the opener (see openSticksWindow in ReceiverTab.vue).
const i18n: StickWindowI18n | undefined = host.i18n ?? host.opener?.i18n;
const t = (key: string, parameters?: Record<string, unknown>) => i18n?.getMessage(key, parameters) ?? key;

// First the vertical axis, then the horizontal
const gimbals: [vertical: ChannelName, horizontal: ChannelName][] = [
    ["Throttle", "Yaw"],
    ["Pitch", "Roll"],
];

// Set reasonable initial stick positions (Mode 2): sticks centred, throttle and every AUX low.
const stickValues = reactive<Record<ChannelName, number>>({ ...DEFAULT_CHANNEL_VALUES });

const enableTX = ref(false);
const gimbalElements = ref<HTMLElement[]>([]);
const activeGimbalIndex = ref<number | null>(null);
let transmitInterval: ReturnType<typeof setInterval> | null = null;

const auxChannel = (i: number) => `Aux${i}` as ChannelName;

function channelValueToStickPortion(channel: number) {
    return (channel - CHANNEL_MIN_VALUE) / (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE);
}

function stickPortionToChannelValue(portion: number) {
    return Math.round(clamp(portion, 0, 1) * (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE) + CHANNEL_MIN_VALUE);
}

function startGimbalDrag(gimbalIndex: number, event: MouseEvent) {
    // A gamepad-driven stick would be overwritten by the next poll anyway.
    if (event.button !== 0 || (source.value !== "mouse" && selectedGamepadIndex.value !== null)) {
        return;
    }
    activeGimbalIndex.value = gimbalIndex;
    updateGimbalFromEvent(gimbalIndex, event);
}

function updateGimbalFromEvent(gimbalIndex: number, event: MouseEvent) {
    const gimbalEl = gimbalElements.value[gimbalIndex];
    if (!gimbalEl) {
        return;
    }

    const rect = gimbalEl.getBoundingClientRect();
    const size = rect.width;

    stickValues[gimbals[gimbalIndex][0]] = stickPortionToChannelValue(1 - (event.clientY - rect.top) / size);
    stickValues[gimbals[gimbalIndex][1]] = stickPortionToChannelValue((event.clientX - rect.left) / size);
}

function onMouseMove(event: MouseEvent) {
    if (activeGimbalIndex.value !== null) {
        updateGimbalFromEvent(activeGimbalIndex.value, event);
    }
}

function onMouseUp() {
    activeGimbalIndex.value = null;
}

function enableControls() {
    enableTX.value = true;
}

// ---------------------------------------------------------------------------------------
// Gamepad source (browser Gamepad API). The popup polls navigator.getGamepads() on the same
// 50 ms tick that transmits, so a stick move reaches the FC within one MSP frame. Chromium
// only exposes a controller after a button press on it, and may freeze its readings while
// the window is unfocused — both are surfaced in the UI rather than worked around.
// ---------------------------------------------------------------------------------------

// Profiles used to be kept in localStorage (earlier builds of this window); nothing is
// user-editable any more, so the stored copy is dropped and the preset rules.
const LEGACY_PROFILE_STORAGE_KEY = "receiverMspGamepadProfiles";

// The one thing that is remembered: the stick centres captured with "Set centre", per
// gamepad id, in the configurator's own settings store (localStorage, shared with the opener).
const CENTER_STORAGE_KEY = "receiver_msp_gamepad_centers";
type StoredCenters = Record<string, StickCenters>;

function loadStoredCenters(): StoredCenters {
    try {
        const stored: unknown = getConfig(CENTER_STORAGE_KEY, {})[CENTER_STORAGE_KEY];
        return typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as StoredCenters) : {};
    } catch {
        return {};
    }
}

function storeCenters(gamepadId: string, centers: StickCenters) {
    try {
        setConfig({ [CENTER_STORAGE_KEY]: { ...loadStoredCenters(), [gamepadId]: centers } });
    } catch {
        // Storage unavailable: the centre still holds until the window is closed.
    }
}

type InputSource = "mouse" | "gamepad";
interface GamepadListEntry {
    index: number;
    id: string;
    mapping: string;
}

// Gamepad first: a connected radio takes over as soon as the browser exposes it; until then
// (or with the mouse source picked) the on-screen sticks follow the mouse.
const source = ref<InputSource>("gamepad");
const sourceItems = computed(() => [
    { label: t("receiverMspSourceMouse"), value: "mouse" },
    { label: t("receiverMspSourceGamepad"), value: "gamepad" },
]);

const gamepadList = ref<GamepadListEntry[]>([]); // everything the browser currently exposes
const selectedGamepadIndex = ref<number | null>(null);
const snapshot = ref<GamepadSnapshot | null>(null); // last copy of the selected gamepad, null when gone
const profile = ref<GamepadProfile>(createProfile(""));
const gamepadLost = ref(false);
const pageFocused = ref(true);

// A known radio is listed by its name; anything else by what the browser calls it.
const gamepadItems = computed(() =>
    gamepadList.value.map((pad) => ({ label: findPreset(pad.id)?.name ?? pad.id, value: pad.index })),
);

// USelect wants `number | undefined`; the state keeps null for "nothing selected".
const selectedGamepadModel = computed({
    get: () => selectedGamepadIndex.value ?? undefined,
    set: (index: number | undefined) => {
        if (index !== undefined && index !== selectedGamepadIndex.value) {
            selectGamepad(index);
        }
    },
});

// The sticks plus as many AUX as the radio has; the mouse source keeps the classic four.
const activeChannels = computed<ChannelName[]>(() =>
    source.value === "mouse" ? CHANNEL_NAMES.slice(0, 4 + DEFAULT_AUX_COUNT) : activeChannelNames(profile.value),
);
const auxCount = computed(() => activeChannels.value.length - 4);

// Plain-language source of a channel: the radio's own control name when the preset knows
// it, otherwise the axis/button/switch it reads.
function describeChannel(name: ChannelName): string {
    const binding = profile.value.bindings[name];
    let text: string;
    if (binding.kind === "none") {
        return t("receiverMspGamepadNotAssigned");
    } else if (binding.label) {
        text = binding.label;
    } else if (binding.kind === "axis") {
        text = t("receiverMspGamepadAxis", { index: binding.index });
    } else if (binding.kind === "button") {
        text = t("receiverMspGamepadButton", { index: binding.index });
    } else {
        text = t("receiverMspGamepadSwitchOn", {
            controls: describeSwitchControls(binding),
            count: switchPositionCount(binding),
        });
    }
    return binding.invert ? `${text}, ${t("receiverMspGamepadInverted")}` : text;
}

function isChannelBound(name: ChannelName) {
    return source.value === "gamepad" && profile.value.bindings[name].kind !== "none";
}

function liveBarPercent(name: ChannelName) {
    return channelValueToStickPortion(stickValues[name]) * 100;
}

function readGamepads(): Gamepad[] {
    try {
        return Array.from(navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => !!pad && pad.connected);
    } catch {
        return [];
    }
}

function selectGamepad(index: number) {
    selectedGamepadIndex.value = index;
    gamepadLost.value = false;
    const pad = gamepadList.value.find((p) => p.index === index);
    const id = pad?.id ?? "";
    profile.value = applyStickCenters(createProfile(id, pad?.mapping ?? ""), loadStoredCenters()[id]);
}

// The sticks as they sit right now become mid stick (1500), and that centre is remembered
// for this gamepad id; a bad press is undone by pressing again with the sticks at rest.
function setCenter() {
    const centers = readStickCenters(profile.value, snapshot.value);
    profile.value = applyStickCenters(profile.value, centers);
    storeCenters(profile.value.gamepadId, centers);
}

function refreshGamepadList() {
    const list = readGamepads().map((pad) => ({ index: pad.index, id: String(pad.id), mapping: pad.mapping }));
    const changed =
        list.length !== gamepadList.value.length ||
        list.some((pad, i) => pad.index !== gamepadList.value[i].index || pad.id !== gamepadList.value[i].id);
    if (changed) {
        gamepadList.value = list;
    }

    const selected = selectedGamepadIndex.value;
    if (selected !== null && !list.some((pad) => pad.index === selected)) {
        // The controller we were reading went away: never keep transmitting its last frame.
        if (enableTX.value && source.value === "gamepad") {
            enableTX.value = false;
            gamepadLost.value = true;
        }
        selectedGamepadIndex.value = null;
        snapshot.value = null;
    }
    if (selectedGamepadIndex.value === null && list.length) {
        selectGamepad(list[0].index);
    }
}

function pollGamepad() {
    const pad = readGamepads().find((p) => p.index === selectedGamepadIndex.value);
    snapshot.value = snapshotGamepad(pad);
    if (!snapshot.value) {
        return;
    }
    const values = mapGamepadToChannels(snapshot.value, profile.value, stickValues);
    for (const name of CHANNEL_NAMES) {
        if (profile.value.bindings[name].kind !== "none") {
            stickValues[name] = values[name];
        }
    }
}

function onGamepadEvent() {
    refreshGamepadList();
}

function onFocusChange() {
    pageFocused.value = document.hasFocus();
}

watch(source, (value) => {
    if (value === "mouse") {
        gamepadLost.value = false;
        // Do not keep sending what the gamepad last set (an armed AUX, a raised throttle).
        Object.assign(stickValues, releaseBoundChannels(stickValues, profile.value));
        return;
    }
    refreshGamepadList();
    pollGamepad();
});

function transmitChannels() {
    if (source.value === "gamepad") {
        refreshGamepadList();
        pollGamepad();
    }

    if (!enableTX.value) {
        return;
    }

    const channelValues = channelsToMspArray(stickValues, activeChannels.value.length);

    // Callback given to us by the window creator so we can have it send data over MSP for us
    if (host.setRawRx && !host.setRawRx(channelValues)) {
        // MSP connection has gone away
        host.close();
    }
}

onMounted(() => {
    i18n?.updatePageDirection(document);

    document.title = t("receiverButtonSticks");
    globalThis.addEventListener("mousemove", onMouseMove);
    globalThis.addEventListener("mouseup", onMouseUp);
    globalThis.addEventListener("gamepadconnected", onGamepadEvent);
    globalThis.addEventListener("gamepaddisconnected", onGamepadEvent);
    globalThis.addEventListener("focus", onFocusChange);
    globalThis.addEventListener("blur", onFocusChange);
    onFocusChange();
    try {
        globalThis.localStorage?.removeItem(LEGACY_PROFILE_STORAGE_KEY);
    } catch {
        // Storage unavailable: nothing to clean up.
    }
    refreshGamepadList();
    transmitInterval = setInterval(transmitChannels, 50);
});

onUnmounted(() => {
    globalThis.removeEventListener("mousemove", onMouseMove);
    globalThis.removeEventListener("mouseup", onMouseUp);
    globalThis.removeEventListener("gamepadconnected", onGamepadEvent);
    globalThis.removeEventListener("gamepaddisconnected", onGamepadEvent);
    globalThis.removeEventListener("focus", onFocusChange);
    globalThis.removeEventListener("blur", onFocusChange);
    if (transmitInterval) {
        clearInterval(transmitInterval);
    }
});
</script>

<style>
body {
    font-family: "Segoe UI", Tahoma, sans-serif;
    font-size: 12px;
    background-color: var(--surface-100);
    color: var(--text);
    /* The safety warning makes the initial state nearly fill the popup, so scroll rather than
       clip it. `safe center` centres the short armed state (warning hidden) but falls back to
       top-anchored when the content is tall — plain `center` would push the first line out of
       reach above the scroll origin. */
    overflow-y: auto;
    user-select: none;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    align-items: center;
    min-height: 100vh;
    box-sizing: border-box;
    padding: 1.5rem;
    margin: 0;
}

#app {
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    align-items: center;
    flex: 1;
    width: 100%;
}

.receiver-msp {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 1.5rem;
}

.control-gimbals {
    padding: 0.5rem 1.5rem 0;
    text-align: center;
    display: inline-flex;
}

.control-gimbal {
    position: relative;
    width: 120px;
    height: 120px;
    background-color: var(--surface-200);
    margin-inline-start: 1.5rem;
    margin-inline-end: 1.5rem;
    margin-bottom: 2rem;
    display: inline-block;
    border-radius: 5px;
    cursor: pointer;
}

.crosshair {
    display: block;
    position: absolute;
    background-color: var(--surface-500);
}

.crosshair-vert {
    width: 1px;
    height: 100%;
    inset-inline-start: 50%;
}

.crosshair-horz {
    height: 1px;
    width: 100%;
    top: 50%;
}

.gimbal-label {
    display: block;
    position: absolute;
    text-align: center;
}

.gimbal-label-horz {
    top: calc(100% + 1rem);
    width: 100%;
}

.gimbal-label-vert {
    transform: rotate(-90deg);
    top: calc(50% - 0.5em);
    width: 100%;
    inset-inline-start: calc(-50% - 1.5rem);
}

.control-stick {
    background-color: var(--primary-500);
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;
    display: block;
    border-radius: 100%;
    position: absolute;
    cursor: pointer;
}

.warning-text {
    line-height: 1.6;
    margin: 0;
}

.hint-text {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.8;
}

.binding-text {
    font-size: 12px;
}

.binding-text.unassigned {
    opacity: 0.5;
}

.channel-name {
    flex: 0 0 auto;
    width: 5rem;
    text-align: right;
    white-space: nowrap;
}

.live-bar {
    height: 6px;
    min-width: 40px;
    border-radius: 3px;
    background-color: var(--surface-300);
    overflow: hidden;
}

.live-bar-fill {
    height: 100%;
    background-color: var(--primary-500);
    transition: width 50ms linear;
}

@media all and (max-width: 575px) {
    body {
        height: unset !important;
    }
    .control-gimbals {
        padding-top: 0;
    }
}
</style>
