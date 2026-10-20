<template>
    <UiBox :title="$t('frameHealthTitle')" :help="$t('frameHealthHelp')" type="neutral">
        <FrameDiagram v-if="isQuadX" :motors="motorBadges" :centre="centreModes" />
        <p v-else class="text-sm text-muted">{{ $t("frameHealthQuadOnly") }}</p>

        <!-- the filter autotune in flight: each motor's 1x and harmonics over the floor -->
        <template v-if="summary">
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-highlighted">{{ $t("frameHealthInFlight") }}</span>
                <RunDateBadge v-if="filterTune.shownKeptAt" :at="filterTune.shownKeptAt" kept />
            </div>
            <UAlert
                :color="summary.allOk ? 'success' : 'warning'"
                variant="subtle"
                :icon="summary.allOk ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
                :title="verdictTitle"
                :description="verdictText"
                :ui="{ title: 'text-highlighted font-medium', description: 'text-default' }"
            />
        </template>
        <p v-else-if="!motorRun" class="text-sm text-muted">{{ $t("frameHealthNoData") }}</p>

        <div v-if="summary" class="grid max-w-md grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-x-3 gap-y-1 text-sm">
            <span></span>
            <span v-for="order in ORDERS" :key="order" class="text-xs text-muted text-right">{{ order }}</span>
            <template v-for="(motor, index) in summary.motors" :key="index">
                <span :class="motor.standsOut ? 'text-error font-medium' : 'text-muted'">
                    {{ $t("frameTestStepMotor", { n: index + 1 }) }}
                </span>
                <span v-for="(db, order) in motor.orders" :key="order" class="text-right tabular-nums">
                    {{ formatDb(db) }}
                </span>
            </template>
        </div>
    </UiBox>

    <!-- the motor run on the bench: how hard each motor drives each shared resonance, against the other motors (the
         verdict is over the resonance chart) -->
    <UiBox
        v-if="motorRows.length"
        :title="$t('frameHealthMotorRun')"
        :help="$t('frameHealthMotorRunHelp')"
        type="neutral"
    >
        <div class="grid grid-cols-[auto_repeat(4,minmax(0,1fr))_auto] items-center gap-x-3 gap-y-0.5 text-sm">
            <span></span>
            <span v-for="m in 4" :key="m" class="pb-1 text-center text-xs text-muted">M{{ m }}</span>
            <span></span>
            <!-- per resonance two grid rows: the frequency, the bars and the verdict on one line, the numbers
                 under the bars -->
            <template v-for="row in motorRows" :key="row.hz">
                <span class="font-medium leading-none tabular-nums" :class="row.textClass">
                    {{ row.hz.toFixed(0) }} Hz
                </span>
                <!-- from the middle (the other motors): right louder, left softer; square at the middle -->
                <div
                    v-for="(cell, m) in row.cells"
                    :key="`bar-${m}`"
                    class="relative h-2 rounded-full bg-elevated"
                    :title="cell.title"
                >
                    <div class="absolute inset-y-0 left-1/2 w-px bg-inverted/40"></div>
                    <div
                        class="absolute inset-y-0"
                        :class="[cell.barClass, cell.louder ? 'rounded-r-full' : 'rounded-l-full']"
                        :style="
                            cell.louder
                                ? { left: '50%', width: `${cell.pct}%` }
                                : { right: '50%', width: `${cell.pct}%` }
                        "
                    ></div>
                </div>
                <UIcon
                    :name="row.even ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
                    class="size-4 justify-self-end"
                    :class="row.even ? 'text-success' : 'text-warning'"
                    :title="row.even ? $t('frameHealthSpreadOk') : $t('frameHealthSpreadHigh')"
                />
                <span></span>
                <span
                    v-for="(cell, m) in row.cells"
                    :key="`db-${m}`"
                    class="pb-2 text-center text-xs tabular-nums"
                    :class="cell.textClass"
                    :title="cell.title"
                >
                    {{ cell.text }}
                </span>
                <span></span>
            </template>
        </div>
        <!-- every peak of every motor, with its axis, for the specialist -->
        <UCollapsible v-if="peakRows.length" class="text-sm">
            <UButton
                :label="$t('frameTestMotorPeaks')"
                color="neutral"
                variant="link"
                size="xs"
                trailing-icon="i-lucide-chevron-down"
                class="group px-0"
                :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
            />
            <template #content>
                <div class="flex flex-col pt-2">
                    <div
                        v-for="row in peakRows"
                        :key="row.name"
                        class="grid grid-cols-[3rem_1fr] items-start gap-2 py-0.5"
                    >
                        <span class="text-muted">{{ row.name }}</span>
                        <div class="flex flex-wrap gap-1">
                            <span v-if="row.peaks.length === 0" class="text-dimmed">{{ $t("frameTestNoModes") }}</span>
                            <UBadge
                                v-for="(peak, i) in row.peaks"
                                :key="i"
                                :color="peak.cable ? 'warning' : 'neutral'"
                                :variant="peak.speeds === 2 ? 'subtle' : 'outline'"
                                size="sm"
                                :icon="peak.cable ? 'i-lucide-cable' : undefined"
                                :title="peakTitle(peak)"
                                :label="`${peak.hz.toFixed(0)} Hz ${axisShort(peak.axis)}`"
                            />
                        </div>
                    </div>
                    <p v-if="rotationHz" class="pt-1 text-xs text-muted">
                        {{ $t("frameTestRotation", { r1: rotationHz[0], r2: rotationHz[1] }) }}
                    </p>
                </div>
            </template>
        </UCollapsible>
    </UiBox>
