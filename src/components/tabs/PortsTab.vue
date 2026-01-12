<template>
    <BaseTab tab-name="ports">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabPorts')"></div>
            <WikiButton docUrl="ports" />

            <div class="require-support">
                <div class="note">
                    <p v-html="$t('portsHelp')"></p>
                    <p v-html="$t('portsMSPHelp')"></p>
                </div>

                <div class="note vtxTableNotSet" v-if="vtxTableNotConfigured">
                    <p v-html="$t('portsVtxTableNotSet')"></p>
                </div>

                <table class="ports">
                    <thead>
                        <tr>
                            <th class="sm-min" v-html="$t('portsIdentifier')"></th>
                            <th class="config" v-html="$t('portsConfiguration')"></th>
                            <th>
                                <span v-html="$t('portsSerialRx')"></span>
                                <span class="helpicon cf_tip" :title="$t('portsSerialRxHelp')"></span>
                            </th>
                            <th v-html="$t('portsTelemetryOut')"></th>
                            <th v-html="$t('portsSensorIn')"></th>
                            <th v-html="$t('portsPeripherals')"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(port, index) in ports" :key="port.identifier" class="portConfiguration">
                            <td class="identifierCell sm-min">
                                <p class="identifier">{{ getPortName(port.identifier) }}</p>
                            </td>

                            <!-- Configuration (MSP) -->
                            <td class="functionsCell-configuration">
                                <span class="function">
                                    <input
                                        type="checkbox"
                                        class="togglemedium"
                                        :id="`msp-${index}`"
                                        v-model="port.msp"
                                        :disabled="port.identifier === 20"
                                    />
                                    <label :for="`msp-${index}`">
                                        <span class="visually-hidden">MSP</span>
                                    </label>
                                </span>
                                <select class="msp_baudrate" v-model="port.msp_baudrate">
                                    <option v-for="rate in mspBaudRates" :key="rate" :value="rate">{{ rate }}</option>
                                </select>
                            </td>

                            <!-- Serial RX -->
                            <td class="functionsCell-rx">
                                <span class="function">
                                    <input
                                        type="checkbox"
                                        class="togglemedium"
                                        :id="`rx-${index}`"
                                        v-model="port.rxSerial"
                                    />
                                    <label :for="`rx-${index}`">
                                        <span class="visually-hidden">{{ $t("portsSerialRx") }}</span>
                                    </label>
                                </span>
                            </td>

                            <!-- Telemetry -->
                            <td class="functionsCell-telemetry">
                                <select v-model="port.telemetry" @change="onTelemetryChange(port)">
                                    <option value="">{{ $t("portsTelemetryDisabled") }}</option>
                                    <option
                                        v-for="rule in getRules('telemetry')"
                                        :key="rule.name"
                                        :value="rule.name"
                                        :disabled="isRuleDisabled(rule)"
                                    >
                                        {{ rule.displayName }}
                                    </option>
                                </select>
                                <select class="telemetry_baudrate" v-model="port.telemetry_baudrate">
                                    <option v-for="rate in telemetryBaudRates" :key="rate" :value="rate">
                                        {{ rate }}
                                    </option>
                                </select>
                            </td>

                            <!-- Sensors -->
                            <td class="functionsCell-sensors">
                                <select v-model="port.sensor">
                                    <option value="">{{ $t("portsTelemetryDisabled") }}</option>
                                    <option
                                        v-for="rule in getRules('sensors')"
                                        :key="rule.name"
                                        :value="rule.name"
                                        :disabled="isRuleDisabled(rule)"
                                    >
                                        {{ rule.displayName }}
                                    </option>
                                </select>
                                <select class="gps_baudrate" v-model="port.gps_baudrate">
                                    <option v-for="rate in gpsBaudRates" :key="rate" :value="rate">{{ rate }}</option>
                                </select>
                            </td>

                            <!-- Peripherals -->
                            <td class="functionsCell-peripherals">
                                <select v-model="port.peripheral" @change="onPeripheralChange(port)">
                                    <option value="">{{ $t("portsTelemetryDisabled") }}</option>
                                    <option
                                        v-for="rule in getRules('peripherals')"
                                        :key="rule.name"
                                        :value="rule.name"
                                        :disabled="isRuleDisabled(rule)"
                                    >
                                        {{ rule.displayName }}
                                    </option>
                                </select>
                                <select class="blackbox_baudrate" v-model="port.blackbox_baudrate">
                                    <option v-for="rate in blackboxBaudRates" :key="rate" :value="rate">
                                        {{ rate }}
                                    </option>
                                </select>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div class="clear-both"></div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom" style="position: fixed">
            <div class="btn save_btn">
                <a class="save" href="#" @click.prevent="saveConfig">{{ $t("configurationButtonSave") }}</a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, onMounted, onUnmounted, computed, toRaw, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { tracking } from "../../js/Analytics";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_47 } from "../../js/data_storage";
