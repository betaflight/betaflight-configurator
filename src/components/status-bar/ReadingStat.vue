<template>
  <span>
    <span class="message">{{ $t(message) }}</span>
    <span class="value">{{ modelValue }}</span>
    <span
      v-if="unit"
      class="unit"
    >
      {{ unit }}
    </span>
  </span>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    message: {
      type: String,
      default: "",
    },
    modelValue: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      default: "",
    },
  },
});
</script>