</template>

<script setup lang="ts">
import { computed } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import FrameDiagram, { type MotorBadge } from "./FrameDiagram.vue";
import RunDateBadge from "./RunDateBadge.vue";
import { spinText } from "./spinText";
import { spinVerdict } from "@/stores/frameSpinCheck";
import { i18n } from "@/js/localization";
import { useFilterTuneStore } from "@/stores/filterTune";
import { useFlightControllerStore } from "@/stores/fc";
import { useFrameWizardStore } from "@/stores/frameWizard";
import {
    isFrameMode,
    modeSpectrum,
    MOTOR_LOUD_DB,
    motorRunSummary,
    nearAnyHz,
    type Axis,
    type MotorPeak,
} from "@/stores/frameWizardProtocol";

// Every peak of every motor of the last motor run, by frequency, with its axis.
const peakRows = computed(() =>
    (wizard.lastResult?.motors ?? []).some((list) => list.length)
        ? wizard.lastResult!.motors.map((list, m) => ({
              name: `M${m + 1}`,
              peaks: [...list].sort((a, b) => a.hz - b.hz),
          }))
        : [],
);
const rotationHz = computed(() =>
    wizard.lastResult && wizard.lastResult.rotationHz[0] > 0 ? wizard.lastResult.rotationHz : null,
);
const AXIS_NAME: Record<Axis, string> = {
    roll: "frameTestAxisRoll",
    pitch: "frameTestAxisPitch",
    yaw: "frameTestAxisYaw",
};
const axisShort = (axis: Axis | null): string => (axis ? t(AXIS_NAME[axis]).charAt(0).toUpperCase() : "");
function peakTitle(peak: MotorPeak): string {
    const parts = [
        t("frameTestPeakHelp", { axis: peak.axis ? t(AXIS_NAME[peak.axis]) : "?", gain: peak.gain.toFixed(3) }),
    ];
    if (peak.speeds !== 2) {
        parts.push(t("frameTestOneSpeed"));
    }
    if (peak.cable) {
        parts.push(t("frameTestCableModeHelp"));
    }
    return parts.join(" · ");
}

