<template>
  <div id="status-bar">
    <PortUtilization
      :usage-down="portUsageDown"
      :usage-up="portUsageUp"
    />
    <ReadingStat
      message="statusbar_packet_error"
      :value="packetError"
    />
    <ReadingStat
      message="statusbar_i2c_error"
      :value="i2cError"
    />
    <ReadingStat
      message="statusbar_cycle_time"
      :value="cycleTime"
    />
    <ReadingStat
      message="statusbar_cpu_load"
      :value="cpuLoad"
      unit="%"
    />
    <StatusBarVersion
      :configurator-version="configuratorVersion"
      :firmware-version="firmwareVersion"
      :firmware-id="firmwareId"
      :hardware-id="hardwareId"
    />
  </div>
</template>

<script>
import StatusBarVersion from "./StatusBarVersion.vue";
import ReadingStat from "./ReadingStat.vue";
import PortUtilization from "./PortUtilization.vue";

export default {
  components: {
    PortUtilization,
    ReadingStat,
    StatusBarVersion,
  },
  props: {
    portUsageDown: {
      type: Number,
      default: 0,
    },
    portUsageUp: {
      type: Number,
      default: 0,
    },
    packetError: {
      type: Number,
      default: 0,
    },
    i2cError: {
      type: Number,
      default: 0,
    },
    cycleTime: {
      type: Number,
      default: 0,
    },
    cpuLoad: {
      type: Number,
      default: 0,
    },

    configuratorVersion: {
      type: String,
      default: '',
    },
    firmwareVersion: {
      type: String,
      default: '',
    },
    firmwareId: {
      type: String,
      default: '',
    },
    hardwareId: {
      type: String,
      default: '',
    },
  },
};
</script>
