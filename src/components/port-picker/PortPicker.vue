<template>
  <div class="web-port-picker">
    <FirmwareVirtualOption :is-virtual="value.selectedPort === 'virtual'" />
    <PortsInput 
      v-model="value" 
      :connected-devices="connectedDevices"
      :read-only="readOnly" />
  </div>
</template>

<script>
import FirmwareVirtualOption from "./FirmwareVirtualOption.vue";
import PortsInput from "./PortsInput.vue";

export default {
  props: {
      value: {
        type: Object,
        default: {
          selectedPort: "manual", 
          selectedBaud: 115200,
        },
      },
      connectedDevices: {
        type: Array,
        default: () => [],
      },
      readOnly: {
        type: Boolean,
        default: false,
      },
  },
  components: {
    FirmwareVirtualOption,
    PortsInput,
  },
};
</script>

<style scoped>
.web-port-picker {
    display: flex;
    margin-left: auto;
}
</style>
