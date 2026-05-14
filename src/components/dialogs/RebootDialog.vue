<template>
    <dialog ref="dialogRef" class="dialogReboot" @cancel.prevent>
        <div class="content">
            <div class="reboot-status">{{ status }}</div>
            <div class="reboot-progress-container">
                <div class="reboot-progress-bar" :style="{ width: progress + '%' }"></div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    status: {
        type: String,
        default: "Rebooting...",
    },
    progress: {
        type: Number,
        default: 0,
    },
});

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
.dialogReboot:not([open]) {
    display: none;
}

.dialogReboot {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;

    border: 1px solid var(--subtleAccent);
    border-radius: 5px;
    background-color: var(--surface-100);
    color: var(--text);
    padding: 20px;
    max-width: 400px;
    width: 100%;
}

.dialogReboot::backdrop {
    background: rgba(0, 0, 0, 0.5);
}

.reboot-progress-container {
    width: 100%;
    background-color: var(--surface-0);
    border-radius: 3px;
    margin: 15px 0 5px;
    height: 10px;
    overflow: hidden;
}

.reboot-progress-bar {
    height: 100%;
    background-color: var(--primary-500);
    transition: width 0.1s linear;
}

.reboot-status {
    text-align: center;
    margin: 10px 0;
}
</style>
