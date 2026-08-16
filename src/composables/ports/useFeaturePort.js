import { computed, ref } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { i18n } from "../../js/localization";
import { findCliError, findCliSettingValue, isMspCliSupported, send as cliSend } from "../useMspCliSession";
import { serialPortsAreReadOnly } from "./usePortsReadOnly";
import { PORT_NONE, formatPortSetCommand, getPortDisplayName } from "./portNames";

/**
 * The port a feature is currently assigned to, read from the per-port function mask.
 *
 * @param {Array<{identifier: number, functions: string[]}>} ports FC.SERIAL_CONFIG.ports
 * @param {string} functionName e.g. "RX_SERIAL"
 * @returns {number} identifier, or PORT_NONE when unassigned
 */
export function findFeaturePortIdentifier(ports, functionName) {
    const port = (ports ?? []).find((candidate) => (candidate.functions ?? []).includes(functionName));

    return port ? port.identifier : PORT_NONE;
}

/**
 * @param {Array<{identifier: number, functions: string[]}>} ports
 * @param {object} options
 * @param {string} options.functionName the feature's own function, left out of the annotations
 * @param {number} [options.currentIdentifier] kept in the list even if the FC did not report it
 * @param {string} [options.noneLabel]
 * @param {(functionName: string) => string} [options.describeFunction]
 * @returns {Array<{value: number, label: string}>}
 */
export function buildPortOptions(
    ports,
    { functionName, currentIdentifier = PORT_NONE, noneLabel = "None", describeFunction = (name) => name } = {},
) {
    const options = [{ value: PORT_NONE, label: noneLabel }];

    for (const port of ports ?? []) {
        const claimedElsewhere = (port.functions ?? []).filter((name) => name !== functionName);
        const displayName = getPortDisplayName(port.identifier);

        options.push({
            value: port.identifier,
            label: claimedElsewhere.length
                ? `${displayName} (${claimedElsewhere.map(describeFunction).join(", ")})`
                : displayName,
        });
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

function describePortFunction(functionName) {
    return i18n.getMessage(`portsFunction_${functionName}`) || functionName;
}

/**
 * Serial port assignment for one feature, owned by that feature's own tab.
 *
 * From API 1.49 the port lives on the feature's parameter group and the per-port function mask
 * is a read-only view synthesised from those, so the assignment is read over MSP with the rest
 * of the serial config but written through the CLI.
 *
 * Features that also own their baud rate pass `baud`; the port and the baud are two settings on
 * the same parameter group, so they load and persist together.
 *
 * @param {object} options
 * @param {string} options.setting CLI setting name, e.g. "rx_uart"
 * @param {string} options.functionName port function the feature claims, e.g. "RX_SERIAL"
 * @param {{setting: string, rates: string[]}} [options.baud] omit for a feature with no baud of
 *   its own, such as a serial receiver, whose rate follows the protocol
 */
export function useFeaturePort({ setting, functionName, baud = null }) {
    const fcStore = useFlightControllerStore();

    const available = computed(() => serialPortsAreReadOnly(fcStore.config.apiVersion));
    const writable = computed(() => available.value && isMspCliSupported());

    const selectedIdentifier = ref(PORT_NONE);
    const assignedIdentifier = ref(PORT_NONE);
    const selectedBaud = ref(null);
    const assignedBaud = ref(null);

    const portChanged = computed(() => selectedIdentifier.value !== assignedIdentifier.value);
    const baudChanged = computed(() => Boolean(baud) && selectedBaud.value !== assignedBaud.value);
    const changed = computed(() => portChanged.value || baudChanged.value);

    const options = computed(() =>
        buildPortOptions(fcStore.serialConfig?.ports, {
            functionName,
            currentIdentifier: selectedIdentifier.value,
            noneLabel: i18n.getMessage("portsPortNone"),
            describeFunction: describePortFunction,
        }),
    );

    const baudOptions = computed(() => buildBaudOptions(baud?.rates, selectedBaud.value));

    async function load() {
        if (!available.value) {
            return;
        }

        await MSP.promise(MSPCodes.MSP2_COMMON_SERIAL_CONFIG);

        assignedIdentifier.value = findFeaturePortIdentifier(fcStore.serialConfig?.ports, functionName);
        selectedIdentifier.value = assignedIdentifier.value;

        // Not read from the port entry alongside the mask: the synthesised baud only appears on the
        // port that owns the function, so an unassigned feature would report the firmware default
        // instead of what is stored, and a save would then skip a write it owed.
        if (baud && writable.value) {
            assignedBaud.value = findCliSettingValue(await cliSend(`get ${baud.setting}`), baud.setting);
            selectedBaud.value = assignedBaud.value;
        }
    }

    async function sendSetting(command) {
        const error = findCliError(await cliSend(command));
        if (error) {
            throw new Error(error);
        }
    }

    async function write() {
        if (!available.value) {
            return;
        }

        if (portChanged.value) {
            await sendSetting(formatPortSetCommand(setting, selectedIdentifier.value));
            assignedIdentifier.value = selectedIdentifier.value;
        }

        if (baudChanged.value) {
            await sendSetting(`set ${baud.setting} = ${selectedBaud.value}`);
            assignedBaud.value = selectedBaud.value;
        }
    }

    return { available, writable, options, selectedIdentifier, baudOptions, selectedBaud, changed, load, write };
}
