<template>
    <UModal
        :open="open"
        :title="status"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <UProgress :model-value="progress" :max="100" />
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    status: {
        type: String,
        default: "Rebooting...",
    },
    progress: {
        type: Number,
        default: 0,
    },
});

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
