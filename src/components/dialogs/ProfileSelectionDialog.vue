<template>
    <dialog ref="dialogRef" class="dialogProfileSelection" @cancel.prevent>
        <h3 class="dialogProfileSelectionTitle">{{ title }}</h3>
        <div class="dialogProfileSelectionContent">
            <p>{{ message }}</p>
            <div class="profile-options">
                <label v-for="option in options" :key="option.value" class="profile-option">
                    <input type="radio" :value="option.value" v-model="selectedValue" name="profileSelection" />
                    <span>{{ option.label }}</span>
                </label>
            </div>
        </div>
        <div class="buttons">
            <button type="button" class="dialogProfileSelection-cancelButton regular-button" @click.prevent="cancel">
                {{ cancelText }}
            </button>
            <button
                type="button"
                class="dialogProfileSelection-confirmButton regular-button"
                :disabled="selectedValue === null"
                @click.prevent="confirm"
            >
                {{ confirmText }}
            </button>
        </div>
    </dialog>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
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

const dialogRef = ref(null);
const selectedValue = ref(null);

const show = () => {
    selectedValue.value = null;
    dialogRef.value?.showModal();
};

const close = () => {
    dialogRef.value?.close();
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
    dialog: dialogRef,
});
</script>

<style scoped>
.dialogProfileSelection {
    border: none;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    padding: 0;
    background: var(--boxBackground, #f5f5f5);
    color: var(--text, #000);
    max-width: 500px;
    width: 90vw;
}

.dialogProfileSelectionTitle {
    margin: 0;
    padding: 20px 20px 10px 20px;
    font-size: 18px;
    font-weight: bold;
    border-bottom: 1px solid var(--subtleAccent, #ddd);
}

.dialogProfileSelectionContent {
    padding: 20px;
}

.dialogProfileSelectionContent p {
    margin: 0 0 15px 0;
    line-height: 1.4;
}

.profile-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.profile-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.profile-option:hover {
    background: var(--hoverBackground, rgba(0, 0, 0, 0.05));
}

.profile-option input[type="radio"] {
    margin: 0;
}

.buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 15px 20px 20px 20px;
    border-top: 1px solid var(--subtleAccent, #ddd);
}

.buttons button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
}

.dialogProfileSelection-cancelButton {
    background: var(--buttonBackground, #f0f0f0);
    color: var(--text, #000);
}

.dialogProfileSelection-cancelButton:hover {
    background: var(--buttonHoverBackground, #e0e0e0);
}

.dialogProfileSelection-confirmButton {
    background: var(--accent, #007bff);
    color: var(--buttonText, #fff);
}

.dialogProfileSelection-confirmButton:hover:not(:disabled) {
    background: var(--accentHover, #0056b3);
}

.dialogProfileSelection-confirmButton:disabled {
    background: var(--disabledBackground, #ccc);
    cursor: not-allowed;
    opacity: 0.6;
}
</style>
