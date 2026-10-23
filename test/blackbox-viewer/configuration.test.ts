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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ConfigurationDefaults, loadConfigurationFile } from "../../src/blackbox-viewer/configuration";
import type { PrefStorage } from "../../src/blackbox-viewer/pref_storage";
import { useGraphStore } from "../../src/blackbox-viewer/stores/graph";

function textFile(text: string, name: string): File {
    return new File([text], name, { type: "text/plain" });
}

describe("loadConfigurationFile", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("pushes the file's lines and name to the graph store", async () => {
        const graphStore = useGraphStore();
        loadConfigurationFile(textFile("# diff\nset a = 1\n\nset b = 2", "craft.txt"));

        await vi.waitFor(() => expect(graphStore.configFileName).toBe("craft.txt"));
        expect(graphStore.configLines).toEqual(["# diff", "set a = 1", "", "set b = 2"]);
    });
});

describe("ConfigurationDefaults", () => {
    it("caches the defaults file's lines in the prefs", async () => {
        const set = vi.fn();
        const defaults = new ConfigurationDefaults({ set } as unknown as PrefStorage);

        defaults.loadFile(textFile("# dump\nset a = 0", "defaults.txt"));

        await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
        expect(set).toHaveBeenCalledWith("configurationDefaults", ["# dump", "set a = 0"]);
    });
});
