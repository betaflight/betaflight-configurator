import { ref, computed, watch } from "vue";
import { useOsdStore } from "@/stores/osd";
import { FONT } from "@/js/utils/osdFont";

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
            // Array of objects {x, y, sym}. Seed the limits from the first cell so
            // elements whose cells all sit on one side of the anchor (e.g.
            // ARTIFICIAL_HORIZON spans y +1..+7) report their true extents.
            limits.minX = arrayElements[0].x;
            limits.maxX = arrayElements[0].x;
            limits.minY = arrayElements[0].y;
            limits.maxY = arrayElements[0].y;
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
    return ((position % totalSize) + totalSize) % totalSize;
}

function drawStringPreview(buffer, field, selectedPosition) {
    for (const [i, char] of Array.from(field.preview).entries()) {
        const charCode = char.codePointAt(0);
        drawByOrder(buffer, selectedPosition, field, charCode, i, 1);
        selectedPosition++;
    }
    return selectedPosition;
}

function drawStringArrayPreview(buffer, field, displaySize, selectedPosition) {
    const arrayElements = field.preview;
    for (let i = 0; i < arrayElements.length; i++) {
        const element = arrayElements[i];
        for (const [j, char] of Array.from(element).entries()) {
            const charCode = char.codePointAt(0);
            drawByOrder(buffer, selectedPosition, field, charCode, j, i);
            selectedPosition++;
        }
        selectedPosition = selectedPosition - Array.from(element).length + displaySize.x;
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

    // Initial update — only run if font data is already loaded to avoid empty renders.
    // The OsdTab component calls updatePreviewBuffer() explicitly after loading the font.
    if (FONT.data?.characters?.length) {
        updatePreviewBuffer();
    }

    // Watch for changes that require re-rendering.
    // Use deep: false — the component calls updatePreviewBuffer() imperatively after
    // mutations, so we only need to react to reference replacements (e.g. full reload).
    watch(
        [
            () => store.displayItems,
            () => store.currentPreviewProfile,
            () => store.displaySize.total,
            () => store.displaySize.x,
        ],
        () => {
            updatePreviewBuffer();
        },
        { deep: false },
    );

    return {
        previewBuffer,
        previewRows,
        updatePreviewBuffer,
        searchLimitsElement,
    };
}

/**
 * Check if the element preview is an array of strings.
 * @param {any} preview - The preview property of the element.
 * @returns {boolean} True if the preview is an array of strings.
 */
export function isStringArrayPreview(preview) {
    return Array.isArray(preview) && typeof preview[0] === "string";
}

/**
 * Clamp the position of a string OSD element (1D string) to screen bounds.
 * @param {object} displayItem - The display item.
 * @param {number} position - The proposed grid index.
 * @param {object} displaySize - The screen size {x, y, total}.
 * @param {number} cursorY - The row the user cursor is pointing to.
 * @returns {number} The clamped position grid index.
 */
export function clampStringPreviewPosition(displayItem, position, displaySize, cursorY) {
    const elementWidth = Array.from(displayItem.preview || "").length;
    const maxX = Math.max(0, displaySize.x - elementWidth);
    const maxY = Math.max(0, displaySize.y - 1);
    const row = Math.min(Math.max(cursorY, 0), maxY);

    const rawX = position - row * displaySize.x;
    const x = Math.min(Math.max(rawX, 0), maxX);

    return row * displaySize.x + x;
}

/**
 * Clamp the position of a string-array OSD element to screen bounds.
 * @param {number} position - The proposed grid index.
 * @param {object} displaySize - The screen size {x, y, total}.
 * @param {number} cursorX - The column the user cursor is pointing to.
 * @param {object} limits - The layout limits {minX, maxX, minY, maxY}.
 * @returns {number|null} The clamped position grid index or null if invalid.
 */
export function clampStringArrayPreviewPosition(position, displaySize, cursorX, limits) {
    const selectedPositionX = position % displaySize.x;
    let selectedPositionY = Math.trunc(position / displaySize.x);

    if (position < 0) {
        return null;
    }
    if (selectedPositionX > cursorX) {
        position += displaySize.x - selectedPositionX;
        selectedPositionY++;
    } else if (selectedPositionX + limits.maxX > displaySize.x) {
        position -= selectedPositionX + limits.maxX - displaySize.x;
    }
    if (selectedPositionY < 0) {
        position += Math.abs(selectedPositionY) * displaySize.x;
    } else if (selectedPositionY + limits.maxY > displaySize.y) {
        position -= (selectedPositionY + limits.maxY - displaySize.y) * displaySize.x;
    }

    return position;
}

/**
 * Clamp the position of an object-array OSD element to screen bounds.
 * @param {number} position - The proposed grid index.
 * @param {object} displaySize - The screen size {x, y, total}.
 * @param {object} limits - The layout limits {minX, maxX, minY, maxY}.
 * @returns {number} The clamped position grid index.
 */
export function clampObjectArrayPreviewPosition(position, displaySize, limits) {
    const selectedPositionX = ((position % displaySize.x) + displaySize.x) % displaySize.x;
    const selectedPositionY = Math.floor(position / displaySize.x);

    if (selectedPositionX + limits.minX < 0) {
        position += Math.abs(selectedPositionX + limits.minX);
    } else if (limits.maxX > 0 && selectedPositionX + limits.maxX >= displaySize.x) {
        position -= selectedPositionX + limits.maxX + 1 - displaySize.x;
    }
    if (selectedPositionY + limits.minY < 0) {
        position += Math.abs(selectedPositionY + limits.minY) * displaySize.x;
    } else if (limits.maxY > 0 && selectedPositionY + limits.maxY >= displaySize.y) {
        position -= (selectedPositionY + limits.maxY - displaySize.y + 1) * displaySize.x;
    }

    if (position < 0) {
        // The anchor of an element whose cells all sit below it (positive minY) may
        // still land above row 0 after clamping, but positions pack into unsigned
        // x/y for MSP (see stores/osd.js pack.position): settle on row 0, keeping
        // the column instead of jumping to the top-left corner.
        position = ((position % displaySize.x) + displaySize.x) % displaySize.x;
    }

    return position;
}

/**
 * Clamp the position of any array OSD element (object array or string array) to screen bounds.
 * @param {object} displayItem - The display item.
 * @param {number} position - The proposed grid index.
 * @param {object} displaySize - The screen size {x, y, total}.
 * @param {number} cursorX - The column the user cursor is pointing to.
 * @returns {number|null} The clamped position grid index or null if invalid.
 */
export function clampArrayPreviewPosition(displayItem, position, displaySize, cursorX) {
    const limits = searchLimitsElement(displayItem.preview);
    if (isStringArrayPreview(displayItem.preview)) {
        return clampStringArrayPreviewPosition(position, displaySize, cursorX, limits);
    }
    return clampObjectArrayPreviewPosition(position, displaySize, limits);
}
