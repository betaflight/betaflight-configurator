import { betaflightModel } from "../../components/init.js";
import { isExpertModeEnabled } from "./isExpertModeEnabled";

// Delegate tab visibility to Vue via template v-show bindings. This function now
// only syncs the expert mode state to the global Vue model if present.
export function updateTabList(_features) {
    try {
        if (typeof betaflightModel.expertMode !== "undefined") {
            betaflightModel.expertMode = isExpertModeEnabled();
        }
    } catch {
        // noop: if Vue model not available, do nothing
    }
}
