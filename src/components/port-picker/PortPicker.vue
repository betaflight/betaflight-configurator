<template>
  <div class="web-port-picker">
    <FirmwareVirtualOption :is-virtual="port === 'virtual'" />
    <PortsInput v-model="port" />
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
  data() {
    return {
      port: 'manual',
    };
  },
};
</script>

<style scoped>
.web-port-picker {
    display: flex;
    margin-left: auto;
}
</style>
