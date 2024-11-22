<template>
  <div
    v-if="isManual"
    id="port-override-option"
  >
    <label
      for="port-override"
    ><span>{{ $t("portOverrideText") }}</span>
      <input
        id="port-override"
        type="text"
        :value="value"
        @change="inputValueChanged($event)"
      >
    </label>
  </div>
</template>

<script>
import { set as setConfig } from "../../js/ConfigStorage";
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    value: {
      type: String,
      default: '/dev/rfcomm0',
    },
    isManual: {
      type: Boolean,
      default: true,
    },
  },
  methods: {
    inputValueChanged(event) {
      setConfig({'portOverride': event.target.value});
      this.$emit('input', event.target.value);
    },
  },
});
</script>

<style lang="less" scoped>
#port-override-option {
  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}
</style>
