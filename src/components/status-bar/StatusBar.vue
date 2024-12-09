<template>
  <div id="status-bar">
    <PortUtilization
      :usage-down="portUsageDown"
      :usage-up="portUsageUp"
    />
    <ReadingStat
      message="statusbar_packet_error"
      :model-value="packetError"
    />
    <ReadingStat
      message="statusbar_i2c_error"
      :model-value="i2cError"
    />
    <ReadingStat
      message="statusbar_cycle_time"
      :model-value="cycleTime"
    />
    <ReadingStat
      message="statusbar_cpu_load"
      :model-value="cpuLoad"
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
import { defineComponent } from 'vue';
import StatusBarVersion from "./StatusBarVersion.vue";
import ReadingStat from "./ReadingStat.vue";
import PortUtilization from "./PortUtilization.vue";

export default defineComponent({
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
      default: "",
    },
    firmwareVersion: {
      type: String,
      default: "",
    },
    firmwareId: {
      type: String,
      default: "",
    },
    hardwareId: {
      type: String,
      default: "",
    },
  },
});
</script>

<style lang="less">
/** Status bar **/
#status-bar {
  display: flex;
  white-space: nowrap;
  gap: 0.5rem;
  bottom: 0;
  width: calc(100% - 20px);
  height: 20px;
  line-height: 20px;
  padding: 0.5rem 1rem;
  background-color: var(--surface-300);
  .message {
    margin-right: 0.25rem;
  }
}

#status-bar > * ~ * {
  padding-left: 10px;
  border-left: 1px solid var(--surface-400);
}

/** Status bar (phones) **/
@media all and (max-width: 575px) {
  #status-bar {
    display: none;
  }
}
</style>
