<template>
    <UModal v-model:open="open" :title="$t('tabLog')" :ui="{ overlay: 'z-3000', content: 'max-w-4xl h-full z-3001' }">
        <template #body>
            <div class="flex flex-col min-h-full">
                <div class="log-toolbar">
                    <UButton
                        icon="i-lucide-trash-2"
                        :label="$t('logActionClear')"
                        size="sm"
                        color="neutral"
                        variant="soft"
                        @click="onClear"
                    />
                    <div class="log-autoscroll">
                        <USwitch v-model="autoScroll" size="sm" :label="$t('logAutoScroll')" />
                    </div>
                </div>
                <UiBox class="log-box">
                    <div ref="scrollArea" class="log-scroll">
                        <p v-for="entry in entries" :key="entry.id" class="log-entry">
                            <span class="log-timestamp">{{ entry.timestamp }}</span>
                            <span class="log-message" v-html="entry.message"></span>
                        </p>
                    </div>
                </UiBox>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import UiBox from "../elements/UiBox.vue";
import { useLogStore } from "../../stores/log";

const props = defineProps({
    modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const store = useLogStore();
const entries = computed(() => store.entries);
const autoScroll = ref(true);
const scrollArea = ref(null);

const open = computed({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

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
    () => entries.value[entries.value.length - 1]?.id,
    () => {
        if (!autoScroll.value) {
            return;
        }
        nextTick(scrollToBottom);
    },
);

watch(open, (isOpen) => {
    if (isOpen) {
        nextTick(scrollToBottom);
    }
});
</script>

<style scoped lang="less">
.content_wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.log-dialog-body {
    height: min(75vh, 720px);
}

.log-toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
}

.log-autoscroll {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 12px;
    color: var(--text);
}

.log-box {
    display: flex;
    flex: 1;
    min-height: 0;
}

.log-box :deep(> div:last-child) {
    flex: 1;
    min-height: 0;
    padding: 0;
}

.log-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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
