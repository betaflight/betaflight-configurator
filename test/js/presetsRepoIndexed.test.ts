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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PresetsRepoIndexed, {
    type PresetsIndex,
} from "../../src/components/tabs/presets/PresetsRepoIndexed/PresetsRepoIndexed";
import type { ParsedPreset } from "../../src/components/tabs/presets/PresetsRepoIndexed/PresetParser";
import { presetsIndexSettings } from "./presetsIndexSettings";

const RAW = "https://raw.example.com/repo/master/";
const VIEW = "https://example.com/repo/blob/master/";

const index: PresetsIndex = {
    majorVersion: 1,
    minorVersion: 0,
    uniqueValues: { firmware_version: ["4.5"], category: ["TUNE"], author: ["Betaflight"], keywords: ["race"] },
    settings: presetsIndexSettings,
    presets: [{ hash: "h1", title: "Race tune", fullPath: "presets/4.5/tune/race.txt" }],
};

let files: Record<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    files = {};
    fetchMock = vi.fn((url: string) => {
        if (url === `${RAW}index.json`) {
            return Promise.resolve({ json: () => Promise.resolve(structuredClone(index)) });
        }
        if (url in files) {
            return Promise.resolve({ text: () => Promise.resolve(files[url]) });
        }
        return Promise.reject(new Error(`404 ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function loadedRepo() {
    const repo = new PresetsRepoIndexed(RAW, VIEW, true, "Betaflight");
    await repo.loadIndex();
    return repo;
}

describe("PresetsRepoIndexed", () => {
    it("exposes its name and official flag", () => {
        const repo = new PresetsRepoIndexed(RAW, VIEW, false, "Third party");

        expect(repo.name).toBe("Third party");
        expect(repo.official).toBe(false);
    });

    it("has a null index until loadIndex() resolves", async () => {
        const repo = new PresetsRepoIndexed(RAW, VIEW, true, "Betaflight");

        expect(repo.index).toBeNull();
        await repo.loadIndex();

        expect(fetchMock).toHaveBeenCalledWith(`${RAW}index.json`, { cache: "no-cache" });
        expect(repo.index).toEqual(index);
    });

    it("refuses to strip options before the index has loaded", () => {
        const repo = new PresetsRepoIndexed(RAW, VIEW, true, "Betaflight");

        expect(() => repo.removeUncheckedOptions(["a"], [])).toThrow("loadIndex() has not resolved");
    });

    it("strips unchecked options with the index's settings once loaded", async () => {
        const repo = await loadedRepo();
        const lines = ["set a = 1", "#$ OPTION BEGIN (UNCHECKED): Drop", "set b = 2", "#$ OPTION END"];

        expect(repo.removeUncheckedOptions(lines, [])).toEqual(["set a = 1"]);
    });

    it("links a preset to its online view", () => {
        const repo = new PresetsRepoIndexed(RAW, VIEW, true, "Betaflight");

        expect(repo.getPresetOnlineLink({ fullPath: "presets/a.txt" })).toBe(`${VIEW}presets/a.txt`);
    });

    it("loads a preset: trimmed lines, metadata, and nested includes in place", async () => {
        files[`${RAW}presets/main.txt`] = [
            "#$ TITLE: Main",
            "#$ DESCRIPTION: does things",
            "  #$ INCLUDE: presets/inc/a.txt",
            "set main = 1",
        ].join("\n");
        files[`${RAW}presets/inc/a.txt`] = "set a = 1\n#$ INCLUDE: presets/inc/b.txt";
        files[`${RAW}presets/inc/b.txt`] = "  set b = 1  ";
        const repo = await loadedRepo();
        const preset: ParsedPreset = { fullPath: "presets/main.txt" };

        await repo.loadPreset(preset);

        expect(preset.description).toEqual(["does things"]);
        expect(preset.options).toEqual([]);
        expect(preset.originalPresetCliStrings).toEqual([
            "#$ TITLE: Main",
            "#$ DESCRIPTION: does things",
            "set a = 1",
            "set b = 1",
            "set main = 1",
        ]);
    });

    it("builds the complete warning from the warning, the disclaimer and the included files, in that order", async () => {
        files[`${RAW}presets/main.txt`] = [
            "#$ WARNING: warning text",
            "#$ DISCLAIMER: disclaimer text",
            "#$ INCLUDE_WARNING: misc/w1.txt",
            "#$ INCLUDE_DISCLAIMER: misc/d1.txt",
        ].join("\n");
        files[`${RAW}misc/w1.txt`] = "included warning";
        files[`${RAW}misc/d1.txt`] = "included disclaimer";
        const repo = await loadedRepo();
        const preset: ParsedPreset = { fullPath: "presets/main.txt" };

        await repo.loadPreset(preset);

        expect(preset.completeWarning).toBe("warning text\ndisclaimer text\nincluded warning\nincluded disclaimer");
    });

    it("leaves a trailing newline on the complete warning when there are no included files", async () => {
        files[`${RAW}presets/main.txt`] = "#$ WARNING: only this";
        const repo = await loadedRepo();
        const preset: ParsedPreset = { fullPath: "presets/main.txt" };

        await repo.loadPreset(preset);

        expect(preset.completeWarning).toBe("only this\n");
    });

    it("gives an empty complete warning when the preset has none", async () => {
        files[`${RAW}presets/main.txt`] = "set a = 1";
        const repo = await loadedRepo();
        const preset: ParsedPreset = { fullPath: "presets/main.txt" };

        await repo.loadPreset(preset);

        expect(preset.completeWarning).toBe("");
    });

    it("rejects, and logs, when a preset file cannot be fetched", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const repo = await loadedRepo();

        await expect(repo.loadPreset({ fullPath: "presets/missing.txt" })).rejects.toThrow("404");
        expect(error).toHaveBeenCalled();
    });
});
