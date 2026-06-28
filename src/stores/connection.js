import { defineStore } from "pinia";
import { computed, ref } from "vue";
import GUI from "../js/gui";
import CONFIGURATOR from "../js/data_storage";
import PortHandler from "../js/port_handler";
import MSP from "../js/msp";
import { getConnectionFsm } from "../js/connection_fsm";

export const useConnectionStore = defineStore("connection", () => {
    // Proxy state directly to legacy reactive objects
    // This ensures full bi-directional synchronization during migration

    const connectingTo = computed({
        get: () => GUI.connecting_to,
        set: (val) => (GUI.connecting_to = val),
    });

    const connectedTo = computed({
        get: () => GUI.connected_to,
        set: (val) => (GUI.connected_to = val),
    });

    const connectLock = computed({
        get: () => GUI.connect_lock,
        set: (val) => (GUI.connect_lock = val),
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
        MSP.callbacks_cleanup();
    }

    function reboot() {
        GUI.reinitializeConnection();
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
