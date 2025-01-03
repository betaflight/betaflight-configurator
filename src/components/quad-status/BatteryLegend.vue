<template>
  <div class="battery-legend">
    {{ reading }}
  </div>
</template>
<script>
const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8;
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    voltage: {
      type: Number,
      default: 0,
    },
    vbatmaxcellvoltage: {
      type: Number,
      default: 1,
    },
  },
  computed: {
    reading() {
      let nbCells = Math.floor(this.voltage / this.vbatmaxcellvoltage) + 1;
      if (this.voltage === 0) {
        nbCells = 1;
      }
      const cellsText = this.voltage > NO_BATTERY_VOLTAGE_MAXIMUM ? `${nbCells}S` : 'USB';
      return `${this.voltage.toFixed(2)}V (${cellsText})`;
    },
  },
});
</script>

<style>
.battery-legend {
  display: inline;
  position: relative;
  top: -2px;
  margin-top: 0;
  left: 0;
  right: 0;
  width: 40px;
  text-align: left;
  color: var(--surface-800);
  margin-left: -8px;
  padding-right: 4px;
}
</style>
