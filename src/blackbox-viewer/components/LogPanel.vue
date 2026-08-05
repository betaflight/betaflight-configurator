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

<script setup>
import { useLogStore } from "../stores/log.js";
import { useGraphStore } from "../stores/graph.js";

const logStore = useLogStore();
const graphStore = useGraphStore();

function onLogIndexChange(val) {
    graphStore.selectLogIndex?.(val);
}
</script>
