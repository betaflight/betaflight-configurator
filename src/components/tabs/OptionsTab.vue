<template>
    <BaseTab tab-name="options">
        <div class="content_wrapper grid-box col1">
            <!-- Main Options Box -->
            <div class="gui_box">
                <div class="gui_box_titlebar">
                    <div class="spacer_box_title" v-html="$t('tabOptions')"></div>
                </div>
                <div class="spacer">
                    <!-- Remember Last Tab -->
                    <div class="rememberLastTab margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.rememberLastTab" />
                        </div>
                        <span class="freelabel" v-html="$t('rememberLastTab')"></span>
                    </div>

                    <!-- Metered Connection -->
                    <div class="meteredConnection margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.meteredConnection" />
                        </div>
                        <span class="freelabel" v-html="$t('meteredConnection')"></span>
                    </div>

                    <!-- Analytics Opt Out -->
                    <div class="analyticsOptOut margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.analyticsOptOut" />
                        </div>
                        <span class="freelabel" v-html="$t('analyticsOptOut')"></span>
                    </div>

                    <!-- CLI Auto Complete -->
                    <div class="cliAutoComplete margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.cliAutoComplete" />
                        </div>
                        <span class="freelabel" v-html="$t('cliAutoComplete')"></span>
                    </div>

                    <!-- Show Manual Mode -->
                    <div class="showManualMode margin-bottom">
                        <div>
                            <input
                                type="checkbox"
                                class="toggle"
                                v-model="settings.showManualMode"
                                data-setting="showManualMode"
                            />
                        </div>
                        <span class="freelabel" v-html="$t('showManualMode')"></span>
                    </div>

                    <!-- Show Virtual Mode -->
                    <div class="showVirtualMode margin-bottom">
                        <div>
                            <input
                                type="checkbox"
                                class="toggle"
                                v-model="settings.showVirtualMode"
                                data-setting="showVirtualMode"
                            />
                        </div>
                        <span class="freelabel" v-html="$t('showVirtualMode')"></span>
                    </div>

                    <!-- Show Dev Tools On Startup -->
                    <div class="showDevToolsOnStartup margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.showDevToolsOnStartup" />
                        </div>
                        <span class="freelabel" v-html="$t('showDevToolsOnStartup')"></span>
                    </div>

                    <!-- Show Notifications -->
                    <div class="showNotifications margin-bottom">
                        <div>
                            <input
                                type="checkbox"
                                class="toggle"
                                v-model="settings.showNotifications"
                                @change="handleNotificationsChange"
                            />
                        </div>
                        <span class="freelabel" v-html="$t('showNotifications')"></span>
                    </div>

                    <!-- Backup On Flash -->
                    <div class="backupOnFlash margin-bottom">
                        <select id="backupOnFlashSelect" v-model.number="settings.backupOnFlash">
                            <option value="0">{{ $t("firmwareBackupDisabled") }}</option>
                            <option value="1">{{ $t("firmwareBackupEnabled") }}</option>
                            <option value="2">{{ $t("firmwareBackupAsk") }}</option>
                        </select>
                        <span class="freelabel" v-html="$t('firmwareBackupOnFlash')"></span>
                    </div>
                </div>
            </div>

            <!-- Language and Appearance Box -->
            <div class="gui_box">
                <div class="gui_box_titlebar">
                    <div class="spacer_box_title" v-html="$t('languageAndAppearanceSettings')"></div>
                </div>
                <div class="spacer">
                    <!-- Use Legacy Rendering Model -->
                    <div class="useLegacyRenderingModel margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.useLegacyRenderingModel" />
                        </div>
                        <span class="freelabel" v-html="$t('useLegacyRenderingModel')"></span>
                    </div>

                    <!-- Dark Theme -->
                    <div class="darkTheme margin-bottom">
                        <select id="darkThemeSelect" v-model.number="settings.darkTheme">
                            <option value="0">{{ $t("on") }}</option>
                            <option value="1">{{ $t("off") }}</option>
                            <option value="2">{{ $t("auto") }}</option>
                        </select>
                        <span class="freelabel" v-html="$t('darkTheme')"></span>
                    </div>

                    <!-- Color Theme -->
                    <div class="colorTheme margin-bottom">
                        <select id="colorThemeSelect" v-model="settings.colorTheme">
                            <option value="yellow">{{ $t("colorThemeYellow") }}</option>
                            <option value="amber">{{ $t("colorThemeAmber") }}</option>
                            <option value="contrast">{{ $t("colorThemeContrast") }}</option>
                        </select>
                        <span class="freelabel" v-html="$t('colorTheme')"></span>
                    </div>

                    <!-- User Language -->
                    <div class="userLanguage">
                        <span class="dropdown">
                            <select class="dropdown-select" id="userLanguage" v-model="settings.userLanguage">
                                <option value="DEFAULT">{{ $t("language_default") }}</option>
                                <option disabled>------</option>
                                <option v-for="lang in availableLanguages" :key="lang" :value="lang">
                                    {{ $t(`language_${lang}`) }}
                                </option>
                            </select>
                        </span>
                        <span v-html="$t('userLanguageSelect')" class="freelabel"></span>
                    </div>
                </div>
            </div>

            <!-- Development Settings Box -->
            <div class="gui_box">
                <div class="gui_box_titlebar">
                    <div class="spacer_box_title" v-html="$t('developmentSettings')"></div>
                </div>
                <div class="spacer">
                    <div class="showAllSerialDevices margin-bottom">
                        <div>
                            <input
                                type="checkbox"
                                class="toggle"
                                v-model="settings.showAllSerialDevices"
                                data-setting="showAllSerialDevices"
                            />
                        </div>
                        <span class="freelabel" v-html="$t('showAllSerialDevices')"></span>
                    </div>

                    <div class="cliOnlyMode margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.cliOnlyMode" />
                        </div>
                        <span class="freelabel" v-html="$t('cliOnlyMode')"></span>
                    </div>

                    <div class="automaticDevOptions margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.automaticDevOptions" />
                        </div>
                        <span class="freelabel" v-html="$t('automaticDevOptions')"></span>
                    </div>
                </div>
            </div>

            <!-- Warning Settings Box -->
            <div class="gui_box">
                <div class="gui_box_titlebar">
                    <div class="spacer_box_title" v-html="$t('warningSettings')"></div>
                </div>
                <div class="spacer">
                    <div class="presetsWarningBackup margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.showPresetsWarningBackup" />
                        </div>
                        <span class="freelabel" v-html="$t('presetsWarningBackup')"></span>
                    </div>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, watch, onMounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { i18n } from "../../js/localization";
