import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// S7 — useConnectionStore is a thin reactive read-model of the connection FSM.
// The store's heavy legacy collaborators are stubbed; the FSM is the real one.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/gui", () => ({ default: { connecting_to: false, connected_to: false, connect_lock: false } }));
vi.mock("../../src/js/data_storage", () => ({
    default: { connectionValid: false, virtualMode: false, cliActive: false, cliValid: false },
}));
vi.mock("../../src/js/port_handler", () => ({ default: { portPicker: { selectedPort: "noselection" } } }));
vi.mock("../../src/js/msp", () => ({ default: { callbacks_cleanup: () => {} } }));

import { useConnectionStore } from "../../src/stores/connection.js";
import { getConnectionFsm, __resetConnectionFsmForTests, State } from "../../src/js/connection_fsm.js";
import { __resetLockManagerForTests } from "../../src/js/lock_manager.js";

beforeEach(() => {
    setActivePinia(createPinia());
    __resetConnectionFsmForTests();
    __resetLockManagerForTests();
});

afterEach(() => {
    __resetConnectionFsmForTests();
    __resetLockManagerForTests();
});

describe("S7 store owns connection-target state (folded from GuiControl)", () => {
    it("connectingTo / connectedTo are store-owned, writable, default false", () => {
        const store = useConnectionStore();
        expect(store.connectingTo).toBe(false);
        expect(store.connectedTo).toBe(false);

        store.connectingTo = "serial_1";
        store.connectedTo = "serial_1";
        expect(store.connectingTo).toBe("serial_1");
        expect(store.connectedTo).toBe("serial_1");
    });

    it("connectLock delegates to the ref-counting LockManager", () => {
        const store = useConnectionStore();
        expect(store.connectLock).toBe(false);
        store.connectLock = true;
        expect(store.connectLock).toBe(true);
        store.connectLock = false;
        expect(store.connectLock).toBe(false);
    });
});

describe("S7 connection store FSM read-model", () => {
    it("exposes the initial snapshot", () => {
        const store = useConnectionStore();
        expect(store.fsmState).toBe(State.IDLE);
        expect(store.fsmReady).toBe(false);
        expect(store.fsmReconnectToken).toBeNull();
    });

    it("reactively reflects phase changes", () => {
        const store = useConnectionStore();
        const fsm = getConnectionFsm();

        fsm.setPhase(State.CONNECTING);
        expect(store.fsmState).toBe(State.CONNECTING);

        fsm.setPhase(State.CONNECTED);
        expect(store.fsmState).toBe(State.CONNECTED);
        expect(store.fsmReady).toBe(true);

        fsm.setPhase(State.IDLE);
        expect(store.fsmState).toBe(State.IDLE);
        expect(store.fsmReady).toBe(false);
    });

    it("reflects the frozen reconnect token", () => {
        const store = useConnectionStore();
        const fsm = getConnectionFsm();
        fsm.requestReboot();
        fsm.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        // Trigger a notify so the snapshot ref updates.
        fsm.reconnectStarted();
        expect(store.fsmReconnectToken).toMatchObject({ transportType: "serial", opaqueId: "serial_0" });
    });
});
