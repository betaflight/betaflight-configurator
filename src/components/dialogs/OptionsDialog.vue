<template>
    <UModal
        v-model:open="open"
        :title="$t('tabOptions')"
        :ui="{ overlay: 'z-3000', content: 'max-w-4xl h-full z-3001' }"
    >
        <template #body>
            <div class="flex flex-col gap-4">
                <UiBox>
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
                    <SettingRow v-if="settings.expertMode" :label="$t('showVirtualMode')">
                        <USwitch v-model="settings.showVirtualMode" size="sm" />
                    </SettingRow>
                    <SettingRow :label="$t('showDevToolsOnStartup')">
                        <USwitch v-model="settings.showDevToolsOnStartup" size="sm" />
                    </SettingRow>
                    <SettingRow :label="$t('showNotifications')">
                        <USwitch v-model="settings.showNotifications" size="sm" />
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
                            :ui="{ content: 'z-3002' }"
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
                            :ui="{ content: 'z-3002' }"
                        />
                    </SettingRow>
                    <div class="flex flex-col gap-2 py-2">
                        <label for="options-dialog-ui-scale-slider" class="text-sm font-semibold">{{
                            $t("uiScale")
                        }}</label>
                        <div class="flex gap-1.5 flex-wrap">
                            <button
                                v-for="preset in [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5]"
                                :key="preset"
                                type="button"
                                :aria-pressed="settings.uiScale === preset"
                                class="px-2.5 py-1 text-xs rounded-full border cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-500)"
                                :class="
                                    settings.uiScale === preset
                                        ? 'bg-(--primary-500) border-(--primary-600) text-black font-semibold'
                                        : 'bg-(--surface-200) border-(--surface-400) text-(--text) hover:bg-(--surface-300)'
                                "
                                @click="settings.uiScale = preset"
                            >
                                {{ Math.round(preset * 100) }}%
                            </button>
                        </div>
                        <div class="flex items-center gap-2">
                            <input
                                id="options-dialog-ui-scale-slider"
                                type="range"
                                v-model.number="settings.uiScale"
                                :min="MIN_UI_SCALE"
                                :max="MAX_UI_SCALE"
                                step="0.01"
                                :aria-valuetext="`${Math.round(settings.uiScale * 100)}%`"
                                class="flex-1 accent-(--primary-500)"
                            />
                            <span class="text-sm font-semibold min-w-12 text-right"
                                >{{ Math.round(settings.uiScale * 100) }}%</span
                            >
                        </div>
                    </div>
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
                            :ui="{ content: 'max-h-72 z-3002' }"
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
        </template>
    </UModal>
</template>

<script setup>
import { computed, onUnmounted, reactive, watch } from "vue";
import { useDialog } from "@/composables/useDialog";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { applyUiScale, sanitizeUiScale, DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE } from "../../js/UiScale";
import { i18n } from "../../js/localization";
import PortHandler from "../../js/port_handler";
import CliAutoComplete from "../../js/CliAutoComplete";
import DarkTheme, { setDarkTheme } from "../../js/DarkTheme";
import { checkSetupAnalytics } from "../../js/Analytics";
import NotificationManager from "../../js/utils/notifications";
import { ispConnected } from "../../js/utils/connection";
import { DEFAULT_DEVELOPMENT_OPTIONS, resetDevelopmentOptions } from "../../js/utils/developmentOptions";
import { applyExpertMode } from "../../js/utils/applyExpertMode";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";

const props = defineProps({
    modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const dialog = useDialog();

const open = computed({
    get: () => props.modelValue,
    set: (v) => emit("update:modelValue", v),
});

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
    uiScale: sanitizeUiScale(getConfig("uiScale", DEFAULT_UI_SCALE).uiScale),
});

const availableLanguages = i18n.getLanguagesAvailables();

