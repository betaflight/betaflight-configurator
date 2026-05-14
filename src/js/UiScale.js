import { get as getConfig } from "./ConfigStorage";

const DEFAULT_UI_SCALE = 1;
const MIN_UI_SCALE = 0.5;
const MAX_UI_SCALE = 1.5;

export function sanitizeUiScale(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return DEFAULT_UI_SCALE;
    }
    return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, numericValue));
}

export function applyUiScale(value) {
    const scale = sanitizeUiScale(value);
    document.body.style.setProperty("--ui-scale", scale);
    return scale;
}

export function loadUiScale() {
    const result = getConfig("uiScale");
    const scale = result.uiScale ?? DEFAULT_UI_SCALE;
    applyUiScale(scale);
}

export { DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE };
