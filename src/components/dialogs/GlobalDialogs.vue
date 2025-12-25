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
import InformationDialog from "./InformationDialog.vue";
import WaitDialog from "./WaitDialog.vue";

const dialogStore = useDialogStore();

const dialogComponents = {
    YesNoDialog,
    InformationDialog,
    WaitDialog,
};
</script>