const QUAD_X_MIXER = 3;
const CUSTOM_MIXER = 23; // generic Custom: with 4 motors, a Quad X with its own mmix (a deadcat)
// 1x-3x: what the RPM filter covers; 4x-5x: what is left for gyro LPF2
const ORDERS = ["1x", "2x", "3x", "4x", "5x"];

const filterTune = useFilterTuneStore();
const wizard = useFrameWizardStore();
const fcStore = useFlightControllerStore();
const t = (key: string, params?: Record<string, unknown>) => i18n.getMessage(key, params);

const summary = computed(() => filterTune.summary);
const isQuadX = computed(
    () =>
        fcStore.mixerConfig.mixer === QUAD_X_MIXER ||
        (fcStore.mixerConfig.mixer === CUSTOM_MIXER && fcStore.motorConfig?.motor_count === 4),
);

const formatDb = (db: number): string => `${db >= 0 ? "+" : ""}${db.toFixed(1)}`;

const motorRun = computed(() => (wizard.lastResult ? motorRunSummary(wizard.lastResult) : null));

// The motor run table: per shared resonance each motor against the others (their median), as a bar from the
// middle: right louder, left softer. As loud as the others (within 3 dB) is the point; a few dB softer is
// normal (a motor near a node of the mode barely drives it); one 10 dB or more louder points to its mount or
// the motor.
const ALIKE_DB = 3;
const BAR_SPAN_DB = 12;
const SEVERITY_TEXT: Record<string, string> = { serious: "text-error", notable: "text-warning" };
const signedDb = (db: number): string =>
    Math.abs(db) < 0.5 ? "±0" : `${db > 0 ? "+" : "−"}${Math.abs(db).toFixed(1)}`;

const motorRows = computed(() => {
    const run = motorRun.value;
    if (!run) {
        return [];
    }
    return run.shared.map((row) => {
        const present = row.relDb.filter((db): db is number => db !== null).sort((a, b) => a - b);
        const mid = Math.floor(present.length / 2);
        const median = present.length % 2 ? present[mid] : (present[mid - 1] + present[mid]) / 2;
        const line = spectrum.value?.find((l) => nearAnyHz(l.hz, [row.hz]));
        const cells = row.relDb.map((db, m) => {
            if (db === null) {
                return {
                    louder: false,
                    pct: 0,
                    text: "—",
                    textClass: "text-dimmed",
                    barClass: "",
                    title: t("frameHealthNoPeak", { n: m + 1 }),
                };
            }
            const dev = db - median;
            const louder = dev > 0;
            const tone =
                dev >= MOTOR_LOUD_DB
                    ? { bar: "bg-error", text: "text-error font-medium" }
                    : dev >= ALIKE_DB
                      ? { bar: "bg-warning", text: "text-warning" }
                      : dev <= -ALIKE_DB
                        ? { bar: "bg-inverted/30", text: "text-muted" }
                        : { bar: "bg-success", text: "text-success" };
            return {
                louder,
                pct: (Math.min(Math.abs(dev), BAR_SPAN_DB) / BAR_SPAN_DB) * 50,
                text: `${signedDb(dev)} dB`,
                textClass: tone.text,
                barClass: tone.bar,
                title: t("frameHealthMotorVsOthers", { n: m + 1, db: signedDb(dev) }),
            };
        });
        return {
            hz: row.hz,
            even: !row.relDb.some((db, m) => db === 0 && run.standsOut[m]),
            textClass: SEVERITY_TEXT[line?.severity ?? ""] ?? "text-default",
            cells,
        };
    });
});

// Per motor: from flight data its 1x over the floor; else from the motor run the peaks of its own (the ones
// no tap found and at most one other motor shows: its mount, arm or the motor itself), loudest first.
const SEVERITY_COLOR: Record<string, MotorBadge["color"]> = { serious: "error", notable: "warning" };
const spectrum = computed(() =>
    wizard.lastResult ? modeSpectrum(wizard.lastResult, filterTune.frameMap?.modes ?? []) : null,
);

