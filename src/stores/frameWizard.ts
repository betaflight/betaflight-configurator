/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { isMspCancelled } from "../js/msp/mspErrors";
import { serial } from "../js/serial";
import { useConnectionStore } from "./connection";
import { useFlightControllerStore } from "./fc";
import {
    craftKey,
    hasMotors,
    hasTaps,
    keptRuns,
    loadHistory,
    mergeRuns,
    resultHasData,
    sameRun,
    saveHistory,
} from "./frameHistory";
import { parseSpinCheck, SPIN_CHECK_BASE, type SpinCheck } from "./frameSpinCheck";
import {
    DEFAULT_START,
    clockFactor,
    encodeAbort,
    encodeKeepalive,
    encodeStart,
    isActivePhase,
    parseFeaturesPage,
    parseResult,
    parseTapsPage,
    TAPS_PAGE_FEATURES,
    MOTOR_COUNT,
    RESPONSE_BINS,
    type SessionTap,
    type SessionTapFeatures,
    startParamsFor,
    parseStatus,
    type RunKind,
    type StartParams,
    type WizardResult,
    type WizardStatus,
} from "./frameWizardProtocol";

// The status (41 B a reply) is progress only, once a second is plenty: the result is read once at the end.
// The FC stops the motors 0.5 s after the last keepalive while they run (1.5 s otherwise); a status poll
// is one, and between polls the 1-byte keepalive op goes out every 200 ms, so one lost on the way is
// covered by the next.
const STATUS_MS = 1000;
const KEEPALIVE_MS = 200;
const IDLE_POLL_MS = 1000;

export type StartError = "refused" | "noReply" | "notStarted";

export const useFrameWizardStore = defineStore("frameWizard", () => {
    const connectionStore = useConnectionStore();

    /** null until probed; false when the firmware has no wizard (or an older payload). */
    const supported = ref<boolean | null>(null);
    const status = ref<WizardStatus | null>(null);
    const result = ref<WizardResult | null>(null);
    /** The FC's last run, whoever started it (kept on the FC until the next start), read when the tab opens. */
    const lastResult = ref<WizardResult | null>(null);
    const spinCheck = ref<SpinCheck | null>(null);
    /** When the last run was first seen; null when unknown. */
    const lastResultAt = ref<string | null>(null);
    /** The last run comes from this app's copy: the FC no longer has it (restarted since). */
    const lastResultKept = ref(false);
    /** When the last taps run and the last motor run were first seen; null when none is kept. */
    const lastTapsAt = ref<string | null>(null);
    const lastMotorsAt = ref<string | null>(null);
    /** The wizard was started from here; the checklist shows the FC's counts only then. */
    const started = ref(false);
    /** Which part runs (or ran last): taps for the frame and arms, motors for the motor run. */
    const runKind = ref<RunKind | null>(null);
    /**
     * The "props are off" gate, like motor test mode: the panel shows its controls only when set, and
     * motor test mode stays locked while it is (the two must never drive the motors together).
     */
    const enabled = ref(false);
    const starting = ref(false);
    const startError = ref<StartError | null>(null);
    /** RPM telemetry was missing when the wizard started (bases by command, no rotation mask). */
    const noRpmAtStart = ref(false);
    const clock = ref(1);

    let first: { fcMs: number; hostMs: number } | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;
    let statusInFlight = false;
    let lastStatusAt = Number.NEGATIVE_INFINITY;

    const active = computed(() => started.value && status.value !== null && isActivePhase(status.value.phase));
    const finished = computed(
        () => started.value && (status.value?.phase === "done" || status.value?.phase === "aborted"),
    );

    /** The link is a USB serial port: the FC will ask for the cable taps first. */
    const usbLink = computed(() => {
        const target = connectionStore.connectedTo;
        return typeof target === "string" && serial.selectProtocol(target) === serial._instance("serial");
    });

    async function query(code: number, data?: number[]): Promise<Uint8Array | null> {
        const response = await MSP.promise(code, data);
        if (!response || response.unsupported) {
            return null;
        }
        const view = response.data;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }

    async function refreshStatus(): Promise<WizardStatus | null> {
        const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_STATUS);
        const parsed = bytes ? parseStatus(bytes) : null;
        if (supported.value === null || !parsed) {
            supported.value = parsed !== null;
        }
        if (!parsed) {
            return null;
        }
        if (!started.value && !starting.value && isActivePhase(parsed.phase)) {
            // a session this panel did not start (a reload mid-run): polling would keep it alive unseen
            MSP.send_message(MSPCodes.MSP2_SET_FRAME_WIZARD, encodeAbort());
        }
        const wasActive = active.value;
        status.value = parsed;
        if (started.value && first === null) {
            first = { fcMs: parsed.fcMs, hostMs: performance.now() };
        }
        if (wasActive && !isActivePhase(parsed.phase)) {
            await fetchResult();
        }
        return parsed;
    }

    // The motor run's spin direction check; null when the FC has none (older firmware, a taps run, the buffers
    // lent to the filter autotune).
    async function fetchSpinCheck() {
        const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_RESPONSE, [SPIN_CHECK_BASE, 0]);
        spinCheck.value = bytes ? parseSpinCheck(bytes) : null;
    }

    /** The spin check of the last motor run, for the Motors tab; silent on firmware without it. */
    async function loadSpinCheck() {
        try {
            await fetchSpinCheck();
        } catch (error) {
            spinCheck.value = null;
            if (!isMspCancelled(error)) {
                console.warn("Spin check read failed:", error);
            }
        }
    }

    // The FC forgets its last run at power-off, and a motor run's result has no taps: this app keeps the last
    // taps run and the last motor run per craft (each with the date it was first seen) and shows them together.
    function remember(fcResult: WizardResult | null, finishedNow: boolean) {
        const key = craftKey(useFlightControllerStore().config.uid);
        let { taps, motors } = keptRuns(loadHistory(key));
        const now = new Date().toISOString();
        if (hasTaps(fcResult)) {
            const same = !finishedNow && taps !== undefined && sameRun(taps.result, fcResult);
            taps = { at: same ? taps!.at : now, result: fcResult };
        }
        if (hasMotors(fcResult)) {
            const same = !finishedNow && motors !== undefined && sameRun(motors.result, fcResult);
            // after arming the FC lends the buffers to the autotune: the spin check of the same run stays kept
            const spin = spinCheck.value ?? (same ? motors!.spinCheck : null);
            motors = { at: same ? motors!.at : now, result: fcResult, spinCheck: spin };
        }
        if (resultHasData(fcResult)) {
            saveHistory(key, { taps, motors, run: undefined });
        }
        lastResult.value = mergeRuns(taps?.result, motors?.result) ?? fcResult;
        spinCheck.value = motors?.spinCheck ?? spinCheck.value;
        lastTapsAt.value = taps?.at ?? null;
        lastMotorsAt.value = motors?.at ?? null;
        lastResultAt.value =
            [taps?.at, motors?.at]
                .filter((d): d is string => !!d)
                .sort((a, b) => a.localeCompare(b))
                .at(-1) ?? null;
        // kept: something shown that the FC no longer reports
        lastResultKept.value = (!!taps && !hasTaps(fcResult)) || (!!motors && !hasMotors(fcResult));
    }

    async function loadLastResult() {
        let fcResult: WizardResult | null = null;
        try {
            const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_RESULT);
            fcResult = bytes ? parseResult(bytes) : null;
            await fetchSpinCheck();
        } catch (error) {
            if (!isMspCancelled(error)) {
                console.warn("Frame wizard result read failed:", error);
            }
        }
        remember(fcResult, false);
    }

    async function fetchResult() {
        const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_RESULT);
        result.value = bytes ? parseResult(bytes) : null;
        await fetchSpinCheck();
        remember(result.value, true);
        if (first && status.value) {
            clock.value = clockFactor(first.fcMs, first.hostMs, status.value.fcMs, performance.now());
        }
    }

    function schedule() {
        if (!polling || supported.value === false) {
            return;
        }
        pollTimer = setTimeout(tick, active.value || starting.value ? KEEPALIVE_MS : IDLE_POLL_MS);
    }

    // the idle poll may be up to a second away: a running wizard needs the fast keepalive now
    function rescheduleNow() {
        if (polling && pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
            schedule();
        }
    }

    // Fixed rate: the next tick is armed before this one's reply. While the wizard runs, a tick that is
    // not due for a status poll (or finds one still waiting for its reply) sends the keepalive op; its reply
    // carries nothing.
    function tick() {
        pollTimer = null;
        if (!polling || supported.value === false) {
            return;
        }
        schedule();
        const now = performance.now();
        if (statusInFlight || (active.value && now - lastStatusAt < STATUS_MS)) {
            if (active.value) {
                MSP.send_message(MSPCodes.MSP2_SET_FRAME_WIZARD, encodeKeepalive());
            }
            return;
        }
        statusInFlight = true;
        lastStatusAt = now;
        refreshStatus()
            .catch((error: unknown) => {
                if (isMspCancelled(error)) {
                    // tab switch or disconnect: no link to keep alive, the FC times out on its own
                    stopPolling();
                    return;
                }
                console.warn("Frame wizard status poll failed:", error);
            })
            .finally(() => {
                statusInFlight = false;
            });
    }

    function startPolling() {
        if (polling) {
            return;
        }
        polling = true;
        tick();
    }

    function stopPolling() {
        polling = false;
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    /** One part of the frame test on its own. */
    function startRun(kind: RunKind): Promise<boolean> {
        runKind.value = kind;
        return start(startParamsFor(kind));
    }

    async function start(params: StartParams = DEFAULT_START): Promise<boolean> {
        starting.value = true;
        startError.value = null;
        result.value = null;
        clock.value = 1;
        first = null;
        try {
            const reply = await MSP.promise(MSPCodes.MSP2_SET_FRAME_WIZARD, encodeStart(params));
            if (!reply) {
                startError.value = "noReply";
                return false;
            }
            if (reply.unsupported) {
                // armed, a session already running, not four motors, or the accelerometer not calibrated
                startError.value = "refused";
                return false;
            }
            started.value = true;
            const now = await refreshStatus();
            if (!now || !isActivePhase(now.phase)) {
                startError.value = "notStarted";
                started.value = false;
                return false;
            }
            noRpmAtStart.value = !now.rpmTelemetry;
            rescheduleNow();
            return true;
        } catch (error) {
            if (!isMspCancelled(error)) {
                startError.value = "noReply";
            }
            return false;
        } finally {
            starting.value = false;
        }
    }

    async function abort() {
        try {
            await MSP.promise(MSPCodes.MSP2_SET_FRAME_WIZARD, encodeAbort());
            await refreshStatus();
        } catch (error) {
            if (!isMspCancelled(error)) {
                console.warn("Frame wizard abort failed:", error);
            }
        }
    }

    /**
     * The last run's taps as the FC kept them (label, peaks) and the features it classified them by,
     * for debugging a misclassified tap. Read page by page; the FC keeps them until the next start.
     */
    async function readSession() {
        const taps: SessionTap[] = [];
        for (let first = 0; ;) {
            const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_TAPS, [first]);
            const page = bytes ? parseTapsPage(bytes) : null;
            if (!page || page.taps.length === 0) {
                break;
            }
            taps.push(...page.taps);
            first = page.first + page.taps.length;
            if (first >= page.total) {
                break;
            }
        }
        const features: SessionTapFeatures[] = [];
        for (let page = 0; TAPS_PAGE_FEATURES + page <= 199; page++) {
            const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_TAPS, [TAPS_PAGE_FEATURES + page]);
            const parsed = bytes ? parseFeaturesPage(bytes) : null;
            if (!parsed || parsed.taps.length === 0) {
                break;
            }
            features.push(...parsed.taps);
            if (parsed.first + parsed.taps.length >= parsed.total) {
                break;
            }
        }
        const bySeq = new Map(features.map((f) => [f.seq, f]));
        await fetchSpinCheck();
        // the motor run's gain curves (motor command to gyro, roll / pitch / yaw, 128 log bins from 20 Hz to f1)
        // per base speed and motor, as the bench tools save them: "base/motor" (motor from 1); all zero once the
        // buffers went back to the taps or the filter autotune
        const curves: Record<string, number[][]> = {};
        for (let base = 0; base < 2; base++) {
            for (let motor = 0; motor < MOTOR_COUNT; motor++) {
                const bytes = await query(MSPCodes.MSP2_FRAME_WIZARD_RESPONSE, [base, motor]);
                if (bytes && bytes.byteLength >= 3 * RESPONSE_BINS * 2) {
                    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                    curves[`${base}/${motor + 1}`] = [0, 1, 2].map((axis) =>
                        Array.from(
                            { length: RESPONSE_BINS },
                            (_, b) => view.getUint16((axis * RESPONSE_BINS + b) * 2, true) / 10000,
                        ),
                    );
                }
            }
        }
        return {
            savedAt: new Date().toISOString(),
            runKind: runKind.value,
            status: status.value,
            result: result.value,
            clockFactor: clock.value,
            taps: taps.map((tap) => ({ ...tap, features: bySeq.get(tap.seq) ?? null })),
            curves,
            spinCheck: spinCheck.value,
        };
    }

    /** Back to the checklist before a new run; the result of the last run is dropped. */
    function reset() {
        started.value = false;
        runKind.value = null;
        result.value = null;
        startError.value = null;
        noRpmAtStart.value = false;
        clock.value = 1;
        first = null;
    }

    /** The panel leaves (tab switch, disconnect): stop a running wizard rather than wait for the keepalive. */
    function detach() {
        stopPolling();
        if (active.value) {
            MSP.send_message(MSPCodes.MSP2_SET_FRAME_WIZARD, encodeAbort());
        }
        reset();
        enabled.value = false;
        status.value = null;
        supported.value = null;
    }

    return {
        supported,
        status,
        result,
        lastResult,
        spinCheck,
        lastResultAt,
        lastResultKept,
        lastTapsAt,
        lastMotorsAt,
        loadSpinCheck,
        loadLastResult,
        started,
        runKind,
        enabled,
        starting,
        startError,
        noRpmAtStart,
        clock,
        active,
        finished,
        usbLink,
        startPolling,
        stopPolling,
        start,
        startRun,
        abort,
        readSession,
        reset,
        detach,
    };
});
