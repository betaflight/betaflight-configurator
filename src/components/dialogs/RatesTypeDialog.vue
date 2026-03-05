<template>
    <dialog class="dialogRatesType" open>
        <h3 class="dialogRatesTypeTitle">{{ title }}</h3>
        <div class="dialogRatesTypeContent" v-html="note"></div>
        <div class="buttons">
            <button type="button" class="dialogRatesType-confirmbtn regular-button" @click="$emit('confirm')">
                {{ confirmText }}
            </button>
            <button type="button" class="dialogRatesType-cancelbtn regular-button" @click="$emit('cancel')">
                {{ cancelText }}
            </button>
        </div>
    </dialog>
    <div class="dialog-backdrop"></div>
</template>

<script setup>
defineProps({
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    confirmText: { type: String, default: "Change" },
    cancelText: { type: String, default: "Cancel" },
});

defineEmits(["confirm", "cancel"]);
</script>

<style scoped>
.dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}

.dialogRatesType {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
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
