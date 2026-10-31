<template>
    <UiBox v-if="allLines.length" :title="$t('frameSpectrumTitle')" :help="$t('frameSpectrumHelp')" type="neutral">
        <!-- the answer first, in words: which resonances matter and whether a motor stands out -->
        <!-- the colour on the icon and the edge, the text in the plain text colours: readable on any theme -->
        <UAlert
            :color="verdict.color"
            variant="subtle"
            :icon="verdict.icon"
            :title="verdict.title"
            :ui="{ title: 'text-highlighted font-medium', description: 'text-default' }"
        >
            <template v-if="verdict.text" #description>{{ verdict.text }}</template>
        </UAlert>

        <!-- how many of each; the modes no filter cares about (taps only, the cable's) shown on request -->
        <div class="flex flex-wrap items-center gap-2">
            <template v-for="item in legend" :key="item.severity">
                <UButton
                    v-if="item.severity === 'cable' || item.severity === 'quiet'"
                    color="neutral"
                    :variant="shown[item.severity] ? 'subtle' : 'outline'"
                    size="xs"
                    :icon="item.icon"
                    :trailing-icon="shown[item.severity] ? 'i-lucide-eye' : 'i-lucide-eye-off'"
                    :title="shown[item.severity] ? $t('frameSpectrumHide') : $t('frameSpectrumShow')"
                    :label="`${item.label} · ${item.count}`"
                    @click="shown[item.severity] = !shown[item.severity]"
                />
                <UBadge
                    v-else
                    :color="item.color"
                    variant="subtle"
                    :icon="item.icon"
                    :title="item.title"
                    :label="`${item.label} · ${item.count}`"
                />
            </template>
            <!-- the FC heard a tap: at once, before its peaks are ready -->
            <Transition leave-active-class="transition-opacity duration-500" leave-to-class="opacity-0">
                <UIcon v-if="heard" name="i-lucide-hand" class="size-5 text-primary" :title="tapTitle" />
            </Transition>
        </div>

        <div ref="plot" class="flex w-full flex-col select-none">
            <div class="relative" :style="{ height: `${plotHeight}px` }">
                <!-- the level scale: dB from the strongest resonance of the motor run -->
                <template v-if="motorRun">
                    <div
                        v-for="db in GRID_DB"
                        :key="db"
                        class="absolute right-0 border-t border-dashed border-default"
                        :style="{ left: `${GUTTER_PX}px`, bottom: `${levelPx(db)}px` }"
                    >
                        <span
                            class="absolute -translate-y-1/2 pr-1.5 text-right text-[11px] text-dimmed tabular-nums"
                            :style="{ right: '100%', width: `${GUTTER_PX}px` }"
                        >
                            {{ db === 0 ? "0 dB" : db }}
                        </span>
                    </div>
                </template>
                <div
                    class="absolute right-0 bottom-0 border-b border-default"
                    :style="{ left: `${GUTTER_PX}px` }"
                ></div>
                <div
                    v-for="bar in bars"
                    :key="bar.line.hz"
                    class="absolute bottom-0 w-1.5 -translate-x-1/2 overflow-hidden rounded-t-sm transition-colors"
                    :class="[
                        lit.has(bar.line.hz)
                            ? [DIM_BAR[badgeColor(bar.line)], 'duration-75']
                            : [barClass(bar.line), 'duration-500'],
                        bar.line.storedFrom ? 'opacity-50' : '',
                    ]"
                    :style="{ left: `${bar.x}px`, height: `${bar.height}px` }"
                    :title="lineTitle(bar.line)"
                >
                    <!-- a tap just rang this mode: how strongly, in the tap, on the same scale as the bar -->
                    <div
                        v-if="lit.has(bar.line.hz)"
                        :key="listen.tap?.seq"
                        class="lit-decay absolute inset-x-0 bottom-0 origin-bottom"
                        :class="LIT_BAR[badgeColor(bar.line)]"
                        :style="{ height: `${litHeight(bar)}px`, animationDuration: `${LISTEN_SHOW_MS}ms` }"
                    ></div>
                </div>
                <!-- a peak of the tap no known mode is near (a part the tap rang): grey, its frequency over it -->
                <div
                    v-for="ghost in ghosts"
                    :key="`ghost-${listen.tap?.seq}-${ghost.hz}`"
                    class="lit-fade absolute bottom-0 w-1.5 -translate-x-1/2 rounded-t-sm bg-inverted/30"
                    :style="{
                        left: `${ghost.x}px`,
                        height: `${ghost.height}px`,
                        animationDuration: `${LISTEN_SHOW_MS}ms`,
                    }"
                >
                    <span
                        class="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[11px] font-medium whitespace-nowrap text-muted tabular-nums"
                    >
                        {{ ghost.hz.toFixed(0) }}
                    </span>
                </div>
                <!-- by each peak what found it: over it, or beside its top right or left where there is room; its
                 frequency is under it -->
                <UBadge
                    v-for="label in labels"
                    :key="`label-${label.line.hz}`"
                    :color="badgeColor(label.line)"
                    :variant="label.line.motorOnce ? 'outline' : 'subtle'"
                    size="sm"
                    :icon="label.plate.icon"
                    class="absolute gap-1 whitespace-nowrap tabular-nums transition-colors duration-500"
                    :class="[
                        label.anchor === 'centre'
                            ? '-translate-x-1/2'
                            : label.anchor === 'end'
                              ? '-translate-x-full'
                              : '',
                        label.line.storedFrom ? 'opacity-60' : '',
                        lit.has(label.line.hz) ? LIT_BG[badgeColor(label.line)] : '',
                    ]"
                    :style="{ left: `${label.x}px`, bottom: `${label.y}px` }"
                    :title="lineTitle(label.line)"
                >
                    <template v-if="label.plate.who">
                        <UIcon v-if="label.plate.motors" name="i-lucide-fan" class="size-3.5 shrink-0" />
                        <span>{{ label.plate.who }}</span>
                    </template>
                    <template v-if="label.plate.tapped">
                        <span v-if="label.plate.who" class="opacity-50">·</span>
                        <UIcon name="i-lucide-hand" class="size-3.5 shrink-0" />
                    </template>
                </UBadge>
            </div>
            <!-- the axis: each bar's frequency under it, staggered where they would overlap; the unit under the dB
                 scale -->
            <div class="relative" :style="{ height: `${axisRows * AXIS_ROW_PX + GAP_PX}px` }">
                <span
                    class="absolute pr-1.5 text-right text-[11px] text-dimmed"
                    :style="{ left: 0, top: `${GAP_PX}px`, width: `${GUTTER_PX}px` }"
                >
                    Hz
                </span>
                <span
                    v-for="mark in axis"
                    :key="mark.line.hz"
                    class="absolute -translate-x-1/2 text-xs tabular-nums transition-colors duration-500"
                    :class="[
                        TEXT[badgeColor(mark.line)],
                        lit.has(mark.line.hz)
                            ? `rounded-sm px-1 font-bold ${LIT_BG[badgeColor(mark.line)]}`
                            : 'font-medium',
                    ]"
                    :style="{ left: `${mark.x}px`, top: `${GAP_PX + mark.row * AXIS_ROW_PX}px` }"
                    :title="lineTitle(mark.line)"
                >
                    {{ mark.line.hz.toFixed(0) }}
                </span>
            </div>
        </div>
    </UiBox>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import { i18n } from "@/js/localization";
