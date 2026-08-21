<template>
    <div class="receiver-msp">
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
            <div v-for="i in 4" :key="i" class="flex items-center gap-3">
                <span class="w-10 shrink-0 text-right">{{ t(`controlAxisAux${i}`) }}</span>
                <USlider
                    v-model="stickValues[`Aux${i}`]"
                    :min="CHANNEL_MIN_VALUE"
                    :max="CHANNEL_MAX_VALUE"
                    :aria-label="t(`controlAxisAux${i}`)"
                    class="flex-1"
                />
                <span class="w-9 shrink-0 tabular-nums">{{ stickValues[`Aux${i}`] }}</span>
            </div>
        </div>

        <div v-if="!enableTX" class="flex w-full flex-col items-center gap-6">
            <p class="warning-text text-center" v-html="t('receiverMspWarningText')"></p>
            <UButton class="w-fit" :label="t('receiverMspEnableButton')" @click="enableControls" />
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from "vue";
import { clamp } from "@/js/utils/common";

// i18n instance handed to this window by the opener (see openSticksWindow in ReceiverTab.vue).
const i18n = globalThis.i18n ?? globalThis.opener?.i18n;
const t = (key) => i18n?.getMessage(key) ?? key;

const CHANNEL_MIN_VALUE = 1000;
const CHANNEL_MID_VALUE = 1500;
const CHANNEL_MAX_VALUE = 2000;

const channelMSPIndexes = {
    Roll: 0,
    Pitch: 1,
    Throttle: 2,
    Yaw: 3,
    Aux1: 4,
    Aux2: 5,
    Aux3: 6,
    Aux4: 7,
};

// First the vertical axis, then the horizontal
const gimbals = [
    ["Throttle", "Yaw"],
    ["Pitch", "Roll"],
];

// Set reasonable initial stick positions (Mode 2)
const stickValues = reactive({
    Throttle: CHANNEL_MIN_VALUE,
    Pitch: CHANNEL_MID_VALUE,
    Roll: CHANNEL_MID_VALUE,
    Yaw: CHANNEL_MID_VALUE,
    Aux1: CHANNEL_MIN_VALUE,
    Aux2: CHANNEL_MIN_VALUE,
    Aux3: CHANNEL_MIN_VALUE,
    Aux4: CHANNEL_MIN_VALUE,
});

const enableTX = ref(false);
const gimbalElements = ref([]);
const activeGimbalIndex = ref(null);
let transmitInterval = null;

function channelValueToStickPortion(channel) {
    return (channel - CHANNEL_MIN_VALUE) / (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE);
}

function stickPortionToChannelValue(portion) {
    return Math.round(clamp(portion, 0, 1) * (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE) + CHANNEL_MIN_VALUE);
}

function startGimbalDrag(gimbalIndex, event) {
    if (event.button !== 0) {
        return;
    }
    activeGimbalIndex.value = gimbalIndex;
    updateGimbalFromEvent(gimbalIndex, event);
}

function updateGimbalFromEvent(gimbalIndex, event) {
    const gimbalEl = gimbalElements.value[gimbalIndex];
    if (!gimbalEl) {
        return;
    }

    const rect = gimbalEl.getBoundingClientRect();
    const size = rect.width;

    stickValues[gimbals[gimbalIndex][0]] = stickPortionToChannelValue(1 - (event.clientY - rect.top) / size);
    stickValues[gimbals[gimbalIndex][1]] = stickPortionToChannelValue((event.clientX - rect.left) / size);
}

function onMouseMove(event) {
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

function transmitChannels() {
    if (!enableTX.value) {
        return;
    }

    const channelValues = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const name in stickValues) {
        channelValues[channelMSPIndexes[name]] = stickValues[name];
    }

    // Callback given to us by the window creator so we can have it send data over MSP for us
    if (globalThis.setRawRx && !globalThis.setRawRx(channelValues)) {
        // MSP connection has gone away
        globalThis.close();
    }
}

onMounted(() => {
    document.title = t("receiverButtonSticks");
    globalThis.addEventListener("mousemove", onMouseMove);
    globalThis.addEventListener("mouseup", onMouseUp);
    transmitInterval = setInterval(transmitChannels, 50);
});

onUnmounted(() => {
    globalThis.removeEventListener("mousemove", onMouseMove);
    globalThis.removeEventListener("mouseup", onMouseUp);
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
    margin-left: 1.5rem;
    margin-right: 1.5rem;
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
    left: 50%;
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
    left: calc(-50% - 1.5rem);
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
    line-height: 1.7;
    margin: 0;
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
