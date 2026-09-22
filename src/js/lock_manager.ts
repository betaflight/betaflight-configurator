/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * lock_manager.ts — the connection/flasher lock (a single reactive boolean).
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
import { ref, type Ref } from "vue";

export class LockManager {
    private readonly _locked: Ref<boolean>;

    constructor() {
        this._locked = ref(false);
    }

    /** True while the connection/flasher lock is held (reactive). */
    get locked(): boolean {
        return this._locked.value;
    }

    /**
     * The coercion is load-bearing, not defensive tidiness: the setter is reached from
     * unchecked JavaScript (`GUI.connect_lock`, serial_backend, the flashing protocols),
     * so a truthy non-boolean still has to land in the ref as a boolean — otherwise
     * `locked` would start returning the assigned value and break `=== true` readers.
     */
    set locked(value: boolean) {
        this._locked.value = Boolean(value);
    }
}

// Process-wide lock, lazily constructed (no init-order hazard).
let _instance: LockManager | null = null;

export function getLockManager(): LockManager {
    if (!_instance) {
        _instance = new LockManager();
    }
    return _instance;
}

export function __resetLockManagerForTests(): void {
    _instance = null;
}
