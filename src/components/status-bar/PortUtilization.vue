<template>
  <div>
    <span>{{ $t("statusbar_port_utilization.message") }}</span>
    <ReadingStat
      message="statusbar_usage_download"
      :value="usageDown"
      unit="%"
    />
    <ReadingStat message="statusbar_usage_upload" :value="usageUp" unit="%" />
  </div>
</template>

<script>
import ReadingStat from "./ReadingStat.vue";

export default {
  props: {
    usageDown: {
      type: Number,
    },
    usageUp: {
      type: Number,
    },
  },
  components: {
    ReadingStat,
  },
};
</script>
