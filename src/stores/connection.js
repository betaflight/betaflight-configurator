import { defineStore } from "pinia";
import { computed, ref } from "vue";
import CONFIGURATOR from "../js/data_storage";
import PortHandler from "../js/port_handler";
import { getConnectionState } from "../js/connection_state";
import { getLockManager } from "../js/lock_manager";

export const useConnectionStore = defineStore("connection", () => {
    // The store OWNS the connection-target state (was GUI.connecting_to /
    // GUI.connected_to). gui.js now delegates those fields here, so the store is
    // the canonical home and the store no longer imports gui.js (which would
    // cycle: gui -> store -> ... -> msp -> gui). connect_lock delegates to the
    // reactive LockManager (single source of truth); clearMspQueue reaches msp via
    // dynamic import to stay cycle-free.
    const connectingTo = ref(false);
    const connectedTo = ref(false);

    const connectLock = computed({
        get: () => getLockManager().locked,
        set: (val) => (getLockManager().locked = val),
    });

    // CONFIGURATOR is already reactive (wrapped in reactive() in data_storage.js)
    const connectionValid = computed({
        get: () => CONFIGURATOR.connectionValid,
        set: (val) => (CONFIGURATOR.connectionValid = val),
    });

    const virtualMode = computed({
        get: () => CONFIGURATOR.virtualMode,
        set: (val) => (CONFIGURATOR.virtualMode = val),
    });

    const cliActive = computed({
        get: () => CONFIGURATOR.cliActive,
        set: (val) => (CONFIGURATOR.cliActive = val),
    });

    const cliValid = computed({
        get: () => CONFIGURATOR.cliValid,
        set: (val) => (CONFIGURATOR.cliValid = val),
    });

    const selectedPort = computed(() => PortHandler.portPicker.selectedPort);

    // Thin reactive read-model of the connection status holder. Its phase lives in
    // Vue refs, so a computed that reads the getters tracks them directly — no
    // subscribe/snapshot bridge — giving Vue components one canonical source for
    // lifecycle phase / readiness instead of the legacy CONFIGURATOR/GUI globals.
    const connection = getConnectionState();
    const connectionPhase = computed(() => connection.state);
    const connectionReady = computed(() => connection.isReady);

    // Live data refresh control
    const liveDataPaused = ref(false);

    function pauseLiveData() {
        liveDataPaused.value = true;
    }

    function resumeLiveData() {
        liveDataPaused.value = false;
    }

    function clearMspQueue() {
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
        selectedPort,
        // Connection-state read-model (read-only)
        connectionPhase,
        connectionReady,
        liveDataPaused,
        pauseLiveData,
        resumeLiveData,
    };
});
