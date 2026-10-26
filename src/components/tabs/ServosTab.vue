<template>
    <BaseTab tab-name="servos">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabServos')"></div>
            <WikiButton docUrl="servos" />

            <div v-if="isSupported" class="flex flex-col gap-4">
                <UiBox :title="$t('servosChangeDirection')" type="neutral" collapsible>
                    <div class="overflow-x-auto">
                        <div
                            class="grid items-center gap-y-1 min-w-0"
                            :style="{
                                gridTemplateColumns: `6rem repeat(3, minmax(5rem, auto)) repeat(${totalChannels}, 2.5rem) minmax(7rem, auto)`,
                            }"
                        >
                            <!-- Header row -->
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosName") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMin") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMid") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMax") }}</div>
                            <div v-for="ch in 4" :key="'ch' + ch" class="text-center text-xs font-bold py-1">
                                CH{{ ch }}
                            </div>
                            <div
                                v-for="i in auxChannelCount"
                                :key="'aux' + i"
                                class="text-center text-xs font-bold py-1"
                            >
                                A{{ i }}
                            </div>
                            <div class="text-center text-xs font-bold py-1">
                                {{ $t("servosRateAndDirection") }}
                            </div>

                            <!-- Data rows -->
                            <template v-for="(servo, index) in servoConfigs" :key="index">
                                <div class="text-center text-sm py-1">Servo {{ index + 1 }}</div>
                                <UInputNumber
                                    v-model="servo.min"
                                    :min="500"
                                    :max="2500"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    :format-options="{ useGrouping: false }"
                                    class="w-full"
                                    @change="onServoChange"
                                />
                                <UInputNumber
                                    v-model="servo.middle"
                                    :min="500"
                                    :max="2500"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    :format-options="{ useGrouping: false }"
                                    class="w-full"
                                    @change="onServoChange"
                                />
                                <UInputNumber
                                    v-model="servo.max"
                                    :min="500"
                                    :max="2500"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    :format-options="{ useGrouping: false }"
                                    class="w-full"
                                    @change="onServoChange"
                                />
                                <div v-for="ch in totalChannels" :key="'ch' + ch" class="flex justify-center">
                                    <input
                                        type="checkbox"
                                        class="size-4"
                                        :checked="servo.indexOfChannelToForward === ch - 1"
                                        :aria-label="$t('servosForwardChannel', { channel: ch, servo: index + 1 })"
                                        @change="setChannelForward(index, ch - 1, $event)"
                                    />
                                </div>
                                <USelect
                                    v-model="servo.rate"
                                    :items="rateOptions"
                                    class="w-full"
                                    @change="onServoChange"
                                />
                            </template>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mt-3">
                        <USwitch v-model="liveMode" size="xs" />
                        <span class="text-sm">{{ $t("servosLiveMode") }}</span>
                    </div>
                </UiBox>

                <!-- Servo visualization bars -->
                <UiBox :title="$t('servosText')" type="neutral" collapsible class="mt-4">
                    <ul class="grid grid-cols-8 gap-2 mb-1">
                        <li
                            v-for="i in 8"
                            :key="'title' + i"
                            class="text-center text-xs font-bold"
                            :title="$t(`servoNumber${i}`)"
                        >
                            {{ i }}
                        </li>
                    </ul>
                    <ul class="grid grid-cols-8 gap-2">
                        <li
                            v-for="i in 8"
                            :key="'bar' + i"
                            class="relative h-[100px]"
                            :style="{ '--bar-opacity': getBarOpacity(servoData[i - 1] ?? 1500) }"
                        >
                            <div class="absolute inset-x-0 bottom-[45px] z-10 text-center text-[10px] font-bold">
                                {{ servoData[i - 1] ?? 1500 }}
                            </div>
                            <UProgress
                                orientation="vertical"
                                inverted
                                :model-value="getBarHeight(servoData[i - 1] ?? 1500)"
                                :max="100"
                                color="warning"
                                size="2xl"
                                :ui="{
                                    root: '!w-full',
                                    base: '!w-full !rounded-md border border-(--ui-border)',
                                    indicator: '!rounded-none !transition-none opacity-(--bar-opacity)',
                                }"
                                class="h-full"
                            />
                        </li>
                    </ul>
                </UiBox>
            </div>
        </div>

        <!-- Save button toolbar -->
        <div v-if="isSupported" class="content_toolbar toolbar_fixed_bottom">
            <div class="flex gap-2">
                <UButton
                    :label="$t('servosButtonSave')"
                    :disabled="!configHasChanged"
                    :loading="isSaving"
                    size="xs"
                    @click="saveServoConfig"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import UiBox from "@/components/elements/UiBox.vue";
