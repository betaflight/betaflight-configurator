<template>
    <BaseTab tab-name="servos">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabServos')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="servos" />
            </div>

            <div v-if="isSupported" class="flex flex-col gap-4">
                <UiBox :title="$t('servosChangeDirection')">
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

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <!-- Servo visualization bars -->
                    <UiBox :title="$t('servosText')">
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

                    <!-- Resource Assignments -->
                    <UiBox :title="$t('servosResourceAssignments')">
                        <div v-if="!hasResourceData" class="text-sm text-muted">
                            {{ $t("servosResourceNotAvailable") }}
                        </div>
                        <template v-else>
                            <div v-if="padDefaultsSource" class="flex items-center gap-2 mb-3">
                                <UTooltip
                                    :text="
                                        padDefaultsSource === 'bundle'
                                            ? $t('servosResourceSrcFirmwareTip')
                                            : $t('servosResourceSrcHeuristicTip')
                                    "
                                >
                                    <span
                                        class="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
                                        :class="
                                            padDefaultsSource === 'bundle'
                                                ? 'bg-green-600 text-white'
                                                : 'bg-amber-500 text-zinc-900'
                                        "
                                    >
                                        {{
                                            padDefaultsSource === "bundle"
                                                ? $t("servosResourceSrcFirmware")
                                                : $t("servosResourceSrcHeuristic")
                                        }}
                                    </span>
                                </UTooltip>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 class="text-sm font-bold mb-2">{{ $t("servosMotorResources") }}</h4>
                                    <div
                                        class="grid items-center gap-y-1"
                                        style="grid-template-columns: minmax(4rem, auto) 1fr"
                                    >
                                        <div class="text-center text-xs font-bold py-1">
                                            {{ $t("servosResourceIndex") }}
                                        </div>
                                        <div class="text-center text-xs font-bold py-1">
                                            {{ $t("servosResourcePin") }}
                                        </div>
                                        <template v-for="motor in motorResources" :key="'motor' + motor.index">
                                            <div class="text-sm py-1 flex items-center justify-center gap-2">
                                                <span
                                                    class="inline-block size-2 rounded-full shrink-0"
                                                    :style="{ backgroundColor: motorDotColor(motor.index) }"
                                                />
                                                <span>{{ $t("servosResourceMotorLabel") }} {{ motor.index + 1 }}</span>
                                            </div>
                                            <USelect
                                                :model-value="motor.pin"
                                                :items="resourcePinOptions"
                                                size="xs"
                                                class="w-full"
                                                @update:model-value="(val) => onMotorPinChange(motor.index, val)"
                                            />
                                        </template>
                                    </div>
                                </div>
                                <div>
                                    <h4 class="text-sm font-bold mb-2">{{ $t("servosServoResources") }}</h4>
                                    <div
                                        class="grid items-center gap-y-1"
                                        style="grid-template-columns: minmax(4rem, auto) 1fr"
                                    >
                                        <div class="text-center text-xs font-bold py-1">
                                            {{ $t("servosResourceIndex") }}
                                        </div>
                                        <div class="text-center text-xs font-bold py-1">
                                            {{ $t("servosResourcePin") }}
                                        </div>
                                        <template v-for="servo in servoResources" :key="'servo' + servo.index">
                                            <div class="text-sm py-1 flex items-center justify-center gap-2">
                                                <span
                                                    v-if="servoDotColor(servo.index)"
                                                    class="inline-block size-2 rounded-full shrink-0"
                                                    :style="{ backgroundColor: servoDotColor(servo.index) }"
                                                />
                                                <span
                                                    class="opacity-100"
                                                    :class="{ 'opacity-50': !servoDotColor(servo.index) }"
                                                    >{{ $t("servosResourceServoLabel") }} {{ servo.index + 1 }}</span
                                                >
                                            </div>
                                            <USelect
                                                :model-value="servo.pin"
                                                :items="resourcePinOptions"
                                                size="xs"
                                                class="w-full"
                                                @update:model-value="(val) => onServoPinChange(servo.index, val)"
                                            />
                                        </template>
                                    </div>
                                </div>
                            </div>
                            <p class="text-xs text-muted mt-3">{{ $t("servosResourceEditHint") }}</p>
                        </template>
                    </UiBox>
                </div>
            </div>
        </div>

        <!-- Save button toolbar -->
        <div v-if="isSupported" class="content_toolbar toolbar_fixed_bottom">
            <div class="flex gap-2">
                <UButton
                    :label="$t('servosButtonSave')"
                    :disabled="!configHasChanged"
                    color="warning"
                    variant="solid"
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
import { lookupTargetDefaults } from "@/js/utils/targetDefaults";
import { servoOutputColor, pwmSlotToServoIndex } from "@/js/utils/servoMixerModel";

const { t } = useTranslation();

const isSupported = ref(false);
const liveMode = ref(false);
const servoConfigs = reactive([]);
const servoData = reactive([]);
const originalConfigs = ref("");

// Resource assignment state
const motorResources = reactive([]);
const servoResources = reactive([]);
const hasResourceData = ref(false);
const resourcesModified = ref(false);
// Initial pins from firmware so they remain selectable after edits
const initialPins = ref([]);

// Bundled silkscreen defaults (Mx / LED_STRIP labels) keyed off FC.CONFIG.boardName.
// padDefaultsSource: 'bundle' when target-defaults.json hit; null otherwise.
// In a future iteration this can chain to a CLI-scan tier, then a localStorage
// snapshot tier — see src/js/utils/targetDefaults.js for the lookup helper.
const padDefaults = ref(null);
const padDefaultsSource = ref(null);

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

