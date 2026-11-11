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
 * 0 = dark, 1 = light, 2 = follow the OS. `undefined` until main.ts applies the
 * stored setting; OptionsDialog can read (and pass back) the value before then.
 */
export type DarkThemeSetting = number | undefined;

interface DarkThemeModule {
    configSetting: DarkThemeSetting;
    enabled: boolean;
    isDarkThemeEnabled(callback: (isEnabled: boolean) => void): void;
    apply(): void;
    autoSet(): void;
    setConfig(result: DarkThemeSetting): void;
    applyDark(): void;
    applyNormal(): void;
}

const DarkTheme: DarkThemeModule = {
    configSetting: undefined,
    enabled: false,

    isDarkThemeEnabled(callback) {
        if (this.configSetting === 0) {
            callback(true);
        } else if (this.configSetting === 2) {
            // Optional call kept: matchMedia can be absent (e.g. jsdom in tests).
            const isEnabled = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
            callback(isEnabled);
        } else {
            callback(false);
        }
    },

    apply() {
        this.isDarkThemeEnabled((isEnabled) => {
            if (isEnabled) {
                this.applyDark();
            } else {
                this.applyNormal();
            }
        });
    },

    autoSet() {
        if (this.configSetting === 2) {
            this.apply();
        }
    },

    setConfig(result) {
        if (this.configSetting !== result) {
            this.configSetting = result;
            this.apply();
        }
    },

    applyDark() {
        document.documentElement.classList.add("dark");
        this.enabled = true;
    },

    applyNormal() {
        document.documentElement.classList.remove("dark");
        this.enabled = false;
    },
};

/** @param enabled 0 = dark, 1 = light, 2 = follow the OS */
export function setDarkTheme(enabled: DarkThemeSetting): void {
    DarkTheme.setConfig(enabled);
}

export default DarkTheme;
