<template>
    <div v-if="dialogStore.activeDialog">
        <component
            :is="dialogComponents[dialogStore.activeDialog.type]"
            v-bind="dialogStore.activeDialog.props"
            v-on="dialogStore.activeDialog.listeners"
        />
    </div>
</template>

<script setup>
import { useDialogStore } from "@/stores/dialog";
import YesNoDialog from "./YesNoDialog.vue";

const dialogStore = useDialogStore();

const dialogComponents = {
    YesNoDialog,
};
</script>
