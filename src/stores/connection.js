import { defineStore } from "pinia";
import GUI from "../js/gui";
import CONFIGURATOR from "../js/data_storage";

export const useConnectionStore = defineStore("connection", {
    state: () => ({
        connectingTo: false,
        connectedTo: false,
        connectLock: false,
        connectionValid: false,
        selectedPort: null,
    }),

    actions: {
        // Sync with legacy GUI for backward compatibility
        syncFromLegacy() {
            this.connectingTo = GUI.connecting_to;
            this.connectedTo = GUI.connected_to;
            this.connectLock = GUI.connect_lock;
            this.connectionValid = CONFIGURATOR.connectionValid;
        },
    },
});
