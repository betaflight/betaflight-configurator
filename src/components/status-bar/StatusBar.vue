<template>
    <div id="status-bar">
        <PortUtilization :usage-down="portUsageDown" :usage-up="portUsageUp" />
        <span v-if="connectionTimestamp">
            <span class="message">{{ $t("statusbar_connection_time") }}</span>
            <span class="value">{{ formattedConnectionTime }}</span>
        </span>
        <ReadingStat message="statusbar_packet_error" :model-value="packetError" />
        <ReadingStat message="statusbar_i2c_error" :model-value="i2cError" />
        <ReadingStat message="statusbar_cycle_time" :model-value="cycleTime" />
        <ReadingStat message="statusbar_cpu_load" :model-value="cpuLoad" unit="%" />
        <div v-if="connectionTimestamp" class="status-indicators">
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
import ReadingStat from "./ReadingStat.vue";
import PortUtilization from "./PortUtilization.vue";
import BatteryIcon from "../quad-status/BatteryIcon.vue";
import BatteryLegend from "../quad-status/BatteryLegend.vue";
import BottomStatusIcons from "../quad-status/BottomStatusIcons.vue";
import DataFlash from "../data-flash/DataFlash.vue";
import FC from "../../js/fc";

export default defineComponent({
    components: {
        PortUtilization,
        ReadingStat,
        StatusBarVersion,
        BatteryIcon,
        BatteryLegend,
        BottomStatusIcons,
        DataFlash,
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
        i2cError: {
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
        const dataflash = computed(() => FC.DATAFLASH ?? { totalSize: 0, usedSize: 0 });
        const dataflashSupported = computed(() => (dataflash.value.totalSize ?? 0) > 0);

        return {
            formattedConnectionTime,
            analog,
            batteryConfig,
            batteryState,
            auxConfig,
            fcConfig,
            dataflash,
            dataflashSupported,
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

.status-indicators {
    display: flex;
    align-items: center;
    gap: 0.75rem;
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
