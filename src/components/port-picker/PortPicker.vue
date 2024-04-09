<template>
  <div class="web-port-picker">
    <FirmwareVirtualOption />
    <PortsInput />
  </div>
</template>

<script>
import FirmwareVirtualOption from "./FirmwareVirtualOption.vue";
import PortsInput from "./PortsInput.vue";

export default {
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
