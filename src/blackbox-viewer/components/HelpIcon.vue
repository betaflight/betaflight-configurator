<template>
    <UTooltip :delay-duration="0" arrow :content="{ side: 'right' }">
        <div class="p-0.5 rounded-full hover:bg-elevated cursor-pointer duration-100 w-fit">
            <UIcon name="i-lucide-circle-help" class="size-4" />
        </div>
        <template #content>
            <div v-html="text" />
        </template>
    </UTooltip>
</template>

<script setup>
defineProps({
    text: { type: String, required: true },
});
</script>
