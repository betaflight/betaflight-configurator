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
                                gridTemplateColumns: `minmax(6rem, max-content) repeat(3, minmax(5rem, auto)) repeat(${totalChannels}, 2.5rem) minmax(7rem, auto)`,
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

                            <!-- Data rows, in physical output order. Each row edits the
                                 firmware servo that output carries; servos the mixer
                                 doesn't drive come last, dimmed. -->
                            <template v-for="row in servoConfigRows" :key="row.target">
                                <div
                                    class="text-center text-sm py-1 whitespace-nowrap"
                                    :class="{ 'opacity-50': row.slot == null }"
                                >
                                    {{ row.label }}
                                </div>
                                <UInputNumber
                                    v-model="servoConfigs[row.target].min"
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
                                    v-model="servoConfigs[row.target].middle"
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
                                    v-model="servoConfigs[row.target].max"
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
                                        :checked="servoConfigs[row.target].indexOfChannelToForward === ch - 1"
                                        :aria-label="$t('servosForwardChannel', { channel: ch, servo: row.label })"
                                        @change="setChannelForward(row.target, ch - 1, $event)"
                                    />
                                </div>
                                <USelect
                                    v-model="servoConfigs[row.target].rate"
                                    :items="rateOptions"
                                    class="w-full"
                                    @change="onServoChange"
                                />
                            </template>
                        </div>
                    </div>

                    <p v-if="cliTargetMap" class="text-xs text-muted mt-2">
                        {{ $t("servosCliServoHint", { map: cliTargetMap }) }}
                    </p>

                    <div class="flex items-center gap-2 mt-3">
                        <USwitch v-model="liveMode" size="xs" />
                        <span class="text-sm">{{ $t("servosLiveMode") }}</span>
                    </div>
                </UiBox>

                <!-- Servo mixer rules (smix). Only the set the firmware runs is shown:
                     built-in rules on preset mixers, the custom list on custom mixers. -->
                <UiBox
                    v-if="builtinRules || editsCustomRules"
                    :title="$t('servosMixerRulesTitle')"
                    type="neutral"
                    collapsible
                >
                    <p class="text-sm text-muted mb-2">{{ $t("servosMixerRulesDesc") }}</p>
                    <p v-if="cliTargetMap" class="text-xs text-muted mb-2">
                        {{ $t("servosMixerCliHint", { map: cliTargetMap }) }}
                    </p>

                    <!-- Preset mixers (AIRPLANE, FLYING_WING, TRI, ...) run rules built into
                         the firmware; MSP_SERVO_MIX_RULES only returns the custom list, so
                         the built-in set is shown read-only. -->
                    <div v-if="builtinRules" class="mb-3">
                        <p class="text-xs text-muted mb-1">{{ $t("servosMixerBuiltinHint") }}</p>
                        <div
                            class="grid items-center gap-x-2 gap-y-1 min-w-0 text-sm"
                            style="grid-template-columns: 2rem 9rem 10rem repeat(4, minmax(4rem, 1fr))"
                        >
                            <div class="text-center text-xs font-bold py-1">#</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerOutput") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerInput") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerRate") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerSpeed") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerMin") }}</div>
                            <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerMax") }}</div>
                            <template v-for="(rule, idx) in builtinRules" :key="'builtin' + idx">
                                <div class="text-center text-muted py-1">{{ idx + 1 }}</div>
                                <div class="truncate">{{ servoOutputLabel(rule.target, mixerMode) }}</div>
                                <div class="truncate">{{ SERVO_MIX_INPUT_LABELS[rule.input] }}</div>
                                <div class="text-center">{{ rule.rate }}</div>
                                <div class="text-center">{{ rule.speed }}</div>
                                <div class="text-center">{{ rule.min }}</div>
                                <div class="text-center">{{ rule.max }}</div>
                            </template>
                        </div>
                    </div>

                    <template v-if="editsCustomRules">
                        <div
                            v-if="mixerLoadFailed"
                            class="text-xs rounded p-2 mb-2 bg-red-500/10 text-red-400 border border-red-500/30"
                        >
                            {{ $t("servosMixerLoadFailed") }}
                        </div>

                        <div class="overflow-x-auto">
                            <div
                                v-if="servoMixRules.length > 0"
                                class="grid items-center gap-x-2 gap-y-1 min-w-0"
                                style="
                                    grid-template-columns:
                                        2rem 9rem 10rem minmax(4rem, 1fr) minmax(4rem, 1fr) minmax(4rem, 1fr)
                                        minmax(4rem, 1fr) 7rem 2rem;
                                "
                            >
                                <div class="text-center text-xs font-bold py-1">#</div>
                                <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerOutput") }}</div>
                                <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerInput") }}</div>
                                <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerRate") }}</div>
                                <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerSpeed") }}</div>
                                <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerMin") }}</div>
                                <div class="text-center text-xs font-bold py-1">{{ $t("servosMixerMax") }}</div>
                                <div class="text-center text-xs font-bold py-1" :title="$t('servosMixerBoxHelp')">
                                    {{ $t("servosMixerBox") }}
                                </div>
                                <div></div>

                                <template v-for="(rule, idx) in servoMixRules" :key="idx">
                                    <div class="text-center text-sm py-1">{{ idx + 1 }}</div>
                                    <USelect
                                        v-model="rule.target"
                                        :items="servoMixOutputItems"
                                        size="xs"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <USelect
                                        v-model="rule.input"
                                        :items="servoMixInputItems"
                                        size="xs"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <UInputNumber
                                        v-model="rule.rate"
                                        :min="SERVO_MIX_RATE_MIN"
                                        :max="SERVO_MIX_RATE_MAX"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <UInputNumber
                                        v-model="rule.speed"
                                        :min="0"
                                        :max="255"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <UInputNumber
                                        v-model="rule.min"
                                        :min="SERVO_MIX_MIN"
                                        :max="SERVO_MIX_MAX"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <UInputNumber
                                        v-model="rule.max"
                                        :min="SERVO_MIX_MIN"
                                        :max="SERVO_MIX_MAX"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <USelect
                                        v-model="rule.box"
                                        :items="servoMixBoxItems"
                                        size="xs"
                                        class="w-full"
                                        @change="onMixRuleChange"
                                    />
                                    <UButton
                                        icon="i-lucide-x"
                                        color="error"
                                        variant="ghost"
                                        size="xs"
                                        :title="$t('servosMixerDeleteRule')"
                                        @click="removeServoMixRule(idx)"
                                    />
                                </template>
                            </div>
                            <div v-else class="text-sm text-muted italic py-2 text-center">
                                {{ $t("servosMixerNoRules") }}
                            </div>
                        </div>

                        <div class="flex items-center gap-2 mt-3">
                            <UButton
                                :label="$t('servosMixerAddRule')"
                                icon="i-lucide-plus"
                                size="xs"
                                variant="outline"
                                :disabled="servoMixRules.length >= MAX_SERVO_RULES || mixerLoadFailed"
                                @click="addServoMixRule"
                            />
                            <span class="text-xs text-muted ml-auto">
                                {{ servoMixRules.length }} / {{ MAX_SERVO_RULES }}
                            </span>
                        </div>
                    </template>
                </UiBox>

                <!-- Servo visualization bars, one per physical output, showing the
                     firmware servo that output carries on the active mixer. -->
                <UiBox :title="$t('servosText')" type="neutral" collapsible>
                    <ul class="grid grid-cols-8 gap-2 mb-1">
                        <li
                            v-for="i in 8"
                            :key="'title' + i"
                            class="text-center text-xs font-bold"
                            :class="{ 'opacity-50': slotServoValue(i - 1) == null }"
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
                            :class="{ 'opacity-40': slotServoValue(i - 1) == null }"
                            :style="{ '--bar-opacity': getBarOpacity(slotServoValue(i - 1) ?? 1500) }"
                        >
                            <div class="absolute inset-x-0 bottom-[45px] z-10 text-center text-[10px] font-bold">
                                {{ slotServoValue(i - 1) ?? "-" }}
                            </div>
                            <UProgress
                                orientation="vertical"
                                inverted
                                :model-value="getBarHeight(slotServoValue(i - 1) ?? 1000)"
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
                    :disabled="(!configHasChanged && !mixerDirty) || mixerLoadFailed"
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
import GUI from "@/js/gui";
import FC from "@/js/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { isMspCancelled } from "@/js/msp/mspErrors";
import { gui_log } from "@/js/gui_log";
import { useInterval } from "@/composables/useInterval";
import { useTimeout } from "@/composables/useTimeout";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";
import { clamp } from "@/js/utils/common";
import {
    SERVO_MIX_INPUT_LABELS,
    SERVO_MIX_BOX_LABELS,
    SERVO_MIX_INPUT_STABILIZED_THROTTLE,
    SERVO_MIX_MIN,
    SERVO_MIX_MAX,
    SERVO_MIX_RATE_MIN,
    SERVO_MIX_RATE_MAX,
    MAX_SERVO_RULES,
    activeServoMixRules,
    builtinServoMixRules,
    invalidServoMixRules,
    makeServoMixRule,
    padServoMixRulesToMax,
    pwmSlotToServoIndex,
    servoMixOutputEnumName,
    servoOutputItems,
    servoTargetToSlot,
    usesCustomServoRules,
} from "@/js/utils/servoMixerModel";
import type { ServoConfig, ServoRule } from "@/stores/fc.types";

