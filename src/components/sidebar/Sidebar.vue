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
    <OptionsDialog v-model="optionsOpen" />
    <LogDialog v-model="logOpen" />
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";
import { useTranslation } from "i18next-vue";
import UserSession from "@/components/user-session/UserSession.vue";
import { sidebarItems, isItemVisible } from "./sidebar_items.js";
import { useConnectionStore } from "@/stores/connection";
import { useNavigationStore } from "@/stores/navigation";
import { useAuthStore } from "@/stores/auth";
import { vueTabState } from "@/js/vue_tab_mounter.js";
import { switchTab } from "@/js/tab_switch.js";
import GUI from "@/js/gui.js";
import FCModule from "@/js/fc.js";
import DarkTheme, { setDarkTheme } from "@/js/DarkTheme.js";
import { get as getConfig, set as setConfig } from "@/js/ConfigStorage.js";
import { applyExpertMode } from "@/js/utils/applyExpertMode.js";
import { isExpertModeEnabled } from "@/js/utils/isExpertModeEnabled.js";
import { EventBus } from "@/components/eventBus.js";
import OptionsDialog from "@/components/dialogs/OptionsDialog.vue";
import LogDialog from "@/components/dialogs/LogDialog.vue";

const { t } = useTranslation();
const connectionStore = useConnectionStore();
const authStore = useAuthStore();
const sidebarExpanded = inject("sidebarExpanded", ref(true));
const closeMobileSidebar = inject("closeMobileSidebar", () => {});
const isCompact = computed(() => !sidebarExpanded.value);
const navMenuUi = computed(() => {
    const linkBase = "data-active:before:bg-primary/10 cursor-pointer";
    return {
        link: isCompact.value ? `${linkBase} justify-center` : linkBase,
    };
});
const betaflightModel = inject("betaflightModel", null);

const isModeVisible = (mode) => {
    switch (mode) {
        case "disconnected":
            return !connectionStore.connectionValid;
        case "connected":
        case "cli":
            return !!connectionStore.connectionValid;
        case "shared":
            return true;
        case "loggedin":
            return authStore.isLoggedIn;
        default:
            return false;
    }
};

const ctx = computed(() => {
    const model = betaflightModel ?? globalThis.vm;
    const fc = model?.FC ?? FCModule;
    return {
        expertMode: Boolean(model?.expertMode),
        buildOptions: fc?.CONFIG?.buildOptions,
        features: fc?.FEATURE_CONFIG?.features,
    };
});

const isAllowed = (item) => {
    if (item.mode === "loggedin" || item.mode === "shared") {
        return true;
    }
    return GUI.allowedTabs.includes(item.tab ?? item.key);
};

const activeItems = computed(() =>
    sidebarItems
        .filter((item) => isModeVisible(item.mode))
        .filter((item) => !item.hideInSidebar)
        .filter((item) => isAllowed(item))
        .filter((item) => isItemVisible(item, ctx.value)),
);

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
});

onUnmounted(() => {
    EventBus.$off("expert-mode-change", onExpertModeChange);
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
