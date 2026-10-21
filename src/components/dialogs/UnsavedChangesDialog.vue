<template>
    <UModal :open="open" :title="title" :close="false" :dismissible="false">
        <template #body>
            <div v-html="text"></div>
        </template>
        <template #footer>
            <div class="flex flex-wrap gap-2 justify-end w-full">
                <UButton color="neutral" variant="soft" @click="$emit('stay')">{{ stayText }}</UButton>
                <UButton color="error" variant="soft" @click="$emit('leave')">{{ leaveText }}</UButton>
                <UButton v-if="canSave" color="primary" @click="$emit('save')">{{ saveText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps({
    title: String,
    text: String,
    saveText: String,
    leaveText: String,
    stayText: String,
    /** False when the tab registered no save action, so only Leave and Stay are offered. */
    canSave: Boolean,
});

defineEmits(["save", "leave", "stay"]);

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