// In the middle: the strong frame modes, by frequency (the chart's verdict names the same).
const MAX_CENTRE_MODES = 4;
const centreModes = computed(() =>
    (spectrum.value ?? [])
        // the strong frame modes, the ones the chart's verdict names, by frequency
        .filter((line) => line.severity === "serious" && isFrameMode(line))
        .slice(0, MAX_CENTRE_MODES)
        .map((line) => ({
            label: `${line.hz.toFixed(0)} Hz`,
            color: SEVERITY_COLOR[line.severity] ?? "neutral",
            title: t("frameHealthCentreMode", {
                hz: line.hz.toFixed(0),
                list: line.motors.map((m) => m + 1).join(", "),
                db: (line.levelDb ?? 0).toFixed(1),
            }),
        })),
);

// The motor run's spin check: a motor turning the wrong way (or not answering) is red, whatever else it shows.
const spin = computed(() => (wizard.spinCheck?.done ? spinVerdict(wizard.spinCheck) : null));

// Quad X seen from above with the props in (Betaflight's default): 1 and 4 turn clockwise, 2 and 3 the other way;
// the Motors tab's props-out switch turns them all around.
const CLOCKWISE_PROPS_IN = [true, false, false, true];

// Each motor's spin direction on the diagram: the one set (props in / out), green when the spin check agrees,
// red the way it really turns when it does not, grey without an answer.
const motorBadges = computed<MotorBadge[]>(() => {
    const badges = baseBadges.value;
    const v = spin.value;
    if (!v) {
        return badges;
    }
    const reversed = Boolean(fcStore.mixerConfig.reverseMotorDir);
    return badges.map((badge, m) => {
        const set = CLOCKWISE_PROPS_IN[m] !== reversed;
        const wrong = v.wrongWay.includes(m);
        const silent = v.silent.includes(m);
        const cw = wrong ? !set : set;
        const one = { ok: false, wrongWay: wrong ? [m] : [], silent: silent ? [m] : [] };
        return {
            ...badge,
            color: wrong || silent ? "error" : badge.color,
            spin: {
                cw,
                state: silent ? "unknown" : wrong ? "wrong" : "ok",
                title: wrong || silent ? spinText(one) : t(cw ? "frameSpinMotorCw" : "frameSpinMotorCcw", { n: m + 1 }),
            },
        };
    });
});

const baseBadges = computed<MotorBadge[]>(() => {
    const s = summary.value;
    return [0, 1, 2, 3].map((m) => {
        const motor = s?.motors[m];
        if (!motor) {
            const run = motorRun.value;
            if (!run) {
                return { label: `M${m + 1}`, color: "neutral" };
            }
            // the motor's colour is the motor run's verdict on it: one shaking the frame much harder is yellow
            return {
                label: `M${m + 1}`,
                color: run.standsOut[m] ? "warning" : "success",
                title: t(run.standsOut[m] ? "frameHealthMotorLoud" : "frameHealthMotorAlike", { n: m + 1 }),
            };
        }
        return {
            label: `M${m + 1} · ${formatDb(motor.orders[0])} dB`,
            color: motor.standsOut ? "error" : s.allOk ? "success" : "warning",
            title: t("frameHealthMotorTitle", {
                n: m + 1,
                x1: formatDb(motor.orders[0]),
                x2: formatDb(motor.orders[1]),
                x3: formatDb(motor.orders[2]),
            }),
        };
    });
});

const verdictTitle = computed(() => {
    const s = summary.value;
    if (!s) {
        return "";
    }
    return s.allOk ? t("frameHealthAllOk", { score: s.score }) : t("frameHealthCheck", { score: s.score });
});

const verdictText = computed(() => {
    const s = summary.value;
    if (!s) {
        return "";
    }
    const bad = filterTune.shownStatus?.badMotor;
    if (bad !== null && bad !== undefined) {
        return t("frameHealthMotorStandsOut", { n: bad + 1 });
    }
    return t("frameHealthSpread", { spread: s.spread1x.toFixed(1) });
});
</script>
