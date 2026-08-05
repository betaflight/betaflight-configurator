<template>
    <div class="flex flex-col gap-0.5">
        <div v-for="(item, i) in data" :key="i" class="flex items-center gap-1.5 text-xs py-0.5">
            <UIcon v-if="item.enabled" name="i-lucide-check" class="size-3.5 text-green-500 shrink-0" />
            <UIcon v-else name="i-lucide-minus" class="size-3.5 text-muted shrink-0" />
            <span class="font-medium whitespace-nowrap">{{ item.name }}</span>
            <span v-if="item.description" class="text-dimmed truncate">{{ item.description }}</span>
        </div>
    </div>
</template>

<script setup>
defineProps({
    data: { type: Array, required: true },
});
</script>
