/**
 * tab_lock.js — feature-detected multi-tab coordination (plan S5).
 *
 * Two browser tabs can both `port.open()` the same device, corrupting the MSP
 * stream. The Web Locks API (`navigator.locks`) can coordinate this, but it is
 * NOT guaranteed everywhere: Tauri's WebKitGTK and old Android WebViews may lack
 * it. Those shells are single-webview anyway, so the correct behavior there is a
 * no-op (single-tab). The rule from the plan: feature-detect, fall back to a
 * no-op, and NEVER call navigator.locks unconditionally.
 *
 * Default posture: single-tab. When Web Locks is available we hold an exclusive
 * lock keyed by the connection token for the lifetime of the connection; the
 * held lock is released by calling the returned release function.
 */

/** True only when the Web Locks API is actually present. */
export function hasWebLocks() {
    return typeof navigator !== "undefined" && !!navigator.locks && typeof navigator.locks.request === "function";
}

/**
 * Acquire an exclusive cross-tab lock for `key`, held until the returned
 * function is called. Resolves to a release function in all cases:
 *   - Web Locks available: a real exclusive lock is held while connected; a
 *     second tab attempting the same key with `ifAvailable` is told it failed.
 *   - Web Locks absent: a no-op release (documented single-tab behavior).
 *
 * Never throws and never blocks indefinitely — on contention it resolves with
 * `{ acquired: false }` so the caller can surface "already open in another tab".
 *
 * @param {string} key - stable per-device key (e.g. the reconnect token id)
 * @returns {Promise<{acquired: boolean, release: () => void}>}
 */
export function acquireTabLock(key) {
    if (!hasWebLocks()) {
        // Single-webview shell or unsupported browser: documented single-tab.
        return Promise.resolve({ acquired: true, release: () => {} });
    }

    return new Promise((resolve) => {
        let release = () => {};
        // `ifAvailable: true` => the callback runs immediately with null if the
        // lock is already held by another tab (no waiting).
        navigator.locks
            .request(`bf-connection:${key}`, { mode: "exclusive", ifAvailable: true }, (lock) => {
                if (!lock) {
                    // Another tab holds it.
                    resolve({ acquired: false, release: () => {} });
                    return undefined;
                }
                // Hold the lock until `release()` is called by resolving the
                // callback's promise only then.
                resolve({ acquired: true, release: () => release() });
                return new Promise((held) => {
                    release = held;
                });
            })
            .catch(() => {
                // Any failure degrades to single-tab rather than blocking connect.
                resolve({ acquired: true, release: () => {} });
            });
    });
}
