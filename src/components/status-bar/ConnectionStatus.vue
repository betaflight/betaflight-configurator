<template>
  <div class="connection">
    {{ $t("versionLabelConnection") }}: {{ networkSpeed }} Mb/s
  </div>
</template>

<script>
export default {
  props: {
    networkSpeed: {
      type: Number,
      default: 0,
    },
  },
};
</script>

<style>
.connection {
  margin: 0;
  padding: 0;
  border: 0;
  margin-left: auto;
}
</style>
