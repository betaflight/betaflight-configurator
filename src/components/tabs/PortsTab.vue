<template>
    <BaseTab tab-name="ports">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabPorts')"></div>
            <WikiButton docUrl="ports" />

            <div class="require-support">
                <UiBox type="warning" highlight class="mb-4">
                    <p v-html="$t('portsHelp')"></p>
                    <p v-html="$t('portsMSPHelp')"></p>
                </UiBox>

                <UiBox v-if="vtxTableNotConfigured" type="warning" highlight class="mb-4">
                    <p v-html="$t('portsVtxTableNotSet')"></p>
                </UiBox>

                <SerialPortsPendingBanner />

                <UiBox v-if="loadFailed" type="error" highlight class="mb-4">
                    <p v-html="$t('portsLoadFailed')"></p>
                </UiBox>

                <TabLoadingState v-else-if="!tabReady || !loaded" size="size-8" color-class="text-muted">
                    <span class="ml-2 text-dimmed">{{ $t("dataWaitingForData") }}</span>
                </TabLoadingState>

                <!-- Desktop: grid table -->
                <div v-else-if="isDesktop" class="mt-4">
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
                            <div class="flex items-center gap-1.5 pl-3 font-semibold p-1.5">
                                {{ portName(port.identifier) }}
                                <UBadge
                                    v-if="hasReservedFunctions(port)"
                                    :label="$t('serialPortReserved')"
                                    color="neutral"
                                    variant="subtle"
                                    size="sm"
                                />
                                <HelpIcon v-if="hasReservedFunctions(port)" :text="$t('serialPortReservedHelp')" />
                            </div>

                            <!-- Configuration (MSP) -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USwitch v-model="port.msp" :disabled="isMspDisabled(port)" />
                                <USelect v-model="port.msp_baudrate" :items="mspBaudItems" size="xs" />
                            </div>

                            <!-- Serial RX -->
                            <div class="flex items-center justify-center p-1.5">
                                <USwitch v-model="port.rxSerial" :disabled="isSerialRxDisabled(port)" size="xs" />
                            </div>

                            <!-- Telemetry -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USelect
                                    :model-value="portFieldGet(port, 'telemetry')"
                                    :items="groupItems('telemetry', port)"
                                    size="xs"
                                    class="min-w-22"
                                    @update:model-value="onSlotChange(port, 'telemetry', $event)"
                                />
                                <USelect v-model="port.telemetry_baudrate" :items="telemetryBaudItems" size="xs" />
                            </div>

                            <!-- Sensors -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USelect
                                    :model-value="portFieldGet(port, 'sensor')"
                                    :items="groupItems('sensors', port)"
                                    size="xs"
                                    class="min-w-22"
                                    @update:model-value="onSlotChange(port, 'sensor', $event)"
                                />
                                <USelect v-model="port.gps_baudrate" :items="gpsBaudItems" size="xs" />
                            </div>

                            <!-- Peripherals -->
                            <div class="flex items-center gap-2 p-1.5">
                                <USelect
                                    :model-value="portFieldGet(port, 'peripheral')"
                                    :items="groupItems('peripherals', port)"
                                    size="xs"
                                    class="min-w-48"
                                    @update:model-value="onSlotChange(port, 'peripheral', $event)"
                                />
                                <USelect v-model="port.blackbox_baudrate" :items="blackboxBaudItems" size="xs" />
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Mobile: card per port -->
                <div v-else class="flex flex-col gap-3">
                    <UiBox
                        v-for="port in ports"
                        :key="port.identifier"
                        type="neutral"
                        collapsible
                        :title="portName(port.identifier)"
                    >
                        <!-- Preserved but uneditable functions -->
                        <div v-if="hasReservedFunctions(port)" class="flex items-center gap-1.5">
                            <UBadge :label="$t('serialPortReserved')" color="neutral" variant="subtle" size="sm" />
                            <HelpIcon :text="$t('serialPortReservedHelp')" />
                        </div>

                        <!-- MSP -->
                        <div class="flex items-center gap-2">
                            <USwitch v-model="port.msp" :disabled="isMspDisabled(port)" size="xs" />
                            <span class="text-xs flex-1">MSP</span>
                            <USelect v-model="port.msp_baudrate" :items="mspBaudItems" size="xs" />
                        </div>

                        <!-- Serial RX -->
                        <div class="flex items-center gap-2">
                            <USwitch v-model="port.rxSerial" :disabled="isSerialRxDisabled(port)" size="xs" />
                            <span class="text-xs flex-1" v-html="$t('portsSerialRx')"></span>
                            <HelpIcon :text="$t('portsSerialRxHelp')" />
                        </div>

                        <!-- Telemetry -->
                        <div class="flex flex-col gap-1.5">
                            <span class="text-xs text-dimmed" v-html="$t('portsTelemetryOut')"></span>
                            <div class="flex items-center gap-2">
                                <USelect
                                    :model-value="portFieldGet(port, 'telemetry')"
                                    :items="groupItems('telemetry', port)"
                                    size="xs"
                                    @update:model-value="onSlotChange(port, 'telemetry', $event)"
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
                                    :items="groupItems('sensors', port)"
                                    size="xs"
                                    @update:model-value="onSlotChange(port, 'sensor', $event)"
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
                                    :items="groupItems('peripherals', port)"
                                    size="xs"
                                    class="min-w-44"
                                    @update:model-value="onSlotChange(port, 'peripheral', $event)"
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
                <UButton :label="$t('configurationButtonSave')" size="xs" :disabled="!dirty" @click="save" />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useMediaQuery } from "@vueuse/core";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import WikiButton from "../elements/WikiButton.vue";
