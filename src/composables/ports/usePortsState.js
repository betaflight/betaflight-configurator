import { reactive, ref, computed, nextTick, onMounted } from "vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";

export function usePortsState(getRules) {
    const ports = reactive([]);
    const analyticsChanges = reactive({});
    const savedSnapshot = ref("");

    const portIdentifierToNameMapping = {
        0: "UART1",
        1: "UART2",
        2: "UART3",
        3: "UART4",
        4: "UART5",
        5: "UART6",
        6: "UART7",
        7: "UART8",
        8: "UART9",
        9: "UART10",
        20: "USB VCP",
        30: "SOFTSERIAL1",
        31: "SOFTSERIAL2",
        40: "LPUART1",
        50: "UART0",
        51: "UART1",
        52: "UART2",
        53: "UART3",
        54: "UART4",
        55: "UART5",
        56: "UART6",
        57: "UART7",
        58: "UART8",
        59: "UART9",
        60: "UART10",
        70: "PIOUART0",
        71: "PIOUART1",
        72: "PIOUART2",
        73: "PIOUART3",
        74: "PIOUART4",
        75: "PIOUART5",
        76: "PIOUART6",
        77: "PIOUART7",
        78: "PIOUART8",
        79: "PIOUART9",
    };

    const getPortName = (id) => portIdentifierToNameMapping[id] || `UART (${id})`;

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
        savedSnapshot.value = JSON.stringify(ports);
        nextTick(() => {
            GUI.content_ready();
        });
    };

    const dirty = computed(() => {
        return savedSnapshot.value !== "" && JSON.stringify(ports) !== savedSnapshot.value;
    });

    const loadConfig = () => {
        MSP.promise(MSPCodes.MSP_VTX_CONFIG).then(() => {
            mspHelper.loadSerialConfig(handleSerialConfigLoaded);
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
    };
}
