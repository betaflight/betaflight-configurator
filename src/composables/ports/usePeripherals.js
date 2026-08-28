import { ref } from "vue";
import FC from "../../js/fc";
import { mspHelper } from "../../js/msp/MSPHelper";
import { findCliError, isMspCliSupported, send as cliSend } from "../useMspCliSession";
import { findPortIdentifierByCliName, getPortDisplayName } from "./portNames";

/**
 * Parses the firmware `peripherals` command output. One line per device:
 *
 *   serial UART1: vtx*, osd     claims on a port, the one it opened for starred
 *   can node 125: org.gps (OK) gps, mag
 *   gyro 1: ICM42688P* on SPI1  starred when the instance is enabled
 *   baro: BMP280 on I2C1 @0x76
 *   mag: QMC5883 configured, not detected
 *
 * @param {string[]} lines
 */
export function parsePeripherals(lines) {
    const serial = [];
    const canNodes = [];
    const sensors = [];

    for (const raw of lines ?? []) {
        const line = raw.trim();

        let match = line.match(/^serial (\S+): (.*)$/);
        if (match) {
            serial.push({
                portName: match[1],
                claims: match[2]
                    .split(",")
                    .map((claim) => claim.trim())
                    .filter(Boolean)
                    .map((claim) => ({
                        name: claim.replace(/\*$/, ""),
                        active: claim.endsWith("*"),
                    })),
            });
            continue;
        }

        match = line.match(/^can node (\d+): (.*) \(([^,)]+)(?:, ([^)]+))?\)\s*(.*)$/);
        if (match) {
            canNodes.push({
                nodeId: Number(match[1]),
                name: match[2],
                health: match[3],
                mode: match[4] ?? null,
                sensors: match[5]
                    ? match[5]
                        .split(",")
                        .map((sensor) => sensor.trim())
                        .filter(Boolean)
                    : [],
            });
            continue;
        }

        match = line.match(/^(gyro \d+|acc|baro|mag): (.*)$/);
        if (match) {
            const detail = match[2];
            const missing = detail.match(/^(.*) configured, not detected$/);
            if (missing) {
                sensors.push({ key: match[1], hardware: missing[1], bus: null, detected: false, enabled: false });
                continue;
            }
            const device = detail.match(/^(\S+?)(\*)?(?: on (.*))?$/);
            if (device) {
                sensors.push({
                    key: match[1],
                    hardware: device[1],
                    bus: device[3] ?? null,
                    detected: true,
                    enabled: Boolean(device[2]),
                });
            }
        }
    }

    return { serial, canNodes, sensors };
}

/**
 * The peripherals inventory the tiles Ports view renders: every serial port the
 * FC reports (claimed or not), discovered DroneCAN nodes, and detected sensors.
 *
 * The probe is the command itself — a build without it answers with a CLI
 * error, and the view falls back to a "nothing to show" note.
 */
export function usePeripherals() {
    const isLoading = ref(true);
    const supported = ref(false);
    const serialPorts = ref([]);
    const canNodes = ref([]);
    const sensors = ref([]);

    function loadSerialPortInventory() {
        return new Promise((resolve) => mspHelper.loadSerialConfig(resolve));
    }

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

            const claimed = new Map();
            for (const entry of parsed.serial) {
                const identifier = findPortIdentifierByCliName(fcPorts, entry.portName);
                claimed.set(identifier, entry.claims);
            }

            // The command only prints ports the FC reports over MSP too, so the
            // MSP list is the complete inventory and unclaimed ports fall out
            // of it with an empty claims list.
            serialPorts.value = fcPorts.map((port) => ({
                identifier: port.identifier,
                displayName: getPortDisplayName(port.identifier),
                claims: claimed.get(port.identifier) ?? [],
            }));
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
