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

import { computed, ref, type Ref } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { i18n } from "../../js/localization";
import {
    findCliError,
    findCliSettingAllowedValues,
    findCliSettingValue,
    isMspCliSupported,
    send as cliSend,
} from "../useMspCliSession";
import { serialPortsAreReadOnly } from "./usePortsReadOnly";
import {
    PORT_NONE,
    findPortIdentifierByCliName,
    formatPortSetCommand,
    getPortCliName,
    getPortDisplayName,
} from "./portNames";
import { unreportedSoftSerialIdentifiers } from "./softSerial";
import { describeClaim } from "./portClaims";
import { loadPortClaims } from "./usePortClaims";

export interface Option<T> {
    value: T;
    label: string;
}

/**
 * Claim names for one port. A port with no CLI name cannot be claimed: `claims[null]` read the
 * key "null", which `peripherals` never prints.
 */
function claimsOn(claims: Record<string, string[] | undefined>, identifier: number): string[] {
    const cliName = getPortCliName(identifier);
    return (cliName === null ? undefined : claims[cliName]) ?? [];
}

export interface PortOptionsSettings {
    /** Claim names by port CLI name, as `peripherals` prints them; an absent port is unclaimed. */
    claims?: Record<string, string[] | undefined> | null;
    /** Kept in the list even if the FC did not report it. */
    currentIdentifier?: number;
    noneLabel?: string;
    freeLabel?: string;
    describeClaim?: (claim: string) => string;
    /** Ports the board has but the FC cannot open yet, listed after the reported ones and marked with `inactiveLabel`. */
    inactiveIdentifiers?: number[];
    inactiveLabel?: string;
}

/**
 * Every port is labelled with what holds it, the caller's own claim included, or marked free.
 * Without `claims` (a build that cannot say) the names stand alone rather than claim anything.
 */
export function buildPortOptions(
    ports: readonly { identifier: number }[] | null | undefined,
    {
        claims = null,
        currentIdentifier = PORT_NONE,
        noneLabel = "None",
        freeLabel = "free",
        describeClaim = (name) => name,
        inactiveIdentifiers = [],
        inactiveLabel = "inactive",
    }: PortOptionsSettings = {},
): Option<number>[] {
    const options: Option<number>[] = [{ value: PORT_NONE, label: noneLabel }];

    const label = (identifier: number, ...notes: string[]) => {
        const displayName = getPortDisplayName(identifier);
        const held = claims ? claimsOn(claims, identifier).map(describeClaim) : [];
        if (claims && !held.length && !notes.length) {
            notes.push(freeLabel);
        }
        const detail = [...held, ...notes].join(", ");
        return detail ? `${displayName} (${detail})` : displayName;
    };

    for (const port of ports ?? []) {
        options.push({ value: port.identifier, label: label(port.identifier) });
    }

    for (const identifier of inactiveIdentifiers) {
        if (!options.some((option) => option.value === identifier)) {
            options.push({ value: identifier, label: label(identifier, inactiveLabel) });
        }
    }

    if (currentIdentifier !== PORT_NONE && !options.some((option) => option.value === currentIdentifier)) {
        options.push({ value: currentIdentifier, label: getPortDisplayName(currentIdentifier) });
    }

    return options;
}

/**
 * @param rates baud rate names the firmware accepts for this feature
 * @param current kept in the list even when the feature no longer offers it
 */
export function buildBaudOptions(rates: string[] | null | undefined, current: string | null = null): Option<string>[] {
    const options = (rates ?? []).map((rate) => ({ value: rate, label: rate }));

    if (current && !options.some((option) => option.value === current)) {
        options.push({ value: current, label: current });
    }

    return options;
}

/**
 * Reads one CLI setting.
 *
 * A transport failure reads the same as an absent setting: the row hides and write() becomes a
 * no-op, so a reply we never saw cannot be mistaken for an unassigned port and written back as
 * NONE. Letting it throw would take the whole tab load down with it, and a busy FC times out.
 *
 * Resolves null when the firmware does not have the setting, so a caller can tell an absent
 * instance from one that is simply unassigned.
 */
