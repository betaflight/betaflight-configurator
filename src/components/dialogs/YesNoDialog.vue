<template>
    <UModal :open="open" :title="title" :close="false" :dismissible="false">
        <template #body>
            <div v-html="text"></div>
        </template>
        <template #footer>
            <div class="flex gap-2 justify-end w-full">
                <UButton
                    :color="destructive ? 'primary' : 'neutral'"
                    :variant="destructive ? 'solid' : 'soft'"
                    @click="$emit('no')"
                >
                    {{ noText }}
                </UButton>
                <UButton :color="destructive ? 'error' : 'primary'" @click="$emit('yes')">{{ yesText }}</UButton>
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
    destructive: Boolean,
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
