<template>
    <div id="status-bar">
        <template v-if="connectionTimestamp">
            <template v-if="expertMode">
                <PortUtilization :usage-down="portUsageDown" :usage-up="portUsageUp" />

                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

                <UTooltip :text="$t('statusbar_connection_time')">
                    <span class="stat-group">
                        <UIcon name="i-lucide-clock" class="stat-icon" />
                        <span class="value">{{ formattedConnectionTime }}</span>
                    </span>
                </UTooltip>

                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

                <UTooltip :text="$t('statusbar_packet_error')">
                    <span class="stat-group">
                        <UIcon name="i-lucide-triangle-alert" class="stat-icon" />
                        <span class="value">{{ packetError }}</span>
                    </span>
                </UTooltip>

                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

                <UTooltip :text="$t('statusbar_cycle_time')">
                    <span class="stat-group">
                        <UIcon name="i-lucide-timer" class="stat-icon" />
                        <span class="value">{{ cycleTime }}</span>
                    </span>
                </UTooltip>

                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />
            </template>

            <UTooltip :text="`${$t('statusbar_cpu_load')} ${cpuLoad}%`">
                <span class="stat-group cpu-load">
                    <UIcon name="i-lucide-cpu" class="stat-icon" />
                    <span class="cpu-bar" :class="cpuLoadClass">
                        <span class="cpu-bar__fill" :style="{ width: `${clampedCpuLoad}%` }"></span>
                    </span>
                </span>
            </UTooltip>

            <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

            <SensorStatus :sensors-detected="fcConfig.activeSensors ?? 0" :gps-fix-state="gps.fix ?? 0" />

            <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

            <BatteryIcon
                compact
                :voltage="analog.voltage ?? 0"
                :vbatmaxcellvoltage="batteryConfig.vbatmaxcellvoltage ?? 1"
                :vbatwarningcellvoltage="batteryConfig.vbatwarningcellvoltage ?? 1"
                :battery-state="batteryState.batteryState"
            />
            <BatteryLegend
                compact
                :voltage="analog.voltage ?? 0"
                :vbatmaxcellvoltage="batteryConfig.vbatmaxcellvoltage ?? 1"
            />

            <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

            <BottomStatusIcons
                compact
                :last-received-timestamp="analog.last_received_timestamp ?? 0"
                :mode="fcConfig.mode ?? 0"
                :aux-config="auxConfig"
            />

            <template v-if="dataflashSupported">
                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />

                <DataFlash compact :fc-total-size="dataflash.totalSize" :fc-used-size="dataflash.usedSize" />
            </template>
        </template>
        <div class="flex gap-2 text-xs text-muted ml-auto items-center h-full">
            <template v-if="firmwareTarget && firmwareVersion">
                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />
                <UIcon name="i-lucide-cpu" class="size-4" />
                <UTooltip :text="$t('versionLabelFirmware')">
                    <span>{{ displayedFirmwareTarget }} {{ displayedFirmwareVersion }}</span>
                </UTooltip>
                <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />
            </template>

            <UIcon name="i-lucide-monitor" class="size-4" />
            <UTooltip :text="$t('versionLabelConfigurator')">
                <span>{{ displayedConfiguratorVersion }}</span>
            </UTooltip>
        </div>
    </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted } from "vue";
import PortUtilization from "./PortUtilization.vue";
import BatteryIcon from "../quad-status/BatteryIcon.vue";
import BatteryLegend from "../quad-status/BatteryLegend.vue";
import BottomStatusIcons from "../quad-status/BottomStatusIcons.vue";
import DataFlash from "../data-flash/DataFlash.vue";
import SensorStatus from "../sensor-status/SensorStatus.vue";
import { EventBus } from "../eventBus";
import FC from "../../js/fc";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";

/**
 * Shorter target for the status bar when not in expert mode, e.g.
 * "MFGID/TARGETNAME(MCUNAME)" -> "TARGETNAME"
 */
function shortenTargetDisplay(name) {
    if (!name || typeof name !== "string") {
        return "";
    }
    let s = name.trim();
    const i = s.indexOf("/");
    if (i >= 0) {
        s = s.slice(i + 1);
    }
    s = s.replace(/\([^)]*\)\s*$/, "").trim();
    return s;
}

/**
 * Drop trailing (git/revision) segments from a display version string, e.g.
 * "25.1.0 (a1b2c3d)" or "4.5.0 (a1b2c3d)" for non–expert status text.
 */
function stripVersionDisplay(version) {
    if (!version || typeof version !== "string") {
        return "";
    }
    let s = version.trim();
    let prev;
    do {
        prev = s;
        s = s.replace(/\s+\([^)]*\)\s*$/, "").trim();
    } while (s !== prev);
    return s;
}

export default defineComponent({
    components: {
        PortUtilization,
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
        firmwareTarget: {
            type: String,
            default: "",
        },
    },
    setup(props) {
        const currentTime = ref(Date.now());
        const expertMode = ref(isExpertModeEnabled());
        let interval = null;

        const onExpertModeChange = (enabled) => {
            expertMode.value = enabled;
        };

        onMounted(() => {
            // Update current time every second for the connection timer
            interval = setInterval(() => {
                currentTime.value = Date.now();
            }, 1000);
            expertMode.value = isExpertModeEnabled();
            EventBus.$on("expert-mode-change", onExpertModeChange);
        });

        onUnmounted(() => {
            if (interval) {
                clearInterval(interval);
            }
            EventBus.$off("expert-mode-change", onExpertModeChange);
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

        const displayedFirmwareTarget = computed(() => {
            if (expertMode.value) {
                return props.firmwareTarget;
            }
            return shortenTargetDisplay(props.firmwareTarget);
        });

        const displayedConfiguratorVersion = computed(() => {
            if (expertMode.value) {
                return props.configuratorVersion;
            }
            return stripVersionDisplay(props.configuratorVersion);
        });

        const displayedFirmwareVersion = computed(() => {
            if (expertMode.value) {
                return props.firmwareVersion;
            }
            return stripVersionDisplay(props.firmwareVersion);
        });

        return {
            expertMode,
            displayedFirmwareTarget,
            displayedConfiguratorVersion,
            displayedFirmwareVersion,
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
    height: 2.5rem;
    padding: 0.25rem 1rem;
    background-color: var(--surface-300);
    line-height: 1.2;
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
</style>
