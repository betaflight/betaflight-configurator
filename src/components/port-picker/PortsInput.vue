<template>
    <div id="portsinput">
        <USelect
            :items="[
                { label: $t('portsSelectNoSelection'), value: 'noselection', disabled: true },
                ...(showManualOption ? [{ label: $t('portsSelectManual'), value: 'manual' }] : []),
                ...(showVirtualOption ? [{ label: $t('portsSelectVirtual'), value: 'virtual' }] : []),
                ...(showBluetoothOption
                    ? connectedBluetoothDevices.map((device) => ({
                          label: device.displayName,
                          value: device.path,
                          icon: 'i-lucide-bluetooth',
                      }))
                    : []),
                ...(showSerialOption
                    ? connectedSerialDevices.map((device) => ({
                          label: device.displayName,
                          value: device.path,
                          icon: 'i-lucide-usb',
                      }))
                    : []),
                ...(showUsbOption
                    ? connectedUsbDevices.map((device) => ({
                          label: device.displayName,
                          value: device.path,
                          icon: 'i-lucide-cpu',
                      }))
                    : []),
                { type: 'separator' },
                ...(showSerialOption ? [{ label: $t('portsSelectPermission'), value: 'requestpermissionserial' }] : []),
                ...(showBluetoothOption
                    ? [{ label: $t('portsSelectPermissionBluetooth'), value: 'requestpermissionbluetooth' }]
                    : []),
                ...(showUsbOption ? [{ label: $t('portsSelectPermissionDFU'), value: 'requestpermissionusb' }] : []),
            ]"
            v-model="selectedPort"
            :disabled="disabled"
            size="sm"
            class="sm:min-w-64 min-w-full"
            @change="onChangePort"
            :ui="{
                content: 'max-h-96',
            }"
        />
        <div id="auto-connect-and-baud">
            <div :title="modelValue.autoConnect ? $t('autoConnectEnabled') : $t('autoConnectDisabled')">
                <USwitch :label="$t('autoConnect')" v-model="autoConnect" :disabled="disabled" size="xs" />
            </div>
            <div v-if="selectedPort !== 'virtual' && selectedPort !== 'noselection'" id="baudselect">
                <USelect
                    :items="baudRates"
                    v-model="selectedBauds"
                    :disabled="disabled"
                    size="xs"
                    class="min-w-24"
                    :ui="{
                        content: 'max-h-96',
                    }"
                />
            </div>
        </div>
    </div>
</template>

<script>
import { defineComponent, ref, watch } from "vue";
import { set as setConfig } from "../../js/ConfigStorage";
import { EventBus } from "../eventBus";

export default defineComponent({
    props: {
        modelValue: {
            type: Object,
            default: () => ({
                selectedPort: "noselection",
                selectedBauds: 115200,
                autoConnect: true,
            }),
        },
        connectedSerialDevices: {
            type: Array,
            default: () => [],
        },
        connectedUsbDevices: {
            type: Array,
            default: () => [],
        },
        connectedBluetoothDevices: {
            type: Array,
            default: () => [],
        },
        disabled: {
            type: Boolean,
            default: false,
        },
        showVirtualOption: {
            type: Boolean,
            default: true,
        },
        showManualOption: {
            type: Boolean,
            default: true,
        },
        showBluetoothOption: {
            type: Boolean,
            default: true,
        },
        showSerialOption: {
            type: Boolean,
            default: true,
        },
        showUsbOption: {
            type: Boolean,
            default: true,
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const selectedPort = ref(props.modelValue.selectedPort); // Access through modelValue
        const selectedBauds = ref(props.modelValue.selectedBauds); // Access through modelValue
        const autoConnect = ref(props.modelValue.autoConnect); // Access through modelValue
        const baudRates = ref([
            { value: "1000000", label: "1000000" },
            { value: "500000", label: "500000" },
            { value: "250000", label: "250000" },
            { value: "115200", label: "115200" },
            { value: "57600", label: "57600" },
            { value: "38400", label: "38400" },
            { value: "28800", label: "28800" },
            { value: "19200", label: "19200" },
            { value: "14400", label: "14400" },
            { value: "9600", label: "9600" },
            { value: "4800", label: "4800" },
            { value: "2400", label: "2400" },
            { value: "1200", label: "1200" },
        ]);

        // Keep UI in sync when PortHandler (or parent) updates selectedPort, e.g. after WebUSB permission dialog
        watch(
            () => props.modelValue.selectedPort,
            (v) => {
                selectedPort.value = v;
            },
        );

        watch(selectedPort, (newValue) => {
            emit("update:modelValue", { ...props.modelValue, selectedPort: newValue });
        });

        watch(selectedBauds, (newValue) => {
            emit("update:modelValue", { ...props.modelValue, selectedBauds: newValue });
        });

        watch(autoConnect, (newValue) => {
            emit("update:modelValue", { ...props.modelValue, autoConnect: newValue });
            setConfig({ autoConnect: newValue });
        });

        const onChangePort = () => {
            const value = selectedPort.value;

            if (value.startsWith("requestpermission")) {
                // Extract "serial", "bluetooth", etc., and format the event name
                const type = value.replace("requestpermission", "");
                EventBus.$emit(`ports-input:request-permission-${type}`);
                // Reset selection to "No Selection" (watch(selectedPort) emits update:modelValue)
                selectedPort.value = "noselection";
            } else {
                EventBus.$emit("ports-input:change", value);
            }
        };

        return {
            selectedPort,
            selectedBauds,
            autoConnect,
            baudRates,
            onChangePort,
        };
    },
});
</script>
