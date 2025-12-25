<template>
    <dialog class="dialogReboot" open>
        <div class="content">
            <div class="reboot-status">{{ status }}</div>
            <div class="reboot-progress-container">
                <div class="reboot-progress-bar" :style="{ width: progress + '%' }"></div>
            </div>
        </div>
    </dialog>
    <div class="dialog-backdrop"></div>
</template>

<script setup>
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
    transition: width 0.1s linear;
}

.reboot-status {
    text-align: center;
    margin: 10px 0;
}
</style>
