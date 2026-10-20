<template>
    <UiBox v-if="filterTune.supported" :title="$t('filterTuneTitle')" :help="$t('filterTuneHelp')" type="neutral">
        <!-- what it needs before it can run -->
        <ul class="flex flex-col gap-1 text-sm">
            <li v-for="item in requirements" :key="item.key" class="flex items-center gap-2">
                <UIcon
                    :name="item.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
                    class="size-4 shrink-0"
                    :class="item.ok ? 'text-success' : 'text-error'"
                />
                <span :class="item.ok ? '' : 'text-muted'" :title="item.title">{{ item.label }}</span>
                <!-- the frame map is the frame test's: a way to drop it -->
                <template v-if="item.key === 'map' && map && (map.hasTaps || map.hasMotors)">
                    <UButton
                        :label="$t('frameMapForget')"
                        color="neutral"
                        variant="link"
                        size="xs"
                        icon="i-lucide-trash-2"
                        :loading="filterTune.busy"
                        @click="filterTune.forgetFrameMap()"
                    />
                </template>
            </li>
        </ul>

        <div v-if="status" class="flex flex-wrap items-center gap-2">
            <UBadge
                :color="status.modeOn ? 'success' : 'neutral'"
                variant="subtle"
                size="lg"
                icon="i-lucide-radio"
                :label="status.modeOn ? $t('filterTuneModeOn') : $t('filterTuneModeOff')"
            />
            <!-- idle says nothing the mode badge does not -->
            <UBadge
                v-if="status.state !== 'idle'"
                :color="stateColor"
                variant="subtle"
                size="lg"
                :label="$t(`filterTuneState_${status.state}`)"
            />
        </div>

        <div v-if="showProgress" class="flex flex-col gap-1">
            <UProgress
                :model-value="Math.min(status!.frames, status!.minFrames)"
                :max="status!.minFrames"
                size="sm"
                :color="status!.enoughFrames ? 'success' : 'primary'"
            />
            <span class="text-xs text-muted tabular-nums">
                {{ $t("filterTuneFrames", { frames: status!.frames, min: status!.minFrames }) }}
            </span>
        </div>

        <!-- the craft can tell the pilot nothing in flight: say so before the flight -->
        <p v-if="noSignal" class="flex items-start gap-2 text-xs text-warning">
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
            {{ $t("filterTuneNoSignal") }}
        </p>
        <ol class="list-decimal pl-5 text-xs text-muted flex flex-col gap-0.5">
            <li>{{ $t("filterTuneStep1") }}</li>
            <li>
                {{ step2 }}
                <!-- what the LED strip's colours mean -->
                <span v-if="status?.signals?.ledStrip" class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span v-for="led in LED_STATES" :key="led.key" class="flex items-center gap-1">
                        <span class="size-2 shrink-0 rounded-full" :class="led.dot"></span>
                        {{ $t(led.key) }}
                    </span>
                </span>
            </li>
            <li>{{ $t("filterTuneStep3") }}</li>
        </ol>

        <!-- before / after -->
        <div v-if="showResult" class="flex flex-col gap-2 border-t border-default pt-3">
            <!-- the FC forgot it (restarted since): the measurement this app kept when it was applied -->
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-highlighted">{{ $t("filterTuneResult") }}</span>
                <RunDateBadge v-if="filterTune.shownKeptAt" :at="filterTune.shownKeptAt" kept />
            </div>
            <div class="grid max-w-lg grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
                <span class="text-xs text-muted">{{ $t("filterTuneSetting") }}</span>
                <span class="text-xs text-muted text-right">{{ $t("filterTuneBefore") }}</span>
                <span class="text-xs text-muted text-right">{{ $t("filterTuneAfter") }}</span>
                <template v-for="row in settingRows" :key="row.key">
                    <span class="text-muted">{{ row.label }}</span>
                    <span class="text-right tabular-nums">{{ row.before }}</span>
                    <span class="text-right tabular-nums" :class="row.changed ? 'font-medium text-highlighted' : ''">
                        {{ row.after }}
                    </span>
                </template>
            </div>
            <div v-if="result!.peaks.length" class="flex flex-col gap-1">
                <span class="text-xs text-muted">{{ $t("filterTunePeaks") }}</span>
                <div class="flex flex-wrap gap-1">
                    <UBadge
                        v-for="peak in result!.peaks"
                        :key="peak.hz"
                        :color="peak.fixed ? 'warning' : 'neutral'"
                        variant="subtle"
                        :icon="peak.inMap ? 'i-lucide-scan-line' : undefined"
                        :title="peakTitle(peak)"
                        :label="`${peak.hz.toFixed(0)} Hz +${peak.db.toFixed(0)} dB`"
                    />
                </div>
            </div>
            <span class="text-xs text-muted">
                {{ $t("filterTuneResidual", { db: result!.residual1x.toFixed(1), score: result!.score }) }}
            </span>
            <span v-if="lpf2Text" class="text-xs text-muted">{{ lpf2Text }}</span>
        </div>

        <UAlert
            v-if="revertMessage"
            :color="revertMessage.ok ? 'success' : 'error'"
            variant="subtle"
            :description="revertMessage.text"
        />
        <UButton
            v-if="status?.backupPresent"
            :label="$t('filterTuneRevert')"
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-undo-2"
            class="self-start"
            :loading="filterTune.busy"
            @click="revert"
        />
    </UiBox>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import RunDateBadge from "./RunDateBadge.vue";
