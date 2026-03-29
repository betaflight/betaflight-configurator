<template>
    <div class="battery-legend">
        {{ reading }}
    </div>
</template>
<script setup>
import { computed } from "vue";

const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8;

const props = defineProps({
    voltage: { type: Number, default: 0 },
    vbatmaxcellvoltage: { type: Number, default: 1 },
});

const reading = computed(() => {
    let nbCells = Math.floor(props.voltage / props.vbatmaxcellvoltage) + 1;
    if (props.voltage === 0) {
        nbCells = 1;
    }
    const cellsText = props.voltage > NO_BATTERY_VOLTAGE_MAXIMUM ? `${nbCells}S` : "USB";
    return `${props.voltage.toFixed(2)}V (${cellsText})`;
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
