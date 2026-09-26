/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { ref, computed, watch } from "vue";
import { useOsdStore, type OsdDisplayItem, type OsdPreview, type OsdPreviewSymbol } from "@/stores/osd";
import { FONT } from "@/js/utils/osdFont";

/** The screen size in characters, as the OSD store keeps it. */
export interface OsdDisplaySize {
    x: number;
    y: number;
    total: number;
}

export interface PreviewLimits {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/** One character cell of the preview grid. */
export interface PreviewCell {
    /** The display item drawn in this cell, or null for background. */
    field: OsdDisplayItem | null;
    charCode: number;
    /** Offset of the cell within its element's preview; null for background. */
    x: number | null;
    y: number | null;
    /** Data URI of the character image. */
    img: string;
}

/** A character taken from Array.from(string) always has a code point. */
function codePoint(char: string): number {
    return char.codePointAt(0) ?? 0;
}

function isStringArray(preview: OsdPreview): preview is string[] {
    return Array.isArray(preview) && preview.length > 0 && typeof preview[0] === "string";
}

// Helper: Search limits of an element (ported from legacy OSD.searchLimitsElement)
// Moved to outer scope to reduce complexity
function searchLimitsElement(arrayElements: OsdPreview | null | undefined): PreviewLimits {
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
        if (isStringArray(arrayElements)) {
            // Handle case where it might be an array of strings (though legacy code handles string primitive separately)
            // Legacy code: if (arrayElements[0].constructor === String)
            limits.maxY = arrayElements.length;
            limits.minY = 0;
            limits.minX = 0;
            arrayElements.forEach(function (val) {
                limits.maxX = Math.max(val.length, limits.maxX);
            });
        } else {
            const symbols = arrayElements;
            // Array of objects {x, y, sym}. Seed the limits from the first cell so
            // elements whose cells all sit on one side of the anchor (e.g.
            // ARTIFICIAL_HORIZON spans y +1..+7) report their true extents.
            limits.minX = symbols[0].x;
            limits.maxX = symbols[0].x;
            limits.minY = symbols[0].y;
            limits.maxY = symbols[0].y;
            symbols.forEach(function (val) {
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
function drawByOrder(
    buffer: PreviewCell[],
    selectedPosition: number,
    field: OsdDisplayItem,
    charCode: number,
    x: number,
    y: number,
): void {
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

function createEmptyPreviewBuffer(displaySize: OsdDisplaySize): PreviewCell[] {
    const buffer = new Array<PreviewCell>(displaySize.total);
    const emptyChar = codePoint(" ");
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

function normalizeSelectedPosition(position: number, totalSize: number): number {
    return ((position % totalSize) + totalSize) % totalSize;
}

function drawStringPreview(
    buffer: PreviewCell[],
    field: OsdDisplayItem,
    preview: string,
    selectedPosition: number,
): number {
    for (const [i, char] of Array.from(preview).entries()) {
        drawByOrder(buffer, selectedPosition, field, codePoint(char), i, 1);
        selectedPosition++;
    }
    return selectedPosition;
}

function drawStringArrayPreview(
    buffer: PreviewCell[],
    field: OsdDisplayItem,
    arrayElements: string[],
    displaySize: OsdDisplaySize,
    selectedPosition: number,
): void {
    for (let i = 0; i < arrayElements.length; i++) {
        const element = arrayElements[i];
        for (const [j, char] of Array.from(element).entries()) {
            drawByOrder(buffer, selectedPosition, field, codePoint(char), j, i);
            selectedPosition++;
        }
        selectedPosition = selectedPosition - Array.from(element).length + displaySize.x;
    }
}

function drawObjectArrayPreview(
    buffer: PreviewCell[],
    field: OsdDisplayItem,
    symbols: OsdPreviewSymbol[],
    displaySize: OsdDisplaySize,
    selectedPosition: number,
): void {
    for (const element of symbols) {
        const charCode = element.sym;
        const pos = selectedPosition + element.x + element.y * displaySize.x;
        drawByOrder(buffer, pos, field, charCode, element.x, element.y);
    }
}

function drawFieldPreview(
    buffer: PreviewCell[],
    field: OsdDisplayItem,
    displaySize: OsdDisplaySize,
    selectedPosition: number,
): void {
    const preview = field.preview;
    if (typeof preview === "string") {
        drawStringPreview(buffer, field, preview, selectedPosition);
        return;
    }

    if (!Array.isArray(preview)) {
        return;
    }

    if (isStringArray(preview)) {
        drawStringArrayPreview(buffer, field, preview, displaySize, selectedPosition);
        return;
    }

    drawObjectArrayPreview(buffer, field, preview, displaySize, selectedPosition);
}

export function useOsdPreview() {
    const store = useOsdStore();
    const previewBuffer = ref<PreviewCell[]>([]);

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
        const rows: PreviewCell[][] = [];
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
 */
export function isStringArrayPreview(preview: unknown): preview is string[] {
    return Array.isArray(preview) && typeof preview[0] === "string";
}

/**
 * Clamp the position of a string OSD element (1D string) to screen bounds.
 * @param position - The proposed grid index.
 * @param cursorY - The row the user cursor is pointing to.
 * @returns The clamped position grid index.
 */
export function clampStringPreviewPosition(
    displayItem: Pick<OsdDisplayItem, "preview">,
    position: number,
    displaySize: OsdDisplaySize,
    cursorY: number,
): number {
    const preview = displayItem.preview || "";
    // Array.from counts a string's code points; on an array it is just its length.
    const elementWidth = typeof preview === "string" ? Array.from(preview).length : preview.length;
    const maxX = Math.max(0, displaySize.x - elementWidth);
    const maxY = Math.max(0, displaySize.y - 1);
    const row = Math.min(Math.max(cursorY, 0), maxY);

    const rawX = position - row * displaySize.x;
    const x = Math.min(Math.max(rawX, 0), maxX);

    return row * displaySize.x + x;
}

/**
 * Clamp the position of a string-array OSD element to screen bounds.
 * @param position - The proposed grid index.
 * @param cursorX - The column the user cursor is pointing to.
 * @returns The clamped position grid index or null if invalid.
 */
export function clampStringArrayPreviewPosition(
    position: number,
    displaySize: OsdDisplaySize,
    cursorX: number,
    limits: PreviewLimits,
): number | null {
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
 * @param position - The proposed grid index.
 * @returns The clamped position grid index.
 */
export function clampObjectArrayPreviewPosition(
    position: number,
    displaySize: OsdDisplaySize,
    limits: PreviewLimits,
): number {
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
 * @param position - The proposed grid index.
 * @param cursorX - The column the user cursor is pointing to.
 * @returns The clamped position grid index or null if invalid.
 */
export function clampArrayPreviewPosition(
    displayItem: Pick<OsdDisplayItem, "preview">,
    position: number,
    displaySize: OsdDisplaySize,
    cursorX: number,
): number | null {
    const limits = searchLimitsElement(displayItem.preview);
    if (isStringArrayPreview(displayItem.preview)) {
        return clampStringArrayPreviewPosition(position, displaySize, cursorX, limits);
    }
    return clampObjectArrayPreviewPosition(position, displaySize, limits);
}
