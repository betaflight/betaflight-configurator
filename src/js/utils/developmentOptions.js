import { set as setConfig } from "../ConfigStorage.js";
import PortHandler from "../port_handler.js";

/**
 * Default values for development options (disabled state)
 */
export const DEFAULT_DEVELOPMENT_OPTIONS = {
    showVirtualMode: false,
    showManualMode: false,
    showAllSerialDevices: false,
    backupOnFlash: 1, // 0 = disabled, 1 = enabled, 2 = ask
};

/**
 * Development options enabled for dev URLs (localhost, PR branches, master)
 */
export const ENABLED_DEVELOPMENT_OPTIONS = {
    showVirtualMode: true,
    showManualMode: true,
    showAllSerialDevices: true,
    backupOnFlash: 2, // ask
};

/**
 * Apply development options to config and PortHandler
 * @param {Object} options - Development options to apply
 * @param {boolean} [options.showVirtualMode]
 * @param {boolean} [options.showManualMode]
 * @param {boolean} [options.showAllSerialDevices]
 * @param {number} [options.backupOnFlash] - 0 = disabled, 1 = enabled, 2 = ask
 */
export function applyDevelopmentOptions(options) {
    // Save to config storage
    setConfig(options);

    // Update PortHandler reactive properties using setter methods
    if (options.showVirtualMode !== undefined) {
        PortHandler.setShowVirtualMode(options.showVirtualMode);
    }
    if (options.showManualMode !== undefined) {
        PortHandler.setShowManualMode(options.showManualMode);
    }
    if (options.showAllSerialDevices !== undefined) {
        PortHandler.setShowAllSerialDevices(options.showAllSerialDevices);
    }
}

/**
 * Reset development options to defaults
 */
export function resetDevelopmentOptions() {
    applyDevelopmentOptions(DEFAULT_DEVELOPMENT_OPTIONS);
}

/**
 * Enable development options (for dev URLs)
 */
export function enableDevelopmentOptions() {
    applyDevelopmentOptions(ENABLED_DEVELOPMENT_OPTIONS);
}
