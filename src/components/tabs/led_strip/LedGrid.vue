<template>
    <div
        ref="gridContainer"
        class="led-grid-container"
        :class="{ 'grid-wire': wireMode }"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseLeave"
    >
        <LedGridPoint
            v-for="(led, index) in gridLeds"
            :key="index"
            :led="led"
            :index="index"
            :wire-mode="wireMode"
            :is-selected="selectedIndices.has(index)"
            :hsv-to-color="hsvToColor"
            :led-colors="ledColors"
            :data-index="index"
            @mouseenter="onPointMouseEnter"
        />

        <!-- Selection box overlay -->
        <div v-if="isSelecting && selectionBox" class="selection-box" :style="selectionBoxStyle"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type PropType } from "vue";
import LedGridPoint from "./LedGridPoint.vue";
import type { LedGridCell } from "@/composables/useLedStrip";
import type { LedColor } from "@/stores/fc.types";

interface SelectionBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

const props = defineProps({
    gridLeds: {
        type: Array as PropType<LedGridCell[]>,
        required: true,
    },
    wireMode: {
        type: Boolean,
        default: false,
    },
    selectedIndices: {
        type: Set as PropType<Set<number>>,
        required: true,
    },
    hsvToColor: {
        type: Function as PropType<(color: LedColor | undefined) => string>,
        required: true,
    },
    ledColors: {
        type: Array as PropType<LedColor[]>,
        required: true,
    },
});

const emit = defineEmits<{
    "selection-change": [selection: Set<number>];
    "selection-end": [];
}>();

// Selection state
const gridContainer = ref<HTMLElement | null>(null);
const isSelecting = ref(false);
const selectionStart = ref<{ x: number; y: number } | null>(null);
const selectionBox = ref<SelectionBox | null>(null);
const isShiftPressed = ref(false);
const initialSelection = ref(new Set<number>());

// Handle keyboard events for shift key
const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Shift") {
        isShiftPressed.value = true;
    }
};

const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Shift") {
        isShiftPressed.value = false;
    }
};

// Start selection
const onMouseDown = (e: MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0 || !gridContainer.value) {
        return;
    }

    // Prevent default to avoid text selection
    e.preventDefault();

    const rect = gridContainer.value.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isSelecting.value = true;
    selectionStart.value = { x, y };
    selectionBox.value = { x1: x, y1: y, x2: x, y2: y };

    // Store initial selection if shift is pressed
    if (isShiftPressed.value) {
        initialSelection.value = new Set(props.selectedIndices);
    } else {
        // Clear selection if shift is not pressed
        initialSelection.value = new Set();
        emit("selection-change", new Set());
    }

    // Check if we clicked on a point
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-index]") : null;
    if (target) {
        const index = Number.parseInt(target.dataset.index ?? "", 10);
        if (!Number.isNaN(index)) {
            const newSelection = new Set(initialSelection.value);
            if (isShiftPressed.value && props.selectedIndices.has(index)) {
                newSelection.delete(index);
            } else {
                newSelection.add(index);
            }
            emit("selection-change", newSelection);
        }
    }
};

// Update selection during drag
const onMouseMove = (e: MouseEvent) => {
    if (!isSelecting.value || !selectionStart.value || !gridContainer.value) {
        return;
    }

    const rect = gridContainer.value.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update selection box
    selectionBox.value = {
        x1: Math.min(selectionStart.value.x, x),
        y1: Math.min(selectionStart.value.y, y),
        x2: Math.max(selectionStart.value.x, x),
        y2: Math.max(selectionStart.value.y, y),
    };

    // Find points in selection box
    updateSelection();
};

// Point mouse enter (for hover effect during drag)
const onPointMouseEnter = () => {
    if (isSelecting.value) {
        updateSelection();
    }
};

// Update selection based on current selection box
const updateSelection = () => {
    const box = selectionBox.value;
    const container = gridContainer.value;
    if (!box || !container) {
        return;
    }

    const newSelection = new Set(initialSelection.value);
    const points = container.querySelectorAll<HTMLElement>("[data-index]");

    points.forEach((point) => {
        const index = Number.parseInt(point.dataset.index ?? "", 10);
        if (Number.isNaN(index)) {
            return;
        }

        const rect = point.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const pointBox = {
            x1: rect.left - containerRect.left,
            y1: rect.top - containerRect.top,
            x2: rect.right - containerRect.left,
            y2: rect.bottom - containerRect.top,
        };

        // Check if point intersects with selection box
        const intersects = pointBox.x1 < box.x2 && pointBox.x2 > box.x1 && pointBox.y1 < box.y2 && pointBox.y2 > box.y1;

        if (intersects) {
            if (isShiftPressed.value && initialSelection.value.has(index)) {
                // Remove from selection if shift is pressed and was initially selected
                newSelection.delete(index);
            } else {
                // Add to selection
                newSelection.add(index);
            }
        } else if (!isShiftPressed.value || !initialSelection.value.has(index)) {
            // Remove from selection if not in box and not in initial selection
            newSelection.delete(index);
        }
    });

    emit("selection-change", newSelection);
};

// End selection
const onMouseUp = () => {
    if (isSelecting.value) {
        isSelecting.value = false;
        selectionStart.value = null;
        selectionBox.value = null;
        initialSelection.value = new Set();
        emit("selection-end");
    }
};

const onMouseLeave = () => {
    if (isSelecting.value) {
        onMouseUp();
    }
};

// Computed style for selection box
const selectionBoxStyle = computed(() => {
    if (!selectionBox.value) {
        return {};
    }

    const { x1, y1, x2, y2 } = selectionBox.value;
    return {
        left: `${x1}px`,
        top: `${y1}px`,
        width: `${x2 - x1}px`,
        height: `${y2 - y1}px`,
    };
});

// Mount/unmount event listeners
onMounted(() => {
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);
});

onUnmounted(() => {
    globalThis.removeEventListener("keydown", handleKeyDown);
    globalThis.removeEventListener("keyup", handleKeyUp);
});
</script>

<style scoped>
.led-grid-container {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    background-color: var(--surface-200);
    border: 1px solid var(--surface-500);
    user-select: none;
    cursor: crosshair;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    z-index: 1;
}

/* Ensure LED points are above grid sections */
.led-grid-container :deep(.gPoint) {
    position: relative;
    z-index: 2;
}

.led-grid-container.grid-wire {
    background: rgba(15, 171, 22, 0.5) !important;
}

.selection-box {
    position: absolute;
    background: color-mix(in srgb, var(--primary-500) 30%, transparent);
    border: 2px solid var(--primary-500);
    border-radius: 4px;
    pointer-events: none;
    z-index: 1000;
}
</style>
