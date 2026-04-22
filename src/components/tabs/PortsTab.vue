<template>
    <BaseTab tab-name="ports">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabPorts')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="ports" />
            </div>

            <div class="require-support">
                <UiBox type="warning" highlight class="mb-4">
                    <p v-html="$t('portsHelp')"></p>
                    <p v-html="$t('portsMSPHelp')"></p>
                </UiBox>

                <UiBox v-if="vtxTableNotConfigured" type="warning" highlight class="mb-4">
                    <p v-html="$t('portsVtxTableNotSet')"></p>
                </UiBox>

                <!-- Desktop: grid table (hidden below 1010px) -->
                <div class="max-[1010px]:hidden mt-4">
                    <div class="grid grid-cols-[auto_auto_auto_auto_auto_auto] justify-between text-xs">
                        <!-- Header -->
                        <div class="p-2 font-semibold" v-html="$t('portsIdentifier')"></div>
                        <div class="p-2 font-semibold" v-html="$t('portsConfiguration')"></div>
                        <div class="p-2 font-semibold flex items-center gap-1">
                            <span v-html="$t('portsSerialRx')"></span>
                            <HelpIcon :text="$t('portsSerialRxHelp')" />
                        </div>
                        <div class="p-2 font-semibold" v-html="$t('portsTelemetryOut')"></div>
                        <div class="p-2 font-semibold" v-html="$t('portsSensorIn')"></div>
                        <div class="p-2 font-semibold" v-html="$t('portsPeripherals')"></div>

                        <!-- Rows -->
                        <template v-for="(port, index) in ports" :key="port.identifier">
                            <!-- Identifier -->
                            <div class="flex items-center pl-3 font-semibold p-1.5">
                                {{ getPortName(port.identifier) }}
                            </div>

                            <!-- Configuration (MSP) -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USwitch v-model="port.msp" :disabled="port.identifier === 20" />
                                <USelect v-model="port.msp_baudrate" :items="mspBaudItems" size="xs" />
                            </div>

                            <!-- Serial RX -->
                            <div class="flex items-center justify-center p-1.5">
                                <USwitch v-model="port.rxSerial" size="xs" />
                            </div>

                            <!-- Telemetry -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USelect
                                    :model-value="portFieldGet(port, 'telemetry')"
                                    :items="telemetryItems"
                                    size="xs"
                                    class="min-w-22"
                                    @update:model-value="
                                        portFieldSet(port, 'telemetry', $event);
                                        onTelemetryChange(port);
                                    "
                                />
                                <USelect v-model="port.telemetry_baudrate" :items="telemetryBaudItems" size="xs" />
                            </div>

                            <!-- Sensors -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USelect
                                    :model-value="portFieldGet(port, 'sensor')"
                                    :items="sensorItems"
                                    size="xs"
                                    class="min-w-22"
                                    @update:model-value="portFieldSet(port, 'sensor', $event)"
                                />
                                <USelect v-model="port.gps_baudrate" :items="gpsBaudItems" size="xs" />
                            </div>

                            <!-- Peripherals -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USelect
                                    :model-value="portFieldGet(port, 'peripheral')"
                                    :items="peripheralItems"
                                    size="xs"
                                    class="min-w-48"
                                    @update:model-value="
                                        portFieldSet(port, 'peripheral', $event);
                                        onPeripheralChange(port);
                                    "
                                />
                                <USelect v-model="port.blackbox_baudrate" :items="blackboxBaudItems" size="xs" />
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Mobile: card per port (hidden at 1010px+) -->
                <div class="flex flex-col gap-3 min-[1010px]:hidden">
                    <UiBox
                        v-for="port in ports"
                        :key="port.identifier"
                        :title="getPortName(port.identifier)"
                        type="neutral"
                    >
                        <!-- MSP -->
                        <div class="flex items-center gap-2">
                            <USwitch v-model="port.msp" :disabled="port.identifier === 20" size="sm" />
                            <span class="text-xs flex-1">MSP</span>
                            <USelect v-model="port.msp_baudrate" :items="mspBaudItems" size="xs" />
                        </div>

                        <!-- Serial RX -->
                        <div class="flex items-center gap-2">
                            <USwitch v-model="port.rxSerial" size="sm" />
                            <span class="text-xs flex-1" v-html="$t('portsSerialRx')"></span>
                            <HelpIcon :text="$t('portsSerialRxHelp')" />
                        </div>

                        <!-- Telemetry -->
                        <div class="flex flex-col gap-1.5">
                            <span class="text-xs text-dimmed" v-html="$t('portsTelemetryOut')"></span>
                            <div class="flex items-center gap-2">
                                <USelect
                                    :model-value="portFieldGet(port, 'telemetry')"
                                    :items="telemetryItems"
                                    size="xs"
                                    @update:model-value="
                                        portFieldSet(port, 'telemetry', $event);
                                        onTelemetryChange(port);
                                    "
                                />
                                <USelect v-model="port.telemetry_baudrate" :items="telemetryBaudItems" size="xs" />
                            </div>
                        </div>

                        <!-- Sensors -->
                        <div class="flex flex-col gap-1.5">
                            <span class="text-xs text-dimmed" v-html="$t('portsSensorIn')"></span>
                            <div class="flex items-center gap-2">
                                <USelect
                                    :model-value="portFieldGet(port, 'sensor')"
                                    :items="sensorItems"
                                    size="xs"
                                    @update:model-value="portFieldSet(port, 'sensor', $event)"
                                />
                                <USelect v-model="port.gps_baudrate" :items="gpsBaudItems" size="xs" />
                            </div>
                        </div>

                        <!-- Peripherals -->
                        <div class="flex flex-col gap-1.5">
                            <span class="text-xs text-dimmed" v-html="$t('portsPeripherals')"></span>
                            <div class="flex items-center gap-2">
                                <USelect
                                    :model-value="portFieldGet(port, 'peripheral')"
                                    :items="peripheralItems"
                                    size="xs"
                                    class="min-w-44"
                                    @update:model-value="
                                        portFieldSet(port, 'peripheral', $event);
                                        onPeripheralChange(port);
                                    "
                                />
                                <USelect v-model="port.blackbox_baudrate" :items="blackboxBaudItems" size="xs" />
                            </div>
                        </div>
                    </UiBox>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="flex gap-2">
                <UButton
                    :label="$t('configurationButtonSave')"
                    :disabled="!dirty"
                    :color="dirty ? 'success' : 'neutral'"
                    @click="saveConfig"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import WikiButton from "../elements/WikiButton.vue";
