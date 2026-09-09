import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// useConnectionStore is a thin reactive read-model over CONFIGURATOR, the device picker
// and the lock manager. The store's heavy legacy collaborators are stubbed.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/gui", () => ({ default: { connecting_to: false, connected_to: false, connect_lock: false } }));
vi.mock("../../src/js/data_storage", () => ({
    default: { connectionValid: false, virtualMode: false, cliActive: false, cliValid: false },
}));
vi.mock("../../src/js/device_handler", () => ({ default: { devicePicker: { selectedDevice: "noselection" } } }));
vi.mock("../../src/js/msp", () => ({ default: { callbacks_cleanup: () => {} } }));

import { useConnectionStore } from "../../src/stores/connection.js";
import { __resetLockManagerForTests } from "../../src/js/lock_manager.js";

beforeEach(() => {
    setActivePinia(createPinia());
    __resetLockManagerForTests();
});

afterEach(() => {
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