/** The editable part of a servo's FC config. */
type ServoEdit = Omit<ServoConfig, "reversedInputSources">;

const { t } = useTranslation();

const isSupported = ref(false);
const liveMode = ref(false);
const servoConfigs = reactive<ServoEdit[]>([]);
const servoData = reactive<number[]>([]);
const originalConfigs = ref("");

// Custom servo mixer rules, staged locally until Save.
const servoMixRules = reactive<ServoRule[]>([]);
const mixerDirty = ref(false);
// Set when MSP_SERVO_MIX_RULES couldn't be parsed: the FC's rules are unknown,
// so Save stays disabled rather than overwrite them with an empty list.
const mixerLoadFailed = ref(false);

const { addInterval } = useInterval();
const { addTimeout } = useTimeout();
const { isSaving, runSave } = useSaving();
const { saveToEeprom } = useReboot();

const totalChannels = computed(() => FC.RC?.active_channels || 8);
const auxChannelCount = computed(() => Math.max(0, totalChannels.value - 4));
const configHasChanged = computed(() => originalConfigs.value !== JSON.stringify(servoConfigs));
const mixerMode = computed(() => FC.MIXER_CONFIG?.mixer ?? null);

// Rate options: 100% down to -100%, as {value, label} for USelect
const rateOptions = computed(() => {
    const opts: { value: number; label: string }[] = [];
    for (let i = 100; i > -101; i--) {
        opts.push({ value: i, label: `${t("servosRate")} ${i}%` });
    }
    return opts;
});

function forwardedServos(configs: Array<{ indexOfChannelToForward?: number }>) {
    return configs
        .map((cfg, i) => (cfg.indexOfChannelToForward == null || cfg.indexOfChannelToForward === 255 ? -1 : i))
        .filter((i) => i >= 0);
}

function servoTiltEnabled() {
    return FC.FEATURE_CONFIG?.features?.isEnabled("SERVO_TILT") ?? false;
}

// Channel forwarding moves servos onto physical outputs (firmware
// writeServos), so the output layout follows the edited configs.
function slotLayoutOptions() {
    return { servoTilt: servoTiltEnabled(), forwardedServos: forwardedServos(servoConfigs) };
}

// Change-direction rows in physical output order. Ordered from the saved
// config rather than the live edits, so ticking a forwarding box doesn't make
// rows jump mid-click; the order settles on Save.
const servoConfigRows = computed(() => {
    const options = { servoTilt: servoTiltEnabled(), forwardedServos: forwardedServos(FC.SERVO_CONFIG ?? []) };
    return servoOutputItems(mixerMode.value, options)
        .filter((item) => item.target < servoConfigs.length)
        .map((item) => ({
            ...item,
            label: item.slot == null ? t("servosOutputUnused") : t("servosMixerOutputServo", { index: item.slot + 1 }),
        }));
});

// The custom rule list only runs on CUSTOM_AIRPLANE / CUSTOM_TRI, so it is
// only shown and edited there.
const editsCustomRules = computed(() => usesCustomServoRules(mixerMode.value));

// Label a firmware servo target by the physical output carrying it ("Servo 1"
// = first servo output). Targets the mixer doesn't drive keep their firmware
// name so CLI users can still find them.
function servoOutputLabel(target: number, mixer: number | null) {
    const slot = servoTargetToSlot(target, mixer, slotLayoutOptions());
    if (slot != null) {
        return t("servosMixerOutputServo", { index: slot + 1 });
    }
    return t("servosMixerOutputNotDriven", { name: servoMixOutputEnumName(target, mixer) ?? `S${target + 1}` });
}

// Output dropdown: driven outputs in physical order, undriven targets last
// and disabled.
const servoMixOutputItems = computed(() =>
    servoOutputItems(mixerMode.value, slotLayoutOptions()).map((item) => ({
        value: item.target,
        label: servoOutputLabel(item.target, mixerMode.value),
        disabled: item.slot == null,
    })),
);
// The CLI servo and smix commands take the firmware servo index, not the
// output number the tab shows; spell out the mapping for the active mixer.
const cliTargetMap = computed(() =>
    servoOutputItems(mixerMode.value, slotLayoutOptions())
        .filter((item) => item.slot != null)
        .map((item) => `${t("servosMixerOutputServo", { index: (item.slot ?? 0) + 1 })} = ${item.target}`)
        .join(", "),
);
const servoMixInputItems = computed(() => SERVO_MIX_INPUT_LABELS.map((label, i) => ({ value: i, label })));
const servoMixBoxItems = computed(() => SERVO_MIX_BOX_LABELS.map((label, i) => ({ value: i, label })));

// Built-in rules of the active preset mixer (null on custom mixers and
// multirotors). The STABILIZED_THROTTLE rule (AIRPLANE / FLYING_WING) drives
// a throttle servo for IC engines; on electric planes it only confuses, so it
// is not listed.
const builtinRules = computed(
    () =>
        builtinServoMixRules(mixerMode.value)?.filter((rule) => rule.input !== SERVO_MIX_INPUT_STABILIZED_THROTTLE) ??
        null,
);

function addServoMixRule() {
    if (servoMixRules.length >= MAX_SERVO_RULES) {
        return;
    }
    // Start on the first driven output no rule uses yet, else the first driven one.
    const driven = servoMixOutputItems.value.filter((item) => !item.disabled);
    const used = new Set(servoMixRules.map((rule) => rule.target));
    const target = (driven.find((item) => !used.has(item.value)) ?? driven[0])?.value ?? 0;
    servoMixRules.push(makeServoMixRule(target, 0, 100));
    mixerDirty.value = true;
}

function removeServoMixRule(idx: number) {
    servoMixRules.splice(idx, 1);
    mixerDirty.value = true;
}

function onMixRuleChange() {
    mixerDirty.value = true;
}

function loadServoMixRules() {
    servoMixRules.length = 0;
    mixerDirty.value = false;
    mixerLoadFailed.value = FC.SERVO_RULES_PARSE_OK === false;
    if (mixerLoadFailed.value) {
        gui_log(t("servosMixerLoadFailed"));
        return;
    }
    servoMixRules.push(...activeServoMixRules(FC.SERVO_RULES));
}

// Firmware servo carried by physical output `slotIndex`; MSP_SERVO reports
// values by firmware servo index, so the bars read through this.
function slotServoValue(slotIndex: number) {
    const idx = pwmSlotToServoIndex(slotIndex, mixerMode.value, slotLayoutOptions());
    return idx == null ? null : (servoData[idx] ?? 1500);
}

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

// Marshal reactive servoConfigs into FC.SERVO_CONFIG (clamping min/middle/max) so the
// values sent over MSP match the UI. Also normalizes the reactive values in place.
function marshalServoConfigs() {
    const SERVO_MIN = 500;
    const SERVO_MAX = 2500;

    for (let i = 0; i < servoConfigs.length; i++) {
        const src = servoConfigs[i];
        const cfg = FC.SERVO_CONFIG[i];

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

// Live-mode preview: push the current servo config to the FC without persisting.
// sendServoConfigurations is now error-aware/async; this is fire-and-forget preview, so
// ignore a benign queue-clear cancellation on tab switch but still log genuine failures.
// Mixer rules stay staged until Save.
function updateServos() {
    marshalServoConfigs();
    mspHelper.sendServoConfigurations().catch((error) => {
        if (!isMspCancelled(error)) {
            console.error("Failed to update servo configuration", error);
        }
    });
}

function saveServoConfig() {
    if (mixerLoadFailed.value) {
        return;
    }
    // MSP_SET_SERVO_MIX_RULE stores whatever it gets, so refuse rules the
    // firmware wouldn't run as shown.
    const invalid = mixerDirty.value ? invalidServoMixRules(servoMixRules) : [];
    if (invalid.length > 0) {
        gui_log(t("servosMixerRulesInvalid", { rules: invalid.map((i) => i + 1).join(", ") }));
        return;
    }
    return runSave(async () => {
        marshalServoConfigs();
        await mspHelper.sendServoConfigurations();
        // Only rewrite the rules when they were edited; padded to
        // MAX_SERVO_RULES so removed rules are cleared too.
        if (mixerDirty.value) {
            FC.SERVO_RULES = padServoMixRulesToMax(servoMixRules);
            await mspHelper.sendServoMixRules();
        }
        await saveToEeprom();
        // saveToEeprom() already emits the shared "EEPROM saved" toast; servosEepromSave
        // resolved to the same string, so it's dropped here to avoid a duplicate.
        originalConfigs.value = JSON.stringify(servoConfigs);
        mixerDirty.value = false;
    });
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
        // Mixer mode and SERVO_TILT decide which firmware servo each physical
        // output carries; don't rely on another tab having loaded them.
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
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

    loadServoMixRules();

    addInterval("servo_data_pull", getServoData, 50);
    addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);

    GUI.content_ready();
}

onMounted(() => {
    loadServoData();
});
</script>
