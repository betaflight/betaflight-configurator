<template>
    <div class="orientation-diagram">
        <div class="orientation-quad" :style="{ transform: transforms[step] }">
            <svg viewBox="-80 -80 160 160" xmlns="http://www.w3.org/2000/svg">
                <!-- Arms -->
                <line x1="-12" y1="-12" x2="-42" y2="-42" stroke="#888" stroke-width="5" stroke-linecap="round" />
                <line x1="12" y1="-12" x2="42" y2="-42" stroke="#888" stroke-width="5" stroke-linecap="round" />
                <line x1="-12" y1="12" x2="-42" y2="42" stroke="#888" stroke-width="5" stroke-linecap="round" />
                <line x1="12" y1="12" x2="42" y2="42" stroke="#888" stroke-width="5" stroke-linecap="round" />

                <!-- Body -->
                <rect x="-15" y="-15" width="30" height="30" rx="4" fill="#666" />

                <!-- Front motors (red = front) -->
                <circle cx="-42" cy="-42" r="14" fill="none" stroke="#ef4444" stroke-width="2" />
                <circle cx="42" cy="-42" r="14" fill="none" stroke="#ef4444" stroke-width="2" />

                <!-- Rear motors -->
                <circle cx="-42" cy="42" r="14" fill="none" stroke="#888" stroke-width="2" />
                <circle cx="42" cy="42" r="14" fill="none" stroke="#888" stroke-width="2" />

                <!-- Front direction arrow -->
                <polygon points="0,-24 -6,-17 6,-17" fill="#ef4444" />
            </svg>
        </div>

        <!-- Circular rotation arrow overlay -->
        <svg class="rotation-arrow" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="rot-arrow" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="var(--primary-500)" />
                </marker>
            </defs>
            <path
                d="M 115,30 A 55,55 0 1,1 30,45"
                fill="none"
                stroke="var(--primary-500)"
                stroke-width="2"
                stroke-dasharray="6,3"
                marker-end="url(#rot-arrow)"
                opacity="0.6"
            />
        </svg>
    </div>
</template>

<script setup>
defineProps({
    step: {
        type: Number,
        default: 0,
    },
});

const transforms = [
    "perspective(400px) rotateX(30deg)", // Level
    "perspective(400px) rotateX(70deg)", // Nose down
    "perspective(400px) rotateX(-15deg)", // Nose up
    "perspective(400px) rotateX(20deg) rotateY(50deg)", // Left side down
    "perspective(400px) rotateX(20deg) rotateY(-50deg)", // Right side down
    "perspective(400px) rotateX(30deg) rotateZ(180deg)", // Inverted
];
</script>

<style scoped>
.orientation-diagram {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    max-height: 260px;
}

.orientation-quad {
    width: 75%;
    transition: transform 0.5s ease;
}

.orientation-quad svg {
    width: 100%;
    height: 100%;
    display: block;
}

.rotation-arrow {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
</style>
