/**
 * Global reactive state for Vue tab communication
 * This bridges the legacy TABS system with Vue components
 */
import { reactive } from "vue";

export const tabState = reactive({
    expertMode: false,
});