import { useFilterTuneStore } from "@/stores/filterTune";
import { useFrameWizardStore } from "@/stores/frameWizard";
import { LISTEN_SHOW_MS, useFrameListenStore } from "@/stores/frameListen";
import {
    isFrameMode,
    modeSpectrum,
    motorRunSummary,
    NOTABLE_DB,
    POINT_FRAME,
    SERIOUS_DB,
    type ModeSeverity,
    type SpectrumLine,
} from "@/stores/frameWizardProtocol";

const filterTune = useFilterTuneStore();
const wizard = useFrameWizardStore();
const listen = useFrameListenStore();
const t = (key: string, params?: Record<string, unknown>) => i18n.getMessage(key, params);

const BAR_MAX_PX = 180;
const NO_LEVEL_PX = 4;
const GUTTER_PX = 40; // the dB scale
const PLATE_H_PX = 22;
const PLATE_CHAR_PX = 6.5;
const PLATE_PAD_PX = 14;
const PLATE_ICON_PX = 16;
const GAP_PX = 3;
const SIDE_GAP_PX = 6; // a plate beside a peak, from the bar
// the level scale: from the strongest resonance of the run down to this; the steps match the colour lines
const FLOOR_DB = -30;
const GRID_DB = [0, -6, -12, -18, -24, -30];
// the frequency axis: fitted to the modes on show, again on every show / hide
const AXIS_MARGIN = 1.15;
const AXIS_ROW_PX = 16;
const AXIS_ROWS = 3;
const CHAR_PX = 7;
const TAP_POINTS = 5;

