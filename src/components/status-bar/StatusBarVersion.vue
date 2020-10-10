<template>
  <div class="version">
    {{ $t("versionLabelConfigurator.message") }}: {{ configuratorVersion }}
    <span v-if="firmwareVersion && firmwareId">
      , {{ $t("versionLabelFirmware.message") }}: {{ firmwareVersion }}
      {{ firmwareId }}
    </span>
    <span v-if="hardwareId">
      , {{ $t("versionLabelTarget.message") }}: {{ hardwareId }}
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
