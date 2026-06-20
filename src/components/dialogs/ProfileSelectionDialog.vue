<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <div class="flex flex-col gap-4">
                <p>{{ message }}</p>
                <URadioGroup v-model="selectedValue" :items="options" />
            </div>
        </template>
        <template #footer>
            <div class="flex gap-2 justify-end w-full">
                <UButton color="neutral" variant="soft" @click="cancel">{{ cancelText }}</UButton>
                <UButton :disabled="selectedValue === null" @click="confirm">{{ confirmText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: String,
    message: String,
    options: Array,
    cancelText: {
        type: String,
        default: "Cancel",
    },
    confirmText: {
        type: String,
        default: "OK",
    },
});

const emit = defineEmits(["confirm", "cancel"]);

const open = ref(false);
const selectedValue = ref(null);

const show = () => {
    selectedValue.value = null;
    open.value = true;
};

const close = () => {
    open.value = false;
};

const confirm = () => {
    if (selectedValue.value !== null) {
        emit("confirm", selectedValue.value);
        close();
    }
};

const cancel = () => {
    emit("cancel");
    close();
};

defineExpose({
    show,
    close,
});
</script>