type Color = "error" | "warning" | "success" | "neutral";
const COLOR: Record<ModeSeverity, Color> = {
    serious: "error",
    notable: "warning",
    minor: "success",
    unrated: "neutral",
    cable: "neutral",
    unstable: "neutral",
};
const TEXT: Record<Color, string> = {
    error: "text-error",
    warning: "text-warning",
    success: "text-success",
    neutral: "text-muted",
};
// a mode a tap just rang: its label and frequency on a denser background of its colour
const LIT_BG: Record<Color, string> = {
    error: "bg-error/30",
    warning: "bg-warning/30",
    success: "bg-success/30",
    neutral: "bg-inverted/20",
};
// a bar a tap rang: the rest of it dimmed, the part the tap rang in its colour, brighter
const DIM_BAR: Record<Color, string> = {
    error: "bg-error/30",
    warning: "bg-warning/30",
    success: "bg-success/25",
    neutral: "bg-inverted/15",
};
const LIT_BAR: Record<Color, string> = {
    error: "bg-error brightness-125 saturate-150",
    warning: "bg-warning brightness-125 saturate-150",
    success: "bg-success brightness-125 saturate-150",
    neutral: "bg-inverted/60",
};
const BAR: Record<Color, string> = {
    error: "bg-error",
    warning: "bg-warning",
    success: "bg-success/50",
    neutral: "bg-inverted/30",
};

const allLines = computed(() =>
    // the frame's modes only: a peak of one or two motors is on the quad diagram, with those motors
    modeSpectrum(wizard.lastResult, filterTune.frameMap?.modes ?? []).filter(isFrameMode),
);
// the USB cable's own modes are no frame's: hidden unless asked for
const motorRun = computed(() => wizard.lastResult?.motors.some((list) => list.length > 0) ?? false);
// A mode the taps found that the motors do not drive: grey, it is no filter's business.
const quiet = (line: SpectrumLine): boolean =>
    motorRun.value && line.levelDb === null && (line.severity === "minor" || line.severity === "unrated");

// hidden unless asked for: the USB cable's own modes, and the ones only the taps found (no motor drives them)
const shown = reactive({ cable: false, quiet: false });
const lines = computed(() =>
    allLines.value.filter((l) => (l.severity !== "cable" || shown.cable) && (!quiet(l) || shown.quiet)),
);

const motorSummary = computed(() => (wizard.lastResult ? motorRunSummary(wizard.lastResult) : null));

const badgeColor = (line: SpectrumLine): Color => (quiet(line) ? "neutral" : COLOR[line.severity]);
const barClass = (line: SpectrumLine): string => BAR[badgeColor(line)];

const plot = ref<HTMLElement | null>(null);
const plotWidth = ref(1000);

const range = computed(() => {
    // everything hidden: a plain axis
    const hz = lines.value.length ? lines.value.map((l) => l.hz) : [50, 1000];
    return { lo: Math.log10(Math.min(...hz) / AXIS_MARGIN), hi: Math.log10(Math.max(...hz) * AXIS_MARGIN) };
});
const xPx = (hz: number): number =>
    GUTTER_PX + ((Math.log10(hz) - range.value.lo) / (range.value.hi - range.value.lo)) * (plotWidth.value - GUTTER_PX);

const levelPx = (db: number): number => ((Math.max(db, FLOOR_DB) - FLOOR_DB) / -FLOOR_DB) * BAR_MAX_PX;

// The level on the dB scale; before a motor run, how many of the tap points rang there.
function heightPx(line: SpectrumLine): number {
    if (line.levelDb !== null) {
        return Math.max(levelPx(line.levelDb), NO_LEVEL_PX);
    }
    if (!motorRun.value && line.severity === "unrated" && line.points.length) {
        return (line.points.length / TAP_POINTS) * BAR_MAX_PX;
    }
    return NO_LEVEL_PX;
}