// Stable union of firmware-reported pins plus any currently assigned pins so
// previously assigned values remain selectable for swaps/reverts.
const availablePins = computed(() => {
    const pins = new Set(initialPins.value);
    for (const motor of motorResources) {
        if (motor.pin && motor.pin !== "NONE") {
            pins.add(motor.pin);
        }
    }
    for (const servo of servoResources) {
        if (servo.pin && servo.pin !== "NONE") {
            pins.add(servo.pin);
        }
    }
    return Array.from(pins).sort();
});

// Per-row color cue. Motor rows use a static palette indexed by PWM slot;
// servo rows are mixer-aware — slot N drives a logical servoIndex_e
// (FLAPS / FLAPPERON_X / RUDDER / ELEVATOR / THROTTLE) that varies by
// mixer, so we colour by that logical index to keep the dot consistent
// with the smix output column on the same servo.
function motorDotColor(slotIndex) {
    return servoOutputColor(slotIndex);
}
function servoDotColor(slotIndex) {
    const mixerMode = FC.MIXER_CONFIG?.mixer ?? null;
    const idx = mixerMode != null ? pwmSlotToServoIndex(slotIndex, mixerMode) : slotIndex;
    if (idx == null) return null;
    return servoOutputColor(idx);
}

// Annotate a pin with its silkscreen label when bundle defaults are loaded.
// "C06" → "C06 (M1)" when C06 is the target's MOTOR 1 pad; LED_STRIP and
// other peripheral pads get similar suffixes.
function silkscreenLabel(pin) {
    if (!padDefaults.value) return pin;
    const motors = padDefaults.value.motors ?? [];
    const motorIdx = motors.indexOf(pin);
    if (motorIdx >= 0) return `${pin} (M${motorIdx + 1})`;
    const ledStrips = padDefaults.value.ledStrips ?? [];
    if (ledStrips.includes(pin)) return `${pin} (LED)`;
    return pin;
}

const resourcePinOptions = computed(() => [
    { value: "NONE", label: "NONE" },
    ...availablePins.value.map((pin) => ({ value: pin, label: silkscreenLabel(pin) })),
]);

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

// Lookup bundled silkscreen defaults for the connected board. Tier-0 of
// the padDefaults chain — when the target ships with `betaflight/unified-targets`
// metadata we use it directly; otherwise the dropdown falls back to bare
// pin labels (port+pin, no Mx annotation).
function loadPadDefaults() {
    const boardName = FC.CONFIG?.boardName;
    if (!boardName) {
        padDefaults.value = null;
        padDefaultsSource.value = null;
        return;
    }
    const bundled = lookupTargetDefaults(boardName);
    if (bundled) {
        padDefaults.value = bundled;
        padDefaultsSource.value = "bundle";
    } else {
        padDefaults.value = null;
        padDefaultsSource.value = null;
    }
}

// Populate motor/servo resource state from FC and seed initialPins.
function loadResourceData() {
    const pins = new Set();

    motorResources.length = 0;
    if (FC.MOTOR_RESOURCES && FC.MOTOR_RESOURCES.length > 0) {
        for (const resource of FC.MOTOR_RESOURCES) {
            motorResources.push({ ...resource });
            if (resource.pin && resource.pin !== "NONE") {
                pins.add(resource.pin);
            }
        }
    }

    servoResources.length = 0;
    if (FC.SERVO_RESOURCES && FC.SERVO_RESOURCES.length > 0) {
        for (const resource of FC.SERVO_RESOURCES) {
            servoResources.push({ ...resource });
            if (resource.pin && resource.pin !== "NONE") {
                pins.add(resource.pin);
            }
        }
    }

    initialPins.value = Array.from(pins).sort();
    hasResourceData.value = motorResources.length > 0 || servoResources.length > 0;
    resourcesModified.value = false;
}

// Shared handler for motor (resourceType 0) and servo (resourceType 1) pin updates.
function onResourcePinChange(resourceType, resources, index, newPin) {
    const ioTag = newPin === "NONE" ? 0 : mspHelper.pinToIoTag(newPin);

    resources[index].pin = newPin;
    resources[index].ioTag = ioTag;
    resourcesModified.value = true;

    const label = resourceType === 0 ? "Motor" : "Servo";
    mspHelper.setMotorServoResource(resourceType, index, ioTag, () => {
        console.log(`${label} ${index + 1} pin set to ${newPin}`);
    });
}

function onMotorPinChange(index, newPin) {
    onResourcePinChange(0, motorResources, index, newPin);
}

function onServoPinChange(index, newPin) {
    onResourcePinChange(1, servoResources, index, newPin);
}

async function loadServoData() {
    if (!FC.CONFIG?.apiVersion) {
        isSupported.value = false;
        GUI.content_ready();
        return;
    }

    loadPadDefaults();

    try {
        await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
        await MSP.promise(MSPCodes.MSP_SERVO_MIX_RULES);
        await MSP.promise(MSPCodes.MSP_RC);
        await MSP.promise(MSPCodes.MSP_BOXNAMES);

        // Resource data is optional - older firmware does not support MSP2_MOTOR_SERVO_RESOURCE.
        try {
            await MSP.promise(MSPCodes.MSP2_MOTOR_SERVO_RESOURCE);
            loadResourceData();
        } catch {
            console.log("Resource data not available (firmware may not support MSP2_MOTOR_SERVO_RESOURCE)");
            hasResourceData.value = false;
        }

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
