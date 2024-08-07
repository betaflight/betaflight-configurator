<template>
  <div class="battery-legend">
    {{ reading }}
  </div>
</template>
<script>
export default {
  props: {
    voltage: {
      type: Number,
      default: 0,
    },
    vbatmaxcellvoltage: {
      type: Number,
      default: 1,
    },
    vbatcellcount: {
      type: Number,
      default: 1,
    },
  },
  computed: {
    reading() {
      const nbCells = this.voltage === 0 || this.vbatcellcount === 0 ? 1 : this.vbatcellcount;
      const cellsText = this.voltage && this.vbatcellcount ? `${nbCells}S` : "USB";
      return `${this.voltage.toFixed(2)}V (${cellsText})`;
    },
  },
};
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
