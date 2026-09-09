<template>
    <div class="battery-legend" :class="{ 'battery-legend--compact': compact }">
        {{ reading }}
    </div>
</template>
<script setup>
import { computed } from "vue";
import { NO_BATTERY_VOLTAGE_MAXIMUM, estimateCellCount } from "../../js/utils/battery";

const props = defineProps({
    voltage: { type: Number, default: 0 },
    vbatmaxcellvoltage: { type: Number, default: 1 },
    compact: { type: Boolean, default: false },
});

const reading = computed(() => {
    const nbCells = estimateCellCount(props.voltage, props.vbatmaxcellvoltage);
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
    inset-inline-start: 0;
    inset-inline-end: 0;
    width: 40px;
    text-align: start;
    color: var(--surface-800);
    margin-inline-start: -8px;
    padding-inline-end: 4px;
}

.battery-legend--compact {
    position: static;
    display: inline-block;
    top: 0;
    margin: 0;
    padding: 0 0.25rem;
    width: auto;
    color: var(--text);
    font-size: 12px;
    white-space: nowrap;
}
</style>
