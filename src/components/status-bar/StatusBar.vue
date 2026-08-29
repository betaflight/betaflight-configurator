<template>
    <div id="status-bar" :class="{ 'status-bar--expanded': expanded }">
        <nav class="status-bar__tabs" :aria-label="$t('openSidebarMenu')">
            <UButton
                v-for="tab in visibleTabs"
                :key="tab.key"
                :icon="tab.icon"
                :color="tab.active ? 'primary' : 'neutral'"
                :variant="tab.active ? 'soft' : 'ghost'"
                size="sm"
                square
                :aria-label="tab.label"
                :aria-current="tab.active ? 'page' : undefined"
                @click="tab.select()"
            />
        </nav>
        <div class="status-bar__items">
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
                <template v-if="isConnectedToVirtual">
                    <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />
                    <UIcon name="i-lucide-cpu" class="size-4" />
                    <span>{{ $t("virtualMode") }}</span>
                    <USeparator orientation="vertical" :ui="{ root: 'py-1', border: 'border-accented' }" />
                </template>

                <UIcon name="i-lucide-monitor" class="size-4" />
                <UTooltip :text="$t('versionLabelConfigurator')">
                    <span>{{ displayedConfiguratorVersion }}</span>
                </UTooltip>
            </div>
        </div>
        <UButton
            id="status_expand_btn"
            :icon="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="$t(expanded ? 'statusbar_collapse' : 'statusbar_expand')"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
        />
    </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted } from "vue";
import PortUtilization from "./PortUtilization.vue";
import { useConnectionStore } from "../../stores/connection";
import BatteryIcon from "../quad-status/BatteryIcon.vue";
import BatteryLegend from "../quad-status/BatteryLegend.vue";
import BottomStatusIcons from "../quad-status/BottomStatusIcons.vue";
import DataFlash from "../data-flash/DataFlash.vue";
import SensorStatus from "../sensor-status/SensorStatus.vue";
import { EventBus } from "../eventBus";
import { useVisibleTabs } from "../sidebar/useVisibleTabs.js";
import { useTranslation } from "i18next-vue";
import { vueTabState } from "../../js/vue_tab_mounter.js";
import { switchTab } from "../../js/tab_switch.js";
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
        // Off the landing page the top bar is gone, so this is the only way into the drawer.
        // The floating bar only has room for the controls, so the readouts live behind this.
        const expanded = ref(false);

        const { t } = useTranslation();

        // The compact bar is the navigation: the same tabs the sidebar shows, scrolled sideways.
        const activeTabs = useVisibleTabs();
        const visibleTabs = computed(() =>
            activeTabs.value.map((item) => {
                const key = item.tab ?? item.key;
                return {
                    key,
                    icon: item.icon,
                    label: t(item.i18n),
                    active: vueTabState.activeTabName === key,
                    select: () => switchTab(key, { mode: item.mode, label: t(item.i18n) }),
                };
            }),
        );

        const currentTime = ref(Date.now());
        const expertMode = ref(isExpertModeEnabled());
        let interval = null;
        const connectionStore = useConnectionStore();
        const isVirtualMode = computed(() => connectionStore.virtualMode);
        const isConnectedToVirtual = computed(() => connectionStore.connectedTo === "virtual");

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

            // Use currentTime.value to make this reactive to time changes.
            // Clamp so we never show negative time: currentTime can lag up to ~1s behind
            // Date.now() used when the connection timestamp was set.
            const elapsedMs = currentTime.value - props.connectionTimestamp;
            const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

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
            visibleTabs,
            expanded,
            expertMode,
            isVirtualMode,
            isConnectedToVirtual,
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
    gap: 0.6rem;
    bottom: 0;
    box-sizing: border-box;
    width: 100%;
    /* Grow by the bottom safe-area inset (Android navigation bar / iOS home indicator) and pad the
       contents up by the same amount, so the row keeps a constant 2rem content box. */
    height: calc(2.5rem + var(--bf-inset-bottom));
    padding: 0.25rem 1rem calc(0.25rem + var(--bf-inset-bottom));
    background-color: var(--surface-100);
    line-height: 1.2;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
        display: none;
    }
}

