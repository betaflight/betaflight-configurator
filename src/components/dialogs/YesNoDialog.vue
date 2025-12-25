<template>
    <dialog class="dialogYesNo" open>
        <h3 class="dialogYesNoTitle">{{ title }}</h3>
        <div class="dialogYesNoContent" v-html="text"></div>
        <div class="buttons">
            <a href="#" class="dialogYesNo-yesButton regular-button" @click.prevent="$emit('yes')">{{ yesText }}</a>
            <a href="#" class="dialogYesNo-noButton regular-button" @click.prevent="$emit('no')">{{ noText }}</a>
        </div>
    </dialog>
    <div class="dialog-backdrop"></div>
</template>

<script setup>
defineProps({
    title: String,
    text: String,
    yesText: String,
    noText: String,
});

defineEmits(["yes", "no"]);
</script>

<style scoped>
/* Scoped styles mainly for the backdrop, reusing existing global dialog styles for the dialog itself */
.dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999; /* Below dialog, above content */
}

/* Ensure our Vue dialog sits above everything */
.dialogYesNo {
    display: block; /* Override default hidden dialog behavior since we control it with v-if in parent */
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
}
</style>
