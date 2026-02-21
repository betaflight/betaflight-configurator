import { ref, computed, watch } from "vue";
import { useOsdStore } from "@/stores/osd";
import { FONT } from "@/js/tabs/osd.js";

// Helper: Search limits of an element (ported from legacy OSD.searchLimitsElement)
// Moved to outer scope to reduce complexity
function searchLimitsElement(arrayElements) {
    const limits = {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
    };

    if (!arrayElements || arrayElements.length === 0) {
        return limits;
    }

    if (typeof arrayElements === "string") {
        limits.maxY = 0;
        limits.minY = 0;
        limits.minX = 0;
        limits.maxX = arrayElements.length;
    } else if (Array.isArray(arrayElements)) {
        if (arrayElements.length > 0 && typeof arrayElements[0] === "string") {
            // Handle case where it might be an array of strings (though legacy code handles string primitive separately)
            // Legacy code: if (arrayElements[0].constructor === String)
            limits.maxY = arrayElements.length;
            limits.minY = 0;
            limits.minX = 0;
            arrayElements.forEach(function (val) {
                limits.maxX = Math.max(val.length, limits.maxX);
            });
        } else {
            // Array of objects {x, y, sym}
            arrayElements.forEach(function (val) {
                limits.minX = Math.min(val.x, limits.minX);
                limits.maxX = Math.max(val.x, limits.maxX);
                limits.minY = Math.min(val.y, limits.minY);
                limits.maxY = Math.max(val.y, limits.maxY);
            });
        }
    }
    return limits;
}

// Helper: Draw to buffer with Z-order check (ported from legacy OSD.drawByOrder)
// Moved to outer scope
function drawByOrder(buffer, selectedPosition, field, charCode, x, y) {
    // Check if position is within bounds
    if (selectedPosition < 0 || selectedPosition >= buffer.length) {
        return;
    }

    // Check if there is already a field at this position with higher priority
    const existing = buffer[selectedPosition];
    if (existing?.field) {
        const oldField = existing.field;
        // If old field has draw_order and new one doesn't or has lower, don't overwrite
        if (
            oldField.draw_order !== undefined &&
            (field.draw_order === undefined || field.draw_order < oldField.draw_order)
        ) {
            return;
        }
    }

    // Overwrite
    buffer[selectedPosition] = {
        field: field,
        charCode: charCode,
        x: x,
        y: y,
        img: FONT.draw(charCode), // Compute image URL immediately
    };
}

function createEmptyPreviewBuffer(displaySize) {
    const buffer = new Array(displaySize.total);
    const emptyChar = " ".codePointAt(0);
    const emptyImg = FONT.draw(emptyChar);

    for (let i = 0; i < displaySize.total; i++) {
        buffer[i] = {
            field: null,
            charCode: emptyChar,
            x: null,
            y: null,
            img: emptyImg,
        };
    }

    return buffer;
}

function normalizeSelectedPosition(position, totalSize) {
    if (position < 0) {
        position += totalSize;
    }
    if (position >= totalSize) {
        position %= totalSize;
    }
    return position;
}

function drawStringPreview(buffer, field, selectedPosition) {
    for (let i = 0; i < field.preview.length; i++) {
        const charCode = field.preview.codePointAt(i);
        drawByOrder(buffer, selectedPosition, field, charCode, i, 1);
        selectedPosition++;
    }
    return selectedPosition;
}

function drawStringArrayPreview(buffer, field, displaySize, selectedPosition) {
    const arrayElements = field.preview;
    for (let i = 0; i < arrayElements.length; i++) {
        const element = arrayElements[i];
        for (let j = 0; j < element.length; j++) {
            const charCode = element.codePointAt(j);
            drawByOrder(buffer, selectedPosition, field, charCode, j, i);
            selectedPosition++;
        }
        selectedPosition = selectedPosition - element.length + displaySize.x;
    }
}

function drawObjectArrayPreview(buffer, field, displaySize, selectedPosition) {
    for (const element of field.preview) {
        const charCode = element.sym;
        const pos = selectedPosition + element.x + element.y * displaySize.x;
        drawByOrder(buffer, pos, field, charCode, element.x, element.y);
    }
}

function drawFieldPreview(buffer, field, displaySize, selectedPosition) {
    if (typeof field.preview === "string") {
        drawStringPreview(buffer, field, selectedPosition);
        return;
    }

    if (!Array.isArray(field.preview)) {
        return;
    }

    if (field.preview.length > 0 && typeof field.preview[0] === "string") {
        drawStringArrayPreview(buffer, field, displaySize, selectedPosition);
        return;
    }

    drawObjectArrayPreview(buffer, field, displaySize, selectedPosition);
}

export function useOsdPreview() {
    const store = useOsdStore();
    const previewBuffer = ref([]);

    // Main function to compute the preview buffer
    function updatePreviewBuffer() {
        const displaySize = store.displaySize;
        const currentProfile = store.currentPreviewProfile;
        const displayItems = store.displayItems;
        const newBuffer = createEmptyPreviewBuffer(displaySize);

        // Iterate over all display items
        for (const field of displayItems) {
            if (!field.isVisible?.[currentProfile]) {
                continue;
            }
            if (!field.preview) {
                continue;
            }

            const selectedPosition = normalizeSelectedPosition(field.position, displaySize.total);
            drawFieldPreview(newBuffer, field, displaySize, selectedPosition);
        }

        previewBuffer.value = newBuffer;
    }

    // Computed property to return buffer as rows for easier rendering
    const previewRows = computed(() => {
        const rows = [];
        const width = store.displaySize.x;
        if (!width || previewBuffer.value.length === 0) {
            return rows;
        }

        for (let i = 0; i < previewBuffer.value.length; i += width) {
            rows.push(previewBuffer.value.slice(i, i + width));
        }
        return rows;
    });

    // Initial update
    updatePreviewBuffer();

    // Watch for changes that require re-rendering
    watch(
        [
            () => store.displayItems,
            () => store.currentPreviewProfile,
            () => store.displaySize.total,
            () => store.displaySize.x,
            // Also watch videoSystem change if it triggers displaySize update
        ],
        () => {
            updatePreviewBuffer();
        },
        { deep: true },
    );

    return {
        previewBuffer,
        previewRows,
        updatePreviewBuffer,
        searchLimitsElement,
    };
}