// Who found a mode, short: the motors (1-4), or where the taps rang when no motor run says more.
function whoText(line: SpectrumLine): string {
    if (line.storedFrom) {
        return t("frameSpectrumStoredMotors");
    }
    if (line.motors.length) {
        // the fan icon says they are motors: the numbers alone
        return line.motors.length === 4 ? "1–4" : line.motors.map((m) => `${m + 1}`).join(" ");
    }
    const arms = line.points.filter((p) => p !== POINT_FRAME).map((p) => p + 1);
    const centre = line.points.includes(POINT_FRAME);
    if (arms.length === 4 && centre) {
        return t("frameSpectrumWhereWhole");
    }
    const parts: string[] = [];
    if (arms.length === 4) {
        parts.push(t("frameSpectrumWhereAllArms"));
    } else if (arms.length) {
        parts.push(
            t(arms.length === 1 ? "frameSpectrumWhereArm" : "frameSpectrumWhereArms", { list: arms.join(", ") }),
        );
    }
    if (centre) {
        parts.push(t("frameSpectrumFrame"));
    }
    return parts.join(", ");
}

interface Plate {
    /** The motors that drive it (after a fan, as the motor run button), else where the taps rang. */
    who: string;
    motors: boolean;
    /** The taps found it too (a hand, as the taps button). */
    tapped: boolean;
    /** Leading: the cable's own, or an unstable tap mode. */
    icon?: string;
}

function plate(line: SpectrumLine): Plate {
    if (line.severity === "cable") {
        return { who: "", motors: false, tapped: false, icon: "i-lucide-cable" };
    }
    return {
        who: whoText(line),
        motors: line.motors.length > 0,
        tapped: line.tapped,
        icon: line.severity === "unstable" ? "i-lucide-circle-help" : undefined,
    };
}

// width of a plate: its text, the separator and the icons
function plateWidth(p: Plate): number {
    const chars = p.who.length + (p.who && p.tapped ? 3 : 0);
    const icons = (p.icon ? 1 : 0) + (p.motors ? 1 : 0) + (p.tapped ? 1 : 0);
    return chars * PLATE_CHAR_PX + icons * PLATE_ICON_PX + PLATE_PAD_PX;
}

function lineTitle(line: SpectrumLine): string {
    const parts = [`${line.hz.toFixed(0)} Hz`, t(`frameSpectrum_${line.severity}`)];
    if (line.storedFrom) {
        parts.push(t("frameSpectrumStoredTitle"));
    }
    if (line.motorOnce) {
        parts.push(t("frameSpectrumMotorOnce"));
    }
    if (line.levelDb !== null) {
        parts.push(t("frameSpectrumLevel", { db: line.levelDb.toFixed(1) }));
    } else if (line.severity === "unrated") {
        parts.push(t("frameSpectrumNoMotorRun", { n: line.points.length, of: TAP_POINTS }));
    } else {
        parts.push(t("frameSpectrumNoLevel"));
    }
    if (line.points.length) {
        const names = line.points.map((p) =>
            p === POINT_FRAME ? t("frameSpectrumFrame") : t("frameSpectrumArm", { n: p + 1 }),
        );
        parts.push(t("frameSpectrumPoints", { list: names.join(", ") }));
    } else if (line.tapped) {
        parts.push(t("frameSpectrumTappedInMap"));
    }
    if (line.motors.length) {
        parts.push(t("frameSpectrumMotors", { list: line.motors.map((m) => m + 1).join(", ") }));
    }
    if (line.cableMotors.length) {
        parts.push(t("frameSpectrumCableDisagree", { list: line.cableMotors.map((m) => m + 1).join(", ") }));
    }
    return parts.join(" · ");
}

const bars = computed(() => lines.value.map((line) => ({ line, x: xPx(line.hz), height: Math.round(heightPx(line)) })));

