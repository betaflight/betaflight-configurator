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

import { toRaw } from "vue";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { getTracking } from "../../js/Analytics";
import { useReboot } from "../useReboot";
import type { SerialPort } from "@/stores/fc.types";
import type { PortFunctionRule } from "./usePortsRules";
import type { PortAnalyticsChanges, PortRow } from "./usePortsState";

export function usePortsConfiguration(
    ports: PortRow[],
    analyticsChanges: PortAnalyticsChanges,
    functionRules: PortFunctionRule[],
) {
    const { saveAndReboot } = useReboot();

    const getEnabledFeaturesFromPorts = (portsList: SerialPort[]) => {
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
        if (!featureConfig) {
            // Set on connect, and this tab only saves while connected; it threw here before too.
            throw new Error("Feature config is not loaded");
        }
        if (rxSerial) {
            featureConfig.enable("RX_SERIAL");
        } else {
            featureConfig.disable("RX_SERIAL");
        }

        if (telemetry) {
            featureConfig.enable("TELEMETRY");
        }
        // Original code did NOT disable TELEMETRY when false — preserving that behavior

        if (blackbox) {
            featureConfig.enable("BLACKBOX");
        } else {
            featureConfig.disable("BLACKBOX");
        }
        if (esc) {
            featureConfig.enable("ESC_SENSOR");
        } else {
            featureConfig.disable("ESC_SENSOR");
        }

        // GNSS: only enable when port configured, don't disable (allows Virtual GPS)
        if (gps) {
            featureConfig.enable("GPS");
        }
    };

    const saveConfig = () => {
        const tracking = getTracking();
        tracking?.sendSaveAndChangeEvents(
            tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER,
            toRaw(analyticsChanges),
            "ports",
        );

        // Clear analytics changes
        for (const key in analyticsChanges) {
            delete analyticsChanges[key];
        }

        // Reconstruct FC.SERIAL_CONFIG.ports
        FC.SERIAL_CONFIG.ports = ports.map((p) => {
            const functions: string[] = [];
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
            saveAndReboot().then(() => gui_log(i18n.getMessage("portsEepromSave")));
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

    const findRule = (name: string) => functionRules.find((r) => r.name === name);
    const isMspShareable = (rule: PortFunctionRule | undefined) => rule?.sharableWith?.includes("msp") === true;

    const onTelemetryChange = (port: PortRow) => {
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

    const onPeripheralChange = (port: PortRow) => {
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
