<template>
  <span>
    <span>{{ $t(message) }}</span>
    <span>{{ value }}</span>
    <span v-if="unit">{{ unit }}</span>
  </span>
</template>

<script>
export default {
  props: {
    message: {
      type: String,
      default: "",
    },
    value: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      default: "",
    },
  },
};
</script>