import { useTranslation } from "i18next-vue";
import { usePortsRules } from "../../composables/ports/usePortsRules";
import { usePortsState } from "../../composables/ports/usePortsState";
import { usePortsConfiguration } from "../../composables/ports/usePortsConfiguration";

const { t } = useTranslation();

const { functionRules, mspBaudRates, gpsBaudRates, telemetryBaudRates, blackboxBaudRates, getRules, isRuleDisabled } =
    usePortsRules();

const { ports, analyticsChanges, getPortName, vtxTableNotConfigured, dirty } = usePortsState(getRules);

const { saveConfig, onTelemetryChange, onPeripheralChange } = usePortsConfiguration(
    ports,
    analyticsChanges,
    functionRules,
);

// USelect items
const mspBaudItems = computed(() => mspBaudRates.map((r) => ({ value: r, label: r })));
const gpsBaudItems = computed(() => gpsBaudRates.map((r) => ({ value: r, label: r })));
const telemetryBaudItems = computed(() => telemetryBaudRates.map((r) => ({ value: r, label: r })));
const blackboxBaudItems = computed(() => blackboxBaudRates.map((r) => ({ value: r, label: r })));

const NONE = "_NONE_";
const disabledLabel = computed(() => t("portsTelemetryDisabled"));

const telemetryItems = computed(() => [
    { value: NONE, label: disabledLabel.value },
    ...getRules("telemetry").map((r) => ({ value: r.name, label: r.displayName, disabled: isRuleDisabled(r) })),
]);

const sensorItems = computed(() => [
    { value: NONE, label: disabledLabel.value },
    ...getRules("sensors").map((r) => ({ value: r.name, label: r.displayName, disabled: isRuleDisabled(r) })),
]);

const peripheralItems = computed(() => [
    { value: NONE, label: disabledLabel.value },
    ...getRules("peripherals").map((r) => ({ value: r.name, label: r.displayName, disabled: isRuleDisabled(r) })),
]);

// Map between "" in port data and NONE sentinel for USelect
function portFieldGet(port, field) {
    return port[field] || NONE;
}
function portFieldSet(port, field, value) {
    port[field] = value === NONE ? "" : value;
}
</script>
