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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
    LABEL_CLIPPED,
    LABEL_PENDING,
    clockFactor,
    encodeAbort,
    encodeStart,
    motorChecklist,
    motorRunSummary,
    cableModesHz,
    nearAnyHz,
    parseFeaturesPage,
    parseTapsPage,
    parseResult,
    parseStatus,
    summarizeResonances,
    tapChecklist,
    type Resonance,
    type WizardResult,
    type WizardStatus,
} from "../../src/stores/frameWizardProtocol";

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/serial", () => {
    const usb = { name: "serial" };
    return {
        serial: {
            selectProtocol: (target: string) => (target.startsWith("bluetooth") ? { name: "bluetooth" } : usb),
            _instance: (name: string) => (name === "serial" ? usb : undefined),
        },
    };
});
vi.mock("../../src/stores/connection", () => ({ useConnectionStore: () => ({ connectedTo: "/dev/tty.usbmodem1" }) }));

/** Writes like the firmware's sbuf: little endian. */
class Sbuf {
    bytes: number[] = [];
    u8(v: number) {
        this.bytes.push(v & 0xff);
        return this;
    }
    u16(v: number) {
        return this.u8(v).u8(v >> 8);
    }
    u32(v: number) {
        return this.u16(v & 0xffff).u16(v >>> 16);
    }
}

const PHASE = { idle: 0, taps: 1, beep: 2, motors: 3, analyse: 4, done: 5, aborted: 6, cable: 7 };

interface StatusFields {
    phase?: number;
    counts?: number[];
    confirmed?: number[];
    beeped?: number;
    seq?: number;
    labelCode?: number;
    spin?: number;
    fcMs?: number;
    flags?: number;
    live?: number[];
    clipped?: number;
    end?: number;
}

// frameWizardWriteStatus(), field by field
function statusPayload(f: StatusFields = {}): number[] {
    const b = new Sbuf().u8(4).u8(f.phase ?? PHASE.idle);
    for (let r = 0; r < 6; r++) {
        b.u8(f.counts?.[r] ?? 0).u8(f.confirmed?.[r] ?? 0);
    }
    b.u8(f.beeped ?? 0)
        .u16(f.seq ?? 0)
        .u8(f.labelCode ?? 0)
        .u8(f.spin ?? 0)
        .u32(f.fcMs ?? 0)
        .u16(4000)
        .u8(f.flags ?? 0b110);
    for (let m = 0; m < 4; m++) {
        b.u8(f.live?.[m] ?? 0);
    }
    return b.u8(f.clipped ?? 0xff).u8(f.end ?? 0).bytes;
}

function status(f: StatusFields = {}): WizardStatus {
    const parsed = parseStatus(statusPayload(f));
    if (!parsed) {
        throw new Error("status did not parse");
    }
    return parsed;
}

// frameWizardWriteResult(): arm 1 has a cable mode, the cable its own, motor 2 one peak on one speed
function resultPayload(phase = PHASE.done): number[] {
    const b = new Sbuf().u8(4).u8(phase);
    b.u8(2).u16(1825).u8(4).u8(0).u16(4410).u8(3).u8(1); // arm 1: 182.5 Hz, 441.0 Hz (cable)
    b.u8(0); // arm 2
    b.u8(0); // arm 3
    b.u8(0); // arm 4
    b.u8(1).u16(2500).u8(5).u8(0); // frame
    b.u8(1).u16(4400).u8(5).u8(0); // cable
    b.u8(0); // motor 1
    b.u8(1)
        .u16(3333)
        .u16(1234)
        .u8(1 | (1 << 4) | 0x80); // motor 2: 333.3 Hz pitch, one speed, cable
    b.u8(1)
        .u16(1000)
        .u16(10000)
        .u8(2 | (2 << 4)); // motor 3: 100 Hz yaw, both speeds
    b.u8(0); // motor 4
    b.u16(1205).u16(2010); // rotation Hz x10
    b.u8(0b0011); // rpm mask, bases by rpm
    b.u16(1180).u16(1320); // base commands
    b.u16(40).u16(35); // amplitude headroom
    b.u16(1600); // f1
    b.u8(27).u8(2).u8(0b000100); // taps, clipped, no-mode mask: arm 3
    return b.u8(40).u8(41).u8(42).u8(43).bytes;
}

