<template>
    <div id="status-bar">
        <PortUtilization :usage-down="portUsageDown" :usage-up="portUsageUp" />
        <span v-if="connectionTimestamp" class="stat-group" :title="$t('statusbar_connection_time')">
            <UIcon name="i-lucide-clock" class="stat-icon" />
            <span class="value">{{ formattedConnectionTime }}</span>
        </span>
        <span class="stat-group" :title="$t('statusbar_packet_error')">
            <UIcon name="i-lucide-triangle-alert" class="stat-icon" />
            <span class="value">{{ packetError }}</span>
        </span>
        <span class="stat-group" :title="$t('statusbar_cycle_time')">
            <UIcon name="i-lucide-timer" class="stat-icon" />
            <span class="value">{{ cycleTime }}</span>
        </span>
        <span class="stat-group cpu-load" :title="`${$t('statusbar_cpu_load')}: ${cpuLoad}%`">
            <UIcon name="i-lucide-cpu" class="stat-icon" />
            <span class="cpu-bar" :class="cpuLoadClass">
                <span class="cpu-bar__fill" :style="{ width: `${clampedCpuLoad}%` }"></span>
            </span>
        </span>
        <div v-if="connectionTimestamp" class="status-indicators">
            <SensorStatus :sensors-detected="fcConfig.activeSensors ?? 0" :gps-fix-state="gps.fix ?? 0" />
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
                :mode="fcConfig.mode ?? 0"
                :aux-config="auxConfig"
            />
            <DataFlash
                v-if="dataflashSupported"
                :fc-total-size="dataflash.totalSize"
                :fc-used-size="dataflash.usedSize"
            />
        </div>
        <StatusBarVersion
            :configurator-version="configuratorVersion"
            :firmware-version="firmwareVersion"
            :firmware-id="firmwareId"
            :hardware-id="hardwareId"
        />
    </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted } from "vue";
import StatusBarVersion from "./StatusBarVersion.vue";
import PortUtilization from "./PortUtilization.vue";
import BatteryIcon from "../quad-status/BatteryIcon.vue";
import BatteryLegend from "../quad-status/BatteryLegend.vue";
import BottomStatusIcons from "../quad-status/BottomStatusIcons.vue";
import DataFlash from "../data-flash/DataFlash.vue";
import SensorStatus from "../sensor-status/SensorStatus.vue";
import FC from "../../js/fc";

export default defineComponent({
    components: {
        PortUtilization,
        StatusBarVersion,
        BatteryIcon,
        BatteryLegend,
        BottomStatusIcons,
        DataFlash,
        SensorStatus,
    },
    props: {
        portUsageDown: {
            type: Number,
            default: 0,
        },
        portUsageUp: {
            type: Number,
            default: 0,
        },
        connectionTimestamp: {
            type: Number,
            default: null,
        },
        packetError: {
            type: Number,
            default: 0,
        },
        cycleTime: {
            type: Number,
            default: 0,
        },
        cpuLoad: {
            type: Number,
            default: 0,
        },
        configuratorVersion: {
            type: String,
            default: "",
        },
        firmwareVersion: {
            type: String,
            default: "",
        },
        firmwareId: {
            type: String,
            default: "",
        },
        hardwareId: {
            type: String,
            default: "",
        },
    },
    setup(props) {
        const currentTime = ref(Date.now());
        let interval = null;

        onMounted(() => {
            // Update current time every second for the connection timer
            interval = setInterval(() => {
                currentTime.value = Date.now();
            }, 1000);
        });

        onUnmounted(() => {
            if (interval) {
                clearInterval(interval);
            }
        });

        const formattedConnectionTime = computed(() => {
            if (!props.connectionTimestamp) {
                return "00:00";
            }

            // Use currentTime.value to make this reactive to time changes
            const elapsedMs = currentTime.value - props.connectionTimestamp;
            const elapsedSeconds = Math.floor(elapsedMs / 1000);

            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;

            return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        });

        const analog = computed(() => FC.ANALOG ?? {});
        const batteryConfig = computed(() => FC.BATTERY_CONFIG ?? {});
        const batteryState = computed(() => FC.BATTERY_STATE ?? {});
        const auxConfig = computed(() => FC.AUX_CONFIG ?? []);
        const fcConfig = computed(() => FC.CONFIG ?? {});
        const gps = computed(() => FC.GPS_DATA ?? {});
        const dataflash = computed(() => FC.DATAFLASH ?? { totalSize: 0, usedSize: 0 });
        const dataflashSupported = computed(() => (dataflash.value.totalSize ?? 0) > 0);

        const clampedCpuLoad = computed(() => Math.max(0, Math.min(100, Number(props.cpuLoad) || 0)));
        const cpuLoadClass = computed(() => {
            const v = clampedCpuLoad.value;
            if (v >= 85) {
                return "cpu-bar--critical";
            }
            if (v >= 60) {
                return "cpu-bar--warning";
            }
            return "cpu-bar--ok";
        });

        return {
            formattedConnectionTime,
            analog,
            batteryConfig,
            batteryState,
            auxConfig,
            fcConfig,
            gps,
            dataflash,
            dataflashSupported,
            clampedCpuLoad,
            cpuLoadClass,
        };
    },
});
</script>

