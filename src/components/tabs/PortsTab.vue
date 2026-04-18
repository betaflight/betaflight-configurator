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

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn save_btn">
                <button type="button" class="save" @click="saveConfig">{{ $t("configurationButtonSave") }}</button>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import { usePortsRules } from "../../composables/ports/usePortsRules";
import { usePortsState } from "../../composables/ports/usePortsState";
import { usePortsConfiguration } from "../../composables/ports/usePortsConfiguration";

const { functionRules, mspBaudRates, gpsBaudRates, telemetryBaudRates, blackboxBaudRates, getRules, isRuleDisabled } =
    usePortsRules();

const { ports, analyticsChanges, getPortName, vtxTableNotConfigured } = usePortsState(getRules);

const { saveConfig, onTelemetryChange, onPeripheralChange } = usePortsConfiguration(
    ports,
    analyticsChanges,
    functionRules,
);
</script>

<style lang="less">
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

.tab-ports {
    table {
        border-collapse: collapse;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        td {
            padding: 0.25rem;
            text-align: center;
            &.functionsCell-configuration,
            &.functionsCell-telemetry,
            &.functionsCell-peripherals,
            &.functionsCell-sensors {
                select {
                    margin-left: 0.5rem;
                }
            }
        }
        tr {
            td {
                padding: 0.5rem 0;
                background-color: var(--surface-200);
                &:first-child {
                    text-align: left;
                    padding-left: 1rem;
                }
            }
            &:nth-child(even) {
                select {
                    background-color: var(--surface-300);
                }
            }
        }
        td.functionsCell-peripherals > select:first-of-type {
            max-width: 12rem;
        }
        td.functionsCell-telemetry > select:first-of-type {
            max-width: 10rem;
        }
        thead {
            th {
                padding: 0.5rem;
                background-color: var(--surface-300);
                color: var(--text);
                &:first-child {
                    border-top-left-radius: 0.75rem;
                }
                &:last-child {
                    border-top-right-radius: 0.75rem;
                }
            }
            .helpicon {
                margin-top: 2px;
            }
        }
        tbody {
            // first and last td of last tr
            tr:last-child td:first-child {
                border-bottom-left-radius: 0.75rem;
            }
            tr:last-child td:last-child {
                border-bottom-right-radius: 0.75rem;
            }
            td {
                *:first-child {
                    margin-bottom: 0.25rem;
                }
            }
        }
    }
}
#tab-ports-templates {
    display: none;
}
.tab-ports.supported {
    .require-support {
        display: block;
    }
    .require-upgrade {
        display: none;
    }
}
@media only screen and (max-width: 1055px) {
    .tab-ports {
        table {
            thead {
                tr {
                    &:first-child {
                        font-size: 12px;
                        height: 22px;
                    }
                }
            }
        }
    }
}
@media only screen and (max-device-width: 1055px) {
    .tab-ports {
        table {
            thead {
                tr {
                    &:first-child {
                        font-size: 12px;
                        height: 22px;
                    }
                }
            }
        }
    }
}
@media all and (max-width: 575px) {
    .tab-ports {
        .config {
            text-align: left;
            border-top-left-radius: 5px;
            border-left: 0;
        }
        table {
            td {
                padding: 0;
            }
        }
        .ports {
            select {
                margin: 0;
                width: 100%;
                border: none;
                height: 25px;
                border-radius: unset;
            }
            td.functionsCell-peripherals > select:first-of-type {
                border-bottom: 1px solid var(--surface-500);
            }
            td.functionsCell-telemetry > select:first-of-type {
                border-bottom: 1px solid var(--surface-500);
            }
            td.functionsCell-sensors > select:first-of-type {
                border-bottom: 1px solid var(--surface-500);
            }
            thead {
                th {
                    font-size: 10px;
                    width: fit-content;
                    padding: 0.5rem;
                    word-break: break-word;
                    white-space: unset;
                }
            }
            tbody {
                td {
                    padding: 0.25rem 0.5rem;
                    .switchery-default {
                        margin-bottom: 0.5rem;
                    }
                    &.functionsCell-configuration,
                    &.functionsCell-telemetry,
                    &.functionsCell-peripherals,
                    &.functionsCell-sensors {
                        select {
                            margin-left: 0rem;
                        }
                    }
                }
                // alternate row and its identifier background color
                tr:nth-child(4n) {
                    td {
                        background-color: var(--surface-300);
                    }
                }
                tr:nth-child(4n + 1) {
                    td {
                        background-color: var(--surface-200);
                    }
                }
            }
        }
        .portIdentifier {
            td {
                font-size: 12px;
                color: var(--text);
                font-weight: normal;
                background-color: var(--surface-300);
            }
        }
    }
}
</style>
