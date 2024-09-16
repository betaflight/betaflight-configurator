<template>
  <div class="osd-preview">
    Msg: {{ msg }}
  </div>
</template>

<script>
export default {
  name: 'OSDPreviewPanel',
  props: {
    msg: {
      type: String,
      default: 'alex',
      required: false,
    },
  },
};
</script>

<style scoped>
  .osd-preview {
    color: black;
    background-color: red;
  }
</style>
