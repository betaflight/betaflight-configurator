<template>
    <dialog class="dialogInformation" open>
        <h3 class="dialogInformationTitle">{{ title }}</h3>
        <div class="dialogInformationContent" v-html="text"></div>
        <div class="buttons">
            <a href="#" class="dialogInformation-confirmButton regular-button" @click.prevent="$emit('confirm')">{{
                confirmText
            }}</a>
        </div>
    </dialog>
    <div class="dialog-backdrop"></div>
</template>

<script setup>
defineProps({
    title: String,
    text: String,
    confirmText: {
        type: String,
        default: "OK",
    },
});

defineEmits(["confirm"]);
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

.dialogInformation {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
}
</style>
