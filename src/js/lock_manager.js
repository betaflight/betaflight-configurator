/**
 * lock_manager.js — ref-counting RAII mutex for the connection/flasher lock.
 *
 * `GUI.connect_lock` is today a bare boolean set true/false from 22 sites across
 * 7 files (webstm32, useFirmwareFlashing, serial_backend teardown, OsdTab, ...).
 * A bare boolean is fragile under nesting: if two owners both "lock" and the
 * first "unlocks", the second is left unprotected; and a missed reset wedges the
 * lock forever.
 *
 * LockManager replaces that with ref-counting acquire/release BY OWNER:
 *   - acquire(owner) increments the hold count and returns a release token,
 *   - release(token) is idempotent (releasing twice is a no-op),
 *   - `locked` is true while any holder remains.
 *
 * This is the intermediate mechanism (plan S4); the 22 call sites are rerouted
 * through it in S7 Phase B. Keeping it standalone and pure makes it unit-testable
 * and free of import cycles.
 */
export class LockManager {
    constructor() {
        // token -> owner label, for diagnostics and idempotent release.
        this._holds = new Map();
        this._nextId = 0;
        this.logHead = "[LOCK]";
    }

    /** True while at least one holder is active. */
    get locked() {
        return this._holds.size > 0;
    }

    /** Number of active holders (ref count). */
    get count() {
        return this._holds.size;
    }

    /** Owner labels currently holding the lock (for diagnostics). */
    get owners() {
        return Array.from(new Set(this._holds.values()));
    }

    /**
     * Acquire the lock for `owner`. Multiple acquisitions ref-count; each returns
     * its own release token so holders release independently (RAII).
     * @param {string} owner - diagnostic label (e.g. "flasher", "reboot")
     * @returns {{release: () => void, owner: string, id: number}}
     */
    acquire(owner = "anonymous") {
        const id = this._nextId++;
        this._holds.set(id, owner);
        let released = false;
        return {
            owner,
            id,
            release: () => {
                if (released) {
                    return; // idempotent
                }
                released = true;
                this._holds.delete(id);
            },
        };
    }

    /** Release by token. Idempotent and safe if the token is unknown/foreign. */
    release(token) {
        if (token && typeof token.release === "function") {
            token.release();
            return;
        }
        // Tolerate a raw id for callers that only kept the number.
        if (typeof token === "number") {
            this._holds.delete(token);
        }
    }

    /** Force-release everything (page teardown / hard reset). */
    releaseAll() {
        this._holds.clear();
    }
}

// Process-wide lock, lazily constructed (no init-order hazard).
let _instance = null;

export function getLockManager() {
    if (!_instance) {
        _instance = new LockManager();
    }
    return _instance;
}

export function __resetLockManagerForTests() {
    _instance = null;
}
