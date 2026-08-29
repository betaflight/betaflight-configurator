<template>
    <UApp :tooltip="{ delayDuration: 100 }" portal="#main-wrapper">
        <div class="app-wrapper">
            <div id="background" v-if="isMobileSidebarOpen" aria-hidden="true" @click="isRevealed = false"></div>
            <div id="side_menu_swipe"></div>
            <div v-if="isLandingTab" class="mobile-topbar" :class="{ 'mobile-topbar--hidden': topbarHidden }">
                <div class="mobile-topbar__logo" :title="logoTooltip" aria-hidden="true"></div>
            </div>
            <UserSession is-compact class="floating-account" />
            <div id="tab-content-container" :class="{ 'has-mobile-topbar': isLandingTab }">
                <div class="tab_container" :class="{ reveal: isMobileSidebarOpen }">
                    <betaflight-logo
                        :configurator-version="CONFIGURATOR.getDisplayVersion()"
                        :firmware-version="FC.CONFIG.flightControllerVersion"
                        :firmware-id="FC.CONFIG.flightControllerIdentifier"
                        :hardware-id="FC.CONFIG.hardwareName"
                    ></betaflight-logo>
                    <Teleport to=".floating-connect" :disabled="!useFloatingChrome">
                        <ConnectButton />
                    </Teleport>
                    <Sidebar />
                    <div class="clear-both"></div>
                </div>
                <div id="content" @scroll.passive="onContentScroll">
                    <keep-alive :include="keptAliveTabs">
                        <component
                            :is="activeTabComponent"
                            v-if="activeTabComponent"
                            :key="activeTabKey"
                            ref="activeTabInstance"
                        />
                    </keep-alive>
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
import { isAndroid, isTauriAndroid, isTauriIOS } from "@/js/utils/checkCompatibility.js";
import { computed, nextTick, provide, reactive, ref, shallowRef, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import ConnectButton from "./components/device-picker/ConnectButton.vue";
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
const sidebarNarrow = useMediaQuery("(max-width: 1055px)");
const isCompactBreakpoint = useMediaQuery(
    "(max-width: 575px), (max-width: 950px) and (max-height: 500px) and (orientation: landscape)",
);
const isMobileSidebarOpen = computed(() => isCompactBreakpoint.value && isRevealed.value);
const isSidebarExpanded = computed(() => !sidebarNarrow.value || isRevealed.value);

// Auto-close the drawer when leaving the mobile drawer breakpoint.
watch(isCompactBreakpoint, (compact) => {
    if (!compact) {
        isRevealed.value = false;
    }
});

// The branded top bar is a landing-page affordance. Every other tab reaches the drawer from the
// hamburger in the status bar instead, so the bar only costs vertical space there.
const isLandingTab = computed(() => vueTabState.activeTabName === "landing");

// Connecting is the app's primary action and it lives in the drawer, which the phone shell no
// longer opens. Teleport it into the floating chrome there, and leave it in place everywhere else.
const isAppShell = isTauriIOS() || isTauriAndroid() || isAndroid();
const useFloatingChrome = computed(() => isAppShell && isCompactBreakpoint.value);

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

provide("toggleMobileSidebar", () => {
    isRevealed.value = !isRevealed.value;
});
provide("sidebarExpanded", isSidebarExpanded);
provide("closeMobileSidebar", () => {
    if (isCompactBreakpoint.value) {
        isRevealed.value = false;
    }
});

const activeTabComponent = computed(() => {
    const tabName = vueTabState.activeTabName;
    return tabName ? (VueTabComponents[tabName] ?? null) : null;
});

// Tabs that keep their state (and heavy resources) alive across switches rather than being torn
// down. Matched by component name.
const keptAliveTabs = ["BlackboxViewerTab"];

// The mounter bumps activeTabKey on every switch to force a fresh instance. Kept-alive tabs need
// a stable key instead, or keep-alive caches by an ever-changing key and never restores.
const activeTabKey = computed(() =>
    vueTabState.activeTabName === "blackbox_viewer" ? "blackbox_viewer" : vueTabState.activeTabKey,
);

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
    height: 100%;
    min-height: 0; /* Allow flex children to shrink below content size */
}

/* Legacy cache node is required by some code paths but should never be visible in Vue UI */
#cache {
    display: none;
}

/* Mobile top bar — the landing page's branding, auto-hides on scroll down. The drawer is
   reached from the status bar, which is present on every tab.
   The bar grows by the safe-area inset and pads its contents down by the same amount, so the
   controls sit below the Android/iOS status bar with the content box unchanged. */
.mobile-topbar {
    display: none;
    position: fixed;
    top: 0;
    inset-inline-start: 0;
    inset-inline-end: 0;
    z-index: 2001;
    /* Explicit, not inherited from the Tailwind reset: the height below is an outer height, and
       #content's matching padding-top depends on it staying one. */
    box-sizing: border-box;
    height: calc(3rem + var(--bf-inset-top));
    padding: calc(0.25rem + var(--bf-inset-top)) 0.5rem 0.25rem;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--surface-100);
    border-bottom: 1px solid var(--surface-200);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.25s ease;
}
/* Compact only: a round, always-reachable account button over the content, matching the
   floating status bar at the other end of the screen. */
.floating-connect {
    display: none;
    position: fixed;
    top: calc(0.5rem + var(--bf-inset-top));
    right: 0.75rem;
    z-index: 2002;
    max-width: 62vw;
    border-radius: 9999px;
    border: 1px solid var(--surface-200);
    background-color: color-mix(in srgb, var(--surface-100) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 4px 14px rgb(0 0 0 / 24%);
    overflow: hidden;
}

.floating-account {
    display: none;
    position: fixed;
    top: calc(0.5rem + var(--bf-inset-top));
    left: 0.75rem;
    z-index: 2002;
    border-radius: 9999px;
    border: 1px solid var(--surface-200);
    background-color: color-mix(in srgb, var(--surface-100) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 4px 14px rgb(0 0 0 / 24%);
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
body.mobile-app-shell {
    @media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
        .mobile-topbar {
            display: flex;
        }
        .floating-account,
        .floating-connect {
            display: block;
        }
        /* One reserved strip at the top, whether it holds the landing page's bar or just the
       floating account button. Without it a tab's title renders underneath that button. */
        #content {
            padding-top: calc(3rem + var(--bf-inset-top));
            /* The status bar floats over the content, so the last row needs somewhere to scroll to. */
            padding-bottom: calc(5.75rem + var(--bf-inset-bottom));
        }
    }
}
</style>
