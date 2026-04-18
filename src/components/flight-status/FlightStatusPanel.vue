<template>
    <div class="flight-status-panel">
        <div class="flight-status-panel__group quad-wrap">
            <BatteryIcon
                :voltage="analog.voltage ?? 0"
                :vbatmincellvoltage="batteryConfig.vbatmincellvoltage ?? 0"
                :vbatmaxcellvoltage="batteryConfig.vbatmaxcellvoltage ?? 1"
                :vbatwarningcellvoltage="batteryConfig.vbatwarningcellvoltage ?? 1"
                :battery-state="batteryState.batteryState"
            />
            <BatteryLegend :voltage="analog.voltage ?? 0" :vbatmaxcellvoltage="batteryConfig.vbatmaxcellvoltage ?? 1" />
            <BottomStatusIcons
                :last-received-timestamp="analog.last_received_timestamp ?? 0"
                :mode="config.mode ?? 0"
                :aux-config="auxConfig"
            />
        </div>
        <SensorStatus :sensors-detected="config.activeSensors ?? 0" :gps-fix-state="gps.fix ?? 0" />
        <DataFlash v-if="dataflashSupported" :fc-total-size="dataflash.totalSize" :fc-used-size="dataflash.usedSize" />
    </div>
</template>

<script setup>
import { computed } from "vue";
import BatteryIcon from "../quad-status/BatteryIcon.vue";
import BatteryLegend from "../quad-status/BatteryLegend.vue";
import BottomStatusIcons from "../quad-status/BottomStatusIcons.vue";
import DataFlash from "../data-flash/DataFlash.vue";
import SensorStatus from "../sensor-status/SensorStatus.vue";
import FC from "../../js/fc";

const config = computed(() => FC.CONFIG ?? {});
const analog = computed(() => FC.ANALOG ?? {});
const batteryConfig = computed(() => FC.BATTERY_CONFIG ?? {});
const batteryState = computed(() => FC.BATTERY_STATE ?? {});
const auxConfig = computed(() => FC.AUX_CONFIG ?? []);
const gps = computed(() => FC.GPS_DATA ?? {});
const dataflash = computed(() => FC.DATAFLASH ?? { totalSize: 0, usedSize: 0 });
const dataflashSupported = computed(() => (dataflash.value.totalSize ?? 0) > 0);
</script>

<style scoped lang="less">
.flight-status-panel {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.5rem;
    margin-bottom: 0.75rem;
}

.flight-status-panel__group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.quad-wrap {
    font-size: 10px;
    border-radius: 0.5rem;
    background-color: var(--surface-300);
    white-space: nowrap;
    padding: 0.25rem 0.5rem;
}
</style>
