import { reactive, ref, computed, nextTick, onMounted } from "vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { useDirtyState } from "../useDirtyState";
import { getPortDisplayName as getPortName } from "./portNames";

export function usePortsState(getRules) {
    const ports = reactive([]);
    const analyticsChanges = reactive({});
    const isLoading = ref(true);

    const { dirty, markClean } = useDirtyState(() => JSON.stringify(ports));

    const transformPortData = (fcPort) => {
        return {
            identifier: fcPort.identifier,
            msp_baudrate: fcPort.msp_baudrate,
            telemetry_baudrate: fcPort.telemetry_baudrate,
            gps_baudrate: fcPort.gps_baudrate === "AUTO" ? "AUTO" : fcPort.gps_baudrate || "AUTO",
            blackbox_baudrate: fcPort.blackbox_baudrate === "AUTO" ? "AUTO" : fcPort.blackbox_baudrate || "AUTO",
            msp: fcPort.functions.includes("MSP"),
            rxSerial: fcPort.functions.includes("RX_SERIAL"),
            telemetry: fcPort.functions.find((f) => getRules("telemetry").some((r) => r.name === f)) || "",
            sensor: fcPort.functions.find((f) => getRules("sensors").some((r) => r.name === f)) || "",
            peripheral: fcPort.functions.find((f) => getRules("peripherals").some((r) => r.name === f)) || "",
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