// Re-sync all config-backed settings when the dialog opens, so values changed
// externally (e.g. sidebar quick-toggles for dark/expert mode) are reflected.
const syncSettingsFromStorage = () => {
    settings.rememberLastTab = !!getConfig("rememberLastTab").rememberLastTab;
    settings.meteredConnection = !!getConfig("meteredConnection").meteredConnection;
    settings.analyticsOptOut = !!getConfig("analyticsOptOut").analyticsOptOut;
    settings.showManualMode = !!getConfig("showManualMode").showManualMode;
    settings.showVirtualMode = !!getConfig("showVirtualMode").showVirtualMode;
    settings.expertMode = !!getConfig("expertMode").expertMode;
    settings.useLegacyRenderingModel = !!getConfig("useLegacyRenderingModel").useLegacyRenderingModel;
    settings.darkTheme = DarkTheme.configSetting;
    settings.colorTheme = getConfig("colorTheme", "yellow").colorTheme ?? "yellow";
    settings.showDevToolsOnStartup = !!getConfig("showDevToolsOnStartup").showDevToolsOnStartup;
    settings.showNotifications = !!getConfig("showNotifications").showNotifications;
    settings.backupOnFlash = getConfig("backupOnFlash", 1).backupOnFlash ?? 1;
    settings.showAllSerialDevices = !!getConfig("showAllSerialDevices").showAllSerialDevices;
    settings.cliOnlyMode = !!getConfig("cliOnlyMode", false).cliOnlyMode;
    settings.showPresetsWarningBackup = !!getConfig("showPresetsWarningBackup").showPresetsWarningBackup;
    settings.automaticDevOptions = !!getConfig("automaticDevOptions", true).automaticDevOptions;
    settings.uiScale = sanitizeUiScale(getConfig("uiScale", DEFAULT_UI_SCALE).uiScale);
};

watch(open, (isOpen) => {
    if (isOpen) {
        syncSettingsFromStorage();
    }
});

watch(
    () => settings.rememberLastTab,
    (value) => setConfig({ rememberLastTab: value }),
);

watch(
    () => settings.meteredConnection,
    (value) => {
        setConfig({ meteredConnection: value });
        ispConnected();
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
        applyExpertMode(value);
    },
);

watch(
    () => settings.useLegacyRenderingModel,
    (value) => setConfig({ useLegacyRenderingModel: value }),
);

watch(
    () => settings.darkTheme,
    (value) => {
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
        if (value === "contrast") {
            settings.darkTheme = 0;
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
        if (!value) {
            resetDevelopmentOptions();
            settings.showVirtualMode = DEFAULT_DEVELOPMENT_OPTIONS.showVirtualMode;
            settings.showManualMode = DEFAULT_DEVELOPMENT_OPTIONS.showManualMode;
            settings.showAllSerialDevices = DEFAULT_DEVELOPMENT_OPTIONS.showAllSerialDevices;
            settings.backupOnFlash = DEFAULT_DEVELOPMENT_OPTIONS.backupOnFlash;
        }
    },
);

let uiScalePersistTimer = null;
let notificationRequestId = 0;

watch(
    () => settings.uiScale,
    (value) => {
        const uiScale = sanitizeUiScale(value);
        if (settings.uiScale !== uiScale) {
            settings.uiScale = uiScale;
            return;
        }
        applyUiScale(uiScale);
        clearTimeout(uiScalePersistTimer);
        uiScalePersistTimer = setTimeout(() => {
            setConfig({ uiScale });
        }, 150);
    },
);

onUnmounted(() => clearTimeout(uiScalePersistTimer));

watch(
    () => settings.showNotifications,
    (enabled) => {
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
                case "default": {
                    settings.showNotifications = false;
                    const reqId = ++notificationRequestId;
                    NotificationManager.requestPermission().then((permission) => {
                        if (reqId !== notificationRequestId) {
                            return;
                        }
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
            }
        } else {
            notificationRequestId++;
            setConfig({ showNotifications: false });
        }
    },
);
</script>
