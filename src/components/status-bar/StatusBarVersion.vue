<template>
  <div class="version">
    {{ $t("versionLabelConfigurator") }}: {{ configuratorVersion }}
    <span v-if="firmwareVersion && firmwareId">
      , {{ $t("versionLabelFirmware") }}: {{ firmwareVersion }}
      {{ firmwareId }}
    </span>
    <span v-if="hardwareId">
      , {{ $t("versionLabelTarget") }}: {{ hardwareId }}
    </span>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
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

<style>
.version {
  margin: 0;
  padding: 0;
  border: 0;
  margin-left: auto;
}
</style>
