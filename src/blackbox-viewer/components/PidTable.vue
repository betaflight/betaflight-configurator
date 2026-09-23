<template>
    <UTable
        :data="data"
        :columns="columns"
        :ui="{
            thead: srOnly ? 'sr-only' : '',
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
            <span :class="{ 'opacity-40': row.original.missing }" class="font-medium text-left block">{{
                row.original.label
            }}</span>
        </template>
        <template #p-cell="{ row }">
            <span :class="{ 'opacity-40': row.original.missing }" class="text-center block">{{ row.original.p }}</span>
        </template>
        <template #i-cell="{ row }">
            <span :class="{ 'opacity-40': row.original.missing }" class="text-center block">{{ row.original.i }}</span>
        </template>
        <template v-if="showDMax" #dMax-cell="{ row }">
            <span :class="{ 'opacity-40': row.original.missing }" class="text-center block">{{
                row.original.dMax
            }}</span>
        </template>
        <template #d-cell="{ row }">
            <span :class="{ 'opacity-40': row.original.missing }" class="text-center block">{{ row.original.d }}</span>
        </template>
        <template #f-cell="{ row }">
            <span :class="{ 'opacity-40': row.original.missing }" class="text-center block">{{ row.original.f }}</span>
        </template>
    </UTable>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PropType } from "vue";

interface PidRow {
    label: string;
    p?: string | number;
    i?: string | number;
    d?: string | number;
    dMax?: string | number;
    f?: string | number;
    missing?: boolean;
}

const props = defineProps({
    rows: { type: Array as PropType<PidRow[]>, required: true },
    showDMax: { type: Boolean, default: false },
    srOnly: { type: Boolean, default: false },
});

function fmtPid(val: string | number | null | undefined) {
    if (val == null) {
        return "-";
    }
    return typeof val === "number" ? val.toFixed(0) : String(val);
}

const columns = computed(() => {
    const cols = [
        { accessorKey: "label", header: "Axis" },
        { accessorKey: "p", header: "P" },
        { accessorKey: "i", header: "I" },
    ];
    if (props.showDMax) {
        cols.push({ accessorKey: "dMax", header: "D Max" });
    }
    cols.push({ accessorKey: "d", header: "D" });
    if (!props.showDMax) {
        cols.push({ accessorKey: "_spacer", header: "" });
    }
    cols.push({ accessorKey: "f", header: "FF" });
    return cols;
});

const data = computed(() =>
    props.rows.map((row) => ({
        ...row,
        p: fmtPid(row.p),
        i: fmtPid(row.i),
        d: fmtPid(row.d),
        dMax: fmtPid(row.dMax),
        f: fmtPid(row.f),
        _spacer: "",
    })),
);
</script>