async function readSetting(
    name: string,
    { discoverValues = false }: { discoverValues?: boolean } = {},
): Promise<{ value: string; allowed: string[] | null } | null> {
    let lines;
    try {
        lines = await cliSend(`get ${name}`);
    } catch (error) {
        console.warn(`Could not read ${name} over the CLI:`, error);
        return null;
    }

    if (findCliError(lines)) {
        return null;
    }

    const value = findCliSettingValue(lines, name);
    if (value === null) {
        return null;
    }

    return { value, allowed: discoverValues ? findCliSettingAllowedValues(lines) : null };
}

async function sendSetting(command: string) {
    const error = findCliError(await cliSend(command));
    if (error) {
        throw new Error(error);
    }
}

/**
 * Serial port assignment for one feature, owned by that feature's own tab.
 *
 * From API 1.49 the port lives on the feature's parameter group, so it is read and written
 * through that setting; the per-port function mask is gone from the wire. MSP still lists the
 * ports the board has, and the CLI `peripherals` command says what holds each one, which is
 * where the "claimed by" annotations come from.
 *
 * Whether a build has the setting at all is discovered the same way — a `get` for a setting the
 * firmware was not built with answers INVALID NAME, which is how the instance count for MSP and
 * telemetry reaches the app (MAX_MSP_PORT_COUNT and MAX_TELEMETRY_PROVIDERS never do).
 *
 * - `setting`: CLI setting name, e.g. "rx_uart"
 * - `baud`: omit for a feature with no baud of its own, such as a serial receiver, whose rate
 *   follows the protocol. Without `rates` the values the firmware prints for the setting are offered.
 * - `protocol`: a lookup setting the feature carries beside its port, as a telemetry instance
 *   carries its protocol
 */
export interface FeaturePortSettings {
    setting: string;
    baud?: { setting: string; rates?: string[] } | null;
    protocol?: { setting: string } | null;
}

