<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <div v-html="text"></div>
        </template>
        <template #footer>
            <div class="flex justify-end w-full">
                <UButton @click="$emit('confirm')">{{ confirmText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: String,
    text: String,
    confirmText: {
        type: String,
        default: "OK",
    },
});

defineEmits(["confirm"]);

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
