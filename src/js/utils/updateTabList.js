// Delegate tab visibility to Vue via template v-show bindings. This function now
// only syncs the expert mode checkbox state to the global Vue model if present.
export function updateTabList(_features) {
    try {
        const isExpertModeEnabled = document.querySelector('input[name="expertModeCheckbox"]')?.checked ?? false;
        if (window.vm && typeof window.vm.expertMode !== "undefined") {
            window.vm.expertMode = isExpertModeEnabled;
        }
    } catch {
        // noop: if Vue model not available, do nothing
    }
}
