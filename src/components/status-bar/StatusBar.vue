<template>
  <div id="status-bar">
    <PortUtilization :usage-down="portUsageDown" :usage-up="portUsageUp" />
    <ReadingStat message="statusbar_packet_error" :value="packetError" />
    <ReadingStat message="statusbar_i2c_error" :value="i2cError" />
    <ReadingStat message="statusbar_cycle_time" :value="cycleTime" />
    <ReadingStat message="statusbar_cpu_load" :value="cpuLoad" unit="%" />
    <StatusBarVersion
      :configurator-version="configuratorVersion"
      :firmware-version="firmwareVersion"
      :firmware-id="firmwareId"
      :hardware-id="hardwareId"
      :git-changeset-id="gitChangesetId"
    />
  </div>
</template>
<script>
import StatusBarVersion from "./StatusBarVersion.vue";
import ReadingStat from "./ReadingStat.vue";
import PortUtilization from "./PortUtilization.vue";

export default {
  props: {
    portUsageDown: {
      type: Number,
    },
    portUsageUp: {
      type: Number,
    },
    packetError: {
      type: Number,
    },
    i2cError: {
      type: Number,
    },
    cycleTime: {
      type: Number,
    },
    cpuLoad: {
      type: Number,
    },

    configuratorVersion: {
      type: String,
    },
    firmwareVersion: {
      type: String,
    },
    firmwareId: {
      type: String,
    },
    hardwareId: {
      type: String,
    },
    gitChangesetId: {
      type: String,
    },
  },
  components: {
    PortUtilization,
    ReadingStat,
    StatusBarVersion,
  },
};
</script>
