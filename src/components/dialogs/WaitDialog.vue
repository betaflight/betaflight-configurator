<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <div class="flex justify-center py-2">
                <ProgressRing indeterminate :size="80" :stroke-width="6" color="primary" />
            </div>
        </template>
        <template v-if="showCancel" #footer>
            <div class="flex justify-end w-full">
                <UButton color="neutral" variant="soft" @click="$emit('cancel')">{{ cancelText }}</UButton>
            </div>
        </template>
    </UModal>
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

const open = ref(false);

const show = () => {
    open.value = true;
};

const close = () => {
    open.value = false;
};

defineExpose({
    show,
    close,
});
</script>
