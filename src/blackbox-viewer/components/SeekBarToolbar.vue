<template>
    <span id="seekbarToolbar" class="non-shift">
        <div id="seekbarType" class="seekBar-selection" title="Value to plot">
            <USelect v-model="seekbarType" :items="seekbarOptions" size="xs" class="w-full" />
        </div>
    </span>
</template>

<script setup>
import { computed } from "vue";
import { useGraphStore } from "../stores/graph.js";

const graphStore = useGraphStore();

const seekbarOptions = [
    { label: "Average motor throttle", value: "avgThrottle" },
    { label: "Maximum stick input", value: "maxRC" },
    { label: "Maximum motor differential", value: "maxMotorDiff" },
];

const seekbarType = computed({
    get: () => graphStore.seekBarMode || "avgThrottle",
    set: (val) => graphStore.setSeekBarMode?.(val),
});
</script>
