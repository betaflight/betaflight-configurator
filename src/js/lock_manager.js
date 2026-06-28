/**
 * lock_manager.js — single-hold-per-owner lock for the connection/flasher lock.
 *
 * `GUI.connect_lock` is a bare boolean set true/false from many sites. A bare
 * boolean is fragile under nesting: if two owners both "lock" and the first
 * "unlocks", the second is left unprotected.
 *
 * LockManager fixes that by tracking WHO holds the lock. Each owner holds at
 * most once; `locked` is true while any owner holds. The owners are kept in a
 * Set and mirrored into a Vue `ref` so consumers that read `locked` through a
 * computed (e.g. GUI.connect_lock / store.connectLock) update reactively — a
 * plain Set size read would not be tracked.
 */
import { ref } from "vue";

export class LockManager {
    constructor() {
        // Owners currently holding the lock.
        this._owners = new Set();
        // Reactive mirror of `locked` for Vue computed consumers.
        this._lockedRef = ref(false);
        this.logHead = "[LOCK]";
    }

    /** True while at least one owner holds the lock (reactive). */
    get locked() {
        return this._lockedRef.value;
    }

    /**
     * Boolean-compatible single-hold-per-owner lock for the legacy
     * GUI.connect_lock = true/false pattern. Idempotent: repeated true keeps one
     * hold; false releases that owner's hold (no-op if it isn't held). Distinct
     * owners are independent — the lock stays held until every owner clears.
     */
    setBoolean(owner, value) {
        if (value) {
            this._owners.add(owner);
        } else {
            this._owners.delete(owner);
        }
        this._lockedRef.value = this._owners.size > 0;
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
