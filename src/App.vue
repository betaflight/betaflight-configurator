<template>
    <UApp>
        <div class="app-wrapper">
            <div id="background" v-show="isRevealed" @click="isRevealed = false"></div>
            <div id="side_menu_swipe"></div>
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
                <div id="content">
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

/* Floating mobile menu trigger — shown only on narrow viewports. */
#menu_btn {
    display: none;
    position: fixed;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 2001;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    #menu_btn {
        display: inline-flex;
    }
    /* Push sidebar contents below the floating menu button when the drawer is open. */
    .tab_container.reveal {
        padding-top: 3.5rem;
    }
}
</style>
