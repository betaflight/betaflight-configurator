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
    <div class="log-view">
        <div class="log-view__toolbar">
            <UButton
                icon="i-lucide-trash-2"
                :label="$t('logActionClear')"
                size="xs"
                color="neutral"
                variant="soft"
                @click="store.clear()"
            />
            <USwitch v-model="autoScroll" size="xs" :label="$t('logAutoScroll')" />
        </div>
        <UiBox class="log-view__box">
            <div ref="scrollArea" class="log-view__scroll">
                <p v-for="entry in store.entries" :key="entry.id" class="log-view__entry">
                    <span class="log-view__timestamp">{{ entry.timestamp }}</span>
                    <span v-html="entry.message"></span>
                </p>
            </div>
        </UiBox>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import { useLogStore } from "@/stores/log";

const store = useLogStore();
const autoScroll = ref(true);
const scrollArea = ref<HTMLElement | null>(null);

function scrollToBottom() {
    const el = scrollArea.value;
    if (el) {
        el.scrollTop = el.scrollHeight;
    }
}

watch(
    () => store.entries[store.entries.length - 1]?.id,
    () => {
        if (autoScroll.value) {
            nextTick(scrollToBottom);
        }
    },
);

onMounted(scrollToBottom);

defineExpose({ scrollToBottom });
</script>

<style lang="less">
.log-view {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    min-height: 0;

    .log-view__toolbar {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .log-view__box {
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .log-view__box > div:last-child {
        flex: 1;
        min-height: 0;
        padding: 0;
    }

    .log-view__scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0.5rem 0.75rem;
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
        line-height: 1.4;
        user-select: text;
    }

    .log-view__entry {
        margin: 0;
        color: var(--text);
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    .log-view__timestamp {
        color: var(--quietHeader);
        margin-inline-end: 0.5rem;
    }
}
</style>