import TabLoadingState from "@/components/elements/TabLoadingState.vue";
import SerialPortsPendingBanner from "../ports/SerialPortsPendingBanner.vue";
import { useTranslation } from "i18next-vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { usePortsRules } from "../../composables/ports/usePortsRules";
import { useSerialPortsStore } from "../../stores/serialPorts";

const { t } = useTranslation();

const isDesktop = useMediaQuery("(min-width: 1010px)");

// usePortsRules is stateless and pure, so the tab derives its own copy for the dropdown and
// baudrate lists rather than routing them through the store.
const { mspBaudRates, gpsBaudRates, telemetryBaudRates, blackboxBaudRates, getRules, isRuleDisabled } = usePortsRules();

const store = useSerialPortsStore();
const { ports, loaded, loadFailed, dirty, functionRules } = storeToRefs(store);
const { portName, portUses, hasReservedFunctions, assign, clear, save } = store;

const tabReady = ref(false);

// The VTX-table warning is the only reason this tab reads VTX config. It is fetched separately
// from the serial config so a VTX read that fails cannot stop the ports from loading, which is
// what used to happen when the two were chained.
const vtxTableNotConfigured = computed(
    () =>
        FC.VTX_CONFIG?.vtx_table_available &&
        (FC.VTX_CONFIG.vtx_table_bands === 0 ||
            FC.VTX_CONFIG.vtx_table_channels === 0 ||
            FC.VTX_CONFIG.vtx_table_powerlevels === 0),
);

onMounted(async () => {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            tabReady.value = true;
        });
    });

    MSP.promise(MSPCodes.MSP_VTX_CONFIG).catch((error) =>
        console.error("Failed to load VTX config for the ports tab:", error),
    );

    await store.loadConfig();
    nextTick(() => GUI.content_ready());
});

const mspBaudItems = mspBaudRates.map((r) => ({ value: r, label: r }));
const gpsBaudItems = gpsBaudRates.map((r) => ({ value: r, label: r }));
const telemetryBaudItems = telemetryBaudRates.map((r) => ({ value: r, label: r }));
const blackboxBaudItems = blackboxBaudRates.map((r) => ({ value: r, label: r }));

const NONE = "_NONE_";
const disabledLabel = computed(() => t("portsTelemetryDisabled"));

// `maxPorts` was dead data until now: nothing stopped the user assigning a function to more ports
// than the firmware has slots for. Master rejects such a config outright, so cap it in the UI.
function isFunctionAtLimit(rule, port) {
    if (!rule.maxPorts) {
        return false;
    }
    if (portUses(port, rule.name)) {
        return false; // already this port's selection, must stay selectable
    }
    return ports.value.filter((p) => portUses(p, rule.name)).length >= rule.maxPorts;
}

function groupItems(group, port) {
    return [
        { value: NONE, label: disabledLabel.value },
        ...getRules(group).map((r) => ({
            value: r.name,
            label: r.displayName,
            disabled: Boolean(isRuleDisabled(r)) || isFunctionAtLimit(r, port),
        })),
    ];
}

function isSerialRxDisabled(port) {
    return !port.rxSerial && ports.value.some((p) => p !== port && p.rxSerial);
}

function isMspDisabled(port) {
    const mspRule = functionRules.value.find((r) => r.name === "MSP");
    return !port.msp && isFunctionAtLimit(mspRule, port);
}

function portFieldGet(port, field) {
    return port[field] || NONE;
}

/**
 * Route a slot dropdown through the store so the exclusion rules live in one place. The store
 * reports what each change displaced; the full-matrix view shows the cleared cell directly, so
 * the Ports tab does not need to surface it the way a contextual editor must.
 */
function onSlotChange(port, field, value) {
    if (value === NONE) {
        if (port[field]) {
            clear(port[field], port.identifier);
        }
        return;
    }
    assign(value, port.identifier);
}
</script>
