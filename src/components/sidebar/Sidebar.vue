<template>
    <UNavigationMenu
        :items="visibleItems"
        orientation="vertical"
        :collapsed="isCompact"
        tooltip
        :ui="navMenuUi"
        class="sidebar-nav pb-2"
    />
    <div
        class="flex flex-row gap-1 border-t border-default pt-2 mt-auto items-center flex-wrap"
        :class="{ 'sidebar-footer--compact': isCompact }"
    >
        <UTooltip :text="`${t('settingsSearchTitle')} (Ctrl/Cmd + K)`" :delay-duration="300">
            <UButton
                icon="i-lucide-search"
                variant="ghost"
                color="neutral"
                square
                :aria-label="t('settingsSearchTitle')"
                @click="settingsSearchOpen = true"
                size="xs"
            />
        </UTooltip>
        <UTooltip :text="$t('sidebarOpenOptions')" :delay-duration="300">
            <UButton
                icon="i-lucide-settings"
                variant="ghost"
                color="neutral"
                square
                :aria-label="$t('sidebarOpenOptions')"
                @click="optionsOpen = true"
                size="xs"
            />
        </UTooltip>
        <UTooltip :text="$t('sidebarToggleDarkMode')" :delay-duration="300">
            <UButton
                :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
                variant="ghost"
                color="neutral"
                square
                :aria-label="$t('sidebarToggleDarkMode')"
                @click="toggleDarkMode"
                size="xs"
            />
        </UTooltip>
        <UTooltip :text="$t('sidebarToggleExpertMode')" :delay-duration="300">
            <UButton
                icon="i-lucide-wrench"
                :variant="expertModeOn ? 'soft' : 'ghost'"
                :color="expertModeOn ? 'primary' : 'neutral'"
                square
                :aria-label="$t('sidebarToggleExpertMode')"
                @click="toggleExpertMode"
                size="xs"
            />
        </UTooltip>
        <UTooltip :text="$t('logActionShow')" :delay-duration="300">
            <UButton
                :icon="sidebarItems.find((item) => item.key === 'log').icon"
                variant="ghost"
                color="neutral"
                square
                :aria-label="$t('logActionShow')"
                @click="logOpen = true"
                size="xs"
                :class="{ 'mr-auto': !isCompact }"
            />
        </UTooltip>
        <UserSession :is-compact="isCompact" />
    </div>
    <SettingsSearch v-model="settingsSearchOpen" :expert-mode="expertModeOn" @select="onSettingSelected" />
    <OptionsDialog v-model="optionsOpen" />
    <LogDialog v-model="logOpen" />
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";
import { useTranslation } from "i18next-vue";
import UserSession from "@/components/user-session/UserSession.vue";
import { sidebarItems } from "./sidebar_items.js";
import { useVisibleTabs } from "./useVisibleTabs.js";
import { useNavigationStore } from "@/stores/navigation";
import { vueTabState } from "@/js/vue_tab_mounter.js";
import { switchTab } from "@/js/tab_switch.js";
import { TABS } from "@/js/gui.js";
import DarkTheme, { setDarkTheme } from "@/js/DarkTheme.js";
import { get as getConfig, set as setConfig } from "@/js/ConfigStorage";
import { applyExpertMode } from "@/js/utils/applyExpertMode.js";
import { isExpertModeEnabled } from "@/js/utils/isExpertModeEnabled.js";
import { EventBus } from "@/components/eventBus.js";
import OptionsDialog from "@/components/dialogs/OptionsDialog.vue";
import LogDialog from "@/components/dialogs/LogDialog.vue";
import SettingsSearch from "@/components/settings-search/SettingsSearch.vue";

const { t } = useTranslation();
const settingsSearchOpen = ref(false);

function onSettingsSearchShortcut(event) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyK") {
        event.preventDefault();
        settingsSearchOpen.value = true;
    }
}
const sidebarExpanded = inject("sidebarExpanded", ref(true));
const closeMobileSidebar = inject("closeMobileSidebar", () => {});
const isCompact = computed(() => !sidebarExpanded.value);
const navMenuUi = computed(() => {
    const linkBase = "data-active:before:bg-primary/10 cursor-pointer";
    return {
        link: isCompact.value ? `${linkBase} justify-center` : linkBase,
    };
});
const activeItems = useVisibleTabs();

const visibleItems = computed(() =>
    activeItems.value.map((item) => ({
        label: t(item.i18n),
        icon: item.icon,
        active: vueTabState.activeTabName === (item.tab ?? item.key),
        tooltip: { text: t(item.i18n) },
        onSelect: (event) => {
            event?.preventDefault?.();
            switchTab(item.tab ?? item.key, { mode: item.mode, label: t(item.i18n) });
            closeMobileSidebar();
        },
    })),
);

// Options dialog
const optionsOpen = ref(false);
const navigationStore = useNavigationStore();
watch(
    () => navigationStore.optionsDialogOpen,
    (val) => {
        if (val) {
            optionsOpen.value = true;
            navigationStore.optionsDialogOpen = false;
        }
    },
);

// Log dialog
const logOpen = ref(false);
watch(
    () => navigationStore.logDialogOpen,
    (val) => {
        if (val) {
            logOpen.value = true;
            navigationStore.logDialogOpen = false;
        }
    },
);

// Re-sync isDark when the options dialog closes (user may have changed dark theme there).
watch(optionsOpen, (open) => {
    if (!open) {
        isDark.value = DarkTheme.enabled;
    }
});

// Dark mode toggle — seed from DarkTheme.configSetting (not reactive, update explicitly)
const isDark = ref(DarkTheme.enabled);

async function focusSetting(setting) {
    let subtabSelected = !setting.subtab;

    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!subtabSelected) {
            const tabComponent = TABS[setting.tab]?._vueComponent;

            if (typeof tabComponent?.selectSubtab === "function") {
                tabComponent.selectSubtab(setting.subtab);
                subtabSelected = true;
                continue;
            }
        }

        const rows = [...document.querySelectorAll("[data-setting-search-id]")];
        const target = rows.find((row) => row.dataset.settingSearchId === setting.searchId);

        if (!target) {
            continue;
        }

        let expandedUiBox = false;
        for (
            let uiBox = target.closest("[data-ui-box]");
            uiBox;
            uiBox = uiBox.parentElement?.closest("[data-ui-box]")
        ) {
            const toggle = uiBox.querySelector(':scope > [data-ui-box-toggle][aria-expanded="false"]');

            if (toggle) {
                toggle.click();
                expandedUiBox = true;
            }
        }

        if (expandedUiBox || target.offsetParent === null) {
            continue;
        }

        target.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });

        target.focus({ preventScroll: true });

        target.animate(
            [
                { boxShadow: "0 0 0 0 transparent" },
                { boxShadow: "0 0 0 3px var(--ui-primary)" },
                { boxShadow: "0 0 0 0 transparent" },
            ],
            {
                duration: 1800,
                easing: "ease-out",
            },
        );

        return;
    }
}

function onSettingSelected(setting) {
    const item = activeItems.value.find((sidebarItem) => (sidebarItem.tab ?? sidebarItem.key) === setting.tab);

    if (!item) {
        return;
    }

    switchTab(setting.tab, {
        mode: item.mode,
        label: t(item.i18n),
    });

    closeMobileSidebar();
    void focusSetting(setting);
}

function toggleDarkMode() {
    const colorTheme = getConfig("colorTheme", "yellow").colorTheme ?? "yellow";
    if (colorTheme === "contrast") {
        return;
    }
    const newValue = isDark.value ? 1 : 0;
    isDark.value = !isDark.value;
    setDarkTheme(newValue);
    setConfig({ darkTheme: newValue });
}

// Expert mode toggle — reactive via EventBus
const expertModeOn = ref(isExpertModeEnabled());

const onExpertModeChange = (enabled) => {
    expertModeOn.value = enabled;
};

function toggleExpertMode() {
    applyExpertMode(!expertModeOn.value);
}

onMounted(() => {
    expertModeOn.value = isExpertModeEnabled();
    isDark.value = DarkTheme.enabled;
    EventBus.$on("expert-mode-change", onExpertModeChange);
    window.addEventListener("keydown", onSettingsSearchShortcut);
});

onUnmounted(() => {
    EventBus.$off("expert-mode-change", onExpertModeChange);
    window.removeEventListener("keydown", onSettingsSearchShortcut);
});
</script>

<style scoped>
.sidebar-nav {
    width: 100%;
}

.sidebar-footer--compact {
    flex-direction: column;
    align-items: center;
}
</style>