describe("frame wizard payloads", () => {
    it("encodes the start like the bench host (struct <BHHHBHBHHB)", () => {
        expect(encodeStart()).toEqual([1, 0x7e, 0x04, 0x14, 0x05, 40, 0, 15, 0xa4, 0x06, 0, 0, 0, 0, 0, 0]);
        expect(encodeAbort()).toEqual([0]);
    });

    it("parses every status field", () => {
        const s = status({
            phase: PHASE.taps,
            counts: [1, 2, 3, 4, 5, 5],
            confirmed: [0, 1, 0, 2, 1, 1],
            beeped: 0b110000,
            seq: 513,
            labelCode: 4,
            spin: 37,
            fcMs: 0xfffffff0,
            flags: 0b111,
            live: [1, 2, 3, 4],
            clipped: 2,
            end: 3,
        });
        expect(s).toMatchObject({
            phase: "taps",
            counts: [1, 2, 3, 4, 5, 5],
            confirmed: [0, 1, 0, 2, 1, 1],
            beeped: 0b110000,
            seq: 513,
            label: 2,
            spin: 37,
            fcMs: 0xfffffff0,
            loopHz: 4000,
            rpmTelemetry: true,
            accPresent: true,
            accCalibrated: true,
            live: [1, 2, 3, 4],
            clippedPoint: 2,
            endReason: 3,
        });
    });

    it("maps the label codes: none, unknown, pending, clipped", () => {
        expect(status({ labelCode: 0 }).label).toBe(-2);
        expect(status({ labelCode: 1 }).label).toBe(-1);
        expect(status({ labelCode: 9 }).label).toBe(LABEL_PENDING);
        expect(status({ labelCode: 10 }).label).toBe(LABEL_CLIPPED);
        expect(status({ clipped: 0xff }).clippedPoint).toBeNull();
    });

    it("rejects older and truncated payloads", () => {
        const old = statusPayload();
        old[0] = 3;
        expect(parseStatus(old)).toBeNull();
        expect(parseStatus(statusPayload().slice(0, 20))).toBeNull();
        expect(parseResult(resultPayload().slice(0, 30))).toBeNull();
    });

    it("parses the result", () => {
        const r = parseResult(resultPayload());
        expect(r).not.toBeNull();
        expect(r!.phase).toBe("done");
        expect(r!.points[0]).toEqual([
            { hz: 182.5, taps: 4, cable: false },
            { hz: 441, taps: 3, cable: true },
        ]);
        expect(r!.points[4]).toEqual([{ hz: 250, taps: 5, cable: false }]);
        expect(r!.points[5]).toEqual([{ hz: 440, taps: 5, cable: false }]);
        expect(r!.motors[0]).toEqual([]);
        expect(r!.motors[1]).toEqual([{ hz: 333.3, gain: 0.1234, axis: "pitch", speeds: 1, cable: true }]);
        expect(r!.motors[2]).toEqual([{ hz: 100, gain: 1, axis: "yaw", speeds: 2, cable: false }]);
        expect(r!.rotationHz).toEqual([120.5, 201]);
        expect(r).toMatchObject({
            rpmMask: true,
            basesByRpm: true,
            speedLimited: false,
            noCable: false,
            baseCommand: [1180, 1320],
            f1Hz: 1600,
            sessionTaps: 27,
            clippedTaps: 2,
            noModeMask: 0b100,
            amplitude: [40, 41, 42, 43],
        });
    });
});

describe("frame wizard checklist", () => {
    const ids = (steps: { id: string }[]) => steps.map((s) => s.id);

    it("asks for the cable before the start only on a USB link", () => {
        const idle = status();
        expect(ids(tapChecklist(idle, { started: false, usbLink: true }))).toEqual([
            "acc",
            "cable",
            "frame",
            "arm1",
            "arm2",
            "arm3",
            "arm4",
        ]);
        expect(ids(tapChecklist(idle, { started: false, usbLink: false }))).not.toContain("cable");
    });

    it("drops the cable once the FC skipped it, keeps it once tapped", () => {
        const skipped = status({ phase: PHASE.taps, beeped: 1 << 5 });
        expect(ids(tapChecklist(skipped, { started: true, usbLink: true }))).not.toContain("cable");
        const tapped = status({ phase: PHASE.taps, beeped: 1 << 5, counts: [0, 0, 0, 0, 0, 5] });
        const cable = tapChecklist(tapped, { started: true, usbLink: false }).find((s) => s.id === "cable");
        expect(cable?.state).toBe("done");
    });

    it("the cable step blocks the points: only it is active in the cable phase", () => {
        const s = status({ phase: PHASE.cable, counts: [0, 0, 0, 0, 0, 2] });
        const steps = tapChecklist(s, { started: true, usbLink: true });
        expect(steps.find((x) => x.id === "cable")).toMatchObject({ state: "active", count: 2, progress: 0.4 });
        expect(steps.filter((x) => x.id !== "acc" && x.id !== "cable").every((x) => x.state === "pending")).toBe(true);
    });

    it("blinks only the point of a too-strong tap, and not once it is done", () => {
        const s = status({
            phase: PHASE.taps,
            labelCode: 10,
            clipped: 2,
            counts: [5, 0, 3, 0, 0, 5],
            beeped: 0b100001,
        });
        const steps = tapChecklist(s, { started: true, usbLink: true });
        expect(steps.find((x) => x.id === "arm3")).toMatchObject({ state: "error", clipped: true, count: 3 });
        expect(steps.find((x) => x.id === "arm1")).toMatchObject({ state: "done", clipped: false });
        expect(steps.filter((x) => x.clipped)).toHaveLength(1);
        const unknown = status({ phase: PHASE.taps, labelCode: 10, clipped: 0xff });
        expect(tapChecklist(unknown, { started: true, usbLink: true }).some((x) => x.clipped)).toBe(false);
    });

    it("flags an uncalibrated or missing accelerometer", () => {
        expect(tapChecklist(status({ flags: 0b010 }), { started: false, usbLink: true })[0].state).toBe("error");
        expect(tapChecklist(status({ flags: 0b100 }), { started: false, usbLink: true })[0].state).toBe("error");
        expect(tapChecklist(status({ flags: 0b110 }), { started: false, usbLink: true })[0].state).toBe("done");
        expect(tapChecklist(null, { started: false, usbLink: true })[0].state).toBe("pending");
    });

    it("ignores an earlier session's counts until started here", () => {
        const s = status({ phase: PHASE.done, counts: [5, 5, 5, 5, 5, 5], beeped: 0x3f, live: [3, 3, 3, 3] });
        expect(
            tapChecklist(s, { started: false, usbLink: true })
                .slice(1)
                .every((x) => x.state === "pending"),
        ).toBe(true);
        expect(motorChecklist(s, { started: false, usbLink: true }).every((x) => x.state === "pending")).toBe(true);
    });

    it("motors: active with the sweep progress, done at the end", () => {
        const running = motorChecklist(status({ phase: PHASE.motors, spin: 50, live: [0, 1, 2, 3] }), {
            started: true,
            usbLink: true,
        });
        expect(running.map((m) => [m.state, m.count, m.progress])).toEqual([
            ["active", 0, 0.5],
            ["active", 1, 0.5],
            ["active", 2, 0.5],
            ["active", 3, 0.5],
        ]);
        const done = motorChecklist(status({ phase: PHASE.done }), { started: true, usbLink: true });
        expect(done.every((m) => m.state === "done" && m.progress === 1)).toBe(true);
        const aborted = motorChecklist(status({ phase: PHASE.aborted }), { started: true, usbLink: true });
        expect(aborted.every((m) => m.state === "pending")).toBe(true);
    });

    it("corrects the FC clock only over a long enough session", () => {
        expect(clockFactor(1000, 0, 21400, 20000)).toBeCloseTo(1.02);
        expect(clockFactor(1000, 0, 6000, 5000)).toBe(1);
        expect(clockFactor(0xffffff00, 0, 20000 - 0x100, 20000)).toBeCloseTo(1); // millis() wrapped
    });
});

describe("frame wizard store", () => {
    type Reply = number[] | "unsupported";
    let replies: Map<number, Reply[]>;
    let msp: {
        promise: ReturnType<typeof vi.fn>;
        send_message: ReturnType<typeof vi.fn>;
    };

    function reply(code: number, ...queue: Reply[]) {
        replies.set(code, [...(replies.get(code) ?? []), ...queue]);
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        replies = new Map();
        const { default: MSP } = await import("../../src/js/msp");
        msp = MSP as unknown as typeof msp;
        msp.send_message.mockReset();
        msp.promise.mockReset().mockImplementation(async (code: number) => {
            const queue = replies.get(code) ?? [];
            // the last queued reply repeats, like an FC that stays in a phase
            const next = queue.length > 1 ? queue.shift()! : queue[0];
            if (next === undefined) {
                return undefined;
            }
            const bytes = next === "unsupported" ? [] : next;
            return { data: new DataView(new Uint8Array(bytes).buffer), unsupported: next === "unsupported" ? 1 : 0 };
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function store() {
        const { useFrameWizardStore } = await import("../../src/stores/frameWizard");
        return useFrameWizardStore();
    }

    it("hides itself on firmware without the wizard", async () => {
        reply(0x3018, "unsupported");
        const wizard = await store();
        wizard.startPolling();
        await vi.advanceTimersByTimeAsync(5000);
        expect(wizard.supported).toBe(false);
        expect(msp.promise).toHaveBeenCalledTimes(1);
        wizard.detach();
    });

    it("runs a session: start, poll, fetch the result at the end", async () => {
        reply(0x3018, statusPayload());
        reply(0x3017, []);
        const wizard = await store();
        wizard.startPolling();
        await vi.advanceTimersByTimeAsync(0);
        expect(wizard.supported).toBe(true);
        expect(wizard.usbLink).toBe(true);

        replies.set(0x3018, [
            statusPayload({ phase: PHASE.cable, flags: 0b110 }),
            statusPayload({ phase: PHASE.motors, spin: 40 }),
        ]);
        expect(await wizard.start()).toBe(true);
        expect(msp.promise).toHaveBeenCalledWith(0x3017, encodeStart());
        expect(wizard.active).toBe(true);
        expect(wizard.noRpmAtStart).toBe(true);

        await vi.advanceTimersByTimeAsync(1100);
        expect(wizard.status?.phase).toBe("motors");

        replies.set(0x3018, [statusPayload({ phase: PHASE.done, end: 1 })]);
        reply(0x3019, resultPayload());
        await vi.advanceTimersByTimeAsync(1100);
        expect(wizard.finished).toBe(true);
        expect(wizard.active).toBe(false);
        expect(wizard.result?.motors[2][0].hz).toBe(100);
        wizard.detach();
    });

    // the FC stops the motors 0.5 s after the last keepalive: status polls and keepalive ops both count
    async function startRunning() {
        reply(0x3018, statusPayload());
        reply(0x3017, []);
        const wizard = await store();
        wizard.startPolling();
        await vi.advanceTimersByTimeAsync(0);
        replies.set(0x3018, [statusPayload({ phase: PHASE.motors })]);
        expect(await wizard.start()).toBe(true);
        return wizard;
    }

    it("asks for the status about once a second and keeps the FC alive every 200 ms", async () => {
        const wizard = await startRunning();
        await vi.advanceTimersByTimeAsync(1000);
        const statusBefore = msp.promise.mock.calls.filter(([code]) => code === 0x3018).length;
        msp.send_message.mockClear();
        const times: number[] = [];
        msp.send_message.mockImplementation(() => times.push(Date.now()));
        msp.promise.mockImplementation(
            ((orig) => async (code: number, data?: number[]) => {
                if (code === 0x3018) {
                    times.push(Date.now());
                }
                return orig(code, data);
            })(msp.promise.getMockImplementation() as (code: number, data?: number[]) => Promise<unknown>),
        );
        const t0 = Date.now();
        await vi.advanceTimersByTimeAsync(5000);

        const statusPolls = msp.promise.mock.calls.filter(([code]) => code === 0x3018).length - statusBefore;
        expect(statusPolls).toBeGreaterThanOrEqual(4);
        expect(statusPolls).toBeLessThanOrEqual(6);
        const keepalives = msp.send_message.mock.calls.filter(
            ([code, data]) => code === 0x3017 && (data as number[])[0] === 2,
        ).length;
        expect(keepalives).toBeGreaterThanOrEqual(15);
        const sorted = [t0, ...times].sort((x, y) => x - y);
        const longestGap = Math.max(...sorted.slice(1).map((t, i) => t - sorted[i]));
        expect(longestGap).toBeLessThanOrEqual(250);
        wizard.detach();
    });

    it("keeps the FC alive while a status reply is stalled", async () => {
        const wizard = await startRunning();
        await vi.advanceTimersByTimeAsync(1100);
        // from here every status request hangs, like a lost reply waiting for the MSP retry
        const answering = msp.promise.getMockImplementation() as (code: number, data?: number[]) => Promise<unknown>;
        msp.promise.mockImplementation((code: number, data?: number[]) =>
            code === 0x3018 ? new Promise(() => {}) : answering(code, data),
        );
        msp.send_message.mockClear();
        await vi.advanceTimersByTimeAsync(2000);
        const keepalives = msp.send_message.mock.calls.filter(
            ([code, data]) => code === 0x3017 && (data as number[])[0] === 2,
        ).length;
        expect(keepalives).toBeGreaterThanOrEqual(9);
        wizard.detach();
    });

    it("sends no keepalive when the wizard is not running", async () => {
        reply(0x3018, statusPayload());
        const wizard = await store();
        wizard.startPolling();
        await vi.advanceTimersByTimeAsync(5000);
        // no keepalive op (2) to the wizard
        expect(
            msp.send_message.mock.calls.filter(([code, data]) => code === 0x3017 && (data as number[])[0] === 2),
        ).toEqual([]);
        wizard.detach();
    });

    it("reports a refused start and stays idle", async () => {
        reply(0x3018, statusPayload());
        reply(0x3017, "unsupported");
        const wizard = await store();
        expect(await wizard.start()).toBe(false);
        expect(wizard.startError).toBe("refused");
        expect(wizard.started).toBe(false);
    });

    it("aborts a session it did not start rather than keep it alive", async () => {
        reply(0x3018, statusPayload({ phase: PHASE.motors }));
        const wizard = await store();
        wizard.startPolling();
        await vi.advanceTimersByTimeAsync(0);
        expect(msp.send_message).toHaveBeenCalledWith(0x3017, encodeAbort());
        wizard.detach();
    });

    it("drops the props-off gate when the panel goes away", async () => {
        const wizard = await store();
        wizard.enabled = true;
        wizard.detach();
        expect(wizard.enabled).toBe(false);
    });

    it("aborts a running session when the panel goes away", async () => {
        reply(0x3018, statusPayload({ phase: PHASE.taps }));
        reply(0x3017, []);
        const wizard = await store();
        expect(await wizard.start()).toBe(true);
        wizard.detach();
        expect(msp.send_message).toHaveBeenCalledWith(0x3017, encodeAbort());
        const calls = msp.promise.mock.calls.length;
        await vi.advanceTimersByTimeAsync(3000);
        expect(msp.promise.mock.calls.length).toBe(calls);
    });
});

describe("frame wizard resonance summary", () => {
    // a bench run (5" frame, props off), as the wizard reported it
    const tap = (...hz: number[]) => hz.map((h) => ({ hz: h, taps: 4, cable: false }));
    const peak = (...hz: number[]) =>
        hz.map((h) => ({ hz: h, gain: 0.1, axis: "yaw" as const, speeds: 2, cable: false }));
    const bench: WizardResult = {
        phase: "done",
        points: [
            tap(75, 124, 208, 269, 447),
            tap(75, 209, 271, 449, 127),
            tap(75, 126, 210, 335, 450),
            tap(76, 126, 210, 271, 335),
            tap(78, 124, 151, 209, 234, 277, 333, 132),
            [...tap(276, 336, 119), { hz: 358, taps: 5, cable: true }, { hz: 402, taps: 5, cable: true }],
        ],
        motors: [
            peak(71, 210, 241, 268, 330, 434, 516, 1055),
            peak(210, 236, 273, 329, 433, 513, 1142),
            peak(118, 212, 257, 334, 444, 568, 1072),
            peak(214, 272, 503),
        ],
        rotationHz: [126.8, 236.7],
        rpmMask: true,
        basesByRpm: true,
        speedLimited: false,
        noCable: false,
        baseCommand: [1150, 1300],
        f1Hz: 1600,
        sessionTaps: 34,
        clippedTaps: 0,
        noModeMask: 0,
        amplitude: [40, 40, 40, 40],
    };
    const hz = (list: Resonance[]) => list.map((r) => Math.round(r.hz));

    it("condenses a real run to a few resonances", () => {
        const s = summarizeResonances(bench);
        expect(hz(s.frameAndMotors)).toEqual([210, 236, 271, 334, 446]);
        expect(hz(s.tapsOnly)).toEqual([75, 126]);
        expect(hz(s.motorsOnly)).toEqual([513]);
        expect(Math.round(s.main!.hz)).toBe(210);
        expect(s.main).toMatchObject({ points: [0, 1, 2, 3, 4], motors: [0, 1, 2, 3], score: 9 });
    });

    it("leaves out the cable point and cable-marked peaks", () => {
        const s = summarizeResonances(bench, 1);
        const all = [...s.frameAndMotors, ...s.tapsOnly, ...s.motorsOnly];
        expect(all.some((r) => r.hz > 350 && r.hz < 410)).toBe(false);
        expect(all.every((r) => !r.points.includes(5))).toBe(true);
    });

    it("does not chain a wide band into one resonance", () => {
        const wide: WizardResult = {
            ...bench,
            points: [tap(100, 104, 108, 112, 116, 120), [], [], [], [], []],
            motors: [[], [], [], []],
        };
        const groups = summarizeResonances(wide, 1).tapsOnly;
        expect(groups.length).toBeGreaterThan(1);
        expect(groups.every((r) => r.score === 1)).toBe(true);
    });
});

describe("frame wizard learning and session pages", () => {
    it("reads the learning flag and greys the frame and arms while it is set", () => {
        const s = status({ phase: PHASE.taps, flags: 0b1110, beeped: 1 << 5, counts: [0, 0, 0, 0, 0, 5] });
        expect(s.learning).toBe(true);
        const steps = tapChecklist(s, { started: true, usbLink: true });
        expect(steps.find((x) => x.id === "cable")?.state).toBe("done");
        const points = steps.filter((x) => x.id === "frame" || x.id.startsWith("arm"));
        expect(points.every((x) => x.learning === true && x.state === "pending" && x.count === 0)).toBe(true);
        const labelled = tapChecklist(status({ phase: PHASE.taps, flags: 0b0110 }), { started: true, usbLink: true });
        expect(labelled.some((x) => x.learning)).toBe(false);
    });

    // frameWizardWriteTaps(), first < 100: 16 taps a page
    it("parses a peaks page", () => {
        const b = new Sbuf().u8(37).u8(16).u8(2);
        b.u16(25).u8(4).u8(3);
        [752, 1173, 2425, 0, 0, 0, 0, 0].forEach((v) => b.u16(v));
        b.u16(26).u8(0xff).u8(1); // label -1: not classified
        [1931, 0, 0, 0, 0, 0, 0, 0].forEach((v) => b.u16(v));
        expect(parseTapsPage(b.bytes)).toEqual({
            total: 37,
            first: 16,
            taps: [
                { seq: 25, label: 4, peaksHz: [75.2, 117.3, 242.5] },
                { seq: 26, label: -1, peaksHz: [193.1] },
            ],
        });
    });

    // first = 100 + page: 8 taps a page, u16 seq and 7 x f32
    it("parses a features page", () => {
        const values = [0.31, 0.12, -0.8, 0.05, -1.25, 135, 0.4];
        const bytes = new Uint8Array(3 + 30);
        const view = new DataView(bytes.buffer);
        bytes.set([37, 8, 1]);
        view.setUint16(3, 9, true);
        values.forEach((v, k) => view.setFloat32(5 + 4 * k, v, true));
        const page = parseFeaturesPage(bytes);
        expect(page).toMatchObject({ total: 37, first: 8 });
        const tap = page!.taps[0];
        expect(tap.seq).toBe(9);
        expect(tap.directionDeg).toBe(135);
        expect(tap.r).toBeCloseTo(0.31);
        expect(tap.accPeakZ).toBeCloseTo(-1.25);
        expect(parseFeaturesPage(bytes.slice(0, 20))).toBeNull();
    });
});

describe("motor run summary", () => {
    const peak = (hz: number, gain: number, cable = false) => ({ hz, gain, axis: "roll" as const, speeds: 2, cable });
    const base: WizardResult = {
        phase: "done",
        points: [[], [], [], [], [], []],
        motors: [
            [peak(210, 0.4), peak(272, 0.2), peak(76, 0.9, true)],
            [peak(212, 0.35), peak(270, 0.22)],
            [peak(208, 0.42), peak(274, 0.19), peak(520, 0.05)],
            [peak(211, 0.38), peak(271, 0.21)],
        ],
        rotationHz: [120, 200],
        rpmMask: true,
        basesByRpm: true,
        speedLimited: false,
        noCable: false,
        baseCommand: [1150, 1300],
        f1Hz: 1600,
        sessionTaps: 0,
        clippedTaps: 0,
        noModeMask: 0,
        amplitude: [40, 40, 40, 40],
    };

    it("lists the resonances the motors share and calls them alike within 6 dB", () => {
        const s = motorRunSummary(base)!;
        expect(s.shared.map((r) => Math.round(r.hz))).toEqual([211, 272]);
        expect(s.allOk).toBe(true);
        expect(s.shared[0].relDb.map((v) => v !== null && v <= 0)).toEqual([true, true, true, true]);
        // the cable peak is not a motor's loudest resonance
        expect(s.strongestHz).toEqual([210, 212, 208, 211]);
    });

    it("flags a motor 10 dB or more louder than the others", () => {
        const loud = structuredClone(base);
        loud.motors[1][0].gain = 1.6; // ~+12 dB over the others at 210 Hz
        const s = motorRunSummary(loud)!;
        expect(s.allOk).toBe(false);
        expect(s.standsOut).toEqual([false, true, false, false]);
        expect(s.worst).toMatchObject({ motor: 1 });
    });

    it("keeps a resonance the FC took for the cable's on some motors only", () => {
        const mixed = structuredClone(base);
        mixed.motors[1][1].cable = true; // 270 Hz: motor 2 marked as the cable's, the others the frame's
        mixed.motors[0][2].cable = true;
        expect(motorRunSummary(mixed)!.shared.map((r) => Math.round(r.hz))).toEqual([211, 272]);
        // all of them marked: the cable's
        mixed.motors.forEach((list) => list.filter((p) => Math.abs(p.hz - 271) < 5).forEach((p) => (p.cable = true)));
        expect(motorRunSummary(mixed)!.shared.map((r) => Math.round(r.hz))).toEqual([211]);
    });

    it("does not flag a motor that drives a resonance less (a node of the mode)", () => {
        const soft = structuredClone(base);
        soft.motors[2][0].gain = 0.04; // ~-20 dB at 210 Hz
        const s = motorRunSummary(soft)!;
        expect(s.allOk).toBe(true);
        expect(s.standsOut).toEqual([false, false, false, false]);
    });

    it("finds the cable's own modes and matches them by the merge rule", () => {
        const withCable = structuredClone(base);
        withCable.points[0] = [{ hz: 77, taps: 4, cable: true }];
        withCable.points[5] = [{ hz: 210, taps: 5, cable: false }]; // a frame mode heard on the cable: not the cable's
        expect(cableModesHz(withCable).sort()).toEqual([76, 77]);
        expect(nearAnyHz(75.5, cableModesHz(withCable))).toBe(true);
        expect(nearAnyHz(210, cableModesHz(withCable))).toBe(false);
        expect(cableModesHz(null)).toEqual([]);
    });
});
