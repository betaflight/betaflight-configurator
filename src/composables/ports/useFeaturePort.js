import { computed, ref } from "vue";
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
import { invalidatePortClaims, loadPortClaims } from "./usePortClaims";

/**
 * Every port is labelled with what holds it, the caller's own claim included, or marked free.
 * Without `claims` (a build that cannot say) the names stand alone rather than claim anything.
 *
 * @param {Array<{identifier: number}>} ports
 * @param {object} options
 * @param {Record<string, string[]>|null} [options.claims] claim names by port CLI name, as
 *   `peripherals` prints them; a port that is absent is unclaimed
 * @param {number} [options.currentIdentifier] kept in the list even if the FC did not report it
 * @param {string} [options.noneLabel]
 * @param {string} [options.freeLabel]
 * @param {(claim: string) => string} [options.describeClaim]
 * @param {number[]} [options.inactiveIdentifiers] ports the board has but the FC cannot open yet,
 *   listed after the reported ones and marked with `inactiveLabel`
 * @param {string} [options.inactiveLabel]
 * @returns {Array<{value: number, label: string}>}
 */
export function buildPortOptions(
    ports,
    {
        claims = null,
        currentIdentifier = PORT_NONE,
        noneLabel = "None",
        freeLabel = "free",
        describeClaim = (name) => name,
        inactiveIdentifiers = [],
        inactiveLabel = "inactive",
    } = {},
) {
    const options = [{ value: PORT_NONE, label: noneLabel }];

    const label = (identifier, ...notes) => {
        const displayName = getPortDisplayName(identifier);
        const held = claims ? (claims[getPortCliName(identifier)] ?? []).map(describeClaim) : [];
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
 * @param {string[]} rates baud rate names the firmware accepts for this feature
 * @param {string|null} [current] kept in the list even when the feature no longer offers it
 * @returns {Array<{value: string, label: string}>}
 */
export function buildBaudOptions(rates, current = null) {
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
 * @returns {Promise<{value: string, allowed: string[]|null}|null>} null when the firmware does not
 *   have the setting, so a caller can tell an absent instance from one that is simply unassigned
 */
async function readSetting(name, { discoverValues = false } = {}) {
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

async function sendSetting(command) {
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
 * @param {object} options
 * @param {string} options.setting CLI setting name, e.g. "rx_uart"
 * @param {{setting: string, rates?: string[]}} [options.baud] omit for a feature with no baud of
 *   its own, such as a serial receiver, whose rate follows the protocol. Without `rates` the
 *   values the firmware prints for the setting are offered.
 * @param {{setting: string}} [options.protocol] a lookup setting the feature carries beside its
 *   port, as a telemetry instance carries its protocol
 */
export function useFeaturePort({ setting, baud = null, protocol = null }) {
    const fcStore = useFlightControllerStore();

    const apiSupported = computed(() => serialPortsAreReadOnly(fcStore.config.apiVersion));
    const supported = ref(true);
    const available = computed(() => apiSupported.value && supported.value);
    const writable = computed(() => available.value && isMspCliSupported());

    const selectedIdentifier = ref(PORT_NONE);
    const assignedIdentifier = ref(PORT_NONE);
    const selectedBaud = ref(null);
    const assignedBaud = ref(null);
    const baudRates = ref(baud?.rates ?? null);
    const selectedProtocol = ref(null);
    const assignedProtocol = ref(null);
    const protocolValues = ref(null);

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

        if (protocolChanged.value) {
            await sendSetting(`set ${protocol.setting} = ${selectedProtocol.value}`);
            assignedProtocol.value = selectedProtocol.value;
        }

        if (portChanged.value) {
            await sendSetting(formatPortSetCommand(setting, selectedIdentifier.value));
            assignedIdentifier.value = selectedIdentifier.value;
            invalidatePortClaims();
        }

        if (baudChanged.value) {
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
        load,
        write,
    };
}
