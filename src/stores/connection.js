import { defineStore } from "pinia";
import { computed, ref } from "vue";
import CONFIGURATOR from "../js/data_storage";
import PortHandler from "../js/port_handler";
import { getConnectionFsm } from "../js/connection_fsm";
import { getLockManager } from "../js/lock_manager";

export const useConnectionStore = defineStore("connection", () => {
    // The store OWNS the connection-target state (was GUI.connecting_to /
    // GUI.connected_to). gui.js now delegates those fields here, so the store is
    // the canonical home and the store no longer imports gui.js (which would
    // cycle: gui -> store -> ... -> msp -> gui). connect_lock delegates to the
    // ref-counting LockManager (single source of truth); clearMspQueue and reboot
    // reach msp/serial_backend via dynamic import to stay cycle-free.
    const connectingTo = ref(false);
    const connectedTo = ref(false);

    const connectLock = computed({
        get: () => getLockManager().locked,
        set: (val) => getLockManager().setBoolean("gui", Boolean(val)),
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

    // S7: thin reactive read-model of the connection FSM. The store subscribes
    // to the FSM snapshot and re-publishes it as reactive refs, so Vue components
    // can read lifecycle state/readiness/quality from one canonical source
    // instead of poking the legacy CONFIGURATOR/GUI globals. Read-only — the FSM
    // is the single writer of these. (Inverting the legacy globals to be computed
    // mirrors of the FSM, with dev throw-on-write, is the final step once the FSM
    // is the authoritative live orchestrator.)
    const fsm = getConnectionFsm();
    const fsmSnapshot = ref(fsm.snapshot());
    fsm.subscribe((snap) => {
        fsmSnapshot.value = snap;
    });
    const fsmState = computed(() => fsmSnapshot.value.state);
    const fsmReady = computed(() => fsmSnapshot.value.isReady);
    const fsmQuality = computed(() => fsmSnapshot.value.quality);
    const fsmReconnectToken = computed(() => fsmSnapshot.value.token);

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
        import("../js/msp").then(({ default: MSP }) => MSP.callbacks_cleanup());
    }

    function reboot() {
        // serial_backend imports this store, so a static import here would cycle.
        // A dynamic import is cycle-safe and resolves instantly (serial_backend is
        // already loaded). Replaces the former GUI.reinitializeConnection() ->
        // EventBus("reboot:request") indirection.
        import("../js/serial_backend").then(({ reinitializeConnection }) => reinitializeConnection());
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
        // S7 FSM read-model (read-only)
        fsmState,
        fsmReady,
        fsmQuality,
        fsmReconnectToken,
        liveDataPaused,
        pauseLiveData,
        resumeLiveData,
        reboot,
    };
});
