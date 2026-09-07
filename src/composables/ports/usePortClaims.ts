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

import FC from "../../js/fc";
import { findCliError, isMspCliSupported, send as cliSend } from "../useMspCliSession";
import { parsePeripherals } from "./usePeripherals";

/**
 * What holds each serial port, keyed by the port's CLI name, as the firmware `peripherals`
 * command reports it: `{ UART1: ["vtx", "osd"], VCP: ["msp_1"] }`. A port it does not list is
 * unclaimed.
 */
export type PortClaims = Record<string, string[]>;

/**
 * The claims ride on FC.SERIAL_CONFIG so they live exactly as long as the connection's serial
 * config does - a connect or disconnect resets both together - and are read once per connection
 * rather than once per select: a tab loads its feature ports in turn, and five identical CLI
 * round trips for one answer is what that would cost. A port assignment written from the app
 * refreshes them, since a save need not reboot and the tab keeps showing the same lists; anything
 * else that moves a port (the CLI tab, a preset) ends in a reboot and a fresh connection.
 *
 * `undefined` is not read yet, `null` is a build without the command - a caller can then say
 * nothing about a port rather than call it free.
 */
interface SerialConfigWithClaims {
    claims?: PortClaims | null;
}

// One read in flight per serial config, so a reconnect mid-read starts its own rather than
// inheriting the old connection's answer, and a refresh mid-read supersedes the read it overtook.
const pendingByConfig = new WeakMap<SerialConfigWithClaims, Promise<PortClaims | null>>();

/**
 * @returns the claims, `null` for a build that refuses the command, or `undefined` when the reply
 *   never arrived - a busy FC times out - which is worth asking again next time
 */
async function readClaims(): Promise<PortClaims | null | undefined> {
    let lines: string[];
    try {
        lines = await cliSend("peripherals");
    } catch (error) {
        console.warn("Could not read the port claims over the CLI:", error);
        return undefined;
    }

    if (findCliError(lines)) {
        return null;
    }

    const byName: PortClaims = {};
    for (const port of parsePeripherals(lines).serial) {
        byName[port.portName] = port.claims.map((claim: { name: string }) => claim.name);
    }

    return byName;
}

/**
 * @param options.refresh ask the FC again even if the answer is already held
 */
export function loadPortClaims({ refresh = false }: { refresh?: boolean } = {}): Promise<PortClaims | null> {
    const config = FC.SERIAL_CONFIG as SerialConfigWithClaims | null;
    if (!config) {
        return Promise.resolve(null);
    }

    if (refresh) {
        delete config.claims;
        pendingByConfig.delete(config);
    } else if (config.claims !== undefined) {
        return Promise.resolve(config.claims);
    }

    if (!isMspCliSupported()) {
        return Promise.resolve(null);
    }

    let pending = pendingByConfig.get(config);
    if (!pending) {
        const read: Promise<PortClaims | null> = readClaims()
            .then((claims) => {
                if (claims !== undefined && pendingByConfig.get(config) === read) {
                    config.claims = claims;
                }
                return claims ?? null;
            })
            .finally(() => {
                if (pendingByConfig.get(config) === read) {
                    pendingByConfig.delete(config);
                }
            });
        pendingByConfig.set(config, read);
        pending = read;
    }

    return pending;
}
