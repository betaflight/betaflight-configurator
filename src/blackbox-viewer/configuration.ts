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
 * Configuration
 *
 * Handle loading of configuration dump/diff files.
 * Parsed lines are pushed to graphStore for Vue rendering.
 */

import type { PrefStorage } from "./pref_storage";
import { useGraphStore } from "./stores/graph";

export function loadConfigurationFile(file: File): void {
    const reader = new FileReader();

    reader.onload = function () {
        const graphStore = useGraphStore();
        graphStore.configLines = (reader.result as string).split("\n");
        graphStore.configFileName = file.name;
    };
    reader.onerror = reader.onabort = function () {
        const graphStore = useGraphStore();
        graphStore.configLines = [];
        graphStore.configFileName = "";
    };

    reader.readAsText(file);
}

/** Special configuration file that holds default values only. */
export class ConfigurationDefaults {
    constructor(private readonly prefs: PrefStorage) {}

    loadFile(file: File): void {
        const reader = new FileReader();

        reader.onload = () => {
            this.prefs.set("configurationDefaults", (reader.result as string).split("\n"));
        };

        reader.readAsText(file);
    }
}
