<template>
    <div v-if="dialogStore.activeDialog">
        <component
            ref="currentDialogRef"
            :is="dialogComponents[dialogStore.activeDialog.type]"
            v-bind="dialogStore.activeDialog.props"
            v-on="dialogStore.activeDialog.listeners"
        />
    </div>
</template>

<script setup>
import { useDialogStore } from "@/stores/dialog";
import { ref, watch, nextTick } from "vue";
import YesNoDialog from "./YesNoDialog.vue";
import InformationDialog from "./InformationDialog.vue";
import WaitDialog from "./WaitDialog.vue";
import RebootDialog from "./RebootDialog.vue";
import EscDshotDirectionDialog from "./EscDshotDirectionDialog.vue";

const dialogStore = useDialogStore();
const currentDialogRef = ref(null);

const dialogComponents = {
    YesNoDialog,
    InformationDialog,
    WaitDialog,
    RebootDialog,
    EscDshotDirectionDialog,
};

watch(
    () => dialogStore.activeDialog,
    async (newVal) => {
        if (newVal) {
            await nextTick();
            // Call show() if the component exposes it (for native dialogs)
            if (currentDialogRef.value?.show) {
                currentDialogRef.value.show();
            } else if (currentDialogRef.value?.dialog?.showModal) {
                // Fallback if the component exposes the raw dialog element but not a show method
                currentDialogRef.value.dialog.showModal();
            }
        }
    },
    { immediate: true },
);
</script>
