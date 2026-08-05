<template>
    <div class="flex items-center gap-2">
        <slot name="default"></slot>
        <div class="flex items-center flex-1">
            <slot name="label"></slot>
            <span v-if="label" class="font-medium">{{ label }}</span>
        </div>
        <HelpIcon v-if="help" :text="help" class="text-dimmed" />
        <slot name="trailing"></slot>
    </div>
</template>

<script setup>
import HelpIcon from "./HelpIcon.vue";

defineProps({
    label: {
        type: String,
        default: "",
    },
    help: {
        type: String,
        default: "",
    },
});
</script>
