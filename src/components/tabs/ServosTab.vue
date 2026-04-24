<template>
    <BaseTab tab-name="servos">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabServos')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="servos" />
            </div>

            <div v-if="isSupported">
                <UiBox :title="$t('servosChangeDirection')" type="neutral">
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
                        <USwitch v-model="liveMode" size="sm" />
                        <span class="text-sm">{{ $t("servosLiveMode") }}</span>
                    </div>
                </UiBox>

                <!-- Servo visualization bars -->
                <UiBox :title="$t('servosText')" type="neutral" class="mt-4">
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
                    :color="configHasChanged ? 'success' : 'neutral'"
                    @click="saveServoConfig"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import UiBox from "@/components/elements/UiBox.vue";
import { useTranslation } from "i18next-vue";
import GUI from "@/js/gui";
import FC from "@/js/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";
import { useInterval } from "@/composables/useInterval";
import { useTimeout } from "@/composables/useTimeout";

const { t } = useTranslation();

const isSupported = ref(false);
const liveMode = ref(false);
const servoConfigs = reactive([]);
const servoData = reactive([]);
const originalConfigs = ref("");

const { addInterval } = useInterval();
const { addTimeout } = useTimeout();

const totalChannels = computed(() => FC.RC?.active_channels || 8);
const auxChannelCount = computed(() => Math.max(0, totalChannels.value - 4));
const configHasChanged = computed(() => originalConfigs.value !== JSON.stringify(servoConfigs));

// Rate options: 100% down to -100%, as {value, label} for USelect
const rateOptions = computed(() => {
    const opts = [];
    for (let i = 100; i > -101; i--) {
        opts.push({ value: i, label: `${t("servosRate")} ${i}%` });
    }
    return opts;
});

// Bar height as percentage (0-100) for UProgress
function getBarHeight(value) {
    const clamped = Math.min(Math.max(value - 1000, 0), 1000);
    return (clamped / 1000) * 100;
}

// Bar opacity string for CSS variable
function getBarOpacity(value) {
    const alpha = Math.min(Math.max((value - 1000) / 1000, 0), 1);
    return alpha.toFixed(2);
}

// Channel forward checkbox — only one per servo (radio-like behavior)
function setChannelForward(servoIndex, channelIndex, event) {
    if (event.target.checked) {
        servoConfigs[servoIndex].indexOfChannelToForward = channelIndex;
    } else {
        servoConfigs[servoIndex].indexOfChannelToForward = 255;
    }
    onServoChange();
}

function onServoChange() {
    if (liveMode.value) {
        addTimeout("servos_update", () => updateServos(false), 10);
    }
}

function updateServos(saveToEeprom) {
    const SERVO_MIN = 500;
    const SERVO_MAX = 2500;

    for (let i = 0; i < servoConfigs.length; i++) {
        const src = servoConfigs[i];
        const cfg = FC.SERVO_CONFIG[i];

        const min = Math.min(Math.max(src.min ?? SERVO_MIN, SERVO_MIN), SERVO_MAX);
        const middle = Math.min(Math.max(src.middle ?? SERVO_MIN, SERVO_MIN), SERVO_MAX);
        const max = Math.min(Math.max(src.max ?? SERVO_MAX, SERVO_MIN), SERVO_MAX);

        cfg.min = min;
        cfg.middle = middle;
        cfg.max = max;
        cfg.rate = src.rate;
        cfg.indexOfChannelToForward = src.indexOfChannelToForward ?? 255;

        src.min = min;
        src.middle = middle;
        src.max = max;
    }

    mspHelper.sendServoConfigurations(() => {
        if (saveToEeprom) {
            mspHelper.writeConfiguration(false, () => {
                gui_log(i18n.getMessage("servosEepromSave"));
                originalConfigs.value = JSON.stringify(servoConfigs);
            });
        }
    });
}

function saveServoConfig() {
    updateServos(true);
}

function getServoData() {
    MSP.send_message(MSPCodes.MSP_SERVO, false, false, () => {
        for (let i = 0; i < FC.SERVO_DATA.length; i++) {
            servoData[i] = FC.SERVO_DATA[i];
        }
    });
}

async function loadServoData() {
    if (!FC.CONFIG?.apiVersion) {
        isSupported.value = false;
        GUI.content_ready();
        return;
    }

    try {
        await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
        await MSP.promise(MSPCodes.MSP_SERVO_MIX_RULES);
        await MSP.promise(MSPCodes.MSP_RC);
        await MSP.promise(MSPCodes.MSP_BOXNAMES);
        initializeUI();
    } catch (e) {
        console.error("Failed to load servo configs", e);
        isSupported.value = false;
        GUI.content_ready();
    }
}

function initializeUI() {
    if (!FC.SERVO_CONFIG || FC.SERVO_CONFIG.length === 0) {
        isSupported.value = false;
        GUI.content_ready();
        return;
    }

    isSupported.value = true;

    servoConfigs.length = 0;
    for (let i = 0; i < 8; i++) {
        if (FC.SERVO_CONFIG[i]) {
            servoConfigs.push({
                min: FC.SERVO_CONFIG[i].min,
                middle: FC.SERVO_CONFIG[i].middle,
                max: FC.SERVO_CONFIG[i].max,
                rate: FC.SERVO_CONFIG[i].rate,
                indexOfChannelToForward: FC.SERVO_CONFIG[i].indexOfChannelToForward,
            });
        }
    }

    originalConfigs.value = JSON.stringify(servoConfigs);

    addInterval("servo_data_pull", getServoData, 50);
    addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);

    GUI.content_ready();
}

onMounted(() => {
    loadServoData();
});
</script>
