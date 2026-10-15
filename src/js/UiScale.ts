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

import { get as getConfig } from "./ConfigStorage";

const DEFAULT_UI_SCALE = 1;
const MIN_UI_SCALE = 0.5;
const MAX_UI_SCALE = 1.5;

export function sanitizeUiScale(value: unknown): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return DEFAULT_UI_SCALE;
    }
    return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, numericValue));
}

export function applyUiScale(value: unknown): number {
    const scale = sanitizeUiScale(value);
    document.body.style.setProperty("--ui-scale", String(scale));
    return scale;
}

export function loadUiScale(): void {
    const result = getConfig("uiScale");
    const scale = result.uiScale ?? DEFAULT_UI_SCALE;
    applyUiScale(scale);
}

export { DEFAULT_UI_SCALE, MIN_UI_SCALE, MAX_UI_SCALE };