import PortHandler from "../../js/port_handler";
import CliAutoComplete from "../../js/CliAutoComplete";
import DarkTheme, { setDarkTheme } from "../../js/DarkTheme";
import { checkSetupAnalytics } from "../../js/Analytics";
import NotificationManager from "../../js/utils/notifications";
import { ispConnected } from "../../js/utils/connection";
import { DEFAULT_DEVELOPMENT_OPTIONS, resetDevelopmentOptions } from "../../js/utils/developmentOptions";

export default defineComponent({
    name: "OptionsTab",
    components: {
        BaseTab,
    },
    setup() {
        // Load initial settings from config storage
        const settings = reactive({
            rememberLastTab: !!getConfig("rememberLastTab").rememberLastTab,
            meteredConnection: !!getConfig("meteredConnection").meteredConnection,
            analyticsOptOut: !!getConfig("analyticsOptOut").analyticsOptOut,
            cliAutoComplete: CliAutoComplete.configEnabled,
            showManualMode: !!getConfig("showManualMode").showManualMode,
            showVirtualMode: !!getConfig("showVirtualMode").showVirtualMode,
            useLegacyRenderingModel: !!getConfig("useLegacyRenderingModel").useLegacyRenderingModel,
            darkTheme: DarkTheme.configSetting,
            colorTheme: getConfig("colorTheme", "yellow").colorTheme ?? "yellow",
            showDevToolsOnStartup: !!getConfig("showDevToolsOnStartup").showDevToolsOnStartup,
            showNotifications: !!getConfig("showNotifications").showNotifications,
            backupOnFlash: getConfig("backupOnFlash", 1).backupOnFlash ?? 1,
            userLanguage: i18n.selectedLanguage,
            showAllSerialDevices: !!getConfig("showAllSerialDevices").showAllSerialDevices,
            cliOnlyMode: !!getConfig("cliOnlyMode", false).cliOnlyMode,
            showPresetsWarningBackup: !!getConfig("showPresetsWarningBackup").showPresetsWarningBackup,
            automaticDevOptions: !!getConfig("automaticDevOptions", true).automaticDevOptions,
        });

        const availableLanguages = i18n.getLanguagesAvailables();

        // switchery workaround to refresh the toggles
        const refreshDevelopmentToggles = () => {
            nextTick(() => {
                const toggleSelectors = [
                    "[data-setting='showManualMode']",
                    "[data-setting='showVirtualMode']",
                    "[data-setting='showAllSerialDevices']",
                ];
                toggleSelectors.forEach((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                });
            });
        };

        // Watch each setting and persist changes
        watch(
            () => settings.rememberLastTab,
            (value) => setConfig({ rememberLastTab: value }),
        );

        watch(
            () => settings.meteredConnection,
            (value) => {
                setConfig({ meteredConnection: value });
                ispConnected(); // Update network status
            },
        );

        watch(
            () => settings.analyticsOptOut,
            (value) => {
                setConfig({ analyticsOptOut: value });
                checkSetupAnalytics((analyticsService) => {
                    analyticsService.setOptOut(value);
                });
            },
        );

        watch(
            () => settings.cliAutoComplete,
            (value) => {
                setConfig({ cliAutoComplete: value });
                CliAutoComplete.setEnabled(value);
            },
        );

        watch(
            () => settings.showManualMode,
            (value) => {
                setConfig({ showManualMode: value });
                PortHandler.setShowManualMode(value);
            },
        );

        watch(
            () => settings.showVirtualMode,
            (value) => {
                setConfig({ showVirtualMode: value });
                PortHandler.setShowVirtualMode(value);
            },
        );

        watch(
            () => settings.useLegacyRenderingModel,
            (value) => setConfig({ useLegacyRenderingModel: value }),
        );

        watch(
            () => settings.darkTheme,
            (value) => {
                setConfig({ darkTheme: value });
                setDarkTheme(value);
            },
        );

        watch(
            () => settings.colorTheme,
            (value) => {
                setConfig({ colorTheme: value });
                document.body.dataset.theme = value;

                // Contrast theme requires dark mode
                if (value === "contrast") {
                    settings.darkTheme = 0; // 0 = dark mode on
                    setConfig({ darkTheme: 0 });
                    setDarkTheme(0);
                }
            },
        );

        watch(
            () => settings.showDevToolsOnStartup,
            (value) => setConfig({ showDevToolsOnStartup: value }),
        );

        watch(
            () => settings.backupOnFlash,
            (value) => setConfig({ backupOnFlash: value }),
        );

        watch(
            () => settings.userLanguage,
            (value) => {
                i18n.changeLanguage(value);
                i18n.localizePage();
            },
        );

        watch(
            () => settings.showAllSerialDevices,
            (value) => {
                setConfig({ showAllSerialDevices: value });
                PortHandler.setShowAllSerialDevices(value);
            },
        );

        watch(
            () => settings.cliOnlyMode,
            (value) => setConfig({ cliOnlyMode: value }),
        );

        watch(
            () => settings.showPresetsWarningBackup,
            (value) => setConfig({ showPresetsWarningBackup: value }),
        );

        watch(
            () => settings.automaticDevOptions,
            (value) => {
                setConfig({ automaticDevOptions: value });

                // When disabled, reset development options to defaults
                if (!value) {
                    resetDevelopmentOptions();

                    // Update local reactive state to match
                    settings.showVirtualMode = DEFAULT_DEVELOPMENT_OPTIONS.showVirtualMode;
                    settings.showManualMode = DEFAULT_DEVELOPMENT_OPTIONS.showManualMode;
                    settings.showAllSerialDevices = DEFAULT_DEVELOPMENT_OPTIONS.showAllSerialDevices;
                    settings.backupOnFlash = DEFAULT_DEVELOPMENT_OPTIONS.backupOnFlash;
                    refreshDevelopmentToggles();
                }
            },
        );

        // Handle notifications permission flow
        function handleNotificationsChange() {
            const enabled = settings.showNotifications;

            if (enabled) {
                const informationDialog = {
                    title: i18n.getMessage("notificationsDeniedTitle"),
                    text: i18n.getMessage("notificationsDenied"),
                    buttonConfirmText: i18n.getMessage("OK"),
                };

                switch (NotificationManager.checkPermission()) {
                    case "granted":
                        setConfig({ showNotifications: enabled });
                        break;
                    case "denied":
                        GUI.showInformationDialog(informationDialog);
                        settings.showNotifications = false;
                        break;
                    case "default":
                        settings.showNotifications = false;
                        NotificationManager.requestPermission().then((permission) => {
                            if (permission === "granted") {
                                setConfig({ showNotifications: true });
                                settings.showNotifications = true;
                            } else {
                                GUI.showInformationDialog(informationDialog);
                            }
                        });
                        break;
                }
            } else {
                setConfig({ showNotifications: false });
            }
        }

        onMounted(() => {
            GUI.content_ready();
        });

        return {
            settings,
            availableLanguages,
            handleNotificationsChange,
        };
    },
});
</script>

<style scoped>
/* Inherit styles from existing options.html via global CSS */
</style>
