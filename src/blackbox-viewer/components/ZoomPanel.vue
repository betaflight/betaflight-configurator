<template>
    <div class="toolbar-panel log-chart-zoom-panel">
        <h4>Zoom</h4>
        <div class="flex items-center gap-1">
            <USlider
                v-model="sliderPos"
                :min="0"
                :max="200"
                :step="1"
                class="w-20"
                title="Graph zoom level"
                @dblclick="$emit('zoom-change', 100)"
            />
            <UBadge color="neutral" variant="subtle" size="sm" class="font-mono min-w-[42px] justify-center">
                {{ graphStore.graphZoom }}%
            </UBadge>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { useGraphStore } from "../stores/graph.js";

const emit = defineEmits(["zoom-change"]);

const graphStore = useGraphStore();

// Piecewise-linear mapping: slider midpoint (100) = 100% zoom
// Left half  (0–100)  → 1%–100%
// Right half (100–200) → 100%–1000%
function posToZoom(pos) {
    if (pos <= 100) {
        return Math.round(1 + pos * 0.99);
    }
    return Math.round(100 + (pos - 100) * 9);
}

function zoomToPos(zoom) {
    if (zoom <= 100) {
        return Math.round((zoom - 1) / 0.99);
    }
    return Math.round(100 + (zoom - 100) / 9);
}

const sliderPos = computed({
    get: () => zoomToPos(graphStore.graphZoom),
    set: (pos) => emit("zoom-change", posToZoom(pos)),
});
</script>
