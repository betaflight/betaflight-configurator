<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <!-- Note: 'text' is rendered using v-html to support bolding/links in i18n messages.
                 Ensure that only trusted content (e.g. from i18n) is passed to this prop. -->
            <div v-html="text"></div>
        </template>
        <template #footer>
            <div class="flex gap-2 justify-end w-full">
                <UButton color="neutral" variant="soft" @click="$emit('no')">{{ noText }}</UButton>
                <UButton @click="$emit('yes')">{{ yesText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: String,
    text: String,
    yesText: String,
    noText: String,
});

defineEmits(["yes", "no"]);

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
