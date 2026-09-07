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
