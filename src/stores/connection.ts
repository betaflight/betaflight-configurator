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
import CONFIGURATOR from "../js/data_storage";
import DeviceHandler from "../js/device_handler";
import { getLockManager } from "../js/lock_manager";

/**
 * A connection target: the device path being connected to / currently connected, or `false`
 * when there is none.
 *
 * `false` rather than `null` or `""` because that is the sentinel the existing code writes —
 * `serial_backend.js` clears both fields with `= false` and every reader tests truthiness
 * (`if (!connectionStore.connectedTo)`, `GUI.connecting_to || ""`). Widening to `string | false`
 * rather than leaving the `ref(false)` initializer to infer `boolean` is what makes
 * `connectedTo === "virtual"` in StatusBar.vue typecheck as the comparison it actually is.
 */
export type ConnectionTarget = string | false;

export const useConnectionStore = defineStore("connection", () => {
    // The store OWNS the connection-target state (was GUI.connecting_to /
    // GUI.connected_to). gui.js now delegates those fields here, so the store is
    // the canonical home and the store no longer imports gui.js (which would
    // cycle: gui -> store -> ... -> msp -> gui). connect_lock delegates to the
    // reactive LockManager (single source of truth); clearMspQueue reaches msp via
    // dynamic import to stay cycle-free.
    const connectingTo = ref<ConnectionTarget>(false);
    const connectedTo = ref<ConnectionTarget>(false);

    const connectLock = computed<boolean>({
        get: () => getLockManager().locked,
        set: (val) => (getLockManager().locked = val),
    });

    // CONFIGURATOR is already reactive (wrapped in reactive() in data_storage.ts)
    const connectionValid = computed<boolean>({
        get: () => CONFIGURATOR.connectionValid,
        set: (val) => (CONFIGURATOR.connectionValid = val),
    });

    const virtualMode = computed<boolean>({
        get: () => CONFIGURATOR.virtualMode,
        set: (val) => (CONFIGURATOR.virtualMode = val),
    });

    const cliActive = computed<boolean>({
        get: () => CONFIGURATOR.cliActive,
        set: (val) => (CONFIGURATOR.cliActive = val),
    });

    const cliValid = computed<boolean>({
        get: () => CONFIGURATOR.cliValid,
        set: (val) => (CONFIGURATOR.cliValid = val),
    });

    const selectedDevice = computed(() => DeviceHandler.devicePicker.selectedDevice);

    // Live data refresh control
    const liveDataPaused = ref(false);

    function pauseLiveData(): void {
        liveDataPaused.value = true;
    }

    function resumeLiveData(): void {
        liveDataPaused.value = false;
    }

    function clearMspQueue(): Promise<void> {
        // Dynamic import keeps the store free of a static msp import (msp.js imports
        // gui.js, which now imports this store — a static import would cycle).
        // Returned so callers can await the drain before starting the next handshake.
        return import("../js/msp").then(({ default: MSP }) => MSP.callbacks_cleanup());
    }

    return {
        connectingTo,
        connectedTo,
        connectLock,
        connectionValid,
        virtualMode,
        cliActive,
        cliValid,
        clearMspQueue,
        selectedDevice,
        liveDataPaused,
        pauseLiveData,
        resumeLiveData,
    };
});
