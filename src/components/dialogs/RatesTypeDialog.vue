<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <div class="dialogRatesTypeContent" v-html="note"></div>
        </template>
        <template #footer>
            <div class="flex gap-2 justify-end w-full">
                <UButton color="neutral" variant="soft" @click="cancelHandler">{{ cancelText }}</UButton>
                <UButton @click="confirmHandler">{{ confirmText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    confirmText: { type: String, default: "Change" },
    cancelText: { type: String, default: "Cancel" },
});

const emit = defineEmits(["confirm", "cancel"]);

const open = ref(false);

const show = () => {
    open.value = true;
};

const close = () => {
    open.value = false;
};

const confirmHandler = () => {
    emit("confirm");
    close();
};

const cancelHandler = () => {
    emit("cancel");
    close();
};

defineExpose({
    show,
    close,
});
</script>

<style scoped>
.dialogRatesTypeContent {
    white-space: pre-line;
}

/* Warning message styling (note uses v-html, so target message-negative) */
.dialogRatesTypeContent :deep(.message-negative) {
    display: inline-block;
    color: var(--danger, #ff6666);
    background: rgba(255, 0, 0, 0.04);
    padding: 6px 8px;
    border-radius: 4px;
    font-weight: 600;
}
</style>
