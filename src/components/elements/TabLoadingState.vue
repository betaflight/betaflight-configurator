<template>
    <div class="flex items-center justify-center py-16">
        <UIcon name="i-lucide-loader-circle" :class="[size, 'animate-spin', colorClass]" />
        <slot></slot>
    </div>
</template>

<script>
import { defineComponent } from "vue";

export default defineComponent({
    name: "TabLoadingState",
    props: {
        size: {
            type: String,
            default: "size-5",
        },
        colorClass: {
            type: String,
            default: "text-[var(--color-primary-500)]",
        },
    },
});
</script>
