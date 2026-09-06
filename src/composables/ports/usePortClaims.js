import FC from "../../js/fc";
import { findCliError, isMspCliSupported, send as cliSend } from "../useMspCliSession";
import { parsePeripherals } from "./usePeripherals";

/**
 * What holds each serial port, keyed by the port's CLI name, as the firmware `peripherals`
 * command reports it: `{ UART1: ["vtx", "osd"], VCP: ["msp_1"] }`. A port it does not list is
 * unclaimed.
 *
 * The result rides on FC.SERIAL_CONFIG so it lives exactly as long as the connection's serial
 * config does - a connect or disconnect resets both together - and is read once per connection
 * rather than once per select: a tab loads its feature ports in turn, and five identical CLI
 * round trips for one answer is what that would cost. A port assignment written from the app
 * refreshes it, since a save need not reboot and the tab keeps showing the same lists; anything
 * else that moves a port (the CLI tab, a preset) ends in a reboot and a fresh connection.
 *
 * `undefined` is not read yet, `null` is a build without the command - a caller can then say
 * nothing about a port rather than call it free.
 */
let pending = null;

async function readClaims() {
    let lines;
    try {
        lines = await cliSend("peripherals");
    } catch (error) {
        console.warn("Could not read the port claims over the CLI:", error);
        return null;
    }

    if (findCliError(lines)) {
        return null;
    }

    const byName = {};
    for (const port of parsePeripherals(lines).serial) {
        byName[port.portName] = port.claims.map((claim) => claim.name);
    }

    return byName;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.refresh] ask the FC again even if the answer is already held
 * @returns {Promise<Record<string, string[]>|null>}
 */
export function loadPortClaims({ refresh = false } = {}) {
    const config = FC.SERIAL_CONFIG;
    if (!config) {
        return Promise.resolve(null);
    }

    if (refresh) {
        delete config.claims;
    } else if (config.claims !== undefined) {
        return Promise.resolve(config.claims);
    }

    if (!isMspCliSupported()) {
        return Promise.resolve(null);
    }

    pending ??= readClaims()
        .then((claims) => {
            // A reconnect during the read has already replaced the config this was for.
            if (FC.SERIAL_CONFIG === config) {
                config.claims = claims;
            }
            return claims;
        })
        .finally(() => {
            pending = null;
        });

    return pending;
}
