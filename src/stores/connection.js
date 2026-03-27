import { defineStore } from "pinia";
import { computed, ref } from "vue";
import GUI from "../js/gui";
import CONFIGURATOR from "../js/data_storage";
import PortHandler from "../js/port_handler";
import MSP from "../js/msp";

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
        liveDataPaused,
        pauseLiveData,
        resumeLiveData,
        reboot,
    };
});
