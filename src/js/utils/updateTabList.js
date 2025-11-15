import $ from "jquery";

// Delegate tab visibility to Vue via template v-show bindings. This function now
// only syncs the expert mode checkbox state to the global Vue model if present.
export function updateTabList(_features) {
    try {
        const isExpertModeEnabled = $('input[name="expertModeCheckbox"]').is(":checked");
        if (window.vm && typeof window.vm.expertMode !== "undefined") {
            window.vm.expertMode = isExpertModeEnabled;
        }
    } catch {
        // noop: if Vue model not available, do nothing
    }
}
