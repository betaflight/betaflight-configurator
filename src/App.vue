<template>
    <UApp>
        <div class="app-wrapper">
            <div id="background"></div>
            <div id="side_menu_swipe"></div>
            <UButton
                id="menu_btn"
                icon="i-lucide-menu"
                color="neutral"
                variant="soft"
                size="lg"
                square
                :aria-label="$t('openSidebarMenu')"
            />
            <div id="tab-content-container">
                <div class="tab_container">
                    <betaflight-logo
                        :configurator-version="CONFIGURATOR.getDisplayVersion()"
                        :firmware-version="FC.CONFIG.flightControllerVersion"
                        :firmware-id="FC.CONFIG.flightControllerIdentifier"
                        :hardware-id="FC.CONFIG.hardwareName"
                    ></betaflight-logo>
                    <ConnectButton />
                    <div id="tabs">
                        <ul class="mode-disconnected">
                            <li class="tab_landing" id="tab_landing">
                                <a href="#" i18n="tabLanding" class="tabicon ic_welcome" i18n_title="tabLanding"></a>
                            </li>
                            <li class="tab_help" id="tab_help">
                                <a href="#" i18n="tabHelp" class="tabicon ic_help" i18n_title="tabHelp"></a>
                            </li>
                            <li class="tab_options" id="tab_options">
                                <a href="#" i18n="tabOptions" class="tabicon ic_config" i18n_title="tabOptions"></a>
                            </li>
                            <li class="tab_firmware_flasher" id="tabFirmware">
                                <a
                                    href="#"
                                    i18n="tabFirmwareFlasher"
                                    class="tabicon ic_flasher"
                                    i18n_title="tabFirmwareFlasher"
                                ></a>
                            </li>
                            <li class="tab_preflight">
                                <a
                                    href="#"
                                    i18n="tabPreflight"
                                    class="tabicon ic_preflight"
                                    i18n_title="tabPreflight"
                                ></a>
                            </li>
                            <li class="tab_flight_plan" v-show="expertMode">
                                <a
                                    href="#"
                                    i18n="tabFlightPlan"
                                    class="tabicon ic_route"
                                    i18n_title="tabFlightPlan"
                                ></a>
                            </li>
                        </ul>
                        <ul class="mode-connected">
                            <li class="tab_setup">
                                <a href="#" i18n="tabSetup" class="tabicon ic_setup" i18n_title="tabSetup"></a>
                            </li>
                            <li class="tab_setup_osd">
                                <a href="#" i18n="tabSetupOSD" class="tabicon ic_setup" i18n_title="tabSetupOSD"></a>
                            </li>
                            <li class="tab_ports">
                                <a href="#" i18n="tabPorts" class="tabicon ic_ports" i18n_title="tabPorts"></a>
                            </li>
                            <li class="tab_configuration">
                                <a
                                    href="#"
                                    i18n="tabConfiguration"
                                    class="tabicon ic_config"
                                    i18n_title="tabConfiguration"
                                ></a>
                            </li>
                            <li class="tab_power">
                                <a href="#" i18n="tabPower" class="tabicon ic_power" i18n_title="tabPower"></a>
                            </li>
                            <li class="tab_failsafe" v-show="expertMode">
                                <a href="#" i18n="tabFailsafe" class="tabicon ic_failsafe" i18n_title="tabFailsafe"></a>
                            </li>
                            <li class="tab_presets">
                                <a href="#" i18n="tabPresets" class="tabicon ic_wizzard" i18n_title="tabPresets"></a>
                            </li>
                            <li class="tab_pid_tuning">
                                <a href="#" i18n="tabPidTuning" class="tabicon ic_pid" i18n_title="tabPidTuning"></a>
                            </li>
                            <li class="tab_receiver">
                                <a href="#" i18n="tabReceiver" class="tabicon ic_rx" i18n_title="tabReceiver"></a>
                            </li>
                            <li class="tab_auxiliary">
                                <a href="#" i18n="tabAuxiliary" class="tabicon ic_modes" i18n_title="tabAuxiliary"></a>
                            </li>
                            <li class="tab_adjustments" v-show="expertMode">
                                <a
                                    href="#"
                                    i18n="tabAdjustments"
                                    class="tabicon ic_adjust"
                                    i18n_title="tabAdjustments"
                                ></a>
                            </li>
                            <li
                                class="tab_servos"
                                v-show="
                                    ['USE_SERVOS', 'USE_WING'].some((opt) => FC.CONFIG?.buildOptions?.includes(opt))
                                "
                            >
                                <a href="#" i18n="tabServos" class="tabicon ic_servo" i18n_title="tabServos"></a>
                            </li>
                            <li class="tab_gps" v-show="FC.CONFIG?.buildOptions?.includes('USE_GPS')">
                                <a href="#" i18n="tabGPS" class="tabicon ic_gps" i18n_title="tabGPS"></a>
                            </li>
                            <li class="tab_motors">
                                <a
                                    href="#"
                                    i18n="tabMotorTesting"
                                    class="tabicon ic_motor"
                                    i18n_title="tabMotorTesting"
                                ></a>
                            </li>
                            <li
                                class="tab_osd"
                                v-show="
                                    FC.FEATURE_CONFIG?.features?.isEnabled &&
                                    FC.FEATURE_CONFIG.features.isEnabled('OSD')
                                "
                            >
                                <a href="#" i18n="tabOsd" class="tabicon ic_osd" i18n_title="tabOsd"></a>
                            </li>
                            <li class="tab_vtx">
                                <a href="#" i18n="tabVtx" class="tabicon ic_vtx" i18n_title="tabVtx"></a>
                            </li>
                            <li
                                class="tab_led_strip"
                                v-show="
                                    FC.FEATURE_CONFIG?.features?.isEnabled &&
                                    FC.FEATURE_CONFIG.features.isEnabled('LED_STRIP')
                                "
                            >
                                <a href="#" i18n="tabLedStrip" class="tabicon ic_led" i18n_title="tabLedStrip"></a>
                            </li>
                            <li class="tab_sensors" v-show="expertMode">
                                <a
                                    href="#"
                                    i18n="tabRawSensorData"
                                    class="tabicon ic_sensors"
                                    i18n_title="tabRawSensorData"
                                ></a>
                            </li>
                            <li class="tab_flight_plan" v-show="FC.CONFIG?.buildOptions?.includes('USE_FLIGHT_PLAN')">
                                <a
                                    href="#"
                                    i18n="tabFlightPlan"
                                    class="tabicon ic_route"
                                    i18n_title="tabFlightPlan"
                                ></a>
                            </li>
                            <li class="tab_logging" v-show="expertMode">
                                <a href="#" i18n="tabLogging" class="tabicon ic_log" i18n_title="tabLogging"></a>
                            </li>
                            <li class="tab_onboard_logging">
                                <a
                                    href="#"
                                    i18n="tabOnboardLogging"
                                    class="tabicon ic_data"
                                    i18n_title="tabOnboardLogging"
                                ></a>
                            </li>
                        </ul>
                        <ul class="mode-connected mode-connected-cli">
                            <li class="tab_cli">
                                <a href="#" i18n="tabCLI" class="tabicon ic_cli" i18n_title="tabCLI"></a>
                            </li>
                        </ul>
                        <ul class="mode-shared">
                            <li class="tab_log" v-show="expertMode">
                                <a
                                    href="#"
                                    i18n="tabLog"
                                    class="tabicon ic_log"
                                    i18n_title="tabLog"
                                    :aria-label="$t('tabLog')"
                                ></a>
                            </li>
                        </ul>
                        <ul class="mode-loggedin">
                            <li class="tab_backups">
                                <a href="#" i18n="tabBackups" class="tabicon ic_data" i18n_title="tabBackups"></a>
                            </li>
                            <li class="tab_user_profile">
                                <a
                                    href="#"
                                    i18n="tabUserProfile"
                                    class="tabicon ic_user"
                                    i18n_title="tabUserProfile"
                                ></a>
                            </li>
                        </ul>
                    </div>
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
import ConnectButton from "./components/port-picker/ConnectButton.vue";
import GlobalDialogs from "./components/dialogs/GlobalDialogs.vue";
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

// Read/write current vm via currentVm() so we track the same vm as the globals after window.vm is reassigned.
const expertMode = computed({
    get: () => Boolean(currentVm()?.expertMode),
    set: (value) => {
        const v = currentVm();
        if (v) {
            v.expertMode = value;
        }
    },
});

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
}
</style>
