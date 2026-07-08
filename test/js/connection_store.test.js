import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// useConnectionStore is a thin reactive read-model of the connection state.
// The store's heavy legacy collaborators are stubbed; the connection state is the real one.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/gui", () => ({ default: { connecting_to: false, connected_to: false, connect_lock: false } }));
vi.mock("../../src/js/data_storage", () => ({
    default: { connectionValid: false, virtualMode: false, cliActive: false, cliValid: false },
}));
vi.mock("../../src/js/port_handler", () => ({ default: { portPicker: { selectedPort: "noselection" } } }));
vi.mock("../../src/js/msp", () => ({ default: { callbacks_cleanup: () => {} } }));

import { useConnectionStore } from "../../src/stores/connection.js";
import { getConnectionState, __resetConnectionStateForTests, State } from "../../src/js/connection_state.js";
import { __resetLockManagerForTests } from "../../src/js/lock_manager.js";

beforeEach(() => {
    setActivePinia(createPinia());
    __resetConnectionStateForTests();
    __resetLockManagerForTests();
});

afterEach(() => {
    __resetConnectionStateForTests();
    __resetLockManagerForTests();
});

describe("store owns connection-target state (folded from GuiControl)", () => {
    it("connectingTo / connectedTo are store-owned, writable, default false", () => {
        const store = useConnectionStore();
        expect(store.connectingTo).toBe(false);
        expect(store.connectedTo).toBe(false);

        store.connectingTo = "serial_1";
        store.connectedTo = "serial_1";
        expect(store.connectingTo).toBe("serial_1");
        expect(store.connectedTo).toBe("serial_1");
    });

    it("connectLock delegates to the LockManager", () => {
        const store = useConnectionStore();
        expect(store.connectLock).toBe(false);
        store.connectLock = true;
        expect(store.connectLock).toBe(true);
        store.connectLock = false;
        expect(store.connectLock).toBe(false);
    });
});

describe("connection store connection-state read-model", () => {
    it("exposes the initial phase", () => {
        const store = useConnectionStore();
        expect(store.connectionPhase).toBe(State.IDLE);
        expect(store.connectionReady).toBe(false);
    });

    it("reactively reflects phase changes", () => {
        const store = useConnectionStore();
        const connection = getConnectionState();

        connection.setPhase(State.CONNECTING);
        expect(store.connectionPhase).toBe(State.CONNECTING);

        connection.setPhase(State.CONNECTED);
        expect(store.connectionPhase).toBe(State.CONNECTED);
        expect(store.connectionReady).toBe(true);

        connection.setPhase(State.IDLE);
        expect(store.connectionPhase).toBe(State.IDLE);
        expect(store.connectionReady).toBe(false);
    });
});
