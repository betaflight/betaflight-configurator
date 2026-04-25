<template>
    <UApp :tooltip="{ delayDuration: 100 }">
        <div class="app-wrapper">
            <div id="background" v-show="isRevealed" @click="isRevealed = false"></div>
            <div id="side_menu_swipe"></div>
            <div class="mobile-topbar" :class="{ 'mobile-topbar--hidden': topbarHidden }">
                <UButton
                    id="menu_btn"
                    icon="i-lucide-menu"
                    color="neutral"
                    variant="soft"
                    size="lg"
                    square
                    :aria-label="$t('openSidebarMenu')"
                    @click="isRevealed = !isRevealed"
                />
                <div class="mobile-topbar__logo" :title="logoTooltip" aria-hidden="true"></div>
                <div class="mobile-topbar__spacer" aria-hidden="true"></div>
            </div>
            <div id="tab-content-container">
                <div class="tab_container" :class="{ reveal: isRevealed }">
                    <betaflight-logo
                        :configurator-version="CONFIGURATOR.getDisplayVersion()"
                        :firmware-version="FC.CONFIG.flightControllerVersion"
                        :firmware-id="FC.CONFIG.flightControllerIdentifier"
                        :hardware-id="FC.CONFIG.hardwareName"
                    ></betaflight-logo>
                    <ConnectButton />
                    <Sidebar />
                    <user-session></user-session>
                    <div class="clear-both"></div>
                </div>
                <div id="content" @scroll.passive="onContentScroll">
                    <component
                        :is="activeTabComponent"
                        v-if="activeTabComponent"
                        :key="vueTabState.activeTabKey"
                        ref="activeTabInstance"
                    />
                </div>
            </div>
            <status-bar
                :port-usage-down="PortUsage.port_usage_down"
                :port-usage-up="PortUsage.port_usage_up"
                :connection-timestamp="CONNECTION.timestamp"
                :packet-error="MSP.packet_error"
                :cycle-time="FC.CONFIG.cycleTime"
                :cpu-load="FC.CONFIG.cpuload"
                :configurator-version="CONFIGURATOR.getDisplayVersion()"
                :firmware-version="FC.CONFIG.flightControllerVersion"
                :firmware-target="FC.CONFIG.hardwareName"
            ></status-bar>
            <div id="cache">
                <div class="data-loading">
                    <p i18n="dataWaitingForData">Waiting for data ...</p>
                </div>
            </div>
        </div>
        <GlobalDialogs />
    </UApp>
</template>