// A tap heard outside a run lights the modes it rang (within 4 %): its level in the tap, dB from its strongest peak.
const LIT_TOLERANCE = 0.04;
const lit = ref(new Map<number, number>());
const ghosts = ref<{ hz: number; x: number; height: number }[]>([]);
let litTimer: ReturnType<typeof setTimeout> | null = null;
watch(
    () => listen.heardAt,
    () => {
        const peaks = listen.tap?.peaks ?? [];
        const next = new Map<number, number>();
        const near = (hz: number, other: number) => Math.abs(hz / other - 1) <= LIT_TOLERANCE;
        for (const bar of bars.value) {
            const dbs = peaks.filter((p) => near(p.hz, bar.line.hz)).map((p) => p.db);
            if (dbs.length) {
                next.set(bar.line.hz, Math.max(...dbs));
            }
        }
        lit.value = next;
        // the rest, on the axis as it is (one outside it is not shown: the axis does not jump on a tap)
        ghosts.value = peaks
            .filter((p) => !bars.value.some((bar) => near(p.hz, bar.line.hz)))
            .filter((p) => Math.log10(p.hz) >= range.value.lo && Math.log10(p.hz) <= range.value.hi)
            .map((p) => ({ hz: p.hz, x: xPx(p.hz), height: Math.max(levelPx(p.db), NO_LEVEL_PX) }));
        if (litTimer) {
            clearTimeout(litTimer);
        }
        const left = LISTEN_SHOW_MS - (Date.now() - listen.heardAt);
        litTimer = setTimeout(
            () => {
                lit.value = new Map();
                ghosts.value = [];
            },
            Math.max(left, 0),
        );
    },
);
onUnmounted(() => litTimer && clearTimeout(litTimer));
// the tap's level as a share of the bar: its strongest peak fills it
// The detector fired: the hand shows from the trigger until a little after the tap's peaks came.
const HEARD_SHOW_MS = 400;
const heard = ref(false);
let heardTimer: ReturnType<typeof setTimeout> | null = null;
watch(
    () => listen.triggeredAt,
    (at) => {
        const left = HEARD_SHOW_MS - (Date.now() - at);
        if (left <= 0) {
            return; // an earlier tap, from before this view listened
        }
        heard.value = true;
        if (heardTimer) {
            clearTimeout(heardTimer);
        }
        heardTimer = setTimeout(() => (heard.value = false), left);
    },
);
onUnmounted(() => heardTimer && clearTimeout(heardTimer));
const tapTitle = computed(() => {
    const ready = listen.tap?.readyMs;
    return ready == null ? t("frameSpectrumTapHeard") : t("frameSpectrumTapHeardReady", { ms: ready });
});

const litHeight = (bar: { line: SpectrumLine; height: number }): number =>
    (levelPx(lit.value.get(bar.line.hz) ?? FLOOR_DB) / BAR_MAX_PX) * bar.height;

// Labels are placed in this order: the strong ones first, so they get the spots right over their bars.
const RANK: Record<ModeSeverity, number> = { serious: 0, notable: 1, minor: 2, unrated: 2, unstable: 3, cable: 4 };
const labels = computed(() => {
    const boxes = bars.value.map((bar) => ({ x0: bar.x - 4, x1: bar.x + 4, y0: 0, y1: bar.height }));
    const free = (x0: number, x1: number, y0: number, y1: number) =>
        x0 >= GUTTER_PX &&
        x1 <= plotWidth.value &&
        boxes.every((b) => x1 <= b.x0 || x0 >= b.x1 || y1 <= b.y0 || y0 >= b.y1);
    const order = [...bars.value].sort(
        (a, b) =>
            RANK[a.line.severity] - RANK[b.line.severity] ||
            (b.line.levelDb ?? -99) - (a.line.levelDb ?? -99) ||
            b.height - a.height,
    );
    return order.map((bar) => {
        const p = plate(bar.line);
        const width = plateWidth(p);
        // over the peak, else beside its top on the right, else on the left
        const besideY = Math.max(0, bar.height - PLATE_H_PX);
        // x is where the plate is pinned (its centre, start or end), so a wrong width guess only loosens the check
        const spots = [
            { left: bar.x - width / 2, y: bar.height + GAP_PX, x: bar.x, anchor: "centre" },
            { left: bar.x + SIDE_GAP_PX, y: besideY, x: bar.x + SIDE_GAP_PX, anchor: "start" },
            { left: bar.x - SIDE_GAP_PX - width, y: besideY, x: bar.x - SIDE_GAP_PX, anchor: "end" },
        ];
        let spot = spots.find((c) => free(c.left, c.left + width, c.y, c.y + PLATE_H_PX));
        if (!spot) {
            // no room at any: over the peak, lifted past whatever is in the way
            const left = Math.min(Math.max(bar.x - width / 2, GUTTER_PX), plotWidth.value - width);
            let y = bar.height + GAP_PX;
            for (let moved = true; moved;) {
                moved = false;
                for (const b of boxes) {
                    if (left + width > b.x0 && left < b.x1 && y + PLATE_H_PX > b.y0 && y < b.y1) {
                        y = b.y1 + GAP_PX;
                        moved = true;
                    }
                }
            }
            spot = { left, y, x: left, anchor: "start" };
        }
        boxes.push({ x0: spot.left, x1: spot.left + width, y0: spot.y, y1: spot.y + PLATE_H_PX });
        return { line: bar.line, plate: p, x: spot.x, y: spot.y, anchor: spot.anchor };
    });
});
const plotHeight = computed(() => Math.max(BAR_MAX_PX + 8, ...labels.value.map((l) => l.y + PLATE_H_PX)) + GAP_PX);

