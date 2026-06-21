<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'max-w-3xl w-[calc(100vw-2rem)] h-[80vh] z-3001' }"
    >
        <template #body>
            <div class="flex flex-col h-full gap-3">
                <!-- cli-response / cli-command are driven imperatively by gui.js via their ids;
                     kept as raw elements so the CLI panel's DOM hooks (textContent/value/onchange/focus) work. -->
                <textarea
                    id="cli-response"
                    class="cli-response flex-1 w-full"
                    readonly
                    :aria-label="$t('cliPanelTitle')"
                ></textarea>
                <input
                    id="cli-command"
                    class="cli-command w-full"
                    type="text"
                    :placeholder="commandPlaceholder"
                    :aria-label="$t('cliCommand')"
                />
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end w-full">
                <UButton @click="$emit('close')">{{ buttonCloseText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: {
        type: String,
        default: "",
    },
    buttonCloseText: {
        type: String,
        default: "Close",
    },
    commandPlaceholder: {
        type: String,
        default: "Enter command here",
    },
});

defineEmits(["close"]);

const open = ref(false);

const show = () => {
    open.value = true;
};

const close = () => {
    open.value = false;
};

defineExpose({
    show,
    close,
});
</script>

<style scoped>
.cli-response {
    min-height: 0;
    padding: 0.5rem 0.75rem;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.4;
    white-space: pre-line;
    resize: none;
    color: var(--text);
    background-color: var(--surface-0);
    border: 1px solid var(--subtleAccent);
    border-radius: 4px;
}

.cli-command {
    padding: 0.4rem 0.75rem;
    color: var(--text);
    background-color: var(--surface-0);
    border: 1px solid var(--subtleAccent);
    border-radius: 4px;
}
</style>
