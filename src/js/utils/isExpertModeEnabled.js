import { get as getConfig } from "../ConfigStorage";

export function isExpertModeEnabled() {
    if (globalThis.vm && "expertMode" in globalThis.vm) {
        return Boolean(globalThis.vm.expertMode);
    }
    return Boolean(getConfig("expertMode").expertMode);
}
