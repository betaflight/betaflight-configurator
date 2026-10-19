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

import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import type { FilterTuneStatus } from "./filterTuneProtocol";
import type { SpinCheck } from "./frameSpinCheck";
import type { WizardResult } from "./frameWizardProtocol";

/**
 * The frame test's and the filter autotune's last results, kept by this app per craft: the FC holds them in
 * RAM only (gone at power-off, and the buffers go to the autotune at arming). Only the frame map is stored on
 * the FC. Keyed by the MCU's unique id.
 */
export interface FrameHistory {
    /** The last frame test run the FC reported (taps and / or motors), with its spin check. */
    run?: { at: string; result: WizardResult; spinCheck: SpinCheck | null };
    /** The filter autotune's measurement once it was applied (or had enough frames). */
    tune?: { at: string; status: FilterTuneStatus };
}

const PREFIX = "frame_test_history_";

/** @returns null for an unknown id (all zero, before MSP_UID). */
export function craftKey(uid: number[] | undefined): string | null {
    if (!uid?.length || uid.every((word) => !word)) {
        return null;
    }
    return PREFIX + uid.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

export function loadHistory(key: string | null): FrameHistory {
    if (!key) {
        return {};
    }
    const stored = getConfig<FrameHistory>(key)[key];
    return stored && typeof stored === "object" ? stored : {};
}

export function saveHistory(key: string | null, patch: FrameHistory): void {
    if (!key) {
        return;
    }
    setConfig({ [key]: { ...loadHistory(key), ...patch } });
}

/** A result with something in it: the FC reports an empty one after a restart. */
export const resultHasData = (result: WizardResult | null): result is WizardResult =>
    result !== null && (result.points.some((p) => p.length > 0) || result.motors.some((m) => m.length > 0));

/** The same run as the one kept (its date stays). */
export const sameRun = (a: WizardResult, b: WizardResult): boolean => JSON.stringify(a) === JSON.stringify(b);
