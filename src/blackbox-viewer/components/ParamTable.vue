<template>
    <UTable
        :data="params"
        :columns="columns"
        :ui="{
            thead: 'sr-only',
            base: 'w-full',
            td: 'py-0.5 px-1 text-xs',
            tr: 'border-b border-default',
        }"
    >
        <template #name-cell="{ row }">
            <span :class="{ 'opacity-40': row.original.missing }" class="text-dimmed whitespace-nowrap">{{
                row.original.name
            }}</span>
        </template>
        <template #value-cell="{ row }">
            <span :class="[row.original.missing ? 'opacity-40' : 'font-medium', 'text-right block']">{{
                row.original.value ?? "-"
            }}</span>
        </template>
    </UTable>
</template>

<script setup>
defineProps({
    params: { type: Array, required: true },
});

const columns = [
    { accessorKey: "name", header: "Parameter" },
    { accessorKey: "value", header: "Value" },
];
</script>
