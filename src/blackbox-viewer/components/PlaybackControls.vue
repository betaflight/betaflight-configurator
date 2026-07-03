<template>
    <div class="toolbar-panel log-playback-panel">
        <h4>Playback</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                v-if="logStore.hasVideo"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="xs"
                title="Jump to start of video"
                @click="$emit('video-jump-start')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="xs"
                title="Jump to start of log"
                @click="$emit('jump-start')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-back"
                size="xs"
                title="Jump back"
                @click="$emit('step-back')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                :icon="playbackStore.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                size="xs"
                title="Play/Pause"
                @click="$emit('play-pause')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-forward"
                size="xs"
                title="Jump forward"
                @click="$emit('step-forward')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="xs"
                title="Jump to end of log"
                @click="$emit('jump-end')"
            />
            <UButton
                v-if="logStore.hasVideo"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="xs"
                title="Jump to end of video"
                @click="$emit('video-jump-end')"
            />
        </div>
    </div>
</template>

<script setup>
import { usePlaybackStore } from "../stores/playback.js";
import { useLogStore } from "../stores/log.js";

defineEmits([
    "jump-start",
    "jump-end",
    "step-back",
    "step-forward",
    "play-pause",
    "video-jump-start",
    "video-jump-end",
]);

const playbackStore = usePlaybackStore();
const logStore = useLogStore();
</script>
