<template>
    <dialog ref="dialogRef" class="dialogWait" @cancel.prevent>
        <ProgressRing indeterminate :size="80" :stroke-width="6" color="primary" class="dialogWait-spinner" />
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
import { i18n } from "@/js/localization";
import ProgressRing from "../ProgressRing.vue";

defineProps({
    title: String,
    showCancel: {
        type: Boolean,
        default: true,
    },
    cancelText: {
        type: String,
        default: () => i18n.getMessage("cancel"),
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
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
}

.dialogWait-spinner {
    margin: 1rem auto;
}

.dialogWait::backdrop {
    background: rgba(0, 0, 0, 0.5);
}
</style>
