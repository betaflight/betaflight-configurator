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

import { set as setConfig } from "../ConfigStorage";
import DeviceHandler from "../device_handler";

/** Whether to back up the configuration before flashing: 0 = disabled, 1 = enabled, 2 = ask. */
export type BackupOnFlash = 0 | 1 | 2;

/**
 * Development options. A type alias rather than an interface, so it is assignable to the
 * `Record<string, unknown>` that ConfigStorage's set() takes.
 */
export type DevelopmentOptions = {
    showVirtualMode?: boolean;
    showManualMode?: boolean;
    showAllSerialDevices?: boolean;
    backupOnFlash?: BackupOnFlash;
};

/**
 * Default values for development options (disabled state)
 */
export const DEFAULT_DEVELOPMENT_OPTIONS: Required<DevelopmentOptions> = {
    showVirtualMode: false,
    showManualMode: false,
    showAllSerialDevices: false,
    backupOnFlash: 1, // 0 = disabled, 1 = enabled, 2 = ask
};

/**
 * Development options enabled for dev URLs (localhost, PR branches, master)
 */
export const ENABLED_DEVELOPMENT_OPTIONS: Required<DevelopmentOptions> = {
    showVirtualMode: true,
    showManualMode: true,
    showAllSerialDevices: true,
    backupOnFlash: 2, // ask
};

/**
 * Apply development options to config and DeviceHandler. Options left undefined keep
 * their DeviceHandler state.
 */
export function applyDevelopmentOptions(options: DevelopmentOptions): void {
    // Save to config storage
    setConfig(options);

    // Update DeviceHandler reactive properties using setter methods
    if (options.showVirtualMode !== undefined) {
        DeviceHandler.setShowVirtualMode(options.showVirtualMode);
    }
    if (options.showManualMode !== undefined) {
        DeviceHandler.setShowManualMode(options.showManualMode);
    }
    if (options.showAllSerialDevices !== undefined) {
        DeviceHandler.setShowAllSerialDevices(options.showAllSerialDevices);
    }
}

/**
 * Reset development options to defaults
 */
export function resetDevelopmentOptions(): void {
    applyDevelopmentOptions(DEFAULT_DEVELOPMENT_OPTIONS);
}

/**
 * Enable development options (for dev URLs)
 */
export function enableDevelopmentOptions(): void {
    applyDevelopmentOptions(ENABLED_DEVELOPMENT_OPTIONS);
}
