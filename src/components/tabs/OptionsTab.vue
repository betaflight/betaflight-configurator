<template>
    <BaseTab tab-name="options">
        <div class="content_wrapper grid-box col1">
            <!-- Main Options Box -->
            <div class="gui_box">
                <div class="gui_box_titlebar">
                    <div class="spacer_box_title" v-html="$t('tabOptions')"></div>
                </div>
                <div class="spacer">
                    <!-- Expert Mode -->
                    <div class="expertMode margin-bottom">
                        <div>
                            <input type="checkbox" class="toggle" v-model="settings.expertMode" />
                        </div>
                        <span class="freelabel" v-html="$t('expertMode')"></span>
                    </div>

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

                    <!-- UI Scale -->
                    <div class="uiScale margin-bottom">
                        <span class="freelabel uiScaleLabel" v-html="$t('uiScale')"></span>
                        <div class="uiScaleHint" v-html="$t('uiScaleHelp')"></div>
                        <div class="uiScalePresets">
                            <button
                                type="button"
                                class="regular-button uiScalePresetButton"
                                :class="{ active: settings.uiScale === 0.9 }"
                                @click="applyUiScalePreset(0.9)"
                            >
                                90%
                            </button>
                            <button
                                type="button"
                                class="regular-button uiScalePresetButton"
                                :class="{ active: settings.uiScale === 1 }"
                                @click="applyUiScalePreset(1)"
                            >
                                100%
                            </button>
                            <button
                                type="button"
                                class="regular-button uiScalePresetButton"
                                :class="{ active: settings.uiScale === 1.1 }"
                                @click="applyUiScalePreset(1.1)"
                            >
                                110%
                            </button>
                            <button
                                type="button"
                                class="regular-button uiScalePresetButton"
                                :class="{ active: settings.uiScale === 1.25 }"
                                @click="applyUiScalePreset(1.25)"
                            >
                                125%
                            </button>
                            <button
                                type="button"
                                class="regular-button uiScalePresetButton"
                                :class="{ active: settings.uiScale === 1.4 }"
                                @click="applyUiScalePreset(1.4)"
                            >
                                140%
                            </button>
                        </div>

                        <div class="uiScaleControls">
                            <input
                                id="uiScaleRange"
                                type="range"
                                v-model.number="settings.uiScale"
                                :min="minUiScale"
                                :max="maxUiScale"
                                step="0.01"
                            />
                            <input
                                id="uiScaleNumber"
                                type="number"
                                v-model.number="settings.uiScale"
                                :min="minUiScale"
                                :max="maxUiScale"
                                step="0.01"
                            />
                            <span class="uiScaleValue">{{ Math.round(settings.uiScale * 100) }}%</span>
                        </div>
                    </div>

                    <!-- Color Theme -->
                    <div class="colorTheme margin-bottom">
                        <select id="colorThemeSelect" v-model="settings.colorTheme">
                            <option value="yellow">{{ $t("colorThemeYellow") }}</option>
                            <option value="amber">{{ $t("colorThemeAmber") }}</option>
                            <option value="neon">{{ $t("colorThemeNeon") }}</option>
                            <option value="contrast">{{ $t("colorThemeContrast") }}</option>
                            <option disabled>────────</option>
                            <option value="custom">{{ $t("colorThemeCustom") }}</option>
                        </select>
                        <span class="freelabel" v-html="$t('colorTheme')"></span>
                    </div>

                    <div v-if="settings.colorTheme === 'custom'" class="customThemeEditor margin-bottom">
                        <div class="customThemeTitle" v-html="$t('customThemeEditorTitle')"></div>
                        <div class="customThemeHint" v-html="$t('customThemeLivePreviewHint')"></div>

                        <div class="customThemePresets">
                            <button
                                type="button"
                                class="regular-button customThemePresetButton"
                                @click="applyCustomThemePreset('graphite')"
                            >
                                {{ $t("customThemePresetGraphite") }}
                            </button>
                            <button
                                type="button"
                                class="regular-button customThemePresetButton"
                                @click="applyCustomThemePreset('ocean')"
                            >
                                {{ $t("customThemePresetOcean") }}
                            </button>
                            <button
                                type="button"
                                class="regular-button customThemePresetButton"
                                @click="applyCustomThemePreset('emerald')"
                            >
                                {{ $t("customThemePresetEmerald") }}
                            </button>
                        </div>

                        <div class="customThemeGrid">
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemePrimary") }}</span>
                                <input type="color" v-model="settings.customTheme.primary500" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemePrimaryDark") }}</span>
                                <input type="color" v-model="settings.customTheme.primary700" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemeSurface") }}</span>
                                <input type="color" v-model="settings.customTheme.surface100" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemeSurfaceDark") }}</span>
                                <input type="color" v-model="settings.customTheme.surface300" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemeText") }}</span>
                                <input type="color" v-model="settings.customTheme.text" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemeSuccess") }}</span>
                                <input type="color" v-model="settings.customTheme.success500" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemeWarning") }}</span>
                                <input type="color" v-model="settings.customTheme.warning500" />
                            </label>
                            <label class="customThemeField">
                                <span class="customThemeFieldLabel">{{ $t("customThemeError") }}</span>
                                <input type="color" v-model="settings.customTheme.error500" />
                            </label>
                        </div>

                        <div class="customThemeActions">
                            <button type="button" class="regular-button" @click="saveCustomTheme">
                                {{ $t("customThemeSave") }}
                            </button>
                            <button
                                type="button"
                                class="regular-button customThemeResetButton"
                                @click="resetCustomTheme"
                            >
                                {{ $t("customThemeReset") }}
                            </button>
                        </div>

                        <div
                            v-if="isCustomThemeDirty"
                            class="customThemeUnsavedWarning"
                            v-html="customThemeUnsavedWarningText"
                        ></div>
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
import { computed, defineComponent, reactive, ref, watch, onBeforeUnmount, onMounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import { useDialog } from "@/composables/useDialog";
import GUI from "../../js/gui";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { i18n } from "../../js/localization";
import PortHandler from "../../js/port_handler";
import CliAutoComplete from "../../js/CliAutoComplete";
import DarkTheme, { setDarkTheme } from "../../js/DarkTheme";
import { DEFAULT_CUSTOM_THEME, applyCustomTheme, clearCustomTheme, sanitizeCustomTheme } from "../../js/ColorTheme";
import { DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE, applyUiScale, sanitizeUiScale } from "../../js/UiScale";
import { checkSetupAnalytics } from "../../js/Analytics";
import NotificationManager from "../../js/utils/notifications";
import { ispConnected } from "../../js/utils/connection";
import { DEFAULT_DEVELOPMENT_OPTIONS, resetDevelopmentOptions } from "../../js/utils/developmentOptions";

const CUSTOM_THEME_PRESETS = {
    graphite: {
        primary500: "#94a3b8",
        primary700: "#64748b",
        surface100: "#141922",
        surface300: "#2a3140",
        text: "#e5e7eb",
        success500: "#34d399",
        warning500: "#fbbf24",
        error500: "#fb7185",
    },
    ocean: {
        primary500: "#0284c7",
        primary700: "#075985",
        surface100: "#f0f9ff",
        surface300: "#bae6fd",
        text: "#0c4a6e",
        success500: "#16a34a",
        warning500: "#f59e0b",
        error500: "#dc2626",
    },
    emerald: {
        primary500: "#22c55e",
        primary700: "#15803d",
        surface100: "#101915",
        surface300: "#1f2e27",
        text: "#e7f5ec",
        success500: "#34d399",
        warning500: "#fbbf24",
        error500: "#fb7185",
    },
};

function cloneCustomTheme(theme) {
    return structuredClone(theme);
}

export default defineComponent({
    name: "OptionsTab",
    components: {
        BaseTab,
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
            uiScale: sanitizeUiScale(getConfig("uiScale", DEFAULT_UI_SCALE).uiScale),
            colorTheme: getConfig("colorTheme", "yellow").colorTheme ?? "yellow",
            customTheme: sanitizeCustomTheme(getConfig("customTheme", DEFAULT_CUSTOM_THEME).customTheme),
            showDevToolsOnStartup: !!getConfig("showDevToolsOnStartup").showDevToolsOnStartup,
            showNotifications: !!getConfig("showNotifications").showNotifications,
            backupOnFlash: getConfig("backupOnFlash", 1).backupOnFlash ?? 1,
            userLanguage: i18n.selectedLanguage,
            showAllSerialDevices: !!getConfig("showAllSerialDevices").showAllSerialDevices,
            cliOnlyMode: !!getConfig("cliOnlyMode", false).cliOnlyMode,
            showPresetsWarningBackup: !!getConfig("showPresetsWarningBackup").showPresetsWarningBackup,
            automaticDevOptions: !!getConfig("automaticDevOptions", true).automaticDevOptions,
        });

        const savedCustomTheme = ref(sanitizeCustomTheme(settings.customTheme));
        const minUiScale = MIN_UI_SCALE;
        const maxUiScale = MAX_UI_SCALE;

        function serializeCustomTheme(theme) {
            const normalizedTheme = sanitizeCustomTheme(theme);
            return [
                normalizedTheme.primary500,
                normalizedTheme.primary700,
                normalizedTheme.surface100,
                normalizedTheme.surface300,
                normalizedTheme.text,
                normalizedTheme.success500,
                normalizedTheme.warning500,
                normalizedTheme.error500,
            ].join("|");
        }

        const isCustomThemeDirty = computed(
            () => serializeCustomTheme(settings.customTheme) !== serializeCustomTheme(savedCustomTheme.value),
        );

        function getLocaleMessageOrFallback(key, fallbackMessage) {
            const localizedMessage = i18n.getMessage(key);
            return localizedMessage && localizedMessage !== key ? localizedMessage : fallbackMessage;
        }

        const customThemeUnsavedWarningText = computed(() =>
            getLocaleMessageOrFallback(
                "customThemeUnsavedWarning",
                "Unsaved color changes. Click Save to keep them for next launch.",
            ),
        );

        const customThemeUnsavedBrowserWarningText = computed(() =>
            getLocaleMessageOrFallback(
                "customThemeUnsavedBrowserWarning",
                "You have unsaved custom theme color changes.",
            ),
        );

        function applyOrClearCustomTheme(themeInput = settings.customTheme) {
            const customTheme = sanitizeCustomTheme(themeInput);
            if (settings.colorTheme === "custom") {
                applyCustomTheme(customTheme);
            } else {
                clearCustomTheme();
            }

            return customTheme;
        }

        const availableLanguages = i18n.getLanguagesAvailables();

        if (settings.colorTheme === "custom") {
            settings.customTheme = applyOrClearCustomTheme(settings.customTheme);
        }

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
            () => settings.uiScale,
            (value) => {
                const uiScale = sanitizeUiScale(value);
                settings.uiScale = uiScale;
                setConfig({ uiScale });
                applyUiScale(uiScale);
            },
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

                if (value === "custom") {
                    settings.customTheme = applyOrClearCustomTheme(settings.customTheme);
                } else {
                    clearCustomTheme();
                }
            },
        );

        watch(
            () => settings.customTheme,
            (value) => {
                if (settings.colorTheme === "custom") {
                    applyOrClearCustomTheme(value);
                }
            },
            { deep: true },
        );

        function saveCustomTheme() {
            const customTheme = applyOrClearCustomTheme(settings.customTheme);
            const snapshot = cloneCustomTheme(customTheme);
            settings.customTheme = snapshot;
            savedCustomTheme.value = cloneCustomTheme(snapshot);
            setConfig({ customTheme: cloneCustomTheme(snapshot) });
        }

        function resetCustomTheme() {
            settings.customTheme = cloneCustomTheme(DEFAULT_CUSTOM_THEME);
            savedCustomTheme.value = cloneCustomTheme(settings.customTheme);
            setConfig({ customTheme: cloneCustomTheme(settings.customTheme) });
        }

        function applyCustomThemePreset(presetName) {
            const preset = CUSTOM_THEME_PRESETS[presetName];
            if (!preset) {
                return;
            }

            settings.customTheme = sanitizeCustomTheme(preset);
        }

        function applyUiScalePreset(value) {
            settings.uiScale = sanitizeUiScale(value);
        }

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
            window.addEventListener("beforeunload", handleBeforeUnload);
            GUI.content_ready();
        });

        onBeforeUnmount(() => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        });

        function handleBeforeUnload(event) {
            if (!isCustomThemeDirty.value) {
                return;
            }

            event.preventDefault();
            event.returnValue = customThemeUnsavedBrowserWarningText.value;
        }

        return {
            settings,
            availableLanguages,
            handleNotificationsChange,
            saveCustomTheme,
            resetCustomTheme,
            applyCustomThemePreset,
            applyUiScalePreset,
            minUiScale,
            maxUiScale,
            isCustomThemeDirty,
            customThemeUnsavedWarningText,
        };
    },
});
</script>

<style lang="less">
.tab-options {
    .freelabel {
        margin-left: 10px;
        position: relative;
    }
    .switchery {
        float: left;
    }
    .margin-bottom {
        margin-bottom: 10px;
        grid-template-columns: fit-content(300px) 1fr;
    }
    select {
        background: var(--surface-200);
        color: var(--text);
        border: 1px solid var(--surface-500);
        border-radius: 3px;
        width: fit-content;
    }

    .customThemeEditor {
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--surface-300);
        border-radius: 6px;
        background: var(--surface-100);
        color: var(--text);
    }

    .customThemeTitle {
        font-weight: 600;
    }

    .customThemeHint {
        color: var(--text);
        opacity: 0.75;
        font-size: 12px;
    }

    .customThemeGrid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    }

    .customThemeField {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid var(--surface-300);
        border-radius: 4px;
        background: var(--surface-100);
    }

    .customThemeFieldLabel {
        font-size: 12px;
        font-weight: 600;
        color: var(--text);
    }

    .customThemeField input[type="color"] {
        width: 34px;
        height: 24px;
        padding: 0;
        border: 1px solid var(--surface-500);
        border-radius: 4px;
        background: var(--surface-100);
        cursor: pointer;
    }

    .customThemeActions {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .customThemeUnsavedWarning {
        color: var(--warning-500);
        font-size: 12px;
        font-weight: 600;
    }

    .customThemeActions .regular-button {
        margin-top: 0;
        margin-bottom: 0;
        line-height: 24px;
        padding: 0 8px;
        font-size: 11px;
    }

    .customThemeActions .regular-button.customThemeResetButton {
        background-color: var(--primary-200);
        border: 1px solid var(--primary-600);
        color: var(--primary-contrast, #000);
    }

    .customThemeActions .regular-button.customThemeResetButton:hover {
        background-color: var(--primary-300);
    }

    .customThemePresets {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    .customThemePresets .customThemePresetButton.regular-button {
        margin: 0;
        padding: 0 10px;
        line-height: 24px;
        font-size: 11px;
        border-radius: 999px;
        background-color: var(--primary-100);
        border-color: var(--primary-600);
        color: var(--primary-900);
    }

    .customThemePresets .customThemePresetButton.regular-button:hover {
        background-color: var(--primary-200);
    }

    .uiScaleControls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 4px;
    }

    .uiScaleControls input[type="range"] {
        min-width: 240px;
        flex: 1 1 240px;
        accent-color: var(--primary-500);
    }

    .uiScaleControls input[type="number"] {
        width: 90px;
        min-width: 90px;
    }

    .uiScalePresets {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 2px 0 4px;
    }

    .uiScalePresetButton.regular-button {
        margin: 0;
        padding: 0 10px;
        line-height: 26px;
        font-size: 11px;
        border-radius: 999px;
        background-color: var(--primary-100);
        border-color: var(--primary-600);
        color: var(--primary-900);
        opacity: 0.92;
    }

    .uiScalePresetButton.regular-button:hover {
        background-color: var(--primary-200);
        opacity: 1;
    }

    .uiScalePresetButton.regular-button.active {
        background-color: var(--primary-500);
        border-color: var(--primary-600);
        color: var(--primary-contrast, #000);
        opacity: 1;
    }

    .uiScaleValue {
        min-width: 50px;
        font-weight: 600;
        color: var(--text);
    }

    .uiScale {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
        padding: 12px;
        border: 1px solid var(--surface-300);
        border-radius: 6px;
        background: var(--surface-100);
    }

    .uiScale .freelabel.uiScaleLabel {
        margin-left: 0;
        font-weight: 600;
    }

    .uiScaleHint {
        margin-top: 0;
        color: var(--text);
        opacity: 0.75;
        font-size: 12px;
    }
}
</style>
