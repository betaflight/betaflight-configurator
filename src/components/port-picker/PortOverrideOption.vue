<template>
  <div id="port-override-option">
    <label
      for="port-override"
    ><span>{{ $t("portOverrideText") }}</span>
      <input
        id="port-override"
        v-model="value"
        type="text"
      ></label>
  </div>
</template>

<script>
export default {
  data() {
    return {
      value: "/dev/rfcomm0",
    };
  },
};
</script>
<style scoped>
#port-override-option {
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
    font-size: 12px;
    margin-top: 4px;
    margin-right: 15px;
    label {
        background-color: #2b2b2b;
        border-radius: 3px;
        padding: 3px;
        color: var(--subtleAccent);
    };
    display: block;
}

#port-override-option label {
    background-color: #2b2b2b;
    border-radius: 3px;
    /* might be less */
    padding: 2px;
    color: var(--subtleAccent);
}

#port-override {
    background-color: rgba(0, 0, 0, 0.1);
    color: #888888;
    width: 140px;
    margin-left: 2px;
    padding: 1px;
    border-radius: 3px;
    height: 15px;
    font-size: 12px;
}
</style>
