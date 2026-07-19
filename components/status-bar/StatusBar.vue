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

export default defineComponent({
    components: {
        PortUtilization,
        ReadingStat,
        StatusBarVersion,
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

        return {
            formattedConnectionTime,
        };
    },
});
</script>

<style lang="less" scoped>
/** Status bar **/
#status-bar {
    display: flex;
    white-space: nowrap;
    gap: 0.5rem;
    bottom: 0;
    width: calc(100% - 20px);
    height: 20px;
    line-height: 20px;
    padding: 0.5rem 1rem;
    background-color: var(--surface-300);
    .message {
        margin-right: 0.25rem;
    }
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
