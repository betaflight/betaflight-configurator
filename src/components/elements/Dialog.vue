<template>
    <Teleport to="body">
        <dialog ref="dialogRef" class="dialog-modal" @close="handleClose">
            <div class="dialog-title-bar">
                <div class="dialog-title">
                    {{ title }}
                </div>
                <button
                    v-if="closeable"
                    class="dialog-close"
                    type="button"
                    :aria-label="$t('dialogClose')"
                    @click="close"
                >
                    <svg width="10" height="10" version="1.1" xmlns="http://www.w3.org/2000/svg">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="var(--surface-950)" stroke-width="2" />
                        <line x1="0" y1="10" x2="10" y2="0" stroke="var(--surface-950)" stroke-width="2" />
                    </svg>
                </button>
            </div>
            <div class="dialog-content">
                <slot></slot>
            </div>
        </dialog>
    </Teleport>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";

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

const dialogRef = ref(null);

const close = () => {
    if (dialogRef.value?.open) {
        dialogRef.value.close();
    }
};

const handleClose = () => {
    emit("update:modelValue", false);
    emit("close");
};

watch(
    () => props.modelValue,
    (newValue) => {
        if (!dialogRef.value) {
            return;
        }

        if (newValue) {
            // Only call showModal if dialog is not already open
            if (!dialogRef.value.open) {
                dialogRef.value.showModal();
            }
            // Reset scrolling
            const content = dialogRef.value.querySelector(".dialog-content");
            if (content) {
                content.scrollTop = 0;
            }
        } else {
            // Only call close if dialog is currently open
            if (dialogRef.value.open) {
                dialogRef.value.close();
            }
        }
    },
);

onMounted(() => {
    if (props.modelValue && dialogRef.value && !dialogRef.value.open) {
        dialogRef.value.showModal();
    }
});

defineExpose({
    close,
});
</script>

<style scoped>
.dialog-modal {
    border: none;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 0;
    max-width: 90vw;
    max-height: 90vh;
}

.dialog-modal::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
}

.dialog-title-bar {
    display: flex;
    height: 47px;
    background: var(--surface-300);
    border-bottom: 1px solid var(--surface-950);
}

.dialog-title {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 15px;
}

.dialog-close {
    flex: 0 0 47px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
}

.dialog-close:hover {
    background: var(--surface-400);
}

.dialog-content {
    padding: 20px;
    overflow-y: auto;
    max-height: calc(90vh - 47px);
}
</style>
