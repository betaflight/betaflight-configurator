import { useLogStore } from "../stores/log";

type LogStore = ReturnType<typeof useLogStore>;

let cachedStore: LogStore | null = null;

function getStore(): LogStore | null {
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

/**
 * Appends a message to the in-app log. The message is rendered as HTML by the log dialog, so
 * callers that interpolate user- or device-supplied text are responsible for escaping it.
 */
export function gui_log(message: string): void {
    const store = getStore();
    store?.add(message);
}
