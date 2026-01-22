<template>
    <dialog class="dialogWait" open>
        <div class="data-loading"></div>
        <h3 class="dialogWaitTitle">{{ title }}</h3>
        <div class="buttons" v-if="showCancel">
            <a href="#" class="dialogWait-cancelButton regular-button" @click.prevent="$emit('cancel')">{{
                cancelText
            }}</a>
        </div>
    </dialog>
    <div class="dialog-backdrop"></div>
</template>

<script setup>
defineProps({
    title: String,
    showCancel: {
        type: Boolean,
        default: true,
    },
    cancelText: {
        type: String,
        default: () => globalThis.i18n?.getMessage("cancel"),
    },
});

defineEmits(["cancel"]);
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

.dialogWait {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
}
</style>
