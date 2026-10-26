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
            v-model="selectedDevice"
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
            <div v-if="selectedDevice !== 'virtual' && selectedDevice !== 'noselection'" id="baudselect">
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

<script lang="ts">
import { defineComponent, ref, watch } from "vue";
import type { PropType } from "vue";

export interface PickerDevice {
    path: string;
    displayName?: string;
}
import { set as setConfig } from "../../js/ConfigStorage";
import { EventBus, type DevicePermissionType } from "../eventBus";

export default defineComponent({
    props: {
        modelValue: {
            type: Object,
            default: () => ({
                selectedDevice: "noselection",
                selectedBauds: 115200,
                autoConnect: true,
            }),
        },
        connectedSerialDevices: {
            type: Array as PropType<PickerDevice[]>,
            default: () => [],
        },
        connectedUsbDevices: {
            type: Array as PropType<PickerDevice[]>,
            default: () => [],
        },
        connectedBluetoothDevices: {
            type: Array as PropType<PickerDevice[]>,
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
        const selectedDevice = ref(props.modelValue.selectedDevice); // Access through modelValue
        const selectedBauds = ref(props.modelValue.selectedBauds); // Access through modelValue
        const autoConnect = ref(props.modelValue.autoConnect); // Access through modelValue
        // Numeric values: the transports open the port with this rate, and the default (115200) is a number.
        const baudRates = ref(
            [1000000, 500000, 250000, 115200, 57600, 38400, 28800, 19200, 14400, 9600, 4800, 2400, 1200].map(
                (baud) => ({ value: baud, label: String(baud) }),
            ),
        );

        // Keep UI in sync when DeviceHandler (or parent) updates selectedDevice, e.g. after WebUSB permission dialog
        watch(
            () => props.modelValue.selectedDevice,
            (v) => {
                selectedDevice.value = v;
            },
        );

        watch(selectedDevice, (newValue) => {
            emit("update:modelValue", { ...props.modelValue, selectedDevice: newValue });
        });

        watch(selectedBauds, (newValue) => {
            emit("update:modelValue", { ...props.modelValue, selectedBauds: newValue });
        });

        watch(autoConnect, (newValue) => {
            emit("update:modelValue", { ...props.modelValue, autoConnect: newValue });
            setConfig({ autoConnect: newValue });
        });

        const onChangePort = () => {
            const value = selectedDevice.value;

            if (value.startsWith("requestpermission")) {
                // Extract "serial", "bluetooth", etc., and format the event name
                // The options above offer exactly the permission types the bus carries.
                const type = value.replace("requestpermission", "") as DevicePermissionType;
                EventBus.$emit(`ports-input:request-permission-${type}`);
                // Reset selection to "No Selection" (watch(selectedDevice) emits update:modelValue)
                selectedDevice.value = "noselection";
            } else {
                EventBus.$emit("ports-input:change", value);
            }
        };

        return {
            selectedDevice,
            selectedBauds,
            autoConnect,
            baudRates,
            onChangePort,
        };
    },
});
</script>
