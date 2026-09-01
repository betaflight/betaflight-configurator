import { ref } from "vue";
import FC from "../../js/fc";
import { mspHelper } from "../../js/msp/MSPHelper";
import { findCliError, isMspCliSupported, send as cliSend } from "../useMspCliSession";
import { PORT_NONE, findPortIdentifierByCliName, getPortDisplayName } from "./portNames";

/**
 * Parses the firmware `peripherals` command output. One line per device:
 *
 *   serial UART1: vtx*, osd     claims on a port, the one it opened for starred
 *   serial SOFTSERIAL1 (feature SOFTSERIAL off): vtx
 *                               a port the FC cannot open, and why
 *   can node 125: org.gps (OK) gps, mag
 *   gyro 1: ICM42688P* on SPI1  starred when the instance is enabled
 *   baro: BMP280 on I2C1 @0x76
 *   mag: QMC5883 configured, not detected
 *
 * @param {string[]} lines
 */
function splitList(text) {
    return text
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseSerialLine(line) {
    // The claims are absent altogether on a port nothing has claimed, which the
    // firmware prints as a bare "serial UART4:".
    const match = /^serial (\S+)(?: \(([^)]*)\))?:(?: (.*))?$/.exec(line);
    if (!match) {
        return null;
    }

    return {
        portName: match[1],
        inactiveReason: match[2] ?? null,
        claims: splitList(match[3] ?? "").map((claim) => ({
            name: claim.replace(/\*$/, ""),
            active: claim.endsWith("*"),
        })),
    };
}

function parseCanNodeLine(line) {
    const match = /^can node (\d+): (.*)$/.exec(line);
    if (!match) {
        return null;
    }

    // "<name> (<health>[, <mode>])[ <sensor>, ...]" - the name never contains
    // " (", so the first occurrence splits it off without regex backtracking.
    const detail = match[2];
    const open = detail.indexOf(" (");
    const close = detail.indexOf(")", open);
    if (open < 0 || close < 0) {
        return null;
    }

    const [health, mode] = splitList(detail.slice(open + 2, close));

    return {
        nodeId: Number(match[1]),
        name: detail.slice(0, open),
        health,
        mode: mode ?? null,
        sensors: splitList(detail.slice(close + 1)),
    };
}

function parseSensorLine(line) {
    const match = /^(gyro \d+|acc|baro|mag): (.*)$/.exec(line);
    if (!match) {
        return null;
    }

    const key = match[1];
    const detail = match[2];

    const missingSuffix = " configured, not detected";
    if (detail.endsWith(missingSuffix)) {
        return { key, hardware: detail.slice(0, -missingSuffix.length), bus: null, detected: false, enabled: false };
    }

    const [device, bus] = detail.split(" on ");
    return {
        key,
        hardware: device.replace(/\*$/, ""),
        bus: bus ?? null,
        detected: true,
        enabled: device.endsWith("*"),
    };
}

export function parsePeripherals(lines) {
    const serial = [];
    const canNodes = [];
    const sensors = [];

    for (const raw of lines ?? []) {
        const line = raw.trim();

        const port = parseSerialLine(line);
        if (port) {
            serial.push(port);
            continue;
        }

        const node = parseCanNodeLine(line);
        if (node) {
            canNodes.push(node);
            continue;
        }

        const sensor = parseSensorLine(line);
        if (sensor) {
            sensors.push(sensor);
        }
    }

    return { serial, canNodes, sensors };
}

/**
 * The peripherals inventory the tiles Ports view renders: every serial port the
 * board has, whether claimed, unclaimed or not openable at all, discovered
 * DroneCAN nodes, and detected sensors.
 *
 * The probe is the command itself — a build without it answers with a CLI
 * error, and the view falls back to a "nothing to show" note.
 */
function loadSerialPortInventory() {
    return new Promise((resolve) => mspHelper.loadSerialConfig(resolve));
}

export function usePeripherals() {
    const isLoading = ref(true);
    const supported = ref(false);
    const serialPorts = ref([]);
    const canNodes = ref([]);
    const sensors = ref([]);

    async function load() {
        isLoading.value = true;
        supported.value = false;
        serialPorts.value = [];
        canNodes.value = [];
        sensors.value = [];

        try {
            await loadSerialPortInventory();

            if (!isMspCliSupported()) {
                return;
            }

            const lines = await cliSend("peripherals");
            if (findCliError(lines)) {
                return;
            }

            const parsed = parsePeripherals(lines);
            const fcPorts = FC.SERIAL_CONFIG?.ports ?? [];

            const reported = new Map();
            const unopenable = [];
            for (const entry of parsed.serial) {
                const identifier = findPortIdentifierByCliName(fcPorts, entry.portName);
                if (identifier === PORT_NONE) {
                    continue;
                }
                if (fcPorts.some((port) => port.identifier === identifier)) {
                    reported.set(identifier, entry);
                } else {
                    unopenable.push({ identifier, entry });
                }
            }

            // The command lists every port that can be opened, claimed or not,
            // plus the ones nothing can open yet - a soft serial port waiting on
            // its feature - so it, rather than the MSP list, is the inventory.
            // A port MSP does not report at all is therefore an inactive one.
            const tileFor = (identifier, entry) => ({
                identifier,
                displayName: getPortDisplayName(identifier),
                inactiveReason: entry?.inactiveReason ?? null,
                claims: entry?.claims ?? [],
            });

            serialPorts.value = [
                ...fcPorts.map((port) => tileFor(port.identifier, reported.get(port.identifier))),
                ...unopenable.map(({ identifier, entry }) => tileFor(identifier, entry)),
            ];
            canNodes.value = parsed.canNodes;
            sensors.value = parsed.sensors;
            supported.value = true;
        } catch (error) {
            console.warn("Could not read the peripherals inventory:", error);
        } finally {
            isLoading.value = false;
        }
    }

    return { isLoading, supported, serialPorts, canNodes, sensors, load };
}
