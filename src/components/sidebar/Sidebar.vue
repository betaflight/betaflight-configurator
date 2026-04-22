<template>
    <UNavigationMenu
        :items="visibleItems"
        orientation="vertical"
        :collapsed="isCompact"
        tooltip
        :ui="navMenuUi"
        class="sidebar-nav"
    />
</template>

<script setup>
import { computed, inject, ref } from "vue";
import { useTranslation } from "i18next-vue";
import { sidebarItems, isItemVisible } from "./sidebar_items.js";
import { useConnectionStore } from "@/stores/connection";
import { useAuthStore } from "@/stores/auth";
import { vueTabState } from "@/js/vue_tab_mounter.js";
import { switchTab } from "@/js/tab_switch.js";
import GUI from "@/js/gui.js";
import FCModule from "@/js/fc.js";

const { t } = useTranslation();
const connectionStore = useConnectionStore();
const authStore = useAuthStore();
const sidebarExpanded = inject("sidebarExpanded", ref(true));
const isCompact = computed(() => !sidebarExpanded.value);
const navMenuUi = computed(() => (isCompact.value ? { link: "justify-center" } : {}));
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
        },
    })),
);
</script>

<style scoped>
.sidebar-nav {
    width: 100%;
}
</style>