import { i18n } from "@/js/localization";
import { useFilterTuneStore } from "@/stores/filterTune";
import type { FilterSettings, ResidualPeak } from "@/stores/filterTuneProtocol";

const filterTune = useFilterTuneStore();
const t = (key: string, params?: Record<string, unknown>) => i18n.getMessage(key, params);

const status = computed(() => filterTune.status);
// the measurement shown: the FC's live one, else the one kept when it was applied
const result = computed(() => filterTune.shownStatus);
const map = computed(() => filterTune.frameMap);
const mapParts = computed(() => {
    const parts = [];
    if (map.value?.hasTaps) {
        parts.push(t("frameMapPartTaps"));
    }
    if (map.value?.hasMotors) {
        parts.push(t("frameMapPartMotors"));
    }
    return parts.join(" + ").toLowerCase();
});

const requirements = computed<{ key: string; ok: boolean; label: string; title?: string }[]>(() => [
    {
        key: "map",
        ok: status.value?.hasFrameMap === true,
        // stored: which parts it holds; else what to run
        label:
            map.value && (map.value.hasTaps || map.value.hasMotors)
                ? t("filterTuneMapStored", { parts: mapParts.value })
                : t("filterTuneNeedsMap"),
        title: t("frameMapHelp"),
    },
    { key: "telemetry", ok: status.value?.hasTelemetry === true, label: t("filterTuneNeedsTelemetry") },
    { key: "mode", ok: filterTune.modeAssigned, label: t("filterTuneNeedsMode") },
]);

const stateColor = computed(() => {
    switch (status.value?.state) {
        case "applied":
            return "success";
        case "ready":
            return "primary";
        case "noFrameMap":
        case "noTelemetry":
        case "discarded":
            return "warning";
        default:
            return "neutral";
    }
});

const showProgress = computed(
    () => status.value !== null && (status.value.state === "collecting" || status.value.state === "ready"),
);
const showResult = computed(
    () =>
        result.value !== null &&
        (result.value.enoughFrames || result.value.state === "applied" || result.value.state === "discarded"),
);

const hz = (value: number): string => (value > 0 ? `${value} Hz` : t("filterTuneOff"));

