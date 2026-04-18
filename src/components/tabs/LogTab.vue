<template>
    <BaseTab tab-name="log">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabLog')"></div>
            <div class="log-toolbar">
                <UButton
                    icon="i-lucide-trash-2"
                    :label="$t('logActionClear')"
                    size="sm"
                    color="neutral"
                    variant="soft"
                    @click="onClear"
                />
                <label class="log-autoscroll">
                    <input type="checkbox" v-model="autoScroll" />
                    <span v-html="$t('logAutoScroll')"></span>
                </label>
            </div>
            <div ref="scrollArea" class="log-scroll">
                <p v-for="entry in entries" :key="entry.id" class="log-entry">
                    <span class="log-timestamp">{{ entry.timestamp }}</span>
                    <span class="log-message">{{ entry.message }}</span>
                </p>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import { useLogStore } from "../../stores/log";
import GUI from "../../js/gui";

const store = useLogStore();
const entries = computed(() => store.entries);
const autoScroll = ref(true);
const scrollArea = ref(null);

function scrollToBottom() {
    const el = scrollArea.value;
    if (el) {
        el.scrollTop = el.scrollHeight;
    }
}

function onClear() {
    store.clear();
}

watch(
    // Watch the newest entry id so auto-scroll keeps firing after the store caps at MAX_ENTRIES.
    () => entries.value[entries.value.length - 1]?.id,
    () => {
        if (!autoScroll.value) {
            return;
        }
        nextTick(scrollToBottom);
    },
);

onMounted(() => {
    nextTick(scrollToBottom);
    GUI.content_ready();
});
</script>

<style scoped lang="less">
.content_wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    gap: 0.5rem;
}

.log-toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
}

.log-autoscroll {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 12px;
    color: var(--text);
}

.log-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background-color: var(--surface-100);
    border: 1px solid var(--surface-400);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-family: "Courier New", Courier, monospace;
    font-size: 12px;
    line-height: 1.4;
}

.log-entry {
    margin: 0;
    padding: 0;
    color: var(--text);
    word-break: break-word;
    white-space: pre-wrap;
}

.log-timestamp {
    color: var(--quietHeader);
    margin-right: 0.5rem;
}
</style>
