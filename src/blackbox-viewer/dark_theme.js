/**
 * Dark Theme Manager
 *
 * This module manages the application's dark mode feature.
 * It supports three modes:
 * - ON (0): Always use dark theme
 * - OFF (1): Always use light theme
 * - AUTO (2): Follow system preference via prefers-color-scheme
 *
 * The theme preference is stored via PrefStorage and persists across sessions.
 * When the theme changes, appStore.darkThemeEnabled is set, and App.vue's
 * watchEffect toggles the .dark class on the root element for CSS variable overrides.
 */

import { useAppStore } from "./stores/app.js";

export const DarkTheme = {
    // Preference key name
    configName: "darkTheme",

    // Theme modes
    modes: {
        ON: 0,
        OFF: 1,
        AUTO: 2,
    },

    // Current mode setting (default to AUTO to match betaflight-configurator)
    currentMode: 2,

    // Reference to prefs storage
    prefs: null,

    // Current enabled state
    enabled: false,

    // Media query for system preference
    mediaQuery: null,

    /**
     * Initialize the dark theme system
     * @param {PrefStorage} prefsStorage - The preference storage instance
     */
    init: function (prefsStorage) {
        this.prefs = prefsStorage;

        // Load saved preference
        this.prefs.get(this.configName, (value) => {
            // Validate the persisted mode value
            const allowedModes = Object.values(this.modes);
            if (value !== null && typeof value === "number" && Number.isFinite(value) && allowedModes.includes(value)) {
                this.currentMode = value;
            } else {
                // Default to AUTO mode if no valid preference saved
                this.currentMode = this.modes.AUTO;
                this.prefs.set(this.configName, this.currentMode);
            }

            // Apply the theme based on loaded preference
            this.apply();
        });

        // Set up system preference monitoring for AUTO mode. init() runs on every tab
        // mount, so register the listener only once to avoid stacking handlers on remount.
        if (globalThis.matchMedia) {
            this.mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");

            if (!this.mediaQueryHandler) {
                this.mediaQueryHandler = () => {
                    if (this.currentMode === this.modes.AUTO) {
                        this.apply();
                    }
                };

                // Modern browsers
                if (this.mediaQuery.addEventListener) {
                    this.mediaQuery.addEventListener("change", this.mediaQueryHandler);
                }
                // Older browsers
                else if (this.mediaQuery.addListener) {
                    this.mediaQuery.addListener(this.mediaQueryHandler);
                }
            }
        }
    },

    /**
     * Set the theme mode and save to preferences
     * @param {number} mode - One of the modes (ON, OFF, AUTO)
     * @param {function} callback - Optional callback after theme is applied
     */
    setMode: function (mode, callback) {
        if (mode !== this.modes.ON && mode !== this.modes.OFF && mode !== this.modes.AUTO) {
            console.error("Invalid dark theme mode:", mode);
            return;
        }

        this.currentMode = mode;

        if (this.prefs) {
            this.prefs.set(this.configName, mode);
        }

        this.apply();

        // Notify the application that theme has changed so canvas can redraw
        useAppStore().refreshGraph?.();

        if (typeof callback === "function") {
            callback();
        }
    },

    /**
     * Apply the current theme mode
     */
    apply: function () {
        const shouldUseDark = this.shouldUseDarkTheme();

        if (shouldUseDark) {
            this.applyDark();
        } else {
            this.applyNormal();
        }
    },

    /**
     * Apply the resolved theme state to the store (classes applied by App.vue watchEffect)
     */
    applyDark: function () {
        this.enabled = true;
        useAppStore().darkThemeEnabled = true;
    },

    applyNormal: function () {
        this.enabled = false;
        useAppStore().darkThemeEnabled = false;
    },

    /**
     * Determine if dark theme should be active based on current mode
     * @returns {boolean} True if dark theme should be enabled
     */
    shouldUseDarkTheme: function () {
        switch (this.currentMode) {
            case this.modes.ON:
                return true;

            case this.modes.OFF:
                return false;

            case this.modes.AUTO:
                if (this.mediaQuery) {
                    return this.mediaQuery.matches;
                }
                // Fallback if matchMedia not supported
                return false;

            default:
                return false;
        }
    },

    /**
     * Check if dark theme is currently enabled
     * @returns {boolean} True if dark theme is active
     */
    isEnabled: function () {
        return this.enabled;
    },

    /**
     * Get the current mode
     * @returns {number} Current mode (ON, OFF, or AUTO)
     */
    getMode: function () {
        return this.currentMode;
    },
};
