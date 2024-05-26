<template>
  <div class="web-port-picker">
    <PortOverrideOption
      v-if="value.selectedPort === 'manual'"
      :value="value.portOverride"
      @input="updateValue('portOverride', $event)"
    />
    <FirmwareVirtualOption
      v-if="value.selectedPort === 'virtual'"
      :value="value.virtualMspVersion"
      @input="updateValue('virtualMspVersion', $event)"
    />
    <PortsInput
      :value="value"
      :connected-devices="connectedDevices"
      :disabled="disabled"
      :show-virtual-option="showVirtualOption"
      :show-manual-option="showManualOption"
      @input="updateValue(null, $event)"
    />
  </div>
</template>

<script>
import PortOverrideOption from "./PortOverrideOption.vue";
import FirmwareVirtualOption from "./FirmwareVirtualOption.vue";
import PortsInput from "./PortsInput.vue";

export default {
  components: {
    PortOverrideOption,
    FirmwareVirtualOption,
    PortsInput,
  },
  props: {
      value: {
        type: Object,
        default: () => ({
          selectedPort: "noselection",
          selectedBaud: 115200,
          portOverride: "/dev/rfcomm0",
          virtualMspVersion: "1.46.0",
          autoConnect: true,
        }),
      },
      connectedDevices: {
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
  methods: {
    updateValue(key, value) {
      if (key != null) {
        this.$emit("input", { ...this.value, [key]: value });
      } else {
        this.$emit("input", { ...this.value, ...value});
      }
    },
  },
};
</script>

<style scoped>
.web-port-picker {
    display: flex;
    margin-left: auto;
    align-items: start;
    gap: 0.5rem;
    height: auto;
    padding-top: 1rem;
}
</style>
