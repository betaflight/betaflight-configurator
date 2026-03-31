<template>
    <dialog ref="dialogRef" class="dialogWait" @cancel.prevent>
        <div class="data-loading"></div>
        <h3 class="dialogWaitTitle">{{ title }}</h3>
        <div class="buttons" v-if="showCancel">
            <button type="button" class="dialogWait-cancelButton regular-button" @click="$emit('cancel')">
                {{ cancelText }}
            </button>
        </div>
    </dialog>
</template>

<script setup>
import { ref } from "vue";

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
.dialogWait:not([open]) {
    display: none;
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

.dialogWait::backdrop {
    background: rgba(0, 0, 0, 0.5);
}
</style>
