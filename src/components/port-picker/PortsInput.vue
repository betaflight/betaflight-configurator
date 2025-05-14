<template>
    <div id="portsinput">
        <div class="dropdown dropdown-dark">
            <select
                id="port"
                :value="modelValue.selectedPort"
                class="dropdown-select"
                :title="$t('firmwareFlasherManualPort')"
                :disabled="disabled"
                @change="onChangePort"
            >
                <option value="noselection" disabled>
                    {{ $t("portsSelectNoSelection") }}
                </option>
                <option v-if="showManualOption" value="manual">
                    {{ $t("portsSelectManual") }}
                </option>
                <option v-if="showVirtualOption" value="virtual">
                    {{ $t("portsSelectVirtual") }}
                </option>
                <option
                    v-if="showBluetoothOption"
                    v-for="connectedBluetoothDevice in connectedBluetoothDevices"
                    :key="connectedBluetoothDevice.path"
                    :value="connectedBluetoothDevice.path"
                >
                    {{ connectedBluetoothDevice.displayName }}
                </option>
                <option
                    v-if="showSerialOption"
                    v-for="connectedSerialDevice in connectedSerialDevices"
                    :key="connectedSerialDevice.path"
                    :value="connectedSerialDevice.path"
                >
                    {{ connectedSerialDevice.displayName }}
                </option>
                <option
                    v-if="showDFUOption"
                    v-for="connectedUsbDevice in connectedUsbDevices"
                    :key="connectedUsbDevice.path"
                    :value="connectedUsbDevice.path"
                >
                    {{ connectedUsbDevice.displayName }}
                </option>
                <option v-if="showSerialOption" value="requestpermission">
                    {{ $t("portsSelectPermission") }}
                </option>
                <option v-if="showBluetoothOption" value="requestpermissionbluetooth">
                    {{ $t("portsSelectPermissionBluetooth") }}
                </option>
                <option v-if="showDFUOption" value="requestpermissionusb">
                    {{ $t("portsSelectPermissionDFU") }}
                </option>
            </select>
        </div>
        <div id="auto-connect-and-baud">
            <div
                id="auto-connect-switch"
                :title="modelValue.autoConnect ? $t('autoConnectEnabled') : $t('autoConnectDisabled')"
            >
                <input id="auto-connect" v-model="autoConnect" class="auto_connect togglesmall" type="checkbox" />
                <span class="auto_connect">
                    {{ $t("autoConnect") }}
                </span>
            </div>
            <div
                v-if="modelValue.selectedPort !== 'virtual' && modelValue.selectedPort !== 'noselection'"
                id="baudselect"
            >
                <div class="dropdown dropdown-dark">
                    <select
                        id="baud"
                        v-model="selectedBauds"
                        class="dropdown-select"
                        :title="$t('firmwareFlasherBaudRate')"
                        :disabled="disabled"
                    >
                        <option v-for="baudRate in baudRates" :key="baudRate.value" :value="baudRate.value">
                            {{ baudRate.label }}
                        </option>
                    </select>
                </div>
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
            showDFUOption: {
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

        const onChangePort = (event) => {
            const value = event.target.value;
            if (value === "requestpermission") {
                EventBus.$emit("ports-input:request-permission");
            } else if (value === "requestpermissionbluetooth") {
                EventBus.$emit("ports-input:request-permission-bluetooth");
            } else if (value === "requestpermissionusb") {
                EventBus.$emit("ports-input:request-permission-usb");
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
