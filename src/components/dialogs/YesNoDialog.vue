<template>
    <dialog ref="dialogRef" class="dialogYesNo" @cancel.prevent>
        <h3 class="dialogYesNoTitle">{{ title }}</h3>
        <div class="dialogYesNoContent" v-html="text"></div>
        <div class="buttons">
            <button type="button" class="dialogYesNo-yesButton regular-button" @click="$emit('yes')">
                {{ yesText }}
            </button>
            <button type="button" class="dialogYesNo-noButton regular-button" @click="$emit('no')">{{ noText }}</button>
        </div>
    </dialog>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    title: String,
    // Note: 'text' is rendered using v-html to support bolding/links in i18n messages.
    // Ensure that only trusted content (e.g. from i18n) is passed to this prop.
    text: String,
    yesText: String,
    noText: String,
});

defineEmits(["yes", "no"]);

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
.dialogYesNo:not([open]) {
    display: none;
}

.dialogYesNo {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
}

.dialogYesNo::backdrop {
    background: rgba(0, 0, 0, 0.5);
}
</style>
