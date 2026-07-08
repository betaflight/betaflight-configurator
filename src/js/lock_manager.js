/**
 * lock_manager.js — the connection/flasher lock (a single reactive boolean).
 *
 * `connect_lock` blocks connect/disconnect while a port-owning operation (firmware
 * flash, OSD font upload, DFU) is in progress. Only ONE such operation runs at a
 * time — tab switches are blocked while it is held (tab_switch.js) and the flasher's
 * port ownership is additionally guarded by the FLASHING connection-state phase — and
 * resetConnection() clears it as a global safety net on any disconnect. So a single
 * boolean is sufficient; there is no genuine multi-owner nesting to track.
 *
 * It lives here (not in the Pinia store) as a lazily-constructed singleton so plain
 * modules (serial_backend, protocols) and gui.js can read/write it without an active
 * pinia or an import cycle. The reactive `ref` keeps GUI.connect_lock and the store's
 * connectLock computed updating.
 */
import { ref } from "vue";

export class LockManager {
    constructor() {
        this._locked = ref(false);
    }

    /** True while the connection/flasher lock is held (reactive). */
    get locked() {
        return this._locked.value;
    }

    set locked(value) {
        this._locked.value = Boolean(value);
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
