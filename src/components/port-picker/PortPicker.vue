<template>
    <div class="web-port-picker">
        <PortOverrideOption
            v-if="modelValue.selectedPort === 'manual'"
            :model-value="modelValue.portOverride"
            @update:modelValue="updateModelValue('portOverride', $event)"
        />
        <FirmwareVirtualOption
            v-if="modelValue.selectedPort === 'virtual' && !isConnected"
            :model-value="modelValue.virtualMspVersion"
            @update:modelValue="updateModelValue('virtualMspVersion', $event)"
        />
        <PortsInput
            :model-value="modelValue"
            :connected-bluetooth-devices="connectedBluetoothDevices"
            :connected-serial-devices="connectedSerialDevices"
            :connected-usb-devices="connectedUsbDevices"
            :disabled="disabled"
            :show-virtual-option="showVirtualOption"
            :show-manual-option="showManualOption"
            :show-bluetooth-option="showBluetoothOption"
            :show-serial-option="showSerialOption"
            :show-dfu-option="showDFUOption"
            @update:modelValue="updateModelValue(null, $event)"
        />
    </div>
</template>

<script>
import { defineComponent, computed } from "vue";
import PortOverrideOption from "./PortOverrideOption.vue";
import FirmwareVirtualOption from "./FirmwareVirtualOption.vue";
import PortsInput from "./PortsInput.vue";
import CONFIGURATOR from "../../js/data_storage";

export default defineComponent({
    components: {
        PortOverrideOption,
        FirmwareVirtualOption,
        PortsInput,
    },

    props: {
        modelValue: {
            type: Object,
            required: true,
        },
        connectedBluetoothDevices: {
            type: Array,
            default: () => [],
        },
        connectedSerialDevices: {
            type: Array,
            required: true,
        },
        connectedUsbDevices: {
            type: Array,
            default: () => [],
        },
        showVirtualOption: {
            type: Boolean,
            default: true,
        },
        showManualOption: {
            type: Boolean,
            default: true,
        },
        showDFUOption: {
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
        disabled: {
            type: Boolean,
            default: false,
        },
    },

    emits: ["update:modelValue"],

    setup(props, { emit }) {
        const isConnected = computed(() => CONFIGURATOR.connectionValid);

        const updateModelValue = (key, value) => {
            if (key) {
                emit("update:modelValue", { ...props.modelValue, [key]: value });
            } else {
                emit("update:modelValue", value); // Para el caso de PortsInput
            }
        };

        return {
            isConnected,
            updateModelValue,
        };
    },
});
</script>

<style scoped>
.web-port-picker {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    margin-left: auto;
    align-items: start;
    gap: 0.5rem;
}
</style>
