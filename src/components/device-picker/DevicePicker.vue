<template>
    <div
        class="web-device-picker"
        :class="{ 'virtual-layout': modelValue.selectedDevice === 'virtual' && !isConnected }"
    >
        <PortOverrideOption
            v-if="modelValue.selectedDevice === 'manual'"
            :model-value="modelValue.portOverride"
            @update:modelValue="updateModelValue('portOverride', $event)"
        />
        <FirmwareVirtualOption
            v-if="modelValue.selectedDevice === 'virtual' && !isConnected"
            :model-value="modelValue.virtualMspVersion"
            @update:modelValue="updateModelValue('virtualMspVersion', $event)"
        />
        <DevicesInput
            :model-value="modelValue"
            :connected-bluetooth-devices="connectedBluetoothDevices"
            :connected-serial-devices="connectedSerialDevices"
            :connected-usb-devices="connectedUsbDevices"
            :disabled="disabled"
            :show-virtual-option="showVirtualOption"
            :show-manual-option="showManualOption"
            :show-bluetooth-option="showBluetoothOption"
            :show-serial-option="showSerialOption"
            :show-usb-option="showUsbOption"
            @update:modelValue="updateModelValue(null, $event)"
        />
    </div>
</template>

<script>
import { defineComponent, computed } from "vue";
import PortOverrideOption from "./PortOverrideOption.vue";
import FirmwareVirtualOption from "./FirmwareVirtualOption.vue";
import DevicesInput from "./DevicesInput.vue";
import { useConnectionStore } from "../../stores/connection";

export default defineComponent({
    components: {
        PortOverrideOption,
        FirmwareVirtualOption,
        DevicesInput,
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
        disabled: {
            type: Boolean,
            default: false,
        },
    },

    emits: ["update:modelValue"],

    setup(props, { emit }) {
        const connectionStore = useConnectionStore();
        const isConnected = computed(() => connectionStore.connectionValid);

        const updateModelValue = (key, value) => {
            if (key) {
                emit("update:modelValue", { ...props.modelValue, [key]: value });
            } else {
                emit("update:modelValue", value); // Para el caso de DevicesInput
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
.web-device-picker {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    margin-left: auto;
    align-items: start;
    gap: 0.5rem;
}
</style>
