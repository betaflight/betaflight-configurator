import { defineStore } from "pinia";
import { ref } from "vue";

export const useDialogStore = defineStore("dialog", () => {
    const activeDialog = ref(null);

    /**
     * Open a dialog
     * @param {string} type - Component name (e.g., 'YesNoDialog')
     * @param {object} props - Props to pass to the dialog component
     * @param {object} listeners - Event listeners (e.g., { onYes: () => {} })
     */
    function open(type, props = {}, listeners = {}) {
        activeDialog.value = {
            id: Date.now(), // specific ID if we want to track stack later
            type,
            props,
            listeners,
        };
    }

    function close() {
        activeDialog.value = null;
    }

    return {
        activeDialog,
        open,
        close,
    };
});