import { useTranslation } from "i18next-vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useTimeout } from "@/composables/useTimeout";
import { useServosData } from "@/composables/servos/useServosData";
import { useServosSave } from "@/composables/servos/useServosSave";
import { clamp } from "@/js/utils/common";
import type { ServoConfig } from "@/stores/fc.types";

/** The editable part of a servo's FC config. */
type ServoEdit = Omit<ServoConfig, "reversedInputSources">;

const { t } = useTranslation();
const fcStore = useFlightControllerStore();

const isSupported = ref(false);
const liveMode = ref(false);
const servoConfigs = reactive<ServoEdit[]>([]);
const servoData = reactive<number[]>([]);
const originalConfigs = ref("");

const { addTimeout } = useTimeout();
const { loadServoConfigs, startPolling } = useServosData();
const { updateServos, saveServoConfig, isSaving } = useServosSave(marshalServoConfigs, () => {
    originalConfigs.value = JSON.stringify(servoConfigs);
});

const totalChannels = computed(() => fcStore.rc?.active_channels || 8);
const auxChannelCount = computed(() => Math.max(0, totalChannels.value - 4));
const configHasChanged = computed(() => originalConfigs.value !== JSON.stringify(servoConfigs));

// Rate options: 100% down to -100%, as {value, label} for USelect
const rateOptions = computed(() => {
    const opts: { value: number; label: string }[] = [];
    for (let i = 100; i > -101; i--) {
        opts.push({ value: i, label: `${t("servosRate")} ${i}%` });
    }
    return opts;
});

// Bar height as percentage (0-100) for UProgress
function getBarHeight(value: number) {
    const clamped = clamp(value - 1000, 0, 1000);
    return (clamped / 1000) * 100;
}

// Bar opacity string for CSS variable
function getBarOpacity(value: number) {
    const alpha = clamp((value - 1000) / 1000, 0, 1);
    return alpha.toFixed(2);
}

// Channel forward checkbox — only one per servo (radio-like behavior)
function setChannelForward(servoIndex: number, channelIndex: number, event: Event) {
    if ((event.target as HTMLInputElement).checked) {
        servoConfigs[servoIndex].indexOfChannelToForward = channelIndex;
    } else {
        servoConfigs[servoIndex].indexOfChannelToForward = 255;
    }
    onServoChange();
}

function onServoChange() {
    if (liveMode.value) {
        addTimeout("servos_update", () => updateServos(), 10);
    }
}

// Marshal reactive servoConfigs into fcStore.servoConfig (clamping min/middle/max) so the
// values sent over MSP match the UI. Also normalizes the reactive values in place.
function marshalServoConfigs() {
    const SERVO_MIN = 500;
    const SERVO_MAX = 2500;

    for (let i = 0; i < servoConfigs.length; i++) {
        const src = servoConfigs[i];
        const cfg = fcStore.servoConfig[i];

        const min = clamp(src.min ?? SERVO_MIN, SERVO_MIN, SERVO_MAX);
        const middle = clamp(src.middle ?? SERVO_MIN, SERVO_MIN, SERVO_MAX);
        const max = clamp(src.max ?? SERVO_MAX, SERVO_MIN, SERVO_MAX);

        cfg.min = min;
        cfg.middle = middle;
        cfg.max = max;
        cfg.rate = src.rate;
        cfg.indexOfChannelToForward = src.indexOfChannelToForward ?? 255;

        src.min = min;
        src.middle = middle;
        src.max = max;
    }
}

function updateServoData() {
    for (let i = 0; i < fcStore.servoData.length; i++) {
        servoData[i] = fcStore.servoData[i];
    }
}

async function loadServoData() {
    if (!fcStore.config?.apiVersion) {
        isSupported.value = false;
        return;
    }

    try {
        await loadServoConfigs();
        initializeUI();
    } catch (e) {
        console.error("Failed to load servo configs", e);
        isSupported.value = false;
    }
}

function initializeUI() {
    if (!fcStore.servoConfig || fcStore.servoConfig.length === 0) {
        isSupported.value = false;
        return;
    }

    isSupported.value = true;

    servoConfigs.length = 0;
    for (let i = 0; i < 8; i++) {
        if (fcStore.servoConfig[i]) {
            servoConfigs.push({
                min: fcStore.servoConfig[i].min,
                middle: fcStore.servoConfig[i].middle,
                max: fcStore.servoConfig[i].max,
                rate: fcStore.servoConfig[i].rate,
                indexOfChannelToForward: fcStore.servoConfig[i].indexOfChannelToForward,
            });
        }
    }

    originalConfigs.value = JSON.stringify(servoConfigs);

    startPolling(updateServoData);
}

onMounted(() => {
    loadServoData();
});
</script>
