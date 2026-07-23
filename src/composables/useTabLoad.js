import { isMspCancelled } from "../js/msp/mspErrors.js";

/**
 * Shared tab-load guard: runs a tab's `loadConfig` MSP chain and swallows a benign
 * MspCancelledError — the queue is cleared (reason "cleanup"/"disconnected") when the tab is
 * switched away from or the link drops while the chain is still in flight, which is expected
 * and not a real failure. Any other error (timeout, CRC, ...) is passed to `onError`.
 * @template T
 * @param {() => Promise<T>} fn - the async loadConfig work (the MSP chain)
 * @param {(error: unknown) => void} onError - genuine-failure handler
 * @returns {Promise<T|undefined>} fn's resolved value, or undefined if cancelled/failed
 */
export async function runTabLoad(fn, onError) {
    try {
        return await fn();
    } catch (error) {
        if (isMspCancelled(error)) {
            return undefined;
        }
        onError(error);
        return undefined;
    }
}
