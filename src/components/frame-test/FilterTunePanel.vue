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
                <!-- the mode's switch right now, in the mode's own row -->
                <UBadge
                    v-if="item.key === 'mode' && status"
                    :color="status.modeOn ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                    icon="i-lucide-radio"
                    :label="status.modeOn ? $t('filterTuneModeOn') : $t('filterTuneModeOff')"
                />
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

        <!-- idle has nothing to say -->
        <div
            v-if="status && status.state !== 'idle'"
            class="flex flex-wrap items-center gap-2 border-t border-default pt-3"
        >
            <UBadge
                :color="stateColor"
                variant="subtle"
                size="lg"
                :label="$t(`filterTuneState_${status.state}`, { hz: status.loop?.measuredHz, set: status.loop?.setHz })"
            />
        </div>

        <div v-if="showProgress" class="flex flex-col gap-1.5">
            <UProgress
                :model-value="Math.min(status!.frames, status!.minFrames)"
                :max="status!.minFrames"
                size="sm"
                :color="status!.enoughFrames ? 'success' : 'primary'"
            />
            <span class="text-xs text-muted tabular-nums">
                {{ $t("filterTuneFrames", { frames: status!.frames, min: status!.minFrames }) }}
                <template v-if="status!.carried?.flights">
                    ·
                    {{ $t("filterTuneCarried", { frames: status!.carried.frames, flights: status!.carried.flights }) }}
                </template>
            </span>
            <span v-if="sweepText" class="text-xs text-info">{{ sweepText }}</span>
        </div>

        <div class="flex flex-col gap-3 border-t border-default pt-3">
            <!-- the craft can tell the pilot nothing in flight: say so before the flight -->
            <p v-if="noSignal" class="flex items-start gap-2 text-xs text-warning">
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
                {{ $t("filterTuneNoSignal") }}
            </p>
            <ol class="list-decimal pl-8 text-xs text-muted flex flex-col gap-1">
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
                <li v-if="status?.sweep">{{ $t("filterTuneStepSweep") }}</li>
                <li>{{ status?.carried ? $t("filterTuneStep3Beacon") : $t("filterTuneStep3") }}</li>
            </ol>
        </div>

        <!-- before / after -->
        <div v-if="showResult" class="flex flex-col gap-3 border-t border-default pt-3">
            <span class="text-sm font-medium text-highlighted">{{ $t("filterTuneResult") }}</span>
            <div class="grid w-full grid-cols-[1fr_minmax(8rem,auto)_minmax(8rem,auto)] text-sm">
                <span class="pb-1 text-xs text-muted">{{ $t("filterTuneSetting") }}</span>
                <span class="pb-1 pl-6 text-right text-xs text-muted">{{ $t("filterTuneBefore") }}</span>
                <span class="pb-1 pl-6 text-right text-xs text-muted">{{ $t("filterTuneAfter") }}</span>
                <template v-for="row in settingRows" :key="row.key">
                    <span class="border-t border-default py-1.5 text-muted">{{ row.label }}</span>
                    <span class="border-t border-default py-1.5 pl-6 text-right tabular-nums">{{ row.before }}</span>
                    <span
                        class="border-t border-default py-1.5 pl-6 text-right tabular-nums"
                        :class="row.changed ? 'font-medium text-highlighted' : 'text-muted'"
                    >
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
            <!-- what the measurement says, line by line -->
            <ul class="flex flex-col gap-2 border-t border-default pt-3 text-xs text-muted">
                <li>{{ $t("filterTuneResidual", { db: result!.residual1x.toFixed(1), score: result!.score }) }}</li>
                <li v-if="lpf2Text">{{ lpf2Text }}</li>
                <li v-if="sweepResult">{{ sweepResult }}</li>
            </ul>
        </div>

        <UAlert
            v-if="revertMessage"
            :color="revertMessage.ok ? 'success' : 'error'"
            variant="subtle"
            :description="revertMessage.text"
        />
        <!-- as the frame test's Abort: centred under a line -->
        <div v-if="status?.backupPresent" class="flex justify-center border-t border-default pt-4">
            <UButton
                :label="$t('filterTuneRevert')"
                color="neutral"
                variant="outline"
                size="xs"
                icon="i-lucide-undo-2"
                :loading="filterTune.busy"
                @click="revert"
            />
        </div>
    </UiBox>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import { i18n } from "@/js/localization";
import { useFilterTuneStore } from "@/stores/filterTune";
import { useFrameWizardStore } from "@/stores/frameWizard";
import type { FilterSettings, ResidualPeak } from "@/stores/filterTuneProtocol";

const filterTune = useFilterTuneStore();
const wizard = useFrameWizardStore();
const t = (key: string, params?: Record<string, unknown>) => i18n.getMessage(key, params);

const status = computed(() => filterTune.status);
// the measurement shown: the FC's live one, else the one kept when it was applied
const result = computed(() => filterTune.status);
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
    {
        key: "telemetry",
        ok:
            status.value?.hasTelemetry === true ||
            (filterTune.telemetryConfigured === true && !wizard.dshotBitbangFailed),
        label: t("filterTuneNeedsTelemetry"),
    },
    { key: "mode", ok: filterTune.modeAssigned, label: t("filterTuneNeedsMode") },
    // the D-term rule works out the motors' heat from these (firmware with the sweep)
    ...(status.value?.sweep ? [motorRequirement.value] : []),
]);

const motorRequirement = computed(() => {
    const m = filterTune.motorSpec;
    const ok = !!m && m.kv > 0 && m.statorDiameterMm > 0 && m.statorHeightMm > 0;
    return {
        key: "motor",
        ok,
        label: ok
            ? t("filterTuneMotorSet", { kv: m!.kv, d: m!.statorDiameterMm, h: m!.statorHeightMm })
            : t("filterTuneNeedsMotor"),
    };
});

const stateColor = computed(() => {
    switch (status.value?.state) {
        case "applied":
            return "success";
        case "ready":
        case "partial":
        case "exciting":
            return "primary";
        case "bitbang":
        case "loopSlow":
            return "error";
        case "noFrameMap":
        case "noTelemetry":
        case "discarded":
            return "warning";
        default:
            return "neutral";
    }
});

const showProgress = computed(
    () => status.value !== null && ["collecting", "ready", "partial", "exciting"].includes(status.value.state),
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
    // the D-term filters, scaled together with LPF2 for the least P+D delay
    const d = result.value!.dterm;
    if (d) {
        const now = `${d.current.dynMinHz}–${d.current.dynMaxHz} / ${hz(d.current.lpf2Hz)}`;
        // the D-term filters live in a PID profile: the one they went to, else the current one they would go to
        const pid = result.value!.pidProfile;
        const profile = pid ? (pid.applied ?? pid.current) + 1 : null;
        const label = profile ? t("filterTuneDtermProfile", { n: profile }) : t("filterTuneDterm");
        list.push({ key: "dterm", label, before: now, after: d.mult ? `×${d.mult}` : now });
    }
    return list.map((row) => ({ ...row, changed: row.before !== row.after }));
}

const settingRows = computed(() => (result.value ? rows(result.value.proposed) : []));

// Why LPF2 is where the autotune put it: the 4x/5x harmonics, the noise above 600 Hz, or a high peak
// While the craft is swept: what it waits for, or which axis it sweeps
const sweepText = computed(() => {
    const st = status.value;
    if (st?.state !== "exciting" || !st.sweep) {
        return "";
    }
    return t(`filterTuneSweep_${st.sweep.phase}`);
});

// What the sweep found, and the heat the D-term pick is held to; or why it stopped
const sweepResult = computed(() => {
    const sw = result.value?.sweep;
    if (!sw) {
        return "";
    }
    if (sw.phase === "aborted") {
        return t("filterTuneSweepStopped", { reason: t(`filterTuneSweepEnd_${sw.end}`) });
    }
    if (sw.crossoverHz.roll === null) {
        return "";
    }
    return t("filterTuneSweepResult", {
        roll: sw.crossoverHz.roll.toFixed(0),
        pitch: sw.crossoverHz.pitch?.toFixed(0) ?? "—",
        pmRoll: sw.phaseMarginDeg.roll,
        pmPitch: sw.phaseMarginDeg.pitch,
        heat: sw.heatPickK.toFixed(2),
        stock: sw.heatStockK.toFixed(2),
        budget: sw.heatBudgetK.toFixed(1),
    });
});

const lpf2Text = computed(() => {
    const st = result.value;
    if (!st?.lpf2Basis || st.lpf2Basis === "noData") {
        return "";
    }
    const worst45 = Math.max(...st.harmonics.flatMap((row) => [row[3], row[4]]));
    return t(`filterTuneLpf2Basis_${st.lpf2Basis}`, {
        harmonics: worst45.toFixed(1),
        band: st.highBandDb?.toFixed(1) ?? "?",
        delay: st.dterm?.delayUs ?? "?",
        stock: st.dterm?.stockDelayUs ?? "?",
        input: st.dterm?.inputPct ?? "?",
        noise: st.dterm?.noisePct ?? "?",
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
    { key: "filterTuneLedReady", dot: "bg-violet-500" },
    { key: "filterTuneLedCollecting", dot: "bg-info" },
    { key: "filterTuneLedLand", dot: "bg-success" },
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
