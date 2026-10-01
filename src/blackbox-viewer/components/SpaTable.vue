<template>
    <UTable
        :data="data"
        :columns="columns"
        :ui="{
            base: 'w-full',
            th: 'py-1 px-1 text-xs text-center',
            td: 'py-0.5 px-1 text-xs',
            tr: 'border-b border-default',
        }"
    >
        <template #label-header>
            <span class="text-left block">Axis</span>
        </template>
        <template #label-cell="{ row }">
            <span class="font-medium text-left block">{{ row.original.label }}</span>
        </template>
        <template #mode-cell="{ row }">
            <span class="text-center block">{{ row.original.mode }}</span>
        </template>
        <template #center-cell="{ row }">
            <span class="text-center block">{{ row.original.center }}</span>
        </template>
        <template #width-cell="{ row }">
            <span class="text-center block">{{ row.original.width }}</span>
        </template>
    </UTable>
</template>

<script setup lang="ts">
import { computed } from "vue";

export interface SpaRow {
    label: string;
    mode: string | number | null;
    center: string | number | null;
    width: string | number | null;
}

const props = defineProps<{
    rows: SpaRow[];
}>();

function fmtSpa(val: string | number | null | undefined) {
    if (val == null) {
        return "-";
    }
    return typeof val === "number" ? val.toFixed(0) : String(val);
}

const columns = [
    { accessorKey: "label", header: "Axis" },
    { accessorKey: "mode", header: "Mode" },
    { accessorKey: "center", header: "Center" },
    { accessorKey: "width", header: "Width" },
];

const data = computed(() =>
    props.rows.map((row) => {
        const params = {
            ...row,
            mode: fmtSpa(row.mode),
            center: fmtSpa(row.center),
            width: fmtSpa(row.width),
        };
        return params;
    }),
);
</script>
