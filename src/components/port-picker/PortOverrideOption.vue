<template>
  <div
    id="port-override-option"
    style="display: none"
    :style="{ display: isManual ? 'flex' : 'none' }"
  >
    <label
      for="port-override"
    ><span>{{ $t("portOverrideText") }}</span>
      <input
        id="port-override"
        type="text"
        value="/dev/rfcomm0"
      ></label>
  </div>
</template>

<script>
export default {
    props: {
        isManual: {
            type: Boolean,
            default: true,
        },
    },
};
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
