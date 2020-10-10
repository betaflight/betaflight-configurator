<template>
  <span>
    <span>{{ $t(message + ".message") | stripEnd }}</span>
    <span>{{ value }}</span>
    <span v-if="unit">{{ unit }}</span>
  </span>
</template>
<script>
export default {
  props: {
    message: {
      type: String,
    },
    value: {
      type: Number,
    },
    unit: {
      type: String,
    },
  },
};
</script>
