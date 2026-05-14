<template>
    <dialog ref="dialogRef" class="dialogRatesType" @cancel.prevent>
        <h3 class="dialogRatesTypeTitle">{{ title }}</h3>
        <div class="dialogRatesTypeContent" v-html="note"></div>
        <div class="buttons">
            <button type="button" class="dialogRatesType-confirmbtn regular-button" @click="confirmHandler">
                {{ confirmText }}
            </button>
            <button type="button" class="dialogRatesType-cancelbtn regular-button" @click="cancelHandler">
                {{ cancelText }}
            </button>
        </div>
    </dialog>
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

const dialogRef = ref(null);

const show = () => {
    dialogRef.value?.showModal();
};

const close = () => {
    dialogRef.value?.close();
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
    dialog: dialogRef,
});
</script>

<style scoped>
.dialogRatesType {
    width: fit-content;
    max-width: 400px;
}

.dialogRatesTypeContent {
    margin-bottom: 12px;
    margin-top: 12px;
    white-space: pre-line;
}

.dialogRatesType-confirmbtn {
    margin: 0;
    margin-right: 12px;
}

.dialogRatesType-cancelbtn {
    margin: 0;
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
