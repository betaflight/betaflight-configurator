<template>
    <UTooltip :delayDuration="0" arrow :content="{ side: i18n.direction.value === 'rtl' ? 'left' : 'right' }">
        <div class="p-0.5 rounded-full hover:bg-neutral-100/30 cursor-pointer duration-100 w-fit">
            <UIcon name="i-lucide-circle-question-mark" class="size-4" />
        </div>
        <template #content>
            <div v-html="text"></div>
        </template>
    </UTooltip>
</template>

<script setup>
import { i18n } from "@/js/localization";

defineProps({
    text: {
        type: String,
        required: true,
    },
});
</script>
