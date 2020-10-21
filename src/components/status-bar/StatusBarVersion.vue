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
    ({{ gitChangesetId }})
  </div>
</template>

<script>
export default {
  props: {
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
};
</script>
