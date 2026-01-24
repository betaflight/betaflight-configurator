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
            :data-index="index"
            @mouseenter="onPointMouseEnter"
        />

        <!-- Selection box overlay -->
        <div v-if="isSelecting && selectionBox" class="selection-box" :style="selectionBoxStyle"></div>
    </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from "vue";
import LedGridPoint from "./LedGridPoint.vue";

const props = defineProps({
    gridLeds: {
        type: Array,
        required: true,
    },
    wireMode: {
        type: Boolean,
        default: false,
    },
    selectedIndices: {
        type: Set,
        required: true,
    },
});

const emit = defineEmits(["selection-change", "selection-end"]);

// Selection state
const gridContainer = ref(null);
const isSelecting = ref(false);
const selectionStart = ref(null);
const selectionBox = ref(null);
const isShiftPressed = ref(false);
const initialSelection = ref(new Set());

// Handle keyboard events for shift key
const handleKeyDown = (e) => {
    if (e.key === "Shift") {
        isShiftPressed.value = true;
    }
};

const handleKeyUp = (e) => {
    if (e.key === "Shift") {
        isShiftPressed.value = false;
    }
};

// Start selection
const onMouseDown = (e) => {
    // Only handle left mouse button
    if (e.button !== 0) {
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
    const target = e.target.closest("[data-index]");
    if (target) {
        const index = parseInt(target.getAttribute("data-index"));
        if (!isNaN(index)) {
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
const onMouseMove = (e) => {
    if (!isSelecting.value || !selectionStart.value) {
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
    if (!selectionBox.value || !gridContainer.value) {
        return;
    }

    const newSelection = new Set(initialSelection.value);
    const points = gridContainer.value.querySelectorAll("[data-index]");

    points.forEach((point) => {
        const index = parseInt(point.getAttribute("data-index"));
        if (isNaN(index)) {
            return;
        }

        const rect = point.getBoundingClientRect();
        const containerRect = gridContainer.value.getBoundingClientRect();

        const pointBox = {
            x1: rect.left - containerRect.left,
            y1: rect.top - containerRect.top,
            x2: rect.right - containerRect.left,
            y2: rect.bottom - containerRect.top,
        };

        // Check if point intersects with selection box
        const intersects =
            pointBox.x1 < selectionBox.value.x2 &&
            pointBox.x2 > selectionBox.value.x1 &&
            pointBox.y1 < selectionBox.value.y2 &&
            pointBox.y2 > selectionBox.value.y1;

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
import { onMounted, onUnmounted } from "vue";

onMounted(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
});

onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
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
    background: rgba(52, 155, 255, 0.3);
    border: 2px solid var(--primary-500);
    border-radius: 4px;
    pointer-events: none;
    z-index: 1000;
}
</style>
