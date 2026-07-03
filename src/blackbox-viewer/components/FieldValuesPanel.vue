<template>
    <div
        v-show="graphStore.hasTableOverlay"
        class="fixed top-[135px] left-[15px] right-[15px] bottom-[80px] flex flex-col bg-default border border-default rounded-lg shadow-lg overflow-hidden"
    >
        <div class="flex items-center gap-3 px-4 py-2 border-b border-default shrink-0">
            <h4 class="flex-1 font-semibold">Field Values</h4>
            <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-x"
                label="Close"
                size="xs"
                @click="graphStore.hasTableOverlay = false"
            />
        </div>

        <div class="overflow-y-auto flex-1 p-4 font-mono text-xs">
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <UiBox
                    v-for="(chunk, ci) in valueChunks"
                    :key="ci"
                    :title="`Fields ${chunk[0]?.idx ?? ''} – ${chunk[chunk.length - 1]?.idx ?? ''}`"
                    collapsible
                >
                    <UTable
                        :data="chunk"
                        :columns="valueColumns"
                        :ui="{
                            thead: '',
                            base: 'w-full',
                            th: 'px-1 py-0.5 text-xs',
                            td: 'px-1 py-0.5 text-xs',
                            tr: 'border-b border-default',
                        }"
                    >
                        <template #name-cell="{ row }">
                            <span class="text-dimmed whitespace-nowrap">{{ row.original.name }}</span>
                        </template>
                        <template #raw-cell="{ row }">
                            <span class="font-medium tabular-nums text-right block">{{ row.original.raw }}</span>
                        </template>
                        <template #decoded-cell="{ row }">
                            <span class="tabular-nums text-right block">{{ row.original.decoded }}</span>
                        </template>
                    </UTable>
                </UiBox>
            </div>

            <UiBox title="Statistics" collapsible class="mt-4">
                <p class="text-dimmed mb-2">Min / max / mean values from this log</p>
                <UTable
                    :data="logStore.fieldStats"
                    :columns="statColumns"
                    :ui="{
                        thead: '',
                        base: 'w-full',
                        th: 'px-1 py-0.5 text-xs',
                        td: 'px-1 py-0.5 text-xs',
                        tr: 'border-b border-default',
                    }"
                >
                    <template #name-cell="{ row }">
                        <span class="text-dimmed whitespace-nowrap">{{ row.original.name }}</span>
                    </template>
                    <template #min-cell="{ row }">
                        <span class="font-medium tabular-nums">{{ row.original.min }}</span>
                    </template>
                    <template #max-cell="{ row }">
                        <span class="font-medium tabular-nums">{{ row.original.max }}</span>
                    </template>
                    <template #mean-cell="{ row }">
                        <span class="font-medium tabular-nums">{{ row.original.mean }}</span>
                    </template>
                </UTable>
            </UiBox>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { useLogStore } from "../stores/log.js";
import { useGraphStore } from "../stores/graph.js";
import UiBox from "./UiBox.vue";

const logStore = useLogStore();
const graphStore = useGraphStore();

const valueColumns = [
    { accessorKey: "name", header: "Field" },
    { accessorKey: "raw", header: "Raw" },
    { accessorKey: "decoded", header: "Decoded" },
];

const NUM_COLUMNS = 3;
const valueChunks = computed(() => {
    const data = logStore.fieldValues;
    if (!data.length) {
        return [];
    }
    const indexed = data.map((row, i) => ({ ...row, idx: i + 1 }));
    const size = Math.ceil(indexed.length / NUM_COLUMNS);
    const chunks = [];
    for (let i = 0; i < NUM_COLUMNS; i++) {
        const chunk = indexed.slice(i * size, (i + 1) * size);
        if (chunk.length) {
            chunks.push(chunk);
        }
    }
    return chunks;
});

const statColumns = [
    { accessorKey: "name", header: "Field" },
    { accessorKey: "min", header: "Min" },
    { accessorKey: "max", header: "Max" },
    { accessorKey: "mean", header: "Mean" },
];
</script>
