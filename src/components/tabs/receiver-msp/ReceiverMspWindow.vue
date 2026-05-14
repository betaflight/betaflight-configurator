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

        <div class="control-sliders">
            <div v-for="i in 4" :key="i" class="control-slider">
                <span class="slider-label">{{ t(`controlAxisAux${i}`) }}</span>
                <input
                    type="range"
                    :min="CHANNEL_MIN_VALUE"
                    :max="CHANNEL_MAX_VALUE"
                    v-model.number="stickValues[`Aux${i}`]"
                    class="slider"
                />
                <span class="tooltip">{{ stickValues[`Aux${i}`] }}</span>
            </div>
        </div>

        <div v-if="!enableTX" class="warning">
            <p v-html="t('receiverMspWarningText')"></p>
            <div class="button-enable">
                <a class="btn" href="#" @click.prevent="enableControls">
                    {{ t("receiverMspEnableButton") }}
                </a>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from "vue";

// i18n from parent window
const i18n = globalThis.opener?.i18n;
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
    return Math.round(Math.min(Math.max(portion, 0), 1) * (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE) + CHANNEL_MIN_VALUE);
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
    overflow: hidden;
    user-select: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 2rem;
}

.receiver-msp {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.control-gimbals {
    padding: 1.5rem;
    padding-bottom: 0;
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

.control-sliders {
    width: 100%;
}

.control-slider {
    margin: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.slider-label {
    flex-shrink: 0;
    width: 40px;
    text-align: right;
}

.slider {
    flex: 1;
    margin-left: 10px;
    margin-right: 10px;
    accent-color: var(--primary-500);
}

.tooltip {
    flex-shrink: 0;
    width: 35px;
}

.warning {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.button-enable {
    width: fit-content;
}

.button-enable a {
    width: fit-content;
    margin-top: 20px;
    background-color: var(--primary-500);
    border-radius: 3px;
    border: 1px solid var(--primary-600);
    color: var(--surface-50);
    font-size: 12px;
    display: block;
    cursor: pointer;
    transition: all ease 0.2s;
    padding: 0px 9px;
    line-height: 28px;
    text-decoration: none;
    font-weight: bold;
}

.button-enable a:hover {
    background-color: var(--primary-400);
    transition: all ease 0.2s;
}

.button-enable a:active {
    background-color: var(--success-500);
    border: 1px solid var(--success-600);
    transition: all ease 0s;
    box-shadow: inset 0px 1px 5px rgba(0, 0, 0, 0.35);
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
