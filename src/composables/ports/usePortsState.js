import { reactive, ref, computed, nextTick, onMounted } from "vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { useDirtyState } from "../useDirtyState";
import { getPortDisplayName as getPortName } from "./portNames";

/**
 * A serial port as the FC reported it, decoded from MSP2_COMMON_SERIAL_CONFIG.
 *
 * @typedef {object} FcSerialPort
 * @property {number} identifier
 * @property {number} functionMask - the raw mask, including bits this build cannot name
 * @property {string[]} functions - only the bits it could name
 */

/**
 * A port as the Ports tab edits it: one slot per function group, plus whatever the save has to
 * put back untouched.
 *
 * @typedef {object} PortRow
 * @property {number} identifier
 * @property {number} functionMask - the raw mask as received
 * @property {string[]} reservedFunctions - decoded functions no slot could hold
 * @property {boolean} msp
 * @property {boolean} rxSerial
 * @property {string} telemetry
 * @property {string} sensor
 * @property {string} peripheral
 */

export function usePortsState(getRules) {
    const ports = reactive([]);
    const analyticsChanges = reactive({});
    const isLoading = ref(true);

    const { dirty, markClean } = useDirtyState(() => JSON.stringify(ports));

    /**
     * @param {FcSerialPort} fcPort
     * @returns {PortRow}
     */
    const transformPortData = (fcPort) => {
        const msp = fcPort.functions.includes("MSP");
        const rxSerial = fcPort.functions.includes("RX_SERIAL");
        const telemetry = fcPort.functions.find((f) => getRules("telemetry").some((r) => r.name === f)) || "";
        const sensor = fcPort.functions.find((f) => getRules("sensors").some((r) => r.name === f)) || "";
        const peripheral = fcPort.functions.find((f) => getRules("peripherals").some((r) => r.name === f)) || "";

        // A port has one slot per group (see functionRules), so a decoded function that no slot
        // claimed - a second peripheral, or a named function with no rule on this API version -
        // would be dropped on save. Park it here and re-emit it verbatim instead.
        const claimed = [msp && "MSP", rxSerial && "RX_SERIAL", telemetry, sensor, peripheral].filter(Boolean);
        const reservedFunctions = fcPort.functions.filter((f) => !claimed.includes(f));

        return {
            identifier: fcPort.identifier,
            // Raw mask as received. MSPHelper ORs the bits it cannot name back in on write.
            functionMask: fcPort.functionMask || 0,
            reservedFunctions,
            msp_baudrate: fcPort.msp_baudrate,
            telemetry_baudrate: fcPort.telemetry_baudrate,
            gps_baudrate: fcPort.gps_baudrate === "AUTO" ? "AUTO" : fcPort.gps_baudrate || "AUTO",
            blackbox_baudrate: fcPort.blackbox_baudrate === "AUTO" ? "AUTO" : fcPort.blackbox_baudrate || "AUTO",
            msp,
            rxSerial,
            telemetry,
            sensor,
            peripheral,
        };
    };

    const handleSerialConfigLoaded = () => {
        ports.length = 0;
        FC.SERIAL_CONFIG.ports.forEach((p) => {
            ports.push(transformPortData(p));
        });
        markClean();
        isLoading.value = false;
        nextTick(() => {
            GUI.content_ready();
        });
    };

    const loadConfig = () => {
        MSP.promise(MSPCodes.MSP_VTX_CONFIG)
            .then(() => {
                mspHelper.loadSerialConfig(handleSerialConfigLoaded);
            })
            .catch((error) => {
                console.error("Failed to load VTX config for ports tab:", error);
                isLoading.value = false;
                nextTick(() => {
                    GUI.content_ready();
                });
            });
    };

    const vtxTableNotConfigured = computed(() => {
        return (
            FC.VTX_CONFIG?.vtx_table_available &&
            (FC.VTX_CONFIG.vtx_table_bands === 0 ||
                FC.VTX_CONFIG.vtx_table_channels === 0 ||
                FC.VTX_CONFIG.vtx_table_powerlevels === 0)
        );
    });

    onMounted(() => {
        loadConfig();
    });

    return {
        ports,
        analyticsChanges,
        getPortName,
        vtxTableNotConfigured,
        dirty,
        isLoading,
    };
}
