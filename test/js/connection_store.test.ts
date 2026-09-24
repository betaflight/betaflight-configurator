import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// useConnectionStore is a thin reactive read-model over CONFIGURATOR, the device picker
// and the lock manager. The store's heavy legacy collaborators are stubbed.
// ---------------------------------------------------------------------------

const mspCleanup = vi.hoisted(() => vi.fn());

vi.mock("../../src/js/gui", () => ({ default: { connecting_to: false, connected_to: false, connect_lock: false } }));
// Both stubs are reactive because both real modules are — data_storage.ts wraps CONFIGURATOR in
// reactive() and device_handler.js exports reactive(DeviceHandler). The store reads them through
// computed(), which only invalidates on a reactive source, so a plain object literal here would
// stub out the very property the store depends on and quietly freeze every proxy at its initial
// value.
vi.mock("../../src/js/data_storage", async () => {
    const { reactive } = await import("vue");
    return {
        default: reactive({ connectionValid: false, virtualMode: false, cliActive: false, cliValid: false }),
    };
});
vi.mock("../../src/js/device_handler", async () => {
    const { reactive } = await import("vue");
    return { default: reactive({ devicePicker: { selectedDevice: "noselection" } }) };
});
vi.mock("../../src/js/msp", () => ({ default: { callbacks_cleanup: mspCleanup } }));

import { useConnectionStore } from "../../src/stores/connection";
import { __resetLockManagerForTests } from "../../src/js/lock_manager";
import CONFIGURATOR from "../../src/js/data_storage";
import DeviceHandler from "../../src/js/device_handler";

beforeEach(() => {
    setActivePinia(createPinia());
    __resetLockManagerForTests();
    mspCleanup.mockClear();
    CONFIGURATOR.connectionValid = false;
    CONFIGURATOR.virtualMode = false;
    CONFIGURATOR.cliActive = false;
    CONFIGURATOR.cliValid = false;
    DeviceHandler.devicePicker.selectedDevice = "noselection";
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

    // A connection target is a device path or `false`, never a bare boolean `true`. The two
    // assignments above are the type assertion: a `ref(false)` initializer would infer
    // `boolean` and reject them, which is why the store declares ConnectionTarget.
    it("clears a target back to false rather than to a falsy string", () => {
        const store = useConnectionStore();
        store.connectedTo = "serial_1";

        store.connectedTo = false;

        expect(store.connectedTo).toBe(false);
    });
});

describe("connectLock delegates to the LockManager", () => {
    it("reads and writes through", () => {
        const store = useConnectionStore();
        expect(store.connectLock).toBe(false);
        store.connectLock = true;
        expect(store.connectLock).toBe(true);
        store.connectLock = false;
        expect(store.connectLock).toBe(false);
    });
});

// These four are the computed get/set proxies over the legacy CONFIGURATOR singleton, so the
// write direction matters as much as the read: the singleton, not the store, is still the
// storage. Pinned here because #4800 is going to move that storage.
describe("CONFIGURATOR proxies", () => {
    it.each(["connectionValid", "virtualMode", "cliActive", "cliValid"] as const)(
        "%s reads from the singleton",
        (field) => {
            const store = useConnectionStore();
            expect(store[field]).toBe(false);

            CONFIGURATOR[field] = true;

            expect(store[field]).toBe(true);
        },
    );

    it.each(["connectionValid", "virtualMode", "cliActive", "cliValid"] as const)(
        "%s writes back to the singleton",
        (field) => {
            const store = useConnectionStore();

            store[field] = true;

            expect(CONFIGURATOR[field]).toBe(true);
        },
    );
});

describe("selectedDevice", () => {
    it("is a read-only view of the device picker", () => {
        const store = useConnectionStore();
        expect(store.selectedDevice).toBe("noselection");

        DeviceHandler.devicePicker.selectedDevice = "serial_1";

        expect(store.selectedDevice).toBe("serial_1");
    });
});

describe("live data refresh control", () => {
    it("starts unpaused and toggles via the actions", () => {
        const store = useConnectionStore();
        expect(store.liveDataPaused).toBe(false);

        store.pauseLiveData();
        expect(store.liveDataPaused).toBe(true);

        store.resumeLiveData();
        expect(store.liveDataPaused).toBe(false);
    });
});

describe("clearMspQueue", () => {
    // The dynamic import is what keeps the store out of the msp -> gui -> store cycle, so the
    // returned promise is the only way a caller can await the drain before the next handshake.
    it("returns a promise that resolves once the MSP queue has been drained", async () => {
        const store = useConnectionStore();

        const pending = store.clearMspQueue();
        expect(pending).toBeInstanceOf(Promise);

        await pending;

        expect(mspCleanup).toHaveBeenCalledTimes(1);
    });
});
