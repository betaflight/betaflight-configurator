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
 * `serial_backend.ts` clears both fields with `= false` and every reader tests truthiness
 * (`if (!connectionStore.connectedTo)`, `connectionStore.connectingTo || ""`). Widening to `string | false`
 * rather than leaving the `ref(false)` initializer to infer `boolean` is what makes
 * `connectedTo === "virtual"` in StatusBar.vue typecheck as the comparison it actually is.
 */
export type ConnectionTarget = string | false;

export const useConnectionStore = defineStore("connection", () => {
    // The store owns the connection-target state (was GUI.connecting_to /
    // GUI.connected_to). connectLock delegates to the reactive LockManager (single
    // source of truth); clearMspQueue reaches msp via dynamic import to stay cycle-free.
    const connectingTo = ref<ConnectionTarget>(false);
    const connectedTo = ref<ConnectionTarget>(false);

    // True while the firmware flasher is writing; it blocks connecting and tab switches.
    const flashingInProgress = ref(false);

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

    // MSP CRC errors this session. msp.ts counts through MSP.packet_error, which delegates
    // here so the status bar re-renders on every bad packet.
    const packetErrors = ref(0);

    // Live data refresh control
    const liveDataPaused = ref(false);

    function pauseLiveData(): void {
        liveDataPaused.value = true;
    }

    function resumeLiveData(): void {
        liveDataPaused.value = false;
    }

    function clearMspQueue(): Promise<void> {
        // Dynamic import keeps the store free of a static msp import (msp.ts reaches
        // this store through its own imports — a static import would cycle).
        // Returned so callers can await the drain before starting the next handshake.
        return import("../js/msp").then(({ default: MSP }) => MSP.callbacks_cleanup());
    }

    return {
        connectingTo,
        connectedTo,
        connectLock,
        flashingInProgress,
        connectionValid,
        virtualMode,
        cliActive,
        cliValid,
        clearMspQueue,
        selectedDevice,
        packetErrors,
        liveDataPaused,
        pauseLiveData,
        resumeLiveData,
    };
});
