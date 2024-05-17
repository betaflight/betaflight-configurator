<template>
  <div class="web-port-picker">
    <PortOverrideOption 
      v-if="value.selectedPort === 'manual'"
      v-model="value.portOverride"
    />
    <FirmwareVirtualOption 
      v-if="value.selectedPort === 'virtual'" 
      v-model="value.virtualMspVersion"
    />
    <PortsInput 
      v-model="value" 
      :connected-devices="connectedDevices"
      :disabled="disabled" />
  </div>
</template>

<script>
import PortOverrideOption from "./PortOverrideOption.vue";
import FirmwareVirtualOption from "./FirmwareVirtualOption.vue";
import PortsInput from "./PortsInput.vue";

export default {
  props: {
      value: {
        type: Object,
        default: {
          selectedPort: "manual", 
          selectedBaud: 115200,
          portOverride: "/dev/rfcomm0",
          virtualMspVersion: "1.46.0",
        },
      },
      connectedDevices: {
        type: Array,
        default: () => [],
      },
      disabled: {
        type: Boolean,
        default: false,
      },
  },
  components: {
    PortOverrideOption,
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
