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

<script setup>
import { computed, ref } from "vue";
import { useTranslation } from "i18next-vue";
import { settingsSearchIndex } from "virtual:settings-search-index";
import { sidebarItems } from "@/components/sidebar/sidebar_items.js";
import { useVisibleTabs } from "@/components/sidebar/useVisibleTabs.js";

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false,
    },
    expertMode: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(["update:modelValue", "select"]);

const { t } = useTranslation();
const visibleTabs = useVisibleTabs();

const query = ref("");

const open = computed({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const searchableSettings = computed(() => {
    const visibleTabNames = new Set(visibleTabs.value.map((item) => item.tab ?? item.key));

    return settingsSearchIndex
        .filter((setting) => visibleTabNames.has(setting.tab) && (!setting.expert || props.expertMode))
        .map((setting) => {
            const sidebarItem = sidebarItems.find((item) => (item.tab ?? item.key) === setting.tab);

            return {
                ...setting,
                label: t(setting.labelKey),
                tabLabel: sidebarItem ? t(sidebarItem.i18n) : setting.tab,
                sectionLabel: setting.sectionKey ? t(setting.sectionKey) : "",
            };
        });
});

const results = computed(() => {
    const search = query.value.trim().toLowerCase();

    if (!search) {
        return [];
    }

    return searchableSettings.value
        .map((setting) => {
            const label = setting.label.toLowerCase();
            const section = setting.sectionLabel.toLowerCase();
            const tabLabel = setting.tabLabel.toLowerCase();
            const labelKey = setting.labelKey.toLowerCase();
            const tab = setting.tab.toLowerCase();

            let matchScore = Number.POSITIVE_INFINITY;

            if (label === search) {
                matchScore = 0;
            } else if (label.startsWith(search)) {
                matchScore = 1;
            } else if (label.includes(search)) {
                matchScore = 2;
            } else if (section.startsWith(search)) {
                matchScore = 3;
            } else if (section.includes(search)) {
                matchScore = 4;
            } else if (tabLabel.startsWith(search)) {
                matchScore = 5;
            } else if (tabLabel.includes(search)) {
                matchScore = 6;
            } else if (labelKey.includes(search)) {
                matchScore = 7;
            } else if (tab.includes(search)) {
                matchScore = 8;
            }

            return { ...setting, matchScore };
        })
        .filter((setting) => Number.isFinite(setting.matchScore))
        .sort((a, b) => a.matchScore - b.matchScore || a.label.localeCompare(b.label))
        .slice(0, 30);
});

function selectSetting(setting) {
    emit("select", setting);
    open.value = false;
}
</script>
