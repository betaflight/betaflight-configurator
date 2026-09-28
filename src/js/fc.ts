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

import { getActivePinia, type Pinia } from "pinia";
import { pinia } from "./pinia_instance";
import { useFlightControllerStore } from "../stores/fc";

/*
 * Legacy entry point for the flight-controller state, which is owned by the
 * flightController Pinia store (src/stores/fc.ts). `FC.X` reads and writes the
 * store's `X`, so the two can never disagree. New code should call
 * useFlightControllerStore() instead of importing this module.
 *
 * The store is resolved per access rather than once at import, so a test that
 * installs a fresh Pinia (setActivePinia) sees the same state as the components
 * it mounts. Outside a test the active Pinia is the app's `pinia` instance.
 *
 * Sealed: assigning a key the store does not declare throws, so FC can no longer
 * grow fields that bypass the store's types.
 */

type FlightControllerStore = ReturnType<typeof useFlightControllerStore>;

let cachedPinia: Pinia | null = null;
let cachedStore: FlightControllerStore | null = null;

function store(): FlightControllerStore {
    const active = getActivePinia() ?? pinia;
    if (active !== cachedPinia || !cachedStore) {
        cachedStore = useFlightControllerStore(active);
        cachedPinia = active;
    }
    return cachedStore;
}

function isStoreKey(key: string | symbol): key is keyof FlightControllerStore & string {
    return typeof key === "string" && !key.startsWith("$") && !key.startsWith("_") && key in store();
}

const FC = new Proxy({} as FlightControllerStore, {
    get(target, key) {
        return isStoreKey(key) ? store()[key] : Reflect.get(target, key);
    },
    set(target, key, value) {
        if (!isStoreKey(key)) {
            throw new TypeError(`FC.${String(key)} is not part of the flightController store`);
        }
        (store() as unknown as Record<string, unknown>)[key] = value;
        return true;
    },
    has(target, key) {
        return isStoreKey(key);
    },
});

export default FC;
