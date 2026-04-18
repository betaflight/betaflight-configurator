import { toRaw } from "vue";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { tracking } from "../../js/Analytics";

export function usePortsConfiguration(ports, analyticsChanges, functionRules) {
    const getEnabledFeaturesFromPorts = (portsList) => {
        const flags = {
            rxSerial: false,
            telemetry: false,
            blackbox: false,
            esc: false,
            gps: false,
        };

        for (const port of portsList) {
            const func = port.functions;
            if (func.includes("RX_SERIAL")) {
                flags.rxSerial = true;
            }
            if (func.some((e) => e.startsWith("TELEMETRY"))) {
                flags.telemetry = true;
            }
            if (func.includes("BLACKBOX")) {
                flags.blackbox = true;
            }
            if (func.includes("ESC_SENSOR")) {
                flags.esc = true;
            }
            if (func.includes("GPS")) {
                flags.gps = true;
            }
        }
        return flags;
    };

    const updateFeatures = () => {
        const { rxSerial, telemetry, blackbox, esc, gps } = getEnabledFeaturesFromPorts(FC.SERIAL_CONFIG.ports);

        const featureConfig = FC.FEATURE_CONFIG.features;
        rxSerial ? featureConfig.enable("RX_SERIAL") : featureConfig.disable("RX_SERIAL");

        if (telemetry) {
            featureConfig.enable("TELEMETRY");
        }
        // Original code did NOT disable TELEMETRY when false — preserving that behavior

        blackbox ? featureConfig.enable("BLACKBOX") : featureConfig.disable("BLACKBOX");
        esc ? featureConfig.enable("ESC_SENSOR") : featureConfig.disable("ESC_SENSOR");

        // GNSS: only enable when port configured, don't disable (allows Virtual GPS)
        if (gps) {
            featureConfig.enable("GPS");
        }
    };

    const saveConfig = () => {
        tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, toRaw(analyticsChanges), "ports");

        // Clear analytics changes
        for (const key in analyticsChanges) {
            delete analyticsChanges[key];
        }

        // Reconstruct FC.SERIAL_CONFIG.ports
        FC.SERIAL_CONFIG.ports = ports.map((p) => {
            const functions = [];
            if (p.msp) {
                functions.push("MSP");
            }
            if (p.rxSerial) {
                functions.push("RX_SERIAL");
            }
            if (p.telemetry) {
                functions.push(p.telemetry);
            }
            if (p.sensor) {
                functions.push(p.sensor);
            }
            if (p.peripheral) {
                functions.push(p.peripheral);
            }

            return {
                identifier: p.identifier,
                msp_baudrate: p.msp_baudrate,
                telemetry_baudrate: p.telemetry_baudrate,
                gps_baudrate: p.gps_baudrate === "AUTO" ? "57600" : p.gps_baudrate,
                blackbox_baudrate: p.blackbox_baudrate === "AUTO" ? "115200" : p.blackbox_baudrate,
                functions,
            };
        });

        updateFeatures();

        const saveEeprom = () => {
            mspHelper.writeConfiguration(true, () => {
                gui_log(i18n.getMessage("portsEepromSave"));
            });
        };

        mspHelper.sendSerialConfig(() => {
            MSP.send_message(
                MSPCodes.MSP_SET_FEATURE_CONFIG,
                mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG),
                false,
                saveEeprom,
            );
        });
    };

    const findRule = (name) => functionRules.find((r) => r.name === name);
    const isMspShareable = (rule) => rule?.sharableWith?.includes("msp") === true;

    const onTelemetryChange = (port) => {
        if (port.telemetry) {
            const rule = findRule(port.telemetry);
            if (rule) {
                analyticsChanges["Telemetry"] = rule.displayName;
            }

            if (!isMspShareable(rule)) {
                port.msp = false;
            }

            // Enforce mutual exclusivity
            port.peripheral = "";
            delete analyticsChanges["VtxControl"];
            delete analyticsChanges["MspControl"];
        }
    };

    const onPeripheralChange = (port) => {
        const rule = findRule(port.peripheral);

        // VTX_MSP and similar MSP-based peripherals require MSP enabled
        if (port.peripheral?.includes("MSP")) {
            port.msp = true;
            analyticsChanges["MspControl"] = port.peripheral;
        } else if (port.peripheral && !isMspShareable(rule)) {
            port.msp = false;
            delete analyticsChanges["MspControl"];
        }

        if (port.peripheral === "TBS_SMARTAUDIO" || port.peripheral === "IRC_TRAMP") {
            analyticsChanges["VtxControl"] = port.peripheral;
        }

        // Enforce mutual exclusivity
        if (port.peripheral) {
            port.telemetry = "";
            delete analyticsChanges["Telemetry"];
        }
    };

    return {
        saveConfig,
        onTelemetryChange,
        onPeripheralChange,
    };
}
