<template>
    <div class="toolbar-panel log-chart-time-panel">
        <h4>Time</h4>
        <div>
            <UInput
                :model-value="appStore.graphTimeDisplay"
                size="xs"
                class="w-24 font-mono"
                title="Enter a time to jump to"
                @change="onTimeChange"
            />
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from "../stores/app.js";

const emit = defineEmits(["time-change"]);
const appStore = useAppStore();

function onTimeChange(e) {
    emit("time-change", e.target.value);
}
</script>
