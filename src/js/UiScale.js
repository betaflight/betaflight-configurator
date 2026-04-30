import { get as getConfig } from "./ConfigStorage";

const DEFAULT_SCALE = 100;

export function applyUiScale(value) {
    const scale = value ?? DEFAULT_SCALE;
    document.documentElement.style.zoom = scale === 100 ? "" : `${scale}%`;
}

export function loadUiScale() {
    const result = getConfig("uiScale");
    const scale = result.uiScale ?? DEFAULT_SCALE;
    applyUiScale(scale);
}
