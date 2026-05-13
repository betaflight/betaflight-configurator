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
                                    <span>{{ $t(`servoNumber${index + 1}`) }}</span>
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
                                            <div
                                                class="text-sm py-1 flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                                <span
                                                    class="inline-block size-2 rounded-full shrink-0"
                                                    :style="{ backgroundColor: motorDotColor(motor.index) }"
                                                />
                                                <span>{{
                                                    $t("servosResourceMotorLabel", { index: motor.index + 1 })
                                                }}</span>
                                            </div>
                                            <USelect
                                                :model-value="encodedPinValue(motor)"
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
                                            <div
                                                class="text-sm py-1 flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                                <span
                                                    v-if="servoDotColor(servo.index)"
                                                    class="inline-block size-2 rounded-full shrink-0"
                                                    :style="{ backgroundColor: servoDotColor(servo.index) }"
                                                />
                                                <span
                                                    class="opacity-100"
                                                    :class="{ 'opacity-50': !servoDotColor(servo.index) }"
                                                    >{{
                                                        $t("servosResourceServoLabel", { index: servo.index + 1 })
                                                    }}</span
                                                >
                                            </div>
                                            <USelect
                                                :model-value="encodedPinValue(servo)"
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
                    :disabled="(!configHasChanged && !resourcesModified) || resourcesWriteInFlight"
                    color="warning"
                    variant="solid"
                    class="!bg-[#ffbb00] !text-zinc-900 hover:!bg-[#e6a800] disabled:!bg-zinc-600 disabled:!text-zinc-400"
                    @click="saveServoConfig"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from "vue";
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
import {
    resourceOptions,
    parseResourceOptionValue,
    encodeResourceOptionValue,
} from "@/js/utils/motorServoResourceCandidates";

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
// onResourcePinChange does several awaited CLI writes (release lines, alt-AF
// remap) before the MSP bind. While those are in flight, the user must not
// (a) trigger another pin change on the same row — re-entry would race
// against a stale `previous` snapshot — or (b) click Save, which would write
// EEPROM mid-sequence and persist a half-applied state.
const resourcesWriteInFlight = ref(false);
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
// loadSmartResourceAnalysis runs ~1.25s of CLI scans plus an alt-AF
// discovery pass. If the user navigates away mid-scan we want to drop the
// trailing ref writes so we don't poke an unmounted component's reactive
// state.
const isMounted = ref(true);
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
    return Array.from(pins).sort((a, b) => a.localeCompare(b));
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
    if (idx == null) {
        return null;
    }
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
                // EEPROM persist is the commit point for the resource binds
                // we wrote to firmware RAM during onResourcePinChange — clear
                // the dirty flag so the Save button doesn't stay lit and
                // re-clicking doesn't pointlessly rewrite the same set.
                resourcesModified.value = false;
            });
        }
    });
}

function saveServoConfig() {
    // Refuse Save while a pin-change CLI sequence is mid-flight; otherwise
    // writeConfiguration() would persist EEPROM before the release/remap/
    // bind chain finishes. The Save button's disabled binding already gates
    // this, but cover the keyboard-shortcut / programmatic path too.
    if (resourcesWriteInFlight.value) {
        return;
    }
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
    if (smartResourceAnalysis.value) {
        return smartResourceAnalysis.value;
    }
    if (padDefaults.value) {
        return { padDefaults: padDefaults.value };
    }
    return null;
}
function withNone(items) {
    if (items.some((i) => i.value === "NONE")) {
        return items;
    }
    return [{ value: "NONE", label: "NONE" }, ...items];
}
// Master stores the global Expert Mode toggle on `window.vm.expertMode`
// (App.vue seeds it from getConfig("expertMode")). When ON, the candidate
// pool expands beyond silkscreen-labeled pads to all PWM-capable pads.
function isExpertMode() {
    return Boolean(typeof window !== "undefined" && window.vm?.expertMode);
}
// A pin can only drive one PWM output at a time. Drop dropdown options
// whose pin is already bound to another row, UNLESS the option carries a
// `resource <peripheral> NONE` release line in `requiresRelease` — those
// are the smart picker's deliberate "swap with these CLI changes"
// candidates and should remain selectable. We check the release lines
// rather than the source string so alt-AF entries that ALSO release a
// peripheral (source === "alt-af") are kept too.
// True when any row in `resources` already binds `pin`, ignoring the
// caller's own row (`currentResource`) when its kind matches the row's
// list. Lets isOptionViable short-circuit to "not viable" without
// duplicating the same loop body twice.
function isPinClaimedByOtherResource(pin, resources, kind, currentResource, currentKind) {
    for (const r of resources) {
        if (kind === currentKind && r.index === currentResource.index) {
            continue;
        }
        if (r.pin === pin && r.pin !== "NONE") {
            return true;
        }
    }
    return false;
}

function isOptionViable(option, currentResource, kind) {
    if (option.value === "NONE") {
        return true;
    }
    const hasReleaseStep = (option.requiresRelease ?? []).some((line) =>
        /^resource (MOTOR|SERVO|LED_STRIP|SERIAL_)/i.test(line),
    );
    if (hasReleaseStep) {
        return true;
    }
    const decoded = parseResourceOptionValue(option.value);
    const pin = decoded?.pin ?? option.value;
    if (!pin || pin === "NONE") {
        return true;
    }
    if (isPinClaimedByOtherResource(pin, motorResources, "motor", currentResource, kind)) {
        return false;
    }
    if (isPinClaimedByOtherResource(pin, servoResources, "servo", currentResource, kind)) {
        return false;
    }
    return true;
}
// UARTs the picker is allowed to release for PWM. Default surfaces the
// analyzer's "no function assigned" list only — UARTs already running MSP,
// GPS, telemetry, etc. stay off the table so non-expert pilots can't
// accidentally unbind them. Expert Mode widens to every UART the analyzer
// reports; release is gated on the user opting in. Without this whitelist
// the uart-release path in candidatePadsForSlot is unreachable from the UI.
//
// Caveat: the analyzer's `serials` list is built from CLI `resource show`
// parsing, so it only includes UARTs whose pin is currently bound (either
// by user config in Ports tab or by the firmware target's defaults). A
// "fresh" board with every UART unbound shows nothing here even in expert
// mode — to surface every hardware UART unconditionally we'd need to merge
// in `target-defaults.json` serial pads, which the unified-targets bundle
// doesn't carry today. Deferred since most STM32F7 UART pins lack a
// PWM-capable alt AF anyway and the picker's PWM-capability filter would
// drop them.
function spareUartReleaseWhitelist() {
    const source = isExpertMode() ? effectiveAnalysis()?.serials : effectiveAnalysis()?.spareUarts;
    if (!Array.isArray(source)) {
        return [];
    }
    return source.map((u) => u?.index).filter((idx) => typeof idx === "number");
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
        allowUartRelease: spareUartReleaseWhitelist(),
        expertMode: isExpertMode(),
    });
    return withNone(
        opts.filter((o) => isOptionViable(o, motor, "motor")).map((o) => ({ value: o.value, label: o.label })),
    );
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
        allowUartRelease: spareUartReleaseWhitelist(),
        expertMode: isExpertMode(),
    });
    return withNone(
        opts.filter((o) => isOptionViable(o, servo, "servo")).map((o) => ({ value: o.value, label: o.label })),
    );
}

// Run a one-shot CLI scan after the resource panel has populated. Reads
// `resource show`, `timer show`, `dma show`, `timer` and feeds them into
// the analyzer to produce padTimers, peripheral lists, free-pad inventory,
// and (via discoverPadTimerOptions) per-pad alt-AF candidates. Result
// flows through buildMotorPinOptions / buildServoPinOptions next render.
// Issues the four read-only CLI scans (resource/timer/dma + timer dump) with
// inter-command throttling and feeds the parsed pieces into analyzeResources.
// 500ms initial settle + 250ms between commands matches the pre-rebase
// quiescence-timer budget and gives the FC time to drain its CLI buffer
// between back-to-back reads.
// Unmount-aware short-circuit: the scan is four awaited readCli calls plus
// three throttle waits, then a per-pad discoverPadTimerOptions loop. Without
// an explicit check between each await, an unmount mid-scan keeps queueing
// CLI commands that bleed into whatever the next tab is doing on the same
// MSP/CLI connection. The check returns null on cancel; the caller treats
// that the same as a hard failure (no analysis published).
async function runResourceCliScans() {
    if (!isMounted.value) {
        return null;
    }
    await wait(500);
    if (!isMounted.value) {
        return null;
    }
    const resourceShow = await readCli("resource show");
    if (!isMounted.value) {
        return null;
    }
    await wait(250);
    if (!isMounted.value) {
        return null;
    }
    const timerShow = await readCli("timer show");
    if (!isMounted.value) {
        return null;
    }
    await wait(250);
    if (!isMounted.value) {
        return null;
    }
    const dmaShow = await readCli("dma show");
    if (!isMounted.value) {
        return null;
    }
    await wait(250);
    if (!isMounted.value) {
        return null;
    }
    const timerDump = await readCli("timer");
    if (!isMounted.value) {
        return null;
    }
    return analyzeResources({
        resourceShow: parseResourceShow(resourceShow.lines),
        timerShow: parseTimerShow(timerShow.lines),
        dmaShow: parseDmaShow(dmaShow.lines),
        timerDump: parseTimerDump(timerDump.lines),
        serialPorts: FC.SERIAL_CONFIG?.ports || [],
        mcuFamily: mcuFamilyFromName(FC.MCU_INFO?.name),
    });
}

// Collects pads the picker can actually surface: bound motor/servo pins,
// free PWM pads from the analyzer, and the silkscreen pool from padDefaults.
// Used to filter alt-AF discovery so we don't run `timer <pad> list` against
// every pad in the timer dump (~30+ on full STM32F7 boards = 6-8s of CLI
// scan against candidates the user can never pick).
function collectCandidatePads(analysis) {
    const pads = new Set();
    // Expert mode: also feed every pad the analyzer knows a timer for
    // into the alt-AF discovery pool. The non-expert pool deliberately
    // stays narrow (current bindings + free + silkscreen) so the CLI
    // scan stays fast on big boards; Expert Mode users have explicitly
    // opted into the longer scan in exchange for surfacing alt-AF
    // variants of peripheral-owned PWM pads (UART/LED/etc) that those
    // rows would otherwise only see in their default-AF form.
    if (isExpertMode() && analysis?.padTimers instanceof Map) {
        for (const pad of analysis.padTimers.keys()) {
            if (pad) {
                pads.add(pad);
            }
        }
    }
    for (const m of motorResources) {
        if (m.pin && m.pin !== "NONE") {
            pads.add(m.pin);
        }
    }
    for (const s of servoResources) {
        if (s.pin && s.pin !== "NONE") {
            pads.add(s.pin);
        }
    }
    for (const p of analysis.pwmCapableFreePads ?? []) {
        if (p?.pad) {
            pads.add(p.pad);
        }
    }
    for (const m of padDefaults.value?.motors ?? []) {
        if (m?.pad) {
            pads.add(m.pad);
        }
    }
    for (const ls of padDefaults.value?.ledStrips ?? []) {
        if (ls?.pad) {
            pads.add(ls.pad);
        }
    }
    // UART TX/RX pads — let alt-AF discovery scan them so pads currently
    // owned by a USART AF can surface their latent timer AF options.
    // Without this a UART pad with no timer AF in `timer show` (e.g. PA9
    // USART1_TX on TMOTORF7, ~22/48 F4 UART pads) is invisible to the
    // picker even when `timer <pad> list` would report a usable PWM AF.
    // The downstream PWM-capability filter in padRecommender accepts any
    // pad that has padTimerOptions entries, so this single union unlocks
    // alt-AF rescue for UART release across F4/F7/H7/G4 fleets.
    for (const srl of analysis?.serials ?? []) {
        if (srl?.txPad) {
            pads.add(srl.txPad);
        }
        if (srl?.rxPad) {
            pads.add(srl.rxPad);
        }
    }
    return pads;
}

// Runs `timer <pad> list` against the candidate pool to discover alt-AF
// options and merges them into the published analysis. No-op when no
// candidates have a known timer/AF pool. Returns true if discovery ran
// (even if empty); false if the component unmounted mid-scan.
async function runAltAfDiscovery(analysis) {
    const candidatePads = collectCandidatePads(analysis);
    const altAfPool =
        analysis.padTimers instanceof Map ? [...analysis.padTimers.keys()].filter((pad) => candidatePads.has(pad)) : [];
    if (altAfPool.length === 0) {
        return true;
    }
    try {
        const padTimerOptions = await discoverPadTimerOptions(altAfPool, {
            shouldContinue: () => isMounted.value,
        });
        if (!isMounted.value) {
            return false;
        }
        smartResourceAnalysis.value = padDefaults.value
            ? { ...analysis, padDefaults: padDefaults.value, padTimerOptions }
            : { ...analysis, padTimerOptions };
    } catch (afErr) {
        console.warn("Servos: alt-AF discovery failed", afErr);
    }
    return true;
}

async function loadSmartResourceAnalysis() {
    if (!hasResourceData.value || smartResourceLoading.value) {
        return;
    }
    smartResourceLoading.value = true;
    smartResourceError.value = null;
    try {
        const analysis = await runResourceCliScans();
        // runResourceCliScans returns null when the scan was short-circuited
        // by an unmount mid-flight. Skip publishing anything and bail cleanly.
        if (!analysis || !isMounted.value) {
            return;
        }
        smartResourceAnalysis.value = padDefaults.value ? { ...analysis, padDefaults: padDefaults.value } : analysis;
        if (!(await runAltAfDiscovery(analysis))) {
            return;
        }
    } catch (e) {
        console.warn("Servos: smart resource analysis failed", e);
        if (isMounted.value) {
            smartResourceError.value = e?.message ?? String(e);
        }
    } finally {
        if (isMounted.value) {
            smartResourceLoading.value = false;
        }
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
// Drains an FC resource list into a target reactive array, also adding any
// real (non-"NONE") pins to the seed Set used to build initialPins.
function drainResources(sourceList, targetArray, pinsSet) {
    targetArray.length = 0;
    if (!sourceList || sourceList.length === 0) {
        return;
    }
    for (const resource of sourceList) {
        targetArray.push({ ...resource });
        if (resource.pin && resource.pin !== "NONE") {
            pinsSet.add(resource.pin);
        }
    }
}

function loadResourceData() {
    const pins = new Set();
    drainResources(FC.MOTOR_RESOURCES, motorResources, pins);
    drainResources(FC.SERVO_RESOURCES, servoResources, pins);
    initialPins.value = Array.from(pins).sort((a, b) => a.localeCompare(b));
    hasResourceData.value = motorResources.length > 0 || servoResources.length > 0;
    resourcesModified.value = false;
}

// Shared handler for motor (resourceType 0) and servo (resourceType 1) pin updates.
//
// Smart-picker dropdowns may emit encoded values like "C06@AF1" (pin@AF<n>)
// when an option requires an alt-AF timer remap — same encoding produced by
// encodeResourceOptionValue / parsed by parseResourceOptionValue in
// motorServoResourceCandidates.js. We decode here and:
//   1. If the option specifies an alt AF, send `timer <pad> AF<n>` via CLI
//      first so the pad is on the correct timer when the new ioTag binds.
//   2. Write the ioTag via MSP2_SET_MOTOR_SERVO_RESOURCE.
// Both writes land in firmware RAM immediately; clicking Save persists them
// to EEPROM via mspHelper.writeConfiguration so they survive reboot.
// Mirrors a `resource MOTOR/SERVO N NONE` release into the matching local
// reactive row so the UI doesn't claim a binding the FC just dropped.
// LED_STRIP and SERIAL_TX/RX releases don't have local rows here — the FC
// state alone is the source of truth for those.
function mirrorReleaseToLocalRow(line) {
    const motorRel = /^resource MOTOR (\d+) NONE/i.exec(line);
    if (motorRel) {
        const releasedIndex = Number(motorRel[1]) - 1;
        const target = motorResources.find((m) => m.index === releasedIndex);
        if (target) {
            target.pin = "NONE";
            target.ioTag = 0;
            target.af = null;
        }
        return;
    }
    const servoRel = /^resource SERVO (\d+) NONE/i.exec(line);
    if (servoRel) {
        const releasedIndex = Number(servoRel[1]) - 1;
        const target = servoResources.find((s) => s.index === releasedIndex);
        if (target) {
            target.pin = "NONE";
            target.ioTag = 0;
            target.af = null;
        }
    }
}

// Inter-command throttle helper. Master's send_cli_command queue serializes
// commands but the FC needs a beat to drain its CLI buffer between back-to-
// back writes; without it, later commands occasionally come back with stale
// or partial output. Shared by loadSmartResourceAnalysis and the release
// loop in onResourcePinChange.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// readCli only rejects on transport timeout. When the FC accepts the
// round-trip but the COMMAND itself fails (e.g. unknown pin, locked
// resource), the response comes back with an error line in `lines`/`raw`.
// We need to inspect the payload before treating the write as successful;
// otherwise mirrorReleaseToLocalRow runs, the UI shows the row as released,
// and the FC still holds the binding. BF surfaces these errors with a
// handful of recognizable prefixes ("Invalid", "Unknown", "ERR", "Cannot",
// or "syntax error"); match defensively across them.
const CLI_ERROR_RE = /(?:^|\b)(invalid|unknown|err(?:or)?\b|cannot|syntax error|failed)/i;
function cliResponseHasError(result) {
    if (!result || typeof result !== "object") {
        return false;
    }
    const lines = Array.isArray(result.lines) ? result.lines : [];
    return lines.some((line) => typeof line === "string" && CLI_ERROR_RE.test(line));
}

// Runs one release line against the FC. Returns true on success.
async function applyReleaseLine(line) {
    let result;
    try {
        result = await readCli(line);
    } catch (e) {
        console.warn(`Servos: ${line} failed`, e);
        return false;
    }
    if (cliResponseHasError(result)) {
        console.warn(`Servos: ${line} returned a CLI error`, result?.raw ?? result);
        return false;
    }
    mirrorReleaseToLocalRow(line);
    return true;
}

// Issues `timer <pad> AF<n>` to remap the pad to its alt timer/channel.
// Returns true on success.
async function applyAfRemap(pad, af) {
    const cmd = `timer ${pad} AF${af}`;
    let result;
    try {
        result = await readCli(cmd);
    } catch (e) {
        console.warn(`Servos: ${cmd} write failed`, e);
        return false;
    }
    if (cliResponseHasError(result)) {
        console.warn(`Servos: ${cmd} returned a CLI error`, result?.raw ?? result);
        return false;
    }
    return true;
}

async function onResourcePinChange(resourceType, resources, index, newValue) {
    // Re-entrancy guard. The release/remap chain has multiple awaits; if the
    // user picks again on the same row before this finishes, the second call
    // would race against the first's stale `previous` snapshot and leave UI
    // and FC RAM out of sync. Global flag (rather than per-row) so Save can
    // also see "any pin change in flight" — see resourcesWriteInFlight gate.
    // Global connection lock + tab-local in-flight gate together ensure
    // the release → timer remap → MSP bind sequence runs as an atomic unit:
    //   - resourcesWriteInFlight prevents re-entry from the same tab
    //     (rapid dropdown picks on different rows)
    //   - GUI.connect_lock blocks tab switches and other long-running
    //     connection work (firmware flasher, OSD font upload, etc.) so
    //     no other writer can interleave its own CLI/MSP traffic with
    //     ours mid-sequence
    if (resourcesWriteInFlight.value || GUI.connect_lock) {
        return;
    }
    resourcesWriteInFlight.value = true;
    GUI.connect_lock = true;
    try {
        // Snapshot the previous binding so we can roll back if any prerequisite
        // CLI step (release line, alt-AF remap) fails — without rollback the
        // UI would claim a binding firmware never accepted.
        const previous = { pin: resources[index].pin, ioTag: resources[index].ioTag, af: resources[index].af };

        const decoded = parseResourceOptionValue(newValue);
        const newPin = decoded?.pin ?? newValue;
        const newAf = decoded?.af ?? null;
        const ioTag = newPin === "NONE" ? 0 : mspHelper.pinToIoTag(newPin);
        // pinToIoTag now returns null (not 0) when the pin name is
        // unparseable — fail fast rather than silently sending ioTag=0 which
        // the FC would accept as a NONE release. Should never trip in
        // practice (the dropdown only emits validated pad names), but it's
        // the cheap safeguard CR asked for and rules out stale-state regressions.
        if (newPin !== "NONE" && ioTag == null) {
            console.warn(`Servos: pinToIoTag rejected "${newPin}" — aborting bind`);
            return;
        }

        // Re-resolve the picked option to recover its `requiresRelease` list.
        // <USelect> sees only {value,label}, so the prerequisite CLI lines
        // (e.g. `resource MOTOR 3 NONE`, `resource LED_STRIP 1 NONE`,
        // `resource SERIAL_TX 4 NONE`) need to be looked up here. Without
        // running them before the bind, picking a "releases MOTOR N" / LED /
        // UART candidate would leave the old claim dangling and the FC would
        // either reject the new bind or carry duplicate claims.
        const allOpts = resourceOptions({
            kind: resourceType === 0 ? "motor" : "servo",
            resource: resources[index],
            motorResources,
            servoResources,
            hardwareAnalysis: effectiveAnalysis(),
            fallbackPins: availablePins.value,
            allowLedStrip: true,
            // Match the dropdown builders so UART-release candidates re-resolve
            // here with their full requiresRelease metadata. Without this, the
            // handler skipped the `resource SERIAL_TX/RX N NONE` step and bound
            // onto a pad the serial resource still owned.
            allowUartRelease: spareUartReleaseWhitelist(),
            expertMode: isExpertMode(),
        });
        const picked = allOpts.find((o) => o.value === newValue);
        // Filter out timer remap lines from requiresRelease — those are
        // handled by applyAfRemap below and would otherwise be sent twice.
        const releaseLines = (picked?.requiresRelease ?? []).filter((line) => !/^timer\s+/i.test(line));

        resources[index].pin = newPin;
        resources[index].ioTag = ioTag;
        // Track AF on the resource so the dropdown's model-value can match the
        // alt-AF option after pick (encoded as `pin@AFn`, matches encodedPinValue).
        resources[index].af = newAf;
        // Flip dirty up front. A downstream CLI write that fails and triggers
        // rollback() may still have left FC RAM in a half-changed state — prior
        // release lines could have already cleared a MOTOR/SERVO/LED/UART claim
        // (and mirrorReleaseToLocalRow updated other rows accordingly). Save
        // should stay enabled so the user knows pending RAM changes need
        // persisting (or a reboot to clear them).
        resourcesModified.value = true;

        // selfReleased flips true once the FC has dropped this row's
        // binding via `resource MOTOR/SERVO N NONE`. After that point a
        // failure restore can't safely revert to `previous` — the FC
        // already cleared the row, so re-populating the local snapshot
        // would put UI and firmware out of sync (next Save would re-write
        // the released row). Use `safeRollback` instead of `rollback` from
        // any error path that may run after a self-release succeeded.
        let selfReleased = false;
        const rollback = () => {
            resources[index].pin = previous.pin;
            resources[index].ioTag = previous.ioTag;
            resources[index].af = previous.af;
        };
        const safeRollback = () => {
            if (selfReleased) {
                resources[index].pin = "NONE";
                resources[index].ioTag = 0;
                resources[index].af = null;
            } else {
                rollback();
            }
        };

        for (const line of releaseLines) {
            if (!(await applyReleaseLine(line))) {
                rollback();
                return;
            }
            // Give the FC a beat to drain its CLI buffer before the next
            // command — same throttle pattern as loadSmartResourceAnalysis.
            // Without this, a tight release+remap+release sequence can land
            // partial responses.
            await wait(250);
        }

        // Moving-away AF restore: the user is sending this row to a NEW
        // pad while the OLD pad was on an alt-AF (previous.af != null).
        // The MSP rebind below will free the old pad's resource binding
        // but leave its `timer <pad> AF<n>` setting active in BF forever.
        // Release the row (frees the old pad), remap the old pad back to
        // its captured base AF, then let the rest of the flow continue
        // (eventually applyAfRemap on newPin and mspHelper.setMotorServoResource).
        // Mirrors the same-pad bare-pin restore branch below; both share
        // the selfReleased guard so safeRollback handles failure cleanly.
        if (newPin !== previous.pin && previous.pin !== "NONE" && previous.af != null) {
            const baseAf = effectiveAnalysis()?.padCurrentAF?.get(previous.pin);
            if (baseAf != null && baseAf !== previous.af) {
                const resourceName = resourceType === 0 ? "MOTOR" : "SERVO";
                const releaseLine = `resource ${resourceName} ${index + 1} NONE`;
                if (!(await applyReleaseLine(releaseLine))) {
                    rollback();
                    return;
                }
                selfReleased = true;
                // mirrorReleaseToLocalRow cleared this row locally; re-apply
                // the pending bind so the dropdown stays on the new pin.
                resources[index].pin = newPin;
                resources[index].ioTag = ioTag;
                resources[index].af = newAf;
                await wait(250);
                if (!(await applyAfRemap(previous.pin, baseAf))) {
                    safeRollback();
                    return;
                }
                await wait(250);
            }
        }

        if (newAf != null && newPin !== "NONE") {
            // Same-pad AF change: BF ignores `timer <pad> AF<n>` while the
            // pad is still bound to a peripheral, so the AF write silently
            // no-ops and the row keeps the old timer mapping after the
            // mspHelper rebind. Release the current row first (mirrors the
            // bare-pin restore branch below and the planner's release →
            // remap → rebind sequence). The pad-change case still releases
            // via the requiresRelease loop above.
            if (newPin === previous.pin && newAf !== previous.af) {
                const resourceName = resourceType === 0 ? "MOTOR" : "SERVO";
                const selfRelease = `resource ${resourceName} ${index + 1} NONE`;
                if (!(await applyReleaseLine(selfRelease))) {
                    rollback();
                    return;
                }
                selfReleased = true;
                // applyReleaseLine→mirrorReleaseToLocalRow just cleared this
                // row in the local resources array (pin/ioTag/af → 0/NONE/null).
                // Re-apply the pending bind so the <USelect> doesn't render
                // "NONE" after the MSP rebind below succeeds — the FC will be
                // on the new pin/AF, but the UI snapshot would diverge.
                resources[index].pin = newPin;
                resources[index].ioTag = ioTag;
                resources[index].af = newAf;
                await wait(250);
            }
            if (!(await applyAfRemap(newPin, newAf))) {
                safeRollback();
                return;
            }
        }

        // Switching back to the bare pin after previously picking an alt-AF
        // ON THE SAME PIN: clear the row's AF locally, but the FC stays on
        // the old `timer <pad> AF<n>` until we issue a remap back to the
        // captured base. padCurrentAF is the AF that was active when we
        // scanned (we never overwrite it on our own remap writes), so it's
        // the correct restore target. Skip when we don't have a captured
        // base. CRITICAL: only run this branch when newPin === previous.pin
        // — otherwise we'd be comparing the previous PIN's override AF
        // against the new PIN's captured AF and could fire a spurious
        // remap on a pad the user didn't touch through this UI.
        //
        // Sequence the same way the planner does: release → remap → rebind.
        // The FC won't accept `timer <pad> AF<n>` while the pad is still
        // bound to a peripheral, so without the release the AF write
        // silently no-ops and the FC keeps the old timer mapping under the
        // active resource binding (mspHelper.setMotorServoResource below
        // handles the rebind).
        if (newAf == null && newPin !== "NONE" && previous.af != null && newPin === previous.pin) {
            const baseAf = effectiveAnalysis()?.padCurrentAF?.get(newPin);
            if (baseAf != null && baseAf !== previous.af) {
                const resourceName = resourceType === 0 ? "MOTOR" : "SERVO";
                const releaseLine = `resource ${resourceName} ${index + 1} NONE`;
                if (!(await applyReleaseLine(releaseLine))) {
                    rollback();
                    return;
                }
                selfReleased = true;
                // Re-apply pending bind after the self-release cleared the row
                // locally — see the same-pad alt-AF branch above for context.
                // baseAf restore means newAf is null, but the pin/ioTag still
                // need to be put back so the dropdown reflects the live state.
                resources[index].pin = newPin;
                resources[index].ioTag = ioTag;
                resources[index].af = null;
                await wait(250);
                if (!(await applyAfRemap(newPin, baseAf))) {
                    safeRollback();
                    return;
                }
            }
        }

        // No error callback path: mspHelper.setMotorServoResource (and every
        // other MSP setter in MSPHelper.js) only invokes the callback on the
        // FC's response receipt — transport errors don't surface here. We
        // match that pattern rather than diverge with a one-off rollback.
        // Await the callback so the in-flight guard stays set until the bind
        // actually reaches the FC; without this, Save can re-enable and an
        // EEPROM-write fires before the last MSP response lands.
        //
        // Watchdog: if the FC disconnects mid-write or the transport queue
        // exhausts retries without invoking the callback, the await would
        // hang forever, the finally below never runs, and the in-flight
        // gate stays true until tab remount (locks every pin change and
        // the Save button). 3s race buys the FC plenty of time on a slow
        // USB link while letting the gate self-recover; the underlying MSP
        // write still proceeds either way.
        await new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            };
            const watchdog = setTimeout(() => {
                console.warn(
                    `Servos: setMotorServoResource(type=${resourceType} idx=${index} ioTag=${ioTag}) timed out waiting for FC response`,
                );
                done();
            }, 3000);
            mspHelper.setMotorServoResource(resourceType, index, ioTag, () => {
                clearTimeout(watchdog);
                done();
            });
        });
    } finally {
        // Clear on every exit path: rollback returns, AF-remap rollback,
        // successful MSP send (now awaited above), and any thrown exception.
        // Save can re-enable now that the chain is settled. Drop the global
        // lock so other tabs / connection work can resume.
        GUI.connect_lock = false;
        resourcesWriteInFlight.value = false;
    }
}

// Returns the dropdown value (encoded as `pin:af` for alt-AF entries) so
// USelect can match the right option after a pick. Without this the dropdown
// shows the default-AF entry even when the user picked an alt-AF one,
// because USelect matches by value and motor.pin alone is the bare pin.
function encodedPinValue(resource) {
    if (!resource?.pin || resource.pin === "NONE") {
        return "NONE";
    }
    return resource.af != null ? encodeResourceOptionValue(resource.pin, resource.af) : resource.pin;
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

onBeforeUnmount(() => {
    isMounted.value = false;
});
</script>
