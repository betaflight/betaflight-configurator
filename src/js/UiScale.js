const DEFAULT_UI_SCALE = 1;
const MIN_UI_SCALE = 0.9;
const MAX_UI_SCALE = 1.4;
const UI_SCALE_PRECISION = 2;

export function sanitizeUiScale(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return DEFAULT_UI_SCALE;
    }

    const clampedValue = Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, numericValue));
    return Number(clampedValue.toFixed(UI_SCALE_PRECISION));
}

export function applyUiScale(value) {
    const scale = sanitizeUiScale(value);
    document.body.style.setProperty("--ui-scale", scale);
    return scale;
}

export { DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE };
