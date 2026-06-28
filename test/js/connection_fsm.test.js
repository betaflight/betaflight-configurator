import { describe, expect, it, vi } from "vitest";
import {
    ConnectionFsm,
    State,
    Event,
    DEFAULT_POLICY,
    getConnectionFsm,
    __resetConnectionFsmForTests,
} from "../../src/js/connection_fsm.js";

// ---------------------------------------------------------------------------
// S2a — standalone FSM: transition table, frozen token, abortable reconnect.
// ---------------------------------------------------------------------------

function fsm(opts = { strict: true }) {
    return new ConnectionFsm(opts);
}

/** Drive the FSM into CONNECTED from a fresh IDLE. */
function connected() {
    const m = fsm();
    m.dispatch(Event.CONNECT);
    m.dispatch(Event.READY);
    return m;
}

describe("S2a transition table", () => {
    it("starts IDLE and follows the happy path to CONNECTED", () => {
        const m = fsm();
        expect(m.state).toBe(State.IDLE);
        expect(m.dispatch(Event.CONNECT)).toBe(State.CONNECTING);
        expect(m.dispatch(Event.HANDSHAKE)).toBe(State.HANDSHAKING);
        expect(m.dispatch(Event.READY)).toBe(State.CONNECTED);
        expect(m.isReady).toBe(true);
    });

    it("reaches CLI as a ready (reduced) state", () => {
        const m = fsm();
        m.dispatch(Event.CONNECT);
        expect(m.dispatch(Event.CLI_READY)).toBe(State.CLI);
        expect(m.isReady).toBe(true);
    });

    it("drives CONNECTED -> REBOOTING -> RECONNECTING -> CONNECTING", () => {
        const m = connected();
        expect(m.dispatch(Event.REBOOT)).toBe(State.REBOOTING);
        expect(m.dispatch(Event.RECONNECT)).toBe(State.RECONNECTING);
        expect(m.dispatch(Event.CONNECT)).toBe(State.CONNECTING);
    });

    it("drives CONNECTED -> DISCONNECTING -> IDLE", () => {
        const m = connected();
        expect(m.dispatch(Event.DISCONNECT)).toBe(State.DISCONNECTING);
        expect(m.dispatch(Event.CLOSED)).toBe(State.IDLE);
    });

    it("rejects a re-entrant REBOOT while REBOOTING or RECONNECTING", () => {
        const m = connected();
        m.dispatch(Event.REBOOT);
        expect(m.can(Event.REBOOT)).toBe(false);
        expect(() => m.dispatch(Event.REBOOT)).toThrow(/illegal transition/);

        m.dispatch(Event.RECONNECT);
        expect(m.can(Event.REBOOT)).toBe(false);
        expect(() => m.dispatch(Event.REBOOT)).toThrow(/illegal transition/);
    });

    it("hard-blocks CONNECT / REBOOT / RECONNECT while FLASHING", () => {
        const m = fsm();
        expect(m.dispatch(Event.FLASH_START)).toBe(State.FLASHING);
        for (const ev of [Event.CONNECT, Event.REBOOT, Event.RECONNECT]) {
            expect(m.can(ev)).toBe(false);
        }
        expect(m.dispatch(Event.FLASH_END)).toBe(State.IDLE);
    });

    it("throws on an illegal transition in strict mode", () => {
        const m = fsm({ strict: true });
        expect(() => m.dispatch(Event.READY)).toThrow(/illegal transition/); // READY from IDLE
        expect(m.state).toBe(State.IDLE);
    });

    it("logs and ignores an illegal transition in non-strict (prod) mode", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const m = fsm({ strict: false });
        expect(m.dispatch(Event.READY)).toBe(State.IDLE); // unchanged
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("FAILED resets to IDLE", () => {
        const m = fsm();
        m.dispatch(Event.CONNECT);
        m.dispatch(Event.FAIL);
        expect(m.state).toBe(State.FAILED);
        expect(m.dispatch(Event.RESET)).toBe(State.IDLE);
    });
});

describe("S2a frozen reconnect token", () => {
    it("freezes a token and refuses to let a second freeze (enumeration) change it", () => {
        const m = connected();
        const first = m.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0", baud: 115200 });
        m.dispatch(Event.REBOOT);
        // Simulate enumeration trying to overwrite the target mid-REBOOTING:
        const second = m.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_9", baud: 115200 });

        expect(second).toBe(first);
        expect(m.getReconnectToken().opaqueId).toBe("serial_0");
    });

    it("the frozen token is immutable", () => {
        const m = fsm();
        const token = m.freezeReconnectToken({ transportType: "tcp", opaqueId: "ws://h:1" });
        expect(Object.isFrozen(token)).toBe(true);
        expect(() => {
            token.opaqueId = "mutated";
        }).toThrow();
    });

    it("clears the token on reaching IDLE", () => {
        const m = connected();
        m.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        m.dispatch(Event.DISCONNECT);
        expect(m.getReconnectToken()).not.toBeNull();
        m.dispatch(Event.CLOSED); // -> IDLE
        expect(m.getReconnectToken()).toBeNull();
    });
});

describe("S2a read-model", () => {
    it("notifies subscribers with a snapshot on each transition", () => {
        const m = fsm();
        const seen = [];
        const unsub = m.subscribe((snap, meta) => seen.push({ state: snap.state, event: meta.event }));

        m.dispatch(Event.CONNECT);
        m.dispatch(Event.READY);
        unsub();
        m.dispatch(Event.DISCONNECT); // not observed after unsub

        expect(seen).toEqual([
            { state: State.CONNECTING, event: Event.CONNECT },
            { state: State.CONNECTED, event: Event.READY },
        ]);
    });

    it("a throwing subscriber does not break the FSM", () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const m = fsm();
        m.subscribe(() => {
            throw new Error("boom");
        });
        expect(m.dispatch(Event.CONNECT)).toBe(State.CONNECTING);
        expect(err).toHaveBeenCalled();
        err.mockRestore();
    });
});

describe("S2b reboot-intent helpers", () => {
    it("requestReboot enters REBOOTING and rejects a re-entrant reboot", () => {
        const m = connected();
        expect(m.requestReboot()).toBe(true);
        expect(m.state).toBe(State.REBOOTING);
        // Already rebooting -> rejected.
        expect(m.requestReboot()).toBe(false);
        m.reconnectStarted();
        expect(m.state).toBe(State.RECONNECTING);
        // Still in flight -> rejected.
        expect(m.requestReboot()).toBe(false);
    });

    it("concludeReboot(true) settles to CONNECTED, concludeReboot(false) to IDLE and clears the token", () => {
        const m = connected();
        m.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        m.requestReboot();
        m.concludeReboot(true);
        expect(m.state).toBe(State.CONNECTED);

        m.requestReboot();
        m.concludeReboot(false);
        expect(m.state).toBe(State.IDLE);
        expect(m.getReconnectToken()).toBeNull();
    });

    it("notifies subscribers across the reboot lifecycle", () => {
        const m = connected();
        const states = [];
        m.subscribe((snap) => states.push(snap.state));
        m.requestReboot();
        m.reconnectStarted();
        m.concludeReboot(true);
        expect(states).toEqual([State.REBOOTING, State.RECONNECTING, State.CONNECTED]);
    });
});

describe("S2a abortable reconnect loop", () => {
    // Injected sleep that advances a fake clock so the deadline is reachable
    // without real time.
    function fakeClock() {
        const ref = { t: 0 };
        return {
            now: () => ref.t,
            wait: (ms) => {
                ref.t += ms;
                return Promise.resolve();
            },
        };
    }

    it("polls until the device path resolves, opens it, and settles to CONNECTED", async () => {
        const m = connected();
        const { now, wait } = fakeClock();

        let calls = 0;
        const resolveTarget = vi.fn(() => (++calls >= 2 ? "serial_0" : null));
        const open = vi.fn(async () => true);
        const isReady = vi.fn(() => true);

        const ok = await m.runReconnect({ resolveTarget, open, isReady, policy: DEFAULT_POLICY, now, wait });

        expect(ok).toBe(true);
        expect(m.state).toBe(State.CONNECTED);
        expect(open).toHaveBeenCalledWith("serial_0");
    });

    it("opens whatever CURRENT path resolveTarget returns (path-change tolerant)", async () => {
        const m = connected();
        const { now, wait } = fakeClock();
        const open = vi.fn(async () => true);

        await m.runReconnect({
            resolveTarget: () => "/dev/ttyACM1", // changed from ACM0
            open,
            isReady: () => true,
            policy: DEFAULT_POLICY,
            now,
            wait,
        });

        expect(open).toHaveBeenCalledWith("/dev/ttyACM1");
    });

    it("gives up at the deadline and returns to IDLE", async () => {
        const m = connected();
        const { now, wait } = fakeClock();

        const ok = await m.runReconnect({
            resolveTarget: () => null, // never comes back
            open: vi.fn(),
            isReady: () => false,
            policy: DEFAULT_POLICY,
            now,
            wait,
        });

        expect(ok).toBe(false);
        expect(m.state).toBe(State.IDLE);
    });

    it("stops and tears down when aborted mid-wait", async () => {
        const m = connected();
        const open = vi.fn();

        const ok = await m.runReconnect({
            resolveTarget: () => null,
            open,
            isReady: () => false,
            policy: DEFAULT_POLICY,
            now: () => 0,
            wait: (_ms, _signal) => {
                m.abort();
                return Promise.reject(new Error("aborted"));
            },
        });

        expect(ok).toBe(false);
        expect(m.aborted).toBe(true);
        expect(m.state).toBe(State.IDLE);
        expect(open).not.toHaveBeenCalled();
    });
});

describe("S2a singleton", () => {
    it("getConnectionFsm returns a stable instance until reset", () => {
        __resetConnectionFsmForTests();
        const a = getConnectionFsm();
        const b = getConnectionFsm();
        expect(a).toBe(b);
        __resetConnectionFsmForTests();
        expect(getConnectionFsm()).not.toBe(a);
    });
});
