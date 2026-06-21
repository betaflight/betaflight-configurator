<template>
    <UModal
        :open="modelValue"
        :title="title"
        :close="closeable"
        :dismissible="closeable"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
        @update:open="onOpenChange"
    >
        <template #body>
            <slot></slot>
        </template>
        <template v-if="$slots.footer" #footer>
            <div class="flex justify-end gap-2 w-full">
                <slot name="footer"></slot>
            </div>
        </template>
    </UModal>
</template>

<script setup>
const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false,
    },
    title: {
        type: String,
        required: true,
    },
    closeable: {
        type: Boolean,
        default: true,
    },
});

const emit = defineEmits(["update:modelValue", "close"]);

const onOpenChange = (open) => {
    emit("update:modelValue", open);
    if (!open) {
        emit("close");
    }
};

const close = () => {
    if (props.closeable) {
        emit("update:modelValue", false);
        emit("close");
    }
};

defineExpose({
    close,
});
</script>
