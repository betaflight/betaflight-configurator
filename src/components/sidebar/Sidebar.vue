<template>
    <UNavigationMenu
        :items="visibleItems"
        orientation="vertical"
        :collapsed="isCompact"
        :tooltip="isCompact"
        class="sidebar-nav"
    />
</template>

<script setup>
import { computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useTranslation } from "i18next-vue";
import { sidebarItems } from "./sidebar_items.js";
import { useConnectionStore } from "@/stores/connection";
import { useAuthStore } from "@/stores/auth";
import { vueTabState } from "@/js/vue_tab_mounter.js";
import { switchTab } from "@/js/tab_switch.js";
import FC from "@/js/fc.js";

const { t } = useTranslation();
const connectionStore = useConnectionStore();
const authStore = useAuthStore();
const isCompact = useMediaQuery("(max-width: 575px)");

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

const ctx = computed(() => ({
    expertMode: Boolean(globalThis.vm?.expertMode),
    buildOptions: FC.CONFIG?.buildOptions,
    features: FC.FEATURE_CONFIG?.features,
}));

const activeItems = computed(() =>
    sidebarItems
        .filter((item) => isModeVisible(item.mode))
        .filter((item) => (item.visibleWhen ? item.visibleWhen(ctx.value) : true)),
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
