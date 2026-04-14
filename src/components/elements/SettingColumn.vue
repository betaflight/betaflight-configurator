<template>
    <div class="flex flex-col gap-2">
        <div class="flex gap-2">
            <slot name="label"></slot>
            <span v-if="label" v-html="label"></span>
            <HelpIcon v-if="help" :text="help" class="text-dimmed" />
        </div>
        <slot name="default"></slot>
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
});
</script>
