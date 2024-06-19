<template>
  <span>
    <span class="message">{{ $t(message) }}</span>
    <span class="value">{{ value }}</span>
    <span
      v-if="unit"
      class="unit"
    >
      {{ unit }}
    </span>
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