<script setup>
import { computed, nextTick, provide, reactive, ref, shallowRef, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import ConnectButton from "./components/port-picker/ConnectButton.vue";
import GlobalDialogs from "./components/dialogs/GlobalDialogs.vue";
import Sidebar from "./components/sidebar/Sidebar.vue";
import FCModule from "./js/fc.js";
import MSPModule from "./js/msp.js";
import PortUsageModule from "./js/port_usage.js";
import CONFIGURATORModule from "./js/data_storage.js";
import GUI from "./js/gui.js";
import { i18n } from "./js/localization";
import {
    completeVueTabMount,
    tabAdapterRegistration,
    TAB_ADAPTER_REGISTRATION_KEY,
    vueTabState,
} from "./js/vue_tab_mounter.js";
import { VueTabComponents } from "./js/vue_tab_registry.js";

// Tests or unusual entry points may run without init.js; init.js overwrites this synchronously after its model exists.
if (!window.vm) {
    window.vm = reactive({ expertMode: false });
}

// Stable fallback so computed() does not allocate a new reactive per evaluation when window.vm.CONNECTION is missing.
const connectionFallback = reactive({ timestamp: null });

// Track latest window.vm so computeds re-run when it is reassigned (import order vs. init.js).
const syncedVm = shallowRef(window.vm);

// Intercept future assignments to window.vm so syncedVm stays in sync
// without needing side effects inside computed getters.
let _windowVm = window.vm;
Object.defineProperty(window, "vm", {
    get: () => _windowVm,
    set: (v) => {
        _windowVm = v;
        syncedVm.value = v;
    },
    configurable: true,
    enumerable: true,
});

function currentVm() {
    return syncedVm.value;
}

const CONFIGURATOR = computed(() => currentVm()?.CONFIGURATOR ?? CONFIGURATORModule);
const FC = computed(() => currentVm()?.FC ?? FCModule);
const MSP = computed(() => currentVm()?.MSP ?? MSPModule);
const PortUsage = computed(() => currentVm()?.PortUsage ?? PortUsageModule);
const CONNECTION = computed(() => currentVm()?.CONNECTION ?? connectionFallback);

const activeTabInstance = ref(null);

const isRevealed = ref(false);
const sidebarCompact = useMediaQuery("(max-width: 1055px)");
const isSidebarExpanded = computed(() => !sidebarCompact.value || isRevealed.value);

// Auto-close the drawer when leaving the compact breakpoint.
watch(sidebarCompact, (compact) => {
    if (!compact) {
        isRevealed.value = false;
    }
});

const topbarHidden = ref(false);
let lastScrollTop = 0;
const scrollThreshold = 6;

function onContentScroll(event) {
    const current = event.target.scrollTop;
    if (current <= 0) {
        topbarHidden.value = false;
        lastScrollTop = 0;
        return;
    }
    const diff = current - lastScrollTop;
    if (diff > scrollThreshold) {
        topbarHidden.value = true;
        lastScrollTop = current;
    } else if (diff < -scrollThreshold) {
        topbarHidden.value = false;
        lastScrollTop = current;
    }
}

// Ensure the topbar is visible when the drawer opens so the hamburger stays reachable.
watch(isRevealed, (revealed) => {
    if (revealed) {
        topbarHidden.value = false;
    }
});

const logoTooltip = computed(() => {
    const lines = [`${i18n.getMessage("versionLabelConfigurator")}: ${CONFIGURATOR.value.getDisplayVersion()}`];
    const cfg = FC.value.CONFIG ?? {};
    if (cfg.flightControllerVersion && cfg.flightControllerIdentifier) {
        lines.push(
            `${i18n.getMessage("versionLabelFirmware")}: ${cfg.flightControllerVersion} ${cfg.flightControllerIdentifier}`,
        );
    }
    if (cfg.hardwareName) {
        lines.push(`${i18n.getMessage("versionLabelTarget")}: ${cfg.hardwareName}`);
    }
    return lines.join("\n");
});

provide("sidebarExpanded", isSidebarExpanded);

const activeTabComponent = computed(() => {
    const tabName = vueTabState.activeTabName;
    return tabName ? (VueTabComponents[tabName] ?? null) : null;
});

provide("betaflightModel", currentVm());
provide("gui", GUI);
provide(TAB_ADAPTER_REGISTRATION_KEY, tabAdapterRegistration);

watch(
    () => vueTabState.activeTabKey,
    async () => {
        if (!vueTabState.activeTabName) {
            return;
        }

        await nextTick();
        completeVueTabMount(activeTabInstance.value);
    },
    { flush: "post" },
);
</script>

<style scoped>
@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>

<style>
/* Main app content wrapper - flex column to push status bar to bottom */
.app-wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-height: 0; /* Allow flex children to shrink below content size */
}

/* Legacy cache node is required by some code paths but should never be visible in Vue UI */
#cache {
    display: none;
}

/* Mobile top bar — hamburger left, centred wide logo, auto-hides on scroll down. */
.mobile-topbar {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2001;
    height: 3rem;
    padding: 0.25rem 0.5rem;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--surface-100);
    border-bottom: 1px solid var(--surface-200);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.25s ease;
}
.mobile-topbar--hidden {
    transform: translateY(-100%);
}
.mobile-topbar__logo {
    flex: 1;
    min-width: 0;
    height: 2.5rem;
    background-image: url(./images/bf_logo_white.svg);
    background-repeat: no-repeat;
    background-position: center;
    background-size: auto 100%;
}
.dark .mobile-topbar__logo {
    background-image: url(./images/bf_logo_black.svg);
}
.mobile-topbar__spacer {
    width: 2.5rem;
    flex-shrink: 0;
}

@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    .mobile-topbar {
        display: flex;
    }
    /* Leave room at the top of the content area for the top bar. */
    #content {
        padding-top: 3rem;
    }
}
</style>
