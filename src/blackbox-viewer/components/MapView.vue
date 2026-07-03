<template>
    <div v-show="graphStore.hasMap" ref="mapContainer" class="absolute inset-0" />
</template>

<script setup>
import { ref } from "vue";
import { useGraphStore } from "../stores/graph.js";

const graphStore = useGraphStore();
const mapContainer = ref(null);

// Expose container for legacy MapGrapher
defineExpose({
    mapContainer,
});
</script>
