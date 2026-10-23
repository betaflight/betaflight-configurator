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

/**
 * Theme Colors Helper
 *
 * Provides JavaScript access to CSS variables defined in theme.css.
 * Used by canvas rendering code (grapher.js, seekbar.js) to get
 * theme-aware colors that update when the theme changes.
 */

import { useAppStore } from "./stores/app";

interface ThemeColorsApi {
    /** Values read so far, by variable name; clearCache() empties it when the theme changes. */
    colorCache: Record<string, string>;
    getCSSVariable(variableName: string): string;
    clearCache(): void;
    isDarkTheme(): boolean;
    getGraphBackground(): string;
    getGraphGrid(): string;
    getGraphText(): string;
    getGraphTextSecondary(): string;
    getGraphAxis(): string;
}

export const ThemeColors: ThemeColorsApi = {
    colorCache: {},

    getCSSVariable: function (variableName) {
        if (this.colorCache[variableName]) {
            return this.colorCache[variableName];
        }
        // Theme variables are scoped to the viewer root (.blackbox-viewer-root) so they don't
        // leak into the host configurator; read from there, falling back to documentElement.
        const root = document.querySelector(".blackbox-viewer-root") ?? document.documentElement;
        const value = getComputedStyle(root).getPropertyValue(variableName).trim();
        this.colorCache[variableName] = value;
        return value;
    },

    clearCache: function () {
        this.colorCache = {};
    },

    isDarkTheme: function () {
        return useAppStore().darkThemeEnabled;
    },

    getGraphBackground: function () {
        return this.getCSSVariable("--graph-background");
    },

    getGraphGrid: function () {
        return this.getCSSVariable("--graph-grid");
    },

    getGraphText: function () {
        return this.getCSSVariable("--graph-text");
    },

    getGraphTextSecondary: function () {
        return this.getCSSVariable("--graph-text-secondary");
    },

    getGraphAxis: function () {
        return this.getCSSVariable("--graph-axis");
    },
};
