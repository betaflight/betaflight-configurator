<template>
    <div class="progress-ring" :style="{ width: `${size}px`, height: `${size}px` }">
        <svg
            :width="size"
            :height="size"
            :viewBox="`0 0 ${size} ${size}`"
            class="progress-ring__svg"
            :class="{ 'progress-ring__svg--spin': indeterminate }"
        >
            <!-- background track -->
            <circle
                class="progress-ring__track"
                :cx="centre"
                :cy="centre"
                :r="radius"
                fill="none"
                :stroke-width="strokeWidth"
            />
            <!-- progress arc -->
            <circle
                class="progress-ring__fill"
                :cx="centre"
                :cy="centre"
                :r="radius"
                fill="none"
                :stroke-width="strokeWidth"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="dashOffset"
                stroke-linecap="round"
                :style="{ stroke: strokeColor }"
            />
        </svg>
        <div class="progress-ring__content">
            <slot>
                <span v-if="!indeterminate && progressPercent > 0" class="progress-ring__pct">
                    {{ progressPercent }}%
                </span>
            </slot>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
    value: {
        type: Number,
        default: 0,
    },
    max: {
        type: Number,
        default: 100,
    },
    color: {
        type: String,
        default: "primary",
        validator: (v) => ["primary", "success", "error"].includes(v),
    },
    size: {
        type: Number,
        default: 40,
    },
    strokeWidth: {
        type: Number,
        default: 4,
    },
    indeterminate: {
        type: Boolean,
        default: false,
    },
});

const centre = computed(() => props.size / 2);
const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const effectiveMax = computed(() => (Number.isFinite(props.max) && props.max > 0 ? props.max : 100));
const clampedValue = computed(() => {
    const v = Number.isFinite(props.value) ? props.value : 0;
    return Math.min(Math.max(v, 0), effectiveMax.value);
});
const progressRatio = computed(() => clampedValue.value / effectiveMax.value);
const progressPercent = computed(() => Math.round(progressRatio.value * 100));

const dashOffset = computed(() => {
    if (props.indeterminate) {
        // show ~75% arc that spins
        return circumference.value * 0.25;
    }
    return circumference.value * (1 - progressRatio.value);
});

const colorMap = {
    primary: "var(--primary-500)",
    success: "var(--success-500)",
    error: "var(--error-500)",
};

const strokeColor = computed(() => colorMap[props.color] ?? colorMap.primary);
</script>

<style scoped>
.progress-ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.progress-ring__svg {
    transform: rotate(-90deg);
}

.progress-ring__svg--spin {
    animation: ring-spin 0.8s linear infinite;
}

.progress-ring__track {
    stroke: var(--surface-400);
}

.progress-ring__fill {
    transition:
        stroke-dashoffset 0.35s ease,
        stroke 0.35s ease;
}

.progress-ring__content {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}

.progress-ring__pct {
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text);
    line-height: 1;
}

@keyframes ring-spin {
    to {
        transform: rotate(270deg);
    }
}
</style>
