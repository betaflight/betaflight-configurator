<template>
    <dialog ref="dialogRef" class="dialogInteractive" @cancel.prevent>
        <h3 class="dialogInteractiveTitle">{{ title }}</h3>
        <div class="dialogInteractiveContent"></div>

        <div class="cli-response">
            <textarea id="cli-response" readonly rows="32" cols="96"></textarea>
        </div>

        <div class="cli-command">
            <input type="text" id="cli-command" :placeholder="commandPlaceholder" />
        </div>

        <div class="buttons">
            <button type="button" class="dialogInteractive-closeButton regular-button" @click.prevent="$emit('close')">
                {{ buttonCloseText }}
            </button>
        </div>
    </dialog>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: {
        type: String,
        default: "",
    },
    buttonCloseText: {
        type: String,
        default: "Close",
    },
    commandPlaceholder: {
        type: String,
        default: "Enter command here",
    },
});

defineEmits(["close"]);

const dialogRef = ref(null);

const show = () => {
    dialogRef.value?.showModal();
};

const close = () => {
    dialogRef.value?.close();
};

defineExpose({
    show,
    close,
    dialog: dialogRef,
});
</script>

<style scoped>
.dialogInteractive {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    width: fit-content;
}

.dialogInteractive::backdrop {
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}

.dialogInteractive:not([open]) {
    display: none;
}

.dialogInteractive-closeButton {
    margin: 0px;
}

.cli-command input {
    width: 100%;
    margin-top: 12px;
    margin-bottom: 12px;
}

.cli-response {
    margin-top: 12px;
    margin-bottom: 12px;
    white-space: pre-line;
    height: 100%;
    width: 100%;
}

.cli-response textarea {
    font-size: 11px;
    object-fit: contain;
}
</style>
