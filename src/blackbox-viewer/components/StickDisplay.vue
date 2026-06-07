<template>
    <canvas ref="canvas" class="absolute" />
</template>

<script setup>
import { ref } from "vue";

const canvas = ref(null);

// Expose for legacy FlightLogSticks renderer
defineExpose({
    canvas,
});
</script>
