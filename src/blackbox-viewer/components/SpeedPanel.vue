<template>
    <div class="toolbar-panel log-playback-rate-panel">
        <h4>Speed</h4>
        <div class="flex items-center gap-1">
            <USlider
                v-model="sliderPos"
                :min="0"
                :max="200"
                :step="1"
                class="w-20"
                title="Playback speed"
                @dblclick="$emit('rate-change', 100)"
            />
            <UBadge color="neutral" variant="subtle" size="sm" class="font-mono min-w-[42px] justify-center">
                {{ playbackStore.playbackRate }}%
            </UBadge>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { usePlaybackStore } from "../stores/playback.js";

const emit = defineEmits(["rate-change"]);

const playbackStore = usePlaybackStore();

// Piecewise-linear mapping: slider midpoint (100) = 100% speed
// Left half  (0–100)  → 10%–100%
// Right half (100–200) → 100%–300%
function posToRate(pos) {
    if (pos <= 100) {
        return Math.round(10 + pos * 0.9);
    }
    return Math.round(100 + (pos - 100) * 2);
}

function rateToPos(rate) {
    if (rate <= 100) {
        return Math.round((rate - 10) / 0.9);
    }
    return Math.round(100 + (rate - 100) / 2);
}

const sliderPos = computed({
    get: () => rateToPos(playbackStore.playbackRate),
    set: (pos) => emit("rate-change", posToRate(pos)),
});
</script>