import WikiButton from "../elements/WikiButton.vue";

export default defineComponent({
    name: "PortsTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const ports = reactive([]);
        const analyticsChanges = reactive({});

        // --- Constants & Rules ---
        const functionRules = [
            { name: "MSP", groups: ["configuration", "msp"], maxPorts: 2 },
            { name: "GPS", groups: ["sensors"], maxPorts: 1, dependsOn: "USE_GPS" },
            {
                name: "TELEMETRY_FRSKY",
                groups: ["telemetry"],
                sharableWith: ["msp"],
                notSharableWith: ["peripherals"],
                maxPorts: 1,
                dependsOn: "USE_TELEMETRY_FRSKY_HUB",
            },
            {
                name: "TELEMETRY_HOTT",
                groups: ["telemetry"],
                sharableWith: ["msp"],
                notSharableWith: ["peripherals"],
                maxPorts: 1,
                dependsOn: "USE_TELEMETRY_HOTT",
            },
            { name: "TELEMETRY_SMARTPORT", groups: ["telemetry"], maxPorts: 1, dependsOn: "USE_TELEMETRY_SMARTPORT" },
            { name: "RX_SERIAL", groups: ["rx"], maxPorts: 1 },
            {
                name: "BLACKBOX",
                groups: ["peripherals"],
                sharableWith: ["msp"],
                notSharableWith: ["telemetry"],
                maxPorts: 1,
            },
            {
                name: "TELEMETRY_LTM",
                groups: ["telemetry"],
                sharableWith: ["msp"],
                notSharableWith: ["peripherals"],
                maxPorts: 1,
                dependsOn: "USE_TELEMETRY_LTM",
            },
            {
                name: "TELEMETRY_MAVLINK",
                groups: ["telemetry"],
                sharableWith: ["msp"],
                notSharableWith: ["peripherals"],
                maxPorts: 1,
                dependsOn: "USE_TELEMETRY_MAVLINK",
            },
            { name: "IRC_TRAMP", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_VTX" },
            { name: "ESC_SENSOR", groups: ["sensors"], maxPorts: 1 },
            { name: "TBS_SMARTAUDIO", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_VTX" },
            { name: "TELEMETRY_IBUS", groups: ["telemetry"], maxPorts: 1, dependsOn: "USE_TELEMETRY_IBUS_EXTENDED" },
            { name: "RUNCAM_DEVICE_CONTROL", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_CAMERA_CONTROL" },
            { name: "LIDAR_TF", groups: ["peripherals"], maxPorts: 1 },
            { name: "FRSKY_OSD", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_FRSKYOSD" },
        ];

        // Conditional rules
        if (FC.CONFIG && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            functionRules.push({ name: "VTX_MSP", groups: ["peripherals"], sharableWith: ["msp"], maxPorts: 1 });
        }

        // Localize
        for (const rule of functionRules) {
            rule.displayName = i18n.getMessage(`portsFunction_${rule.name}`);
        }

        const mspBaudRates = ["9600", "19200", "38400", "57600", "115200", "230400", "250000", "500000", "1000000"];
        const gpsBaudRates = ["AUTO", "9600", "19200", "38400", "57600", "115200"];
        const telemetryBaudRates = ["AUTO", "9600", "19200", "38400", "57600", "115200"];
        const blackboxBaudRates = [
            "AUTO",
            "19200",
            "38400",
            "57600",
            "115200",
            "230400",
            "250000",
            "1500000",
            "2000000",
            "2470000",
        ];

        if (FC.CONFIG && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            gpsBaudRates.push("230400");
            telemetryBaudRates.push("230400", "460800");
        }

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

        const getRules = (group) => {
            const rules = functionRules.filter((r) => r.groups.includes(group));
            return rules.sort((a, b) => a.displayName.localeCompare(b.displayName));
        };

        const isRuleDisabled = (rule) => {
            return (
                FC.CONFIG.buildOptions.length &&
                rule.dependsOn !== undefined &&
                !FC.CONFIG.buildOptions.includes(rule.dependsOn)
            );
        };

        const transformPortData = (fcPort) => {
            const port = {
                identifier: fcPort.identifier,
                msp_baudrate: fcPort.msp_baudrate,
                telemetry_baudrate: fcPort.telemetry_baudrate,
                gps_baudrate: fcPort.gps_baudrate === "AUTO" ? "AUTO" : fcPort.gps_baudrate || "AUTO", // Handle existing values
                blackbox_baudrate: fcPort.blackbox_baudrate === "AUTO" ? "AUTO" : fcPort.blackbox_baudrate || "AUTO",

                // Transformed flags
                msp: fcPort.functions.includes("MSP"),
                rxSerial: fcPort.functions.includes("RX_SERIAL"),
                telemetry: fcPort.functions.find((f) => getRules("telemetry").some((r) => r.name === f)) || "",
                sensor: fcPort.functions.find((f) => getRules("sensors").some((r) => r.name === f)) || "",
                peripheral: fcPort.functions.find((f) => getRules("peripherals").some((r) => r.name === f)) || "",
            };
            return port;
        };

        const handleSerialConfigLoaded = () => {
            ports.length = 0;
            FC.SERIAL_CONFIG.ports.forEach((p) => {
                ports.push(transformPortData(p));
            });
            nextTick(() => {
                GUI.content_ready();
            });
        };

        const loadConfig = () => {
            MSP.promise(MSPCodes.MSP_VTX_CONFIG).then(() => {
                mspHelper.loadSerialConfig(handleSerialConfigLoaded);
            });
        };

        // Track local intervals
        const localIntervals = [];
        const addLocalInterval = (name, code, period, first = false) => {
            GUI.interval_add(name, code, period, first);
            localIntervals.push(name);
        };

        onMounted(() => {
            loadConfig();
            addLocalInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);
        });

        onUnmounted(() => {
            localIntervals.forEach((name) => GUI.interval_remove(name));
            localIntervals.length = 0;
        });

        const saveConfig = () => {
            tracking.sendSaveAndChangeEvents(
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

                // Defaults for baudrates if AUTO (handled in component state)

                return {
                    identifier: p.identifier,
                    msp_baudrate: p.msp_baudrate,
                    telemetry_baudrate: p.telemetry_baudrate,
                    gps_baudrate: p.gps_baudrate === "AUTO" ? "57600" : p.gps_baudrate,
                    blackbox_baudrate: p.blackbox_baudrate === "AUTO" ? "115200" : p.blackbox_baudrate,
                    functions: functions,
                };
            });

            // ... logic to update FEATURE_CONFIG ...
            // see original file
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

        const getEnabledFeaturesFromPorts = (ports) => {
            const flags = {
                rxSerial: false,
                telemetry: false,
                blackbox: false,
                esc: false,
                gps: false,
            };

            for (const port of ports) {
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
            // Telemetry disable is handled by user explicitly or mutual exclusivity elsewhere?
            // Original code didn't disable TELEMETRY if false?
            // Original code: if (enableTelemetry) featureConfig.enable("TELEMETRY");
            // It did NOT disable it. Preserving that behavior.

            blackbox ? featureConfig.enable("BLACKBOX") : featureConfig.disable("BLACKBOX");
            esc ? featureConfig.enable("ESC_SENSOR") : featureConfig.disable("ESC_SENSOR");
            gps ? featureConfig.enable("GPS") : featureConfig.disable("GPS");
        };

        const vtxTableNotConfigured = computed(() => {
            return (
                FC.VTX_CONFIG?.vtx_table_available &&
                (FC.VTX_CONFIG.vtx_table_bands === 0 ||
                    FC.VTX_CONFIG.vtx_table_channels === 0 ||
                    FC.VTX_CONFIG.vtx_table_powerlevels === 0)
            );
        });

        // Event handlers for logic (e.g. mutually exclusive)
        const onTelemetryChange = (port) => {
            if (port.telemetry) {
                const rule = functionRules.find((r) => r.name === port.telemetry);
                if (rule) {
                    analyticsChanges["Telemetry"] = rule.displayName;
                }

                // Enforce mutual exclusivity
                port.peripheral = "";
                delete analyticsChanges["VtxControl"];
                delete analyticsChanges["MspControl"];
            }
        };

        const onPeripheralChange = (port) => {
            // Logic for exclusive VTX control or MSP
            if (port.peripheral === "TBS_SMARTAUDIO" || port.peripheral === "IRC_TRAMP") {
                port.msp = false;
                analyticsChanges["VtxControl"] = port.peripheral;
            }
            if (port.peripheral && port.peripheral.includes("MSP")) {
                port.msp = true;
                analyticsChanges["MspControl"] = port.peripheral;
            }

            // Enforce mutual exclusivity
            if (port.peripheral) {
                port.telemetry = "";
                delete analyticsChanges["Telemetry"];
            }
        };

        return {
            ports,
            mspBaudRates,
            gpsBaudRates,
            telemetryBaudRates,
            blackboxBaudRates,
            getPortName,
            getRules,
            isRuleDisabled,
            onTelemetryChange,
            onPeripheralChange,
            saveConfig,
            vtxTableNotConfigured,
        };
    },
});
</script>

<style scoped>
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}
</style>
