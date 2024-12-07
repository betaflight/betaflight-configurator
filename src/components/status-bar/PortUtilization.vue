<template>
  <div>
    <span class="message">{{ $t("statusbar_port_utilization") }}</span>
    <ReadingStat
      message="statusbar_usage_download"
      :model-value="usageDown"
      unit="%"
    />
    <ReadingStat
      message="statusbar_usage_upload"
      :model-value="usageUp"
      unit="%"
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import ReadingStat from "./ReadingStat.vue";

export default defineComponent({
  components: {
    ReadingStat,
  },
  props: {
    usageDown: {
      type: Number,
      default: 0,
    },
    usageUp: {
      type: Number,
      default: 0,
    },
  },
});
</script>
