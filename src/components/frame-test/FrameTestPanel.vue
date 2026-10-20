<template>
    <UiBox v-if="wizard.supported" :title="$t('frameTestTitle')" :help="$t('frameTestHelp')" type="neutral">
        <p v-if="!wizard.active" class="text-sm text-muted">{{ $t("frameTestIntro") }}</p>
        <UAlert
            v-if="previousRunEnd"
            color="neutral"
            variant="subtle"
            icon="i-lucide-clock"
            :description="previousRunEnd"
        />

        <UAlert
            v-if="accProblem"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :description="accProblem"
        />

        <!-- the two parts, each started on its own; the motor run only behind the props-off switch -->
        <div v-if="!wizard.active" class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-2 rounded-md border border-default p-3">
                <div class="text-sm font-medium text-highlighted">{{ $t("frameTestRunTaps") }}</div>
                <p class="text-xs text-muted flex-1">{{ $t("frameTestRunTapsHint") }}</p>
                <UButton
                    :label="$t('frameTestStartTaps')"
                    size="xs"
                    icon="i-lucide-hand"
                    class="self-start"
                    :loading="wizard.starting && wizard.runKind === 'taps'"
                    :disabled="!canStart"
                    @click="wizard.startRun('taps')"
                />
            </div>
            <div class="flex flex-col gap-2 rounded-md border border-error/30 bg-error/5 p-3">
                <div class="text-sm font-medium text-highlighted">{{ $t("frameTestRunMotors") }}</div>
                <p class="text-xs text-muted">{{ $t("frameTestRunMotorsHint") }}</p>
                <p v-if="!tapsDone" class="text-xs text-warning">{{ $t("frameTestMotorsNeedTaps") }}</p>
                <p v-if="wizard.dshotBitbangFailed" class="text-xs text-error">{{ $t("frameTestDshotBitbang") }}</p>
                <p v-else-if="runAgainHint" class="text-xs text-info">{{ runAgainHint }}</p>
                <SettingRow :label="$t('frameTestEnable')" fullWidth>
                    <USwitch v-model="wizard.enabled" :disabled="!tapsDone" size="xs" />
                </SettingRow>
                <UButton
                    :label="$t('frameTestStartMotors')"
                    size="xs"
                    icon="i-lucide-fan"
                    color="error"
                    class="self-start"
                    :loading="wizard.starting && wizard.runKind === 'motors'"
                    :disabled="!canStart || !wizard.enabled || !tapsDone || wizard.dshotBitbangFailed"
                    @click="wizard.startRun('motors')"
                />
            </div>
        </div>

        <template v-if="wizard.started || wizard.startError">
            <!-- the steps only while the test runs: before it the intro says it all, after it the outcome -->
            <template v-if="wizard.started && !wizard.finished">
                <UAlert
                    v-if="learning"
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-ear"
                    :title="$t('frameTestLearningTitle')"
                    :description="$t('frameTestLearning')"
                />
                <UTimeline v-if="wizard.runKind !== 'motors'" :items="tapItems" size="md" :ui="timelineUi">
                    <template #indicator="{ item }">
                        <ProgressRing
                            :value="ringValue(item.step)"
                            :color="ringColor(item.step)"
                            :size="32"
                            :stroke-width="3"
                            :class="{ 'animate-pulse': item.step.clipped }"
                        >
                            <UIcon
                                v-if="item.step.state === 'done'"
                                name="i-lucide-check"
                                class="size-4 text-success"
                            />
                            <UIcon
                                v-else-if="item.step.id === 'acc' && item.step.state === 'error'"
                                name="i-lucide-x"
                                class="size-4 text-error"
                            />
                            <span
                                v-else
                                class="text-xs font-semibold"
                                :class="item.step.state === 'pending' ? 'text-muted' : 'text-highlighted'"
                            >
                                {{ item.step.state === "pending" ? item.ordinal : item.step.count }}
                            </span>
                        </ProgressRing>
                    </template>
                    <template #description="{ item }">
                        <span :class="item.step.clipped ? 'text-error' : ''">{{ item.description }}</span>
                    </template>
                </UTimeline>

                <p v-if="lastTapText" class="text-xs text-muted" aria-live="polite">{{ lastTapText }}</p>

                <!-- one note for the motor run: hold the craft before the motors start, and RPM telemetry missing -->
                <UAlert
                    v-if="runNote"
                    :color="runNote.color"
                    variant="subtle"
                    :icon="runNote.icon"
                    :title="runNote.title"
                    :description="runNote.description"
                    :ui="{ title: 'text-highlighted font-medium', description: 'text-default' }"
                />

                <div v-if="wizard.runKind !== 'taps'" class="flex flex-col gap-2">
                    <div class="text-sm font-medium text-highlighted">{{ $t("frameTestPhaseMotors") }}</div>
                    <UProgress
                        :model-value="motorsRunning || phase === 'done' ? spinPct : 0"
                        :max="100"
                        size="sm"
                        :color="phase === 'done' ? 'success' : 'primary'"
                        :aria-label="$t('frameTestSweep', { pct: spinPct })"
                    />
                    <UTimeline :items="motorItems" orientation="horizontal" size="md" :ui="timelineUi">
                        <template #indicator="{ item }">
                            <ProgressRing
                                :value="ringValue(item.step)"
                                :color="ringColor(item.step)"
                                :size="32"
                                :stroke-width="3"
                            >
                                <UIcon
                                    v-if="item.step.state === 'done'"
                                    name="i-lucide-check"
                                    class="size-4 text-success"
                                />
                                <UIcon
                                    v-else-if="item.step.id === 'spin'"
                                    name="i-lucide-rotate-cw"
                                    class="size-4"
                                    :class="
                                        item.step.state === 'error'
                                            ? 'text-error'
                                            : item.step.state === 'pending'
                                              ? 'text-muted'
                                              : 'text-highlighted'
                                    "
                                />
                                <span
                                    v-else
                                    class="text-xs font-semibold"
                                    :class="item.step.state === 'pending' ? 'text-muted' : 'text-highlighted'"
                                >
                                    {{ item.step.state === "pending" ? item.ordinal : item.step.count }}
                                </span>
                            </ProgressRing>
                        </template>
                    </UTimeline>
                </div>
            </template>

            <UAlert
                v-if="startErrorText"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-x"
                :description="startErrorText"
            />

            <!-- the run's end: one status row with Save session, the warnings, the taps' modes per point on request
                 (the resonances are on the chart, the motors' peaks and spin in Frame and motors) -->
            <template v-if="wizard.finished">
                <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
                    <span class="flex items-center gap-2 text-sm font-medium text-highlighted">
                        <UIcon
                            :name="phase === 'done' ? 'i-lucide-circle-check' : 'i-lucide-circle-stop'"
                            class="size-4 shrink-0"
                            :class="phase === 'done' ? 'text-success' : 'text-error'"
                        />
                        {{ endText }}
                    </span>
                    <UButton
                        :label="$t('frameTestSaveSession')"
                        color="neutral"
                        variant="outline"
                        size="xs"
                        icon="i-lucide-save"
                        :loading="savingSession"
                        @click="saveSession"
                    />
                </div>
                <ul v-if="warnings.length" class="flex flex-col gap-0.5 text-xs text-muted">
                    <li v-for="w in warnings" :key="w">{{ w }}</li>
                </ul>
                <UCollapsible v-if="result && pointRows.some((row) => row.modes.length)" class="text-sm">
                    <UButton
                        :label="$t('frameTestTapModes')"
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
                                v-for="row in pointRows"
                                :key="row.name"
                                class="grid grid-cols-[6rem_1fr] items-start gap-2 py-0.5"
                            >
                                <span class="text-muted">{{ row.name }}</span>
                                <div class="flex flex-wrap gap-1">
                                    <span v-if="row.modes.length === 0" class="text-dimmed">
                                        {{ $t("frameTestNoModes") }}
                                    </span>
                                    <UBadge
                                        v-for="(mode, i) in row.modes"
                                        :key="i"
                                        :color="mode.cable ? 'warning' : 'neutral'"
                                        variant="subtle"
                                        size="sm"
                                        :icon="mode.cable ? 'i-lucide-cable' : undefined"
                                        :title="
                                            mode.cable && !row.isCable
                                                ? $t('frameTestCableModeHelp')
                                                : $t('frameTestModeTaps', { count: mode.taps })
                                        "
                                        :label="`${hz(mode.hz)} Hz`"
                                    />
                                </div>
                            </div>
                            <p class="pt-1 text-xs text-muted">
                                {{
                                    $t("frameTestSessionTaps", {
                                        count: result.sessionTaps,
                                        clipped: result.clippedTaps,
                                    })
                                }}
                            </p>
                        </div>
                    </template>
                </UCollapsible>
            </template>

            <div v-if="wizard.active" class="flex gap-2">
                <UButton
                    :label="$t('frameTestAbort')"
                    color="error"
                    size="xs"
                    icon="i-lucide-octagon-x"
                    @click="wizard.abort()"
                />
            </div>
        </template>
    </UiBox>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import ProgressRing from "@/components/ProgressRing.vue";
import { i18n } from "@/js/localization";
import FileSystem from "@/js/FileSystem";
import { generateFilename } from "@/js/utils/generate_filename";
import { useFrameWizardStore } from "@/stores/frameWizard";
import { useFilterTuneStore } from "@/stores/filterTune";
import { heldAs } from "@/stores/filterTuneProtocol";
import {
    END_DONE,
    LABEL_CLIPPED,
    LABEL_NONE,
    LABEL_PENDING,
    LABEL_UNKNOWN,
    MOTOR_COUNT,
    POINT_CABLE,
    POINT_COUNT,
    isTapPhase,
    motorChecklist,
    tapChecklist,
    type ChecklistStep,
    hasTaps,
    stepState,
} from "@/stores/frameWizardProtocol";
import { spinText } from "./spinText";
import { spinVerdict } from "@/stores/frameSpinCheck";

const emit = defineEmits<{
    /** A run ended (done or aborted): the FC has stored its part of the frame map if it was done. */
    finished: [];
}>();

const wizard = useFrameWizardStore();
const filterTune = useFilterTuneStore();

// Turning the props-off switch off stops a motor run.
watch(
    () => wizard.enabled,
    (on) => {
        if (!on && wizard.active && wizard.runKind === "motors") {
            void wizard.abort();
        }
    },
);

watch(
    () => wizard.finished,
    (finished) => {
        if (finished) {
            // the props-off confirmation is for one motor run: the next one asks again
            if (wizard.runKind === "motors") {
                wizard.enabled = false;
            }
            emit("finished");
        }
    },
);
const t = (key: string, params?: Record<string, unknown>) => i18n.getMessage(key, params);

// a done step joins the next with a success line
const DONE_SEPARATOR = "[&_[data-slot=separator]]:bg-success";

const timelineUi = {
    indicator: "bg-transparent size-8",
    title: "text-sm",
    description: "text-xs",
};

const phase = computed(() => wizard.status?.phase ?? "idle");
// the FC collects the first taps unlabelled until they come from several directions
const learning = computed(() => wizard.started && phase.value === "taps" && wizard.status?.learning === true);

const savingSession = ref(false);

// The run's taps with their labels, peaks and classification features, for debugging a mislabelled tap.
async function saveSession() {
    savingSession.value = true;
    try {
        const session = await wizard.readSession();
        const file = await FileSystem.pickSaveFile(
            generateFilename("frame_test_session", "json"),
            t("fileSystemPickerFiles", { typeof: "JSON" }),
            ".json",
            "frame-test-session",
        );
        if (file) {
            await FileSystem.writeFile(file, JSON.stringify(session, null, 1));
        }
    } catch (error) {
        console.warn("Saving the frame test session failed:", error);
    } finally {
        savingSession.value = false;
    }
}
const motorsRunning = computed(() => wizard.started && (phase.value === "motors" || phase.value === "analyse"));
const spinPct = computed(() => (phase.value === "done" ? 100 : (wizard.status?.spin ?? 0)));
const result = computed(() => wizard.result);

const accOk = computed(() => wizard.status?.accPresent === true && wizard.status.accCalibrated);
const accProblem = computed(() => {
    const status = wizard.status;
    if (!status || accOk.value) {
        return "";
    }
    return status.accPresent ? t("frameTestAccNotCalibrated") : t("frameTestAccMissing");
});

const canStart = computed(() => accOk.value && !wizard.starting && !wizard.active && !!wizard.status);

// The motor run comes after the taps part: the frame map on the FC has its taps part (firmware with the
// filter autotune), or the FC's last run was a finished taps run (firmware without the map).
const tapsDone = computed(() => filterTune.frameMap?.hasTaps === true || hasTaps(wizard.lastResult));

function pointName(point: number): string {
    if (point < 4) {
        return t("frameTestStepArm", { n: point + 1 });
    }
    return point === POINT_CABLE ? t("frameTestStepCable") : t("frameTestStepFrame");
}

function tapDescription(step: ChecklistStep, point: number, hint: string): string {
    if (step.clipped) {
        return t("frameTestTooStrong");
    }
    if (!wizard.started || step.state === "pending") {
        return hint;
    }
    return t("frameTestTapCount", { count: step.count, modes: wizard.status?.confirmed[point] ?? 0 });
}

const tapItems = computed(() => {
    const ctx = { started: wizard.started, usbLink: wizard.usbLink };
    return tapChecklist(wizard.status, ctx).map((step, index) => {
        let title: string;
        let description: string;
        if (step.id === "acc") {
            title = t("frameTestStepAcc");
            description = "";
        } else if (step.id === "cable") {
            title = t("frameTestStepCable");
            description = tapDescription(step, POINT_CABLE, t("frameTestStepCableHint"));
        } else if (step.id === "frame") {
            title = t("frameTestStepFrame");
            description = tapDescription(step, 4, t("frameTestStepFrameHint"));
        } else {
            const arm = Number(step.id.slice(3));
            title = t("frameTestStepArm", { n: arm });
            description = tapDescription(step, arm - 1, t("frameTestStepArmHint", { n: arm }));
        }
        if (step.learning) {
            description = t("frameTestStepLearning");
        }
        return {
            value: step.id,
            title,
            description,
            step,
            ordinal: index + 1,
            class: tapItemClass(step),
        };
    });
});

function tapItemClass(step: ChecklistStep): string | undefined {
    if (step.state === "done") {
        return DONE_SEPARATOR;
    }
    return step.learning ? "opacity-50" : undefined;
}

function spinStepProgress(verdict: unknown, running: boolean, spin: number | undefined): number {
    if (verdict) {
        return 1;
    }
    return running && spin !== undefined ? spin / 100 : 0;
}

// After the motors, their spin direction: each motor alone, the sign of its yaw answer (bench firmware).
const spinItem = computed(() => {
    const status = wizard.status;
    const running = wizard.started && status !== null && (status.phase === "motors" || status.phase === "analyse");
    const runDone = wizard.started && status?.phase === "done";
    const check = runDone && wizard.spinCheck?.done ? wizard.spinCheck : null;
    const verdict = check ? spinVerdict(check) : null;
    const step: ChecklistStep = {
        id: "spin",
        state: stepState(verdict?.ok === true, verdict?.ok === false, running),
        count: 0,
        progress: spinStepProgress(verdict, running, status?.spin),
        clipped: false,
    };
    let description: string | undefined;
    if (verdict) {
        description = spinText(verdict);
    } else if (runDone) {
        description = t("frameSpinNone");
    }
    return { value: step.id, title: t("frameTestStepSpin"), description, step, ordinal: MOTOR_COUNT + 1 };
});

const motorItems = computed(() => [
    ...motorChecklist(wizard.status, { started: wizard.started, usbLink: wizard.usbLink }).map((step, index) => ({
        value: step.id,
        title: t("frameTestStepMotor", { n: index + 1 }),
        description: step.state === "pending" ? undefined : t("frameTestResonanceCount", { count: step.count }),
        step,
        ordinal: index + 1,
        class: step.state === "done" ? DONE_SEPARATOR : undefined,
    })),
    spinItem.value,
]);

function ringValue(step: ChecklistStep): number {
    return step.state === "error" ? 100 : Math.round(step.progress * 100);
}

function ringColor(step: ChecklistStep): string {
    return { pending: "primary", active: "primary", done: "success", error: "error" }[step.state];
}

const lastTapText = computed(() => {
    const status = wizard.status;
    if (!wizard.started || !status || !isTapPhase(status.phase) || status.label === LABEL_NONE) {
        return "";
    }
    let label: string;
    if (status.label === LABEL_UNKNOWN) {
        label = t("frameTestLabelUnknown");
    } else if (status.label === LABEL_PENDING) {
        label = t("frameTestLabelPending");
    } else if (status.label === LABEL_CLIPPED) {
        label =
            status.clippedPoint === null
                ? t("frameTestLabelClipped")
                : `${pointName(status.clippedPoint)}: ${t("frameTestLabelClipped")}`;
    } else if (status.label >= 0 && status.label < POINT_COUNT) {
        label = pointName(status.label);
    } else {
        return "";
    }
    return t("frameTestLastTap", { seq: status.seq, label });
});

// Modes only the last motor run found may be the support or the grip: a second run, held another way, tells.
const runAgainHint = computed(() => {
    const map = filterTune.frameMap;
    if (!map?.modes.some((m) => m.fromMotors && m.motorOnce)) {
        return "";
    }
    const held = map.runGravity ? t(`frameTestHeld_${heldAs(map.runGravity)}`) : "";
    return held ? t("frameTestRunAgainHeld", { held }) : t("frameTestRunAgain");
});

const runNote = computed(() => {
    const beep = phase.value === "beep";
    const noRpm = wizard.active && wizard.noRpmAtStart;
    if (!beep && !noRpm) {
        return null;
    }
    // set up for RPM telemetry, yet none: the ESCs do not answer
    const rpmText = filterTune.telemetryConfigured ? t("frameTestNoRpmEscs") : t("frameTestNoRpm");
    return {
        color: noRpm ? ("warning" as const) : ("neutral" as const),
        icon: beep ? "i-lucide-hand" : "i-lucide-gauge",
        title: beep ? t(wizard.runKind === "motors" ? "frameTestBeepMotors" : "frameTestBeep") : undefined,
        description: noRpm ? rpmText : undefined,
    };
});

const startErrorText = computed(() => {
    switch (wizard.startError) {
        case "refused":
            return t("frameTestStartRefused");
        case "noReply":
            return t("frameTestStartNoReply");
        case "notStarted":
            return t("frameTestStartNotStarted");
        case "noBattery":
            return t("frameTestStartNoBattery");
        default:
            return "";
    }
});

// A run the FC ended while this panel was not following it (the app reconnected, or the tab was
// reopened): its end reason still sits in the status until the next start.
const previousRunEnd = computed(() => {
    const status = wizard.status;
    if (wizard.started || !status || status.phase !== "aborted") {
        return "";
    }
    return t("frameTestPreviousRun", { end: endText.value });
});

const endText = computed(() => {
    const status = wizard.status;
    if (!status || status.endReason === END_DONE) {
        return t("frameTestDone");
    }
    const reason =
        status.endReason >= 2 && status.endReason <= 14
            ? t(`frameTestEnd${status.endReason}`, { hz: status.loopHz })
            : t("frameTestEndUnknown");
    if (status.phase === "done") {
        // the taps went into the map, the motors had no power, no telemetry or no DShot (11, 12, 13)
        return status.endReason >= 11 ? t("frameTestDoneNoMotors", { reason }) : t("frameTestDone");
    }
    return t("frameTestAborted", { reason });
});

const hz = (value: number): string => (value * wizard.clock).toFixed(0);

const byHz = <T extends { hz: number }>(list: T[]): T[] => [...list].sort((a, b) => a.hz - b.hz);

const pointRows = computed(() => {
    const res = result.value;
    if (!res) {
        return [];
    }
    // arms, frame, then the cable (its own modes, which the marks on the others refer to)
    return res.points
        .map((modes, point) => ({ name: pointName(point), modes: byHz(modes), isCable: point === POINT_CABLE }))
        .filter((row) => !(row.isCable && res.noCable));
});

const noModePoints = computed(() => {
    const res = result.value;
    if (!res) {
        return "";
    }
    const names: string[] = [];
    for (let point = 0; point < POINT_COUNT; point++) {
        if (res.noModeMask & (1 << point) && !(point === POINT_CABLE && res.noCable)) {
            names.push(pointName(point));
        }
    }
    return names.join(", ");
});

const warnings = computed(() => {
    const res = result.value;
    if (!res) {
        return [];
    }
    const list: string[] = [];
    if (noModePoints.value) {
        list.push(t("frameTestNoMode", { points: noModePoints.value }));
    }
    if (res.noCable) {
        list.push(t("frameTestNotUsb"));
    }
    if (res.speedLimited) {
        list.push(t("frameTestSpeedLimited"));
    }
    if (!res.rpmMask && res.rotationHz[0] > 0) {
        list.push(t("frameTestNoRpm"));
    }
    return list;
});

// Same convention as motor test mode: Escape stops a running wizard.
function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && wizard.active) {
        void wizard.abort();
    }
}

onMounted(() => {
    wizard.startPolling();
    document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
    document.removeEventListener("keydown", onKeydown);
    wizard.detach();
});
</script>
