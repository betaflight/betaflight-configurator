<template>
    <div v-if="logStore.logIndexEntries.length > 1" class="toolbar-panel log-select-panel">
        <h4>Log</h4>

        <USelect
            :model-value="logStore.activeLogIndex"
            :items="logStore.logIndexEntries"
            size="xs"
            class="w-56"
            title="Switch log"
            @update:model-value="onLogIndexChange"
        />
    </div>
</template>

<script setup lang="ts">
import { useLogStore } from "../stores/log";
import { useGraphStore } from "../stores/graph";

const logStore = useLogStore();
const graphStore = useGraphStore();

function onLogIndexChange(val: number) {
    graphStore.selectLogIndex?.(val);
}
</script>
