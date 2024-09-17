<template>
  <div class="osd-preview">
    Msg: {{ msg }}
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'OSDPreviewPanel',

  props: {
    msg: {
      type: String,
      default: 'alex',
      required: false,
    },
  },
});
</script>

<style scoped>
  .osd-preview {
    color: black;
    background-color: red;
  }
</style>