.status-bar__items {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    flex: 1;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
        display: none;
    }
}

.status-bar__tabs {
    display: none;
    align-items: center;
    gap: 0.125rem;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
        display: none;
    }
    > * {
        flex-shrink: 0;
    }
}

#status_expand_btn {
    display: none;
    flex-shrink: 0;
}

/* Compact: the bar floats clear of the content and above the home indicator, and carries only
   its two controls. The readouts do not fit on one phone-width line, so they move behind the
   expand control, which grows the same element into a panel rather than duplicating them. */
body.mobile-app-shell {
    @media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
        .status-bar__tabs {
            display: flex;
        }
        #status_expand_btn {
            display: inline-flex;
        }

        #status-bar {
            position: fixed;
            left: 0.75rem;
            right: 0.75rem;
            bottom: calc(0.5rem + var(--bf-inset-bottom));
            width: auto;
            height: 4.5rem;
            padding: 0.375rem 0.75rem;
            border-radius: 2.25rem;
            border: 1px solid var(--surface-200);
            background-color: color-mix(in srgb, var(--surface-100) 82%, transparent);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            box-shadow: 0 6px 20px rgb(0 0 0 / 28%);
            overflow: visible;
            z-index: 2000;
        }

        /* Thumb-sized targets on a bar this prominent; UButton's own sizes do not go big enough.
       UButton pads its content, which pushes the glyph off-centre once the box is this large. */
        .status-bar__tabs > button,
        #status_expand_btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.75rem;
            height: 2.75rem;
            padding: 0;
        }

        .status-bar__tabs > button :deep(svg),
        #status_expand_btn :deep(svg) {
            width: 1.5rem;
            height: 1.5rem;
            flex: none;
        }

        /* Collapsed, the readouts would be a squeezed unreadable strip, so hide them outright. */
        #status-bar:not(.status-bar--expanded) .status-bar__items {
            display: none;
        }

        #status-bar.status-bar--expanded {
            height: auto;
            max-height: 70vh;
            border-radius: 2.25rem;
            flex-wrap: wrap;
            align-items: flex-start;
            padding: 0.75rem;
            overflow-y: auto;

            /* The tab strip and the expand control keep their own row, in the same place and at
           the same size as when collapsed. The bar grows upwards instead, so nothing the
           user was just aiming at moves out from under them. */
            .status-bar__tabs {
                order: 2;
            }

            #status_expand_btn {
                order: 3;
            }

            .status-bar__items {
                flex-direction: column;
                align-items: stretch;
                gap: 0.75rem;
                /* flex-basis, not width: the base rule's `flex: 1` sets basis 0, which would size
               this to a share of the row rather than a full row of its own. */
                flex: 0 0 100%;
                /* Above the tab row, so the readouts appear and the controls stay put. */
                order: 1;
                overflow: visible;
                white-space: normal;
            }

            /* The row markup is built for a right-aligned strip (ml-auto and friends); stacked,
           each readout needs to start at the left edge instead. */
            .status-bar__items > *,
            .status-bar__items .ml-auto {
                width: 100%;
                margin-left: 0;
                justify-content: flex-start;
            }

            /* Vertical rules between stacked rows read as stray marks. */
            .status-bar__items > .u-separator,
            .status-bar__items [role="separator"] {
                display: none;
            }
        }
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
/* The keyboard takes the space the tab strip would occupy. Stated at the top level because the
   nested form flattens to a descendant selector, which cannot ask for both classes on body. */
@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    body.mobile-app-shell.keyboard-visible #status-bar .status-bar__tabs {
        display: none;
    }
}
</style>
