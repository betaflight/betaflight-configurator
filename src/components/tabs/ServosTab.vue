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
                                <div class="text-sm py-1 flex items-center justify-center gap-2">
                                    <span
                                        class="inline-block size-2 rounded-full shrink-0"
                                        :style="{ backgroundColor: servoOutputColor(index) }"
                                    />
                                    <span>Servo {{ index + 1 }}</span>
                                </div>
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
                                class="text-xs font-bold flex items-center justify-center gap-1.5"
                                :title="$t(`servoNumber${i}`)"
                            >
                                <span
                                    class="inline-block size-2 rounded-full shrink-0"
                                    :style="{ backgroundColor: servoOutputColor(i - 1) }"
                                />
                                <span>{{ i }}</span>
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
                                                :items="buildMotorPinOptions(motor)"
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
                                                :items="buildServoPinOptions(servo)"
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
import {
    readCli,
    parseResourceShow,
    parseTimerShow,
    parseDmaShow,
    parseTimerDump,
    discoverPadTimerOptions,
} from "@/js/utils/cliOneShot";
import { analyzeResources } from "@/js/utils/resourceAnalyzer";
import { mcuFamilyFromName } from "@/js/utils/mcuFamily";
import { resourceOptions, parseResourceOptionValue } from "@/js/utils/motorServoResourceCandidates";

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

// Smart resource analysis from a one-shot CLI scan (resource / timer / dma /
// per-pad timer AF discovery). Drives the timer-aware dropdown — pads with
// timer conflicts are dropped, peripherals get annotated, alt-AF candidates
// surface for the same pad. Loads asynchronously after the MSP2 panel data
// is ready; until it lands, dropdowns degrade to bare pin options +
// silkscreen labels via padDefaults alone.
const smartResourceAnalysis = ref(null);
const smartResourceLoading = ref(false);
const smartResourceError = ref(null);

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

// Build per-row dropdown options. resourceOptions() degrades gracefully:
//   - bundle padDefaults only (initial render): silkscreen labels work, no
//     timer-conflict drop yet (padTimers absent)
//   - smartResourceAnalysis loaded: full timer-aware candidate pool with
//     peripheral annotations and alt-AF entries
//   - nothing loaded: bare pin pass-through via fallbackPins
function effectiveAnalysis() {
    if (smartResourceAnalysis.value) return smartResourceAnalysis.value;
    if (padDefaults.value) return { padDefaults: padDefaults.value };
    return null;
}
function withNone(items) {
    if (items.some((i) => i.value === "NONE")) return items;
    return [{ value: "NONE", label: "NONE" }, ...items];
}
// Master stores the global Expert Mode toggle on `window.vm.expertMode`
// (App.vue seeds it from getConfig("expertMode")). When ON, the candidate
// pool expands beyond silkscreen-labeled pads to all PWM-capable pads.
function isExpertMode() {
    return Boolean(typeof window !== "undefined" && window.vm?.expertMode);
}
function buildMotorPinOptions(motor) {
    const opts = resourceOptions({
        kind: "motor",
        resource: motor,
        motorResources,
        servoResources,
        hardwareAnalysis: effectiveAnalysis(),
        fallbackPins: availablePins.value,
        allowLedStrip: true,
        expertMode: isExpertMode(),
    });
    return withNone(opts.map((o) => ({ value: o.value, label: o.label })));
}
function buildServoPinOptions(servo) {
    const opts = resourceOptions({
        kind: "servo",
        resource: servo,
        motorResources,
        servoResources,
        hardwareAnalysis: effectiveAnalysis(),
        fallbackPins: availablePins.value,
        allowLedStrip: true,
        expertMode: isExpertMode(),
    });
    return withNone(opts.map((o) => ({ value: o.value, label: o.label })));
}

// Run a one-shot CLI scan after the resource panel has populated. Reads
// `resource show`, `timer show`, `dma show`, `timer` and feeds them into
// the analyzer to produce padTimers, peripheral lists, free-pad inventory,
// and (via discoverPadTimerOptions) per-pad alt-AF candidates. Result
// flows through buildMotorPinOptions / buildServoPinOptions next render.
async function loadSmartResourceAnalysis() {
    if (!hasResourceData.value || smartResourceLoading.value) return;
    smartResourceLoading.value = true;
    smartResourceError.value = null;
    try {
        // Use readCli verbatim from the pre-rebase port — this is the path
        // that worked yesterday on TMTR_TMOTORF7 and exposes timer info,
        // alt-AF candidates, and the full peripheral picture.
        const resourceShow = await readCli("resource show");
        const timerShow = await readCli("timer show");
        const dmaShow = await readCli("dma show");
        const timerDump = await readCli("timer");

        const analysis = analyzeResources({
            resourceShow: parseResourceShow(resourceShow.lines),
            timerShow: parseTimerShow(timerShow.lines),
            dmaShow: parseDmaShow(dmaShow.lines),
            timerDump: parseTimerDump(timerDump.lines),
            serialPorts: FC.SERIAL_CONFIG?.ports || [],
            mcuFamily: mcuFamilyFromName(FC.MCU_INFO?.name),
        });

        smartResourceAnalysis.value = padDefaults.value ? { ...analysis, padDefaults: padDefaults.value } : analysis;

        const altAfPool = analysis.padTimers instanceof Map ? [...analysis.padTimers.keys()] : [];
        if (altAfPool.length > 0) {
            try {
                const padTimerOptions = await discoverPadTimerOptions(altAfPool);
                smartResourceAnalysis.value = padDefaults.value
                    ? { ...analysis, padDefaults: padDefaults.value, padTimerOptions }
                    : { ...analysis, padTimerOptions };
            } catch (afErr) {
                console.warn("Servos: alt-AF discovery failed", afErr);
            }
        }
    } catch (e) {
        console.warn("Servos: smart resource analysis failed", e);
        smartResourceError.value = e?.message ?? String(e);
    } finally {
        smartResourceLoading.value = false;
    }
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
// Trusts what `MSP2_MOTOR_SERVO_RESOURCE` reports verbatim — slots the
// firmware says are NONE stay NONE in the dropdown, since "NONE" is a
// real user choice (e.g. a 4-motor airplane with motors 5-8 unused).
// Silkscreen labels still appear on the dropdown OPTIONS via the smart
// picker so the user can identify and pick a default pad easily.
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
//
// Smart-picker dropdowns may emit encoded values like "C06:1" (pin:AF) when
// an option requires an alt-AF timer remap. We strip down to the bare pin
// here and write only the ioTag via MSP2 — the matching `timer <pad> AF<n>`
// CLI write is a follow-up; for now picking an alt-AF option is equivalent
// to picking the bare pin.
function onResourcePinChange(resourceType, resources, index, newValue) {
    const decoded = parseResourceOptionValue(newValue);
    const newPin = decoded?.pin ?? newValue;

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
            // Fire-and-forget the CLI scan; dropdowns degrade to bare pins
            // until it resolves, then upgrade to timer-aware candidates.
            loadSmartResourceAnalysis();
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
