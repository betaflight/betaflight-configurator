import { useLogStore } from "../stores/log";

let cachedStore = null;

function getStore() {
    if (cachedStore) {
        return cachedStore;
    }
    try {
        cachedStore = useLogStore();
    } catch {
        // Pinia may not yet be active during early boot; fall back to null and retry later.
        cachedStore = null;
    }
    return cachedStore;
}

export function gui_log(message) {
    const store = getStore();
    store?.add(message);
}
