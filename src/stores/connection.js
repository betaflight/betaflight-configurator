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

    // CONFIGURATOR object is NOT reactive by default unless we made it so,
    // but typically it's updated alongside GUI.
    // Ideally we should make CONFIGURATOR reactive too or just rely on GUI being the signal
    // to re-read CONFIGURATOR.
    // For now, let's assume reading it is efficient and we rely on Vue's reactivity
    // tracking on other properties or events to trigger re-renders.
    // A better approach for CONFIGURATOR is to wrap it or access it via getters
    // that depend on a tick or reactive source.
    // However, connectionValid is often set alongside connected_to.

    const connectionValid = computed({
        get: () => CONFIGURATOR.connectionValid,
        set: (val) => (CONFIGURATOR.connectionValid = val),
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
        clearMspQueue,
        selectedPort,
        liveDataPaused,
        pauseLiveData,
        resumeLiveData,
        reboot,
    };
});