function rows(proposed: FilterSettings) {
    const current = result.value!.current;
    const lpf1 =
        current.lpf1DynMinHz > 0 ? t("filterTuneDynMin", { hz: current.lpf1DynMinHz }) : hz(current.lpf1StaticHz);
    const list = [
        {
            key: "rpmWeights",
            label: t("filterTuneRpmWeights"),
            before: current.rpmWeights.join(" / "),
            after: proposed.rpmWeights.join(" / "),
        },
        { key: "rpmQ", label: t("filterTuneRpmQ"), before: `${current.rpmQ}`, after: `${proposed.rpmQ}` },
        {
            key: "dyn",
            label: t("filterTuneDynNotches"),
            before: `${current.dynNotchCount}`,
            after: `${proposed.dynNotchCount}`,
        },
        // the autotune turns gyro LPF1 off: the RPM filter and the notches do its job
        { key: "lpf1", label: t("filterTuneLpf1"), before: lpf1, after: t("filterTuneOff") },
        { key: "lpf2", label: t("filterTuneLpf2"), before: hz(current.lpf2Hz), after: hz(proposed.lpf2Hz) },
        {
            key: "notch1",
            label: t("filterTuneNotch1"),
            before: current.notch1Hz > 0 ? `${current.notch1Hz} / ${current.notch1CutoffHz} Hz` : t("filterTuneOff"),
            after: proposed.notch1Hz > 0 ? `${proposed.notch1Hz} / ${proposed.notch1CutoffHz} Hz` : t("filterTuneOff"),
        },
    ];
    return list.map((row) => ({ ...row, changed: row.before !== row.after }));
}

const settingRows = computed(() => (result.value ? rows(result.value.proposed) : []));

// Why LPF2 is where the autotune put it: the 4x/5x harmonics, the noise above 600 Hz, or a high peak
const lpf2Text = computed(() => {
    const st = result.value;
    if (!st?.lpf2Basis || st.lpf2Basis === "noData") {
        return "";
    }
    const worst45 = Math.max(...st.harmonics.flatMap((row) => [row[3], row[4]]));
    return t(`filterTuneLpf2Basis_${st.lpf2Basis}`, {
        harmonics: worst45.toFixed(1),
        band: st.highBandDb?.toFixed(1) ?? "?",
    });
});

function peakTitle(peak: ResidualPeak): string {
    const parts = [peak.fixed ? t("filterTunePeakFixed") : t("filterTunePeakMoving")];
    if (peak.inMap) {
        parts.push(t("filterTunePeakInMap"));
    }
    return parts.join(" · ");
}

const LED_STATES = [
    { key: "filterTuneLedCollecting", dot: "bg-info" },
    { key: "filterTuneLedReady", dot: "bg-success" },
    { key: "filterTuneLedDiscarded", dot: "bg-error" },
];

// Step 2 says how this craft tells the pilot there is enough data: the FC reports its signals (buzzer, LED
// strip, OSD); older firmware only beeps, so with it the buzzer is the only way.
const step2 = computed(() => {
    const sig = status.value?.signals;
    if (!sig) {
        return t("filterTuneStep2Beeps");
    }
    const ways = [
        sig.beeper ? t("filterTuneSignalBeeps") : "",
        sig.ledStrip ? t("filterTuneSignalLeds") : "",
        sig.osd ? t("filterTuneSignalOsd") : "",
    ].filter(Boolean);
    return ways.length ? t("filterTuneStep2Signals", { ways: ways.join(", ") }) : t("filterTuneStep2None");
});
const noSignal = computed(() => {
    const sig = status.value?.signals;
    return !!sig && !sig.beeper && !sig.ledStrip && !sig.osd;
});

const revertMessage = ref<{ ok: boolean; text: string } | null>(null);

async function revert() {
    const result = await filterTune.revert();
    revertMessage.value =
        result === "done"
            ? { ok: true, text: t("filterTuneReverted") }
            : { ok: false, text: t(result === "refused" ? "filterTuneRevertRefused" : "filterTuneRevertFailed") };
}
</script>
