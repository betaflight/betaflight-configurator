<template>
    <div class="flex items-center gap-2">
        <slot name="default"></slot>
        <div class="flex" :class="{ 'flex-1': fullWidth }">
            <slot name="label"></slot>
            <span v-if="label" v-html="label"></span>
        </div>
        <HelpIcon v-if="help" :text="help" class="text-dimmed" />
    </div>
</template>

<script setup>
import HelpIcon from "./HelpIcon.vue";

defineProps({
    label: {
        type: String,
        default: "",
        required: false,
    },
    help: {
        type: String,
        default: "",
        required: false,
    },
    fullWidth: {
        type: Boolean,
        default: false,
        required: false,
    },
});
</script>
