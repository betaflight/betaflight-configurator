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

import { reactive, ref, computed, nextTick, onMounted } from "vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { useDirtyState } from "../useDirtyState";
import { getPortDisplayName as getPortName } from "./portNames";
import type { SerialPort } from "@/stores/fc.types";
import type { PortFunctionGroup, PortFunctionRule } from "./usePortsRules";

/** One row of the legacy Ports view: an FC serial port with its functions split per column. */
export interface PortRow {
    identifier: number;
    msp_baudrate: string;
    telemetry_baudrate: string;
    gps_baudrate: string;
    blackbox_baudrate: string;
    msp: boolean;
    rxSerial: boolean;
    /** Function names, or "" for none. */
    telemetry: string;
    sensor: string;
    peripheral: string;
}

/** Function names per analytics key, reported when the configuration is saved. */
export type PortAnalyticsChanges = Record<string, string>;

export function usePortsState(getRules: (group: PortFunctionGroup) => PortFunctionRule[]) {
    const ports = reactive<PortRow[]>([]);
    const analyticsChanges = reactive<PortAnalyticsChanges>({});
    const isLoading = ref(true);

    const { dirty, markClean } = useDirtyState(() => JSON.stringify(ports));

    const transformPortData = (fcPort: SerialPort): PortRow => {
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
