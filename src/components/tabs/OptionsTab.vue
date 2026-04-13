<template>
    <BaseTab tab-name="options">
        <div class="content_wrapper grid-box col1">
            <UiBox :title="$t('tabOptions')">
                <SettingRow :label="$t('expertMode')">
                    <USwitch v-model="settings.expertMode" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('rememberLastTab')">
                    <USwitch v-model="settings.rememberLastTab" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('meteredConnection')">
                    <USwitch v-model="settings.meteredConnection" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('analyticsOptOut')">
                    <USwitch v-model="settings.analyticsOptOut" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('cliAutoComplete')">
                    <USwitch v-model="settings.cliAutoComplete" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('showManualMode')">
                    <USwitch v-model="settings.showManualMode" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('showVirtualMode')">
                    <USwitch v-model="settings.showVirtualMode" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('showDevToolsOnStartup')">
                    <USwitch v-model="settings.showDevToolsOnStartup" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('showNotifications')">
                    <USwitch v-model="settings.showNotifications" @change="handleNotificationsChange" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('firmwareBackupOnFlash')">
                    <USelect
                        :items="[
                            { label: $t('firmwareBackupDisabled'), value: 0 },
                            { label: $t('firmwareBackupEnabled'), value: 1 },
                            { label: $t('firmwareBackupAsk'), value: 2 },
                        ]"
                        size="sm"
                        v-model="settings.backupOnFlash"
                        class="min-w-40"
                    />
                </SettingRow>
            </UiBox>

            <UiBox :title="$t('languageAndAppearanceSettings')">
                <SettingRow :label="$t('useLegacyRenderingModel')">
                    <USwitch v-model="settings.useLegacyRenderingModel" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('darkTheme')">
                    <USelect
                        :items="[
                            { label: $t('on'), value: 0 },
                            { label: $t('off'), value: 1 },
                            { label: $t('auto'), value: 2 },
                        ]"
                        size="sm"
                        v-model="settings.darkTheme"
                        class="min-w-40"
                    />
                </SettingRow>
                <SettingRow :label="$t('colorTheme')">
                    <USelect
                        :items="[
                            { label: $t('colorThemeYellow'), value: 'yellow' },
                            { label: $t('colorThemeAmber'), value: 'amber' },
                            { label: $t('colorThemeContrast'), value: 'contrast' },
                        ]"
                        size="sm"
                        v-model="settings.colorTheme"
                        class="min-w-40"
                    />
                </SettingRow>
                <!-- Includes "languages" icon to be noticeable even if the language is set incorrectly for the user -->
                <!-- Other input elements are unlikely to need an icon -->
                <SettingRow :label="$t('userLanguageSelect')">
                    <USelectMenu
                        v-model="settings.userLanguage"
                        value-key="value"
                        :items="[
                            { label: $t('language_default'), value: 'DEFAULT' },
                            { type: 'separator' },
                            ...availableLanguages.map((lang) => ({
                                label: $t(`language_${lang}`),
                                value: lang,
                            })),
                        ]"
                        size="sm"
                        leading-icon="i-lucide-languages"
                        :search-input="{
                            placeholder: $t('search'),
                            icon: 'i-lucide-search',
                        }"
                        class="min-w-48"
                        :ui="{ content: 'max-h-72' }"
                    />
                </SettingRow>
            </UiBox>

            <UiBox :title="$t('developmentSettings')">
                <SettingRow :label="$t('showAllSerialDevices')">
                    <USwitch v-model="settings.showAllSerialDevices" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('cliOnlyMode')">
                    <USwitch v-model="settings.cliOnlyMode" size="sm" />
                </SettingRow>
                <SettingRow :label="$t('automaticDevOptions')">
                    <USwitch v-model="settings.automaticDevOptions" size="sm" />
                </SettingRow>
            </UiBox>

            <UiBox :title="$t('warningSettings')">
                <SettingRow :label="$t('presetsWarningBackup')">
                    <USwitch v-model="settings.showPresetsWarningBackup" size="sm" />
                </SettingRow>
            </UiBox>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, watch, onMounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import { useDialog } from "@/composables/useDialog";
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
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";

export default defineComponent({
    name: "OptionsTab",
    components: {
        BaseTab,
        UiBox,
        SettingRow,
    },
    setup() {
        const dialog = useDialog();

        // Load initial settings from config storage
        const settings = reactive({
            rememberLastTab: !!getConfig("rememberLastTab").rememberLastTab,
            meteredConnection: !!getConfig("meteredConnection").meteredConnection,
            analyticsOptOut: !!getConfig("analyticsOptOut").analyticsOptOut,
            cliAutoComplete: CliAutoComplete.configEnabled,
            showManualMode: !!getConfig("showManualMode").showManualMode,
            showVirtualMode: !!getConfig("showVirtualMode").showVirtualMode,
            expertMode: !!getConfig("expertMode").expertMode,
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
            () => settings.expertMode,
            (value) => {
                setConfig({ expertMode: value });
                // Update global Vue expertMode state
                if (globalThis.vm) {
                    globalThis.vm.expertMode = value;
                }
            },
        );

        watch(
            () => settings.useLegacyRenderingModel,
            (value) => setConfig({ useLegacyRenderingModel: value }),
        );

        watch(
            () => settings.darkTheme,
            (value) => {
                // Contrast theme requires dark mode - prevent user from changing it
                if (settings.colorTheme === "contrast") {
                    settings.darkTheme = 0;
                    setConfig({ darkTheme: 0 });
                    setDarkTheme(0);
                    return;
                }

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
                        dialog.openInfo(informationDialog.title, informationDialog.text, {
                            confirmText: informationDialog.buttonConfirmText,
                        });
                        settings.showNotifications = false;
                        break;
                    case "default":
                        settings.showNotifications = false;
                        NotificationManager.requestPermission().then((permission) => {
                            if (permission === "granted") {
                                setConfig({ showNotifications: true });
                                settings.showNotifications = true;
                            } else {
                                dialog.openInfo(informationDialog.title, informationDialog.text, {
                                    confirmText: informationDialog.buttonConfirmText,
                                });
                            }
                        });
                        break;
                }
            } else {
                setConfig({ showNotifications: false });
            }
        }

        onMounted(() => {
            // Sync expert mode with global Vue state
            if (globalThis.vm) {
                globalThis.vm.expertMode = settings.expertMode;
            }
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