<style lang="less" scoped>
/** Status bar **/
#status-bar {
    display: flex;
    align-items: center;
    white-space: nowrap;
    gap: 0.5rem;
    bottom: 0;
    box-sizing: border-box;
    width: 100%;
    min-height: 2.5rem;
    padding: 0.25rem 1rem;
    background-color: var(--surface-300);
    line-height: 1.2;
    .message {
        margin-right: 0.25rem;
    }
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
        display: none;
    }
}

#status-bar > * {
    display: flex;
    align-items: center;
}

.stat-group {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}

.stat-icon {
    width: 14px;
    height: 14px;
    color: var(--text);
    opacity: 0.75;
}

.value {
    font-variant-numeric: tabular-nums;
}

.cpu-load {
    gap: 0.4rem;
}

.cpu-bar {
    position: relative;
    display: inline-block;
    width: 60px;
    height: 8px;
    border-radius: 3px;
    background-color: var(--surface-500);
    overflow: hidden;
}

.cpu-bar__fill {
    display: block;
    height: 100%;
    border-radius: 3px 0 0 3px;
    transition: width 0.2s ease;
}

.cpu-bar--ok .cpu-bar__fill {
    background-color: #59aa29;
}

.cpu-bar--warning .cpu-bar__fill {
    background-color: var(--warning-500);
}

.cpu-bar--critical .cpu-bar__fill {
    background-color: var(--error-500);
}

.status-indicators {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.status-indicators :deep(.sensor-status) {
    background-color: transparent;
}

.status-indicators :deep(.sensor-status li) {
    width: 2rem;
}

.status-indicators :deep(.sensor-status .gyroicon),
.status-indicators :deep(.sensor-status .accicon),
.status-indicators :deep(.sensor-status .magicon),
.status-indicators :deep(.sensor-status .baroicon),
.status-indicators :deep(.sensor-status .gpsicon),
.status-indicators :deep(.sensor-status .sonaricon) {
    padding-top: 1.4rem;
    height: 0;
    background-size: 22px;
    background-position: center 0;
    font-size: 9px;
    margin-top: 0;
}

/* Neutralise margins/sizes that were tuned for the legacy header bar. */
.status-indicators :deep(.battery-icon) {
    margin-top: 0;
    margin-left: 0;
    height: 24px;
    width: 48px;
}

.status-indicators :deep(.quad-status-contents) {
    margin-top: 8px;
    margin-left: 10px;
    width: 26px;
    height: 8px;
}

.status-indicators :deep(.battery-status) {
    height: 9px;
}

.status-indicators :deep(.battery-legend) {
    position: static;
    display: inline-block;
    margin: 0;
    padding: 0 0.25rem;
    width: auto;
    color: var(--text);
    font-size: 12px;
    white-space: nowrap;
}

.status-indicators :deep(.bottomStatusIcons) {
    height: auto;
    max-width: none;
    margin: 0;
    padding: 0.1rem 0.25rem;
    background-color: transparent;
    border-radius: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.status-indicators :deep(.bottomStatusIcons .armedicon),
.status-indicators :deep(.bottomStatusIcons .failsafeicon),
.status-indicators :deep(.bottomStatusIcons .linkicon) {
    margin: 0;
    height: 16px;
    width: 16px;
}

.status-indicators :deep(.data-flash) {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    width: auto;
    min-width: 140px;
    height: auto;
    padding: 0.25rem 0.5rem;
    background-image: none;
    color: var(--text);
    font-size: 11px;
}

.status-indicators :deep(.dataflash-contents_global) {
    margin: 0;
    padding: 0;
    border: none;
    background-color: var(--surface-500);
    border-radius: 3px;
    overflow: hidden;
    height: 4px;
    width: 100%;
}

.status-indicators :deep(.dataflash-contents_global div) {
    height: 4px;
    border-radius: 3px 0 0 3px;
    box-shadow: none;
}

.status-indicators :deep(.dataflash-contents_global div span) {
    position: static;
    display: block;
    color: var(--text);
    width: auto;
    margin-bottom: 0.15rem;
    white-space: nowrap;
}

.status-indicators :deep(.noflash_global) {
    margin: 0;
    text-align: left;
    color: var(--text);
}

#status-bar > * ~ * {
    padding-left: 10px;
    border-left: 1px solid var(--surface-400);
}

/** Status bar (phones) **/
@media all and (max-width: 575px) {
    #status-bar {
        display: none;
    }
}
</style>
