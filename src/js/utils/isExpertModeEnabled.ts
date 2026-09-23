import { get as getConfig } from "../ConfigStorage";

export function isExpertModeEnabled(): boolean {
    const vm = (globalThis as { vm?: { expertMode?: unknown } }).vm;
    if (vm && "expertMode" in vm) {
        return Boolean(vm.expertMode);
    }
    return Boolean(getConfig("expertMode").expertMode);
}
