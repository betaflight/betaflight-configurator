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
import { getConnectionFsm, __resetConnectionFsmForTests, State, Event, Quality } from "../../src/js/connection_fsm.js";

beforeEach(() => {
    setActivePinia(createPinia());
    __resetConnectionFsmForTests();
});

afterEach(() => {
    __resetConnectionFsmForTests();
});

describe("S7 connection store FSM read-model", () => {
    it("exposes the initial FSM snapshot", () => {
        const store = useConnectionStore();
        expect(store.fsmState).toBe(State.IDLE);
        expect(store.fsmReady).toBe(false);
        expect(store.fsmQuality).toBe(Quality.NONE);
        expect(store.fsmReconnectToken).toBeNull();
    });

    it("reactively reflects FSM transitions", () => {
        const store = useConnectionStore();
        const fsm = getConnectionFsm();

        fsm.dispatch(Event.CONNECT);
        expect(store.fsmState).toBe(State.CONNECTING);

        fsm.dispatch(Event.READY);
        expect(store.fsmState).toBe(State.CONNECTED);
        expect(store.fsmReady).toBe(true);
        expect(store.fsmQuality).toBe(Quality.FULLY_READY);

        fsm.dispatch(Event.DISCONNECT);
        fsm.dispatch(Event.CLOSED);
        expect(store.fsmState).toBe(State.IDLE);
        expect(store.fsmReady).toBe(false);
    });

    it("reflects the frozen reconnect token", () => {
        const store = useConnectionStore();
        const fsm = getConnectionFsm();
        fsm.dispatch(Event.CONNECT);
        fsm.dispatch(Event.READY);
        fsm.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        // Trigger a notify so the snapshot ref updates.
        fsm.requestReboot();
        expect(store.fsmReconnectToken).toMatchObject({ transportType: "serial", opaqueId: "serial_0" });
    });
});
