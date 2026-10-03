<!--
This file is part of Betaflight.

Betaflight is free software. You can redistribute this software
and/or modify this software under the terms of the GNU General
Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later
version.

Betaflight is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

See the GNU General Public License for more details.

You should have received a copy of the GNU General Public
License along with this software.

If not, see <http://www.gnu.org/licenses/>.
-->
<template>
    <UModal v-model:open="open" :title="t('settingsSearchTitle')">
        <template #body>
            <div class="flex flex-col gap-3">
                <UInput
                    v-model="query"
                    icon="i-lucide-search"
                    :placeholder="t('settingsSearchPlaceholder')"
                    :aria-label="t('settingsSearchTitle')"
                    autofocus
                    class="w-full"
                />

                <div v-if="query && results.length === 0" class="text-sm text-dimmed py-4 text-center">
                    {{ t("settingsSearchNoResults") }}
                </div>

                <div v-else class="flex flex-col gap-1 max-h-96 overflow-y-auto">
                    <UButton
                        v-for="result in results"
                        :key="result.searchId"
                        color="neutral"
                        variant="ghost"
                        class="justify-start text-left"
                        @click="selectSetting(result)"
                    >
                        <div class="flex flex-col items-start">
                            <span>{{ result.label }}</span>
                            <span class="text-xs text-dimmed">
                                {{ result.tabLabel }}
                                <span v-if="result.sectionLabel"> › {{ result.sectionLabel }} </span>
                            </span>
                        </div>
                    </UButton>
                </div>
            </div>
        </template>
    </UModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTranslation } from "i18next-vue";
import { settingsSearchIndex, type SettingsSearchEntry } from "virtual:settings-search-index";
import { sidebarItems } from "@/components/sidebar/sidebar_items.js";
import { useVisibleTabs } from "@/components/sidebar/useVisibleTabs.js";
import { useFlightControllerStore } from "@/stores/fc";
import {
    createConfigurationDynamicSearchEntries,
    filterSearchableSettings,
    rankSettings,
    readConfigurationDynamicSettings,
} from "./settingsSearch";

interface SearchResult extends SettingsSearchEntry {
    label: string;
    tabLabel: string;
    sectionLabel: string;
    matchScore?: number;
}

const props = withDefaults(
    defineProps<{
        modelValue?: boolean;
        expertMode?: boolean;
    }>(),
    {
        modelValue: false,
        expertMode: false,
    },
);

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    select: [setting: SettingsSearchEntry];
}>();

const { t } = useTranslation();
const visibleTabs = useVisibleTabs();
const fcStore = useFlightControllerStore();

const query = ref("");

const open = computed({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const dynamicConfigurationSettings = computed<SettingsSearchEntry[]>(() => {
    const features = fcStore.features.features;
    const beepers = fcStore.beepers.beepers;
    const dshotConditions = fcStore.beepers.dshotBeaconConditions;

    return createConfigurationDynamicSearchEntries({
        features: !features || typeof features === "number" ? [] : features.getFeatures(),
        beepers: readConfigurationDynamicSettings(beepers),
        dshotConditions: readConfigurationDynamicSettings(dshotConditions),
    });
});

const searchableSettings = computed<SearchResult[]>(() => {
    const visibleTabNames = new Set(visibleTabs.value.map((item) => item.tab ?? item.key));
    const indexedSettings = [...settingsSearchIndex, ...dynamicConfigurationSettings.value];

    return filterSearchableSettings(indexedSettings, visibleTabNames, props.expertMode).map((setting) => {
        const sidebarItem = sidebarItems.find((item) => (item.tab ?? item.key) === setting.tab);

        return {
            ...setting,
            label: t(setting.labelKey),
            tabLabel: sidebarItem ? t(sidebarItem.i18n) : setting.tab,
            sectionLabel: setting.sectionKey ? t(setting.sectionKey) : "",
        };
    });
});

const results = computed(() => rankSettings(searchableSettings.value, query.value));

function selectSetting(setting: SettingsSearchEntry) {
    emit("select", setting);
    open.value = false;
}
</script>
