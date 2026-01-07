<template>
    <dialog ref="dialogRef" class="dialogInformation" @cancel.prevent>
        <h3 class="dialogInformationTitle">{{ title }}</h3>
        <div class="dialogInformationContent" v-html="text"></div>
        <div class="buttons">
            <a href="#" class="dialogInformation-confirmButton regular-button" @click.prevent="$emit('confirm')">{{
                confirmText
            }}</a>
        </div>
    </dialog>
</template>

<script setup>
import { ref, defineExpose } from "vue";

defineProps({
    title: String,
    text: String,
    confirmText: {
        type: String,
        default: "OK",
    },
});

defineEmits(["confirm"]);

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
    // Expose the raw element just in case, though show/close should suffice
    dialog: dialogRef,
});
</script>

<style scoped>
.dialogInformation {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    border: none;
    padding: 0;
    /* Reset default dialog styles if needed, though scoped styles usually suffice */
}

/* Native backdrop styling */
.dialogInformation::backdrop {
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}

/* Hide the dialog when not open (native behavior handles this, but explicit hiding avoids FOUC in some cases if polyfilled, though native doesn't need it. 
   However, Vue might render it initially. Native <dialog> is hidden by default unless 'open' is present. 
   We removed 'open', so it should be hidden. 
   BUT: The previous CSS had `display: block`. We need to ensure that doesn't force it to show when closed. 
   Native dialogs have `display: none` by default. 
   The scoped style `.dialogInformation { display: block; ... }` overrides the user agent stylesheet.
   We need to fix this.
*/

.dialogInformation:not([open]) {
    display: none;
}
</style>