export function useFeaturePort({ setting, baud = null, protocol = null }: FeaturePortSettings) {
    const fcStore = useFlightControllerStore();

    // The claim the `peripherals` command prints for this feature is the port setting minus its
    // _uart suffix ("rx_uart" -> "rx", "telemetry_1_uart" -> "telemetry_1"), so a port held by
    // this same feature reads as its own and not as a clash.
    const ownClaim = setting.replace(/_uart$/, "");

    const apiSupported = computed(() => serialPortsAreReadOnly(fcStore.config.apiVersion));
    const supported = ref(true);
    const available = computed(() => apiSupported.value && supported.value);
    const writable = computed(() => available.value && isMspCliSupported());

    const selectedIdentifier = ref(PORT_NONE);
    const assignedIdentifier = ref(PORT_NONE);
    const selectedBaud: Ref<string | null> = ref(null);
    const assignedBaud: Ref<string | null> = ref(null);
    const baudRates: Ref<string[] | null> = ref(baud?.rates ?? null);
    const selectedProtocol: Ref<string | null> = ref(null);
    const assignedProtocol: Ref<string | null> = ref(null);
    const protocolValues: Ref<string[] | null> = ref(null);

    const portChanged = computed(() => selectedIdentifier.value !== assignedIdentifier.value);
    const baudChanged = computed(() => Boolean(baud) && selectedBaud.value !== assignedBaud.value);
    const protocolChanged = computed(() => Boolean(protocol) && selectedProtocol.value !== assignedProtocol.value);
    const changed = computed(() => portChanged.value || baudChanged.value || protocolChanged.value);

    const options = computed(() =>
        buildPortOptions(fcStore.serialConfig?.ports, {
            claims: fcStore.serialConfig?.claims ?? null,
            currentIdentifier: selectedIdentifier.value,
            noneLabel: i18n.getMessage("portsPortNone"),
            freeLabel: i18n.getMessage("portsPortFree"),
            describeClaim: (name) => describeClaim(name).label,
            inactiveIdentifiers: unreportedSoftSerialIdentifiers(fcStore.serialConfig?.ports),
            inactiveLabel: i18n.getMessage("portsPortInactive"),
        }),
    );

    const baudOptions = computed(() => buildBaudOptions(baudRates.value, selectedBaud.value));
    const protocolOptions = computed(() => (protocolValues.value ?? []).map((value) => ({ value, label: value })));

    // The port the user has picked, when it is already held by another feature and the pick is a
    // move onto it. Only a change is reported: leaving a port that a shared config already puts
    // this feature beside another on is not the user creating a clash, so it must not warn on save.
    // `null` when there is nothing to warn about, or the build cannot say what holds a port.
    const conflict = computed(() => {
        if (!portChanged.value || selectedIdentifier.value === PORT_NONE) {
            return null;
        }

        const claims = fcStore.serialConfig?.claims;
        if (!claims) {
            return null;
        }

        const heldBy = claimsOn(claims, selectedIdentifier.value)
            .filter((name) => name !== ownClaim)
            .map((name) => describeClaim(name).label);
        if (!heldBy.length) {
            return null;
        }

        return { port: getPortDisplayName(selectedIdentifier.value), heldBy };
    });

    // The pending assignment this feature would write, so a tab can catch two of its features
    // picking the same free port in one save — a clash the claim labels cannot show yet, since
    // nothing holds the port until the save goes through.
    const selection = computed(() => ({
        identifier: selectedIdentifier.value,
        changed: portChanged.value,
        label: describeClaim(ownClaim).label,
    }));

    async function load() {
        supported.value = true;
        selectedIdentifier.value = PORT_NONE;
        assignedIdentifier.value = PORT_NONE;
        selectedBaud.value = null;
        assignedBaud.value = null;
        selectedProtocol.value = null;
        assignedProtocol.value = null;

        if (!apiSupported.value) {
            return;
        }

        await MSP.promise(MSPCodes.MSP2_COMMON_SERIAL_CONFIG);

        if (!isMspCliSupported()) {
            return;
        }

        const port = await readSetting(setting);
        if (!port) {
            supported.value = false;
            return;
        }

        await loadPortClaims();

        assignedIdentifier.value = findPortIdentifierByCliName(fcStore.serialConfig?.ports, port.value);
        selectedIdentifier.value = assignedIdentifier.value;

        if (baud) {
            const stored = await readSetting(baud.setting, { discoverValues: !baud.rates });
            if (stored) {
                if (!baud.rates && stored.allowed) {
                    baudRates.value = stored.allowed;
                }
                assignedBaud.value = stored.value;
                selectedBaud.value = stored.value;
            }
        }

        if (protocol) {
            const stored = await readSetting(protocol.setting, { discoverValues: true });
            if (stored) {
                protocolValues.value = stored.allowed;
                assignedProtocol.value = stored.value;
                selectedProtocol.value = stored.value;
            }
        }
    }

    async function write() {
        if (!available.value) {
            return;
        }

        if (protocol && protocolChanged.value) {
            await sendSetting(`set ${protocol.setting} = ${selectedProtocol.value}`);
            assignedProtocol.value = selectedProtocol.value;
        }

        if (portChanged.value) {
            await sendSetting(formatPortSetCommand(setting, selectedIdentifier.value));
            assignedIdentifier.value = selectedIdentifier.value;
            await loadPortClaims({ refresh: true });
        }

        if (baud && baudChanged.value) {
            await sendSetting(`set ${baud.setting} = ${selectedBaud.value}`);
            assignedBaud.value = selectedBaud.value;
        }
    }

    return {
        available,
        supported,
        writable,
        options,
        selectedIdentifier,
        baudOptions,
        selectedBaud,
        protocolOptions,
        selectedProtocol,
        changed,
        conflict,
        selection,
        load,
        write,
    };
}
