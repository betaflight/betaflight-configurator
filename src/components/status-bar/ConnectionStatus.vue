<template>
  <div class="connection">
    {{ $t("versionLabelConnection") }}: {{ networkStatus }}
  </div>
</template>

<script>
export default {
  props: {
    networkStatus: {
      type: String,
      default: "",
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