// Each bar's frequency under the axis, in the first row where it fits (the strong ones first); with no room
// left, on hover only.
const axis = computed(() => {
    const rows: [number, number][][] = Array.from({ length: AXIS_ROWS }, () => []);
    const marks: { line: SpectrumLine; x: number; row: number }[] = [];
    for (const label of labels.value) {
        const half = (label.line.hz.toFixed(0).length * CHAR_PX) / 2 + 3;
        const x = Math.min(Math.max(xPx(label.line.hz), GUTTER_PX + half), plotWidth.value - half);
        const row = rows.findIndex((spans) => spans.every(([a, b]) => x + half <= a || x - half >= b));
        if (row >= 0) {
            rows[row].push([x - half, x + half]);
            marks.push({ line: label.line, x, row });
        }
    }
    return marks;
});
const axisRows = computed(() => Math.max(1, ...axis.value.map((m) => m.row + 1)));

const hzList = (list: SpectrumLine[]): string => list.map((l) => l.hz.toFixed(0)).join(", ");

// The verdict: before a motor run what the taps found; after it, the strong resonances (what the filters
// must handle) and whether one motor shakes the frame much harder than the others (a loose motor or mount).
const verdict = computed(() => {
    const frame = allLines.value.filter((l) => l.severity !== "cable" && l.severity !== "unstable");
    if (!motorRun.value) {
        return {
            color: "neutral" as const,
            icon: "i-lucide-hand",
            title: t("frameSpectrumVerdictTaps", { count: frame.length, list: hzList(frame) }),
            text: t("frameSpectrumUnratedNote"),
        };
    }
    const strong = frame.filter((l) => l.severity === "serious");
    const run = motorSummary.value;
    const title = strong.length
        ? t("frameSpectrumVerdictStrong", { list: hzList(strong) })
        : t("frameSpectrumVerdictNoStrong");
    if (run && !run.allOk && run.worst) {
        return {
            color: "warning" as const,
            icon: "i-lucide-triangle-alert",
            title,
            text: t("frameHealthMotorDiffers", {
                n: run.worst.motor + 1,
                hz: run.worst.hz.toFixed(0),
                db: `+${run.worst.db.toFixed(1)}`,
            }),
        };
    }
    return {
        color: "success" as const,
        icon: "i-lucide-circle-check",
        title,
        text: t("frameSpectrumVerdictMotorsAlike"),
    };
});

const legend = computed(() => {
    const items: { severity: ModeSeverity | "quiet"; color: string; icon?: string; label: string; title?: string }[] = [
        {
            severity: "serious",
            color: "error",
            label: t("frameSpectrum_serious"),
            title: t("frameSpectrumSeriousRule", { db: -SERIOUS_DB }),
        },
        {
            severity: "notable",
            color: "warning",
            label: t("frameSpectrum_notable"),
            title: t("frameSpectrumNotableRule", { db: -NOTABLE_DB }),
        },
        { severity: "minor", color: "success", label: t("frameSpectrum_minor") },
        { severity: "quiet", color: "neutral", icon: "i-lucide-hand", label: t("frameSpectrumQuiet") },
        { severity: "unrated", color: "neutral", label: t("frameSpectrum_unrated") },
        { severity: "unstable", color: "neutral", icon: "i-lucide-circle-help", label: t("frameSpectrum_unstable") },
        { severity: "cable", color: "neutral", icon: "i-lucide-cable", label: t("frameSpectrum_cable") },
    ];
    return items
        .map((item) => ({
            ...item,
            count: allLines.value.filter((l) => (quiet(l) ? "quiet" : l.severity) === item.severity).length,
        }))
        .filter((item) => item.count > 0);
});

// the plot comes and goes with the data: follow its width while it is there
const resizeObserver = new ResizeObserver((entries) => {
    plotWidth.value = entries[0]?.contentRect.width || plotWidth.value;
});
watch(plot, (el, old) => {
    if (old) {
        resizeObserver.unobserve(old);
    }
    if (el) {
        resizeObserver.observe(el);
    }
});
onUnmounted(() => resizeObserver.disconnect());
</script>
