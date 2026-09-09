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

export interface HeaderLayout {
    hiddenGroups: string[];
    hiddenFields: string[];
    paneOrder: string[];
}

const STORAGE_KEYS = {
    hiddenGroups: "bbv-hidden-groups",
    hiddenFields: "bbv-hidden-fields",
    paneOrder: "bbv-pane-order",
} as const;

type HeaderLayoutListener = (layout: HeaderLayout) => void;

const listeners = new Set<HeaderLayoutListener>();

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.filter((item): item is string => typeof item === "string")));
}

function readStringArray(key: string): string[] {
    try {
        const value = globalThis.localStorage?.getItem(key);
        if (!value) {
            return [];
        }
        const parsed: unknown = JSON.parse(value);
        return toStringArray(parsed);
    } catch {
        return [];
    }
}

export function loadHeaderLayout(): HeaderLayout {
    return {
        hiddenGroups: readStringArray(STORAGE_KEYS.hiddenGroups),
        hiddenFields: readStringArray(STORAGE_KEYS.hiddenFields),
        paneOrder: readStringArray(STORAGE_KEYS.paneOrder),
    };
}

export function saveHeaderLayout(value: unknown): HeaderLayout {
    const candidate = value && typeof value === "object" ? (value as Partial<HeaderLayout>) : {};
    const layout = {
        hiddenGroups: toStringArray(candidate.hiddenGroups),
        hiddenFields: toStringArray(candidate.hiddenFields),
        paneOrder: toStringArray(candidate.paneOrder),
    };

    try {
        globalThis.localStorage?.setItem(STORAGE_KEYS.hiddenGroups, JSON.stringify(layout.hiddenGroups));
        globalThis.localStorage?.setItem(STORAGE_KEYS.hiddenFields, JSON.stringify(layout.hiddenFields));
        globalThis.localStorage?.setItem(STORAGE_KEYS.paneOrder, JSON.stringify(layout.paneOrder));
    } catch {
        // Persistence is best-effort in restricted browser contexts.
    }

    listeners.forEach((listener) => listener(layout));

    return layout;
}

export function subscribeHeaderLayout(listener: HeaderLayoutListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
