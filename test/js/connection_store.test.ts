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

// ---------------------------------------------------------------------------
// useConnectionStore owns the connection state and is a reactive read-model over the device
// picker and the lock manager. The store's heavy legacy collaborators are stubbed.
// ---------------------------------------------------------------------------

const mspCleanup = vi.hoisted(() => vi.fn());

// The stub is reactive because the real module is — device_handler exports
// reactive(new DeviceHandler()). The store reads it through computed(), which only invalidates
// on a reactive source, so a plain object literal here would stub out the very property the
// store depends on and quietly freeze selectedDevice at its initial value.
vi.mock("../../src/js/device_handler", async () => {
    const { reactive } = await import("vue");
    return { default: reactive({ devicePicker: { selectedDevice: "noselection" } }) };
});
vi.mock("../../src/js/msp", () => ({ default: { callbacks_cleanup: mspCleanup } }));

import { useConnectionStore } from "../../src/stores/connection";
import { __resetLockManagerForTests } from "../../src/js/lock_manager";
import DeviceHandler from "../../src/js/device_handler";

beforeEach(() => {
    setActivePinia(createPinia());
    __resetLockManagerForTests();
    mspCleanup.mockClear();
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

    it("flashingInProgress is store-owned, writable, default false", () => {
        const store = useConnectionStore();
        expect(store.flashingInProgress).toBe(false);

        store.flashingInProgress = true;
        expect(store.flashingInProgress).toBe(true);
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

// These used to be get/set proxies over the CONFIGURATOR singleton; the store now owns them.
describe("store owns the connection flags (was CONFIGURATOR)", () => {
    it.each(["connectionValid", "virtualMode", "cliActive", "cliValid"] as const)(
        "%s is store-owned, writable, default false",
        (field) => {
            const store = useConnectionStore();
            expect(store[field]).toBe(false);

            store[field] = true;

            expect(store[field]).toBe(true);
        },
    );

    // A fresh Pinia must start disconnected: the flags no longer live in a module-level
    // singleton that would carry one test's (or session's) state into the next.
    it("starts from the defaults in a fresh Pinia", () => {
        const previous = useConnectionStore();
        previous.connectionValid = true;
        previous.virtualApiVersion = "1.48.0";

        setActivePinia(createPinia());
        const connectionStore = useConnectionStore();

        expect(connectionStore.connectionValid).toBe(false);
        expect(connectionStore.virtualApiVersion).toBe("0.0.1");
    });
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
    // The dynamic import is what keeps the store out of the msp -> store import cycle, so the
    // returned promise is the only way a caller can await the drain before the next handshake.
    it("returns a promise that resolves once the MSP queue has been drained", async () => {
        const store = useConnectionStore();

        const pending = store.clearMspQueue();
        expect(pending).toBeInstanceOf(Promise);

        await pending;

        expect(mspCleanup).toHaveBeenCalledTimes(1);
    });
});
