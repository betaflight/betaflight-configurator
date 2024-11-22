<template>
  <div class="web-port-picker">
    <PortOverrideOption
      v-if="modelValue.selectedPort === 'manual'"
      :model-value="modelValue.portOverride"
      @update:modelValue="updateValue('portOverride', $event)"
    />
    <FirmwareVirtualOption
      v-if="modelValue.selectedPort === 'virtual' && !isConnected"
      :model-value="modelValue.virtualMspVersion"
      @update:modelValue="updateValue('virtualMspVersion', $event)"
    />
    <PortsInput
      :model-value="modelValue.selectedPort"
      :connected-bluetooth-devices="connectedBluetoothDevices"
      :connected-serial-devices="connectedSerialDevices"
      :connected-usb-devices="connectedUsbDevices"
      :disabled="disabled"
      :show-virtual-option="showVirtualOption"
      :show-manual-option="showManualOption"
      @update:modelValue="updateValue(null, $event)"
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import PortOverrideOption from './PortOverrideOption.vue';
import FirmwareVirtualOption from './FirmwareVirtualOption.vue';
import PortsInput from './PortsInput.vue';
import CONFIGURATOR from '../../js/data_storage';

export default defineComponent({
  components: {
    PortOverrideOption,
    FirmwareVirtualOption,
    PortsInput,
  },

  props: {
    modelValue: {
      type: Object,
      default: () => ({
        selectedPort: 'noselection',
        selectedBaud: 115200,
        portOverride: '/dev/rfcomm0',
        virtualMspVersion: '1.46.0',
        autoConnect: true,
      }),
    },
    connectedBluetoothDevices: {
      type: Array,
      default: () => [],
    },
    connectedSerialDevices: {
      type: Array,
      default: () => [],
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
    disabled: {
      type: Boolean,
      default: false,
    },
  },

  emits: [
    'update:modelValue',
  ],

  computed: {
    isConnected() {
      return CONFIGURATOR.connectionValid;
    },
  },

  methods: {
    updateValue(key, value) {
      if (key != null) {
        this.$emit('update:modelValue', { ...this.modelValue, [key]: value });
      } else {
        this.$emit('update:modelValue', { ...this.modelValue, ...value});
      }
    },
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
