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

import { describe, expect, it } from "vitest";
import PresetSource from "../../src/components/tabs/presets/SourcesDialog/PresetSource";

describe("PresetSource", () => {
    it("defaults the branch and id to empty and is not official", () => {
        const source = new PresetSource("Mine", "https://example.com/presets/");

        expect(source).toEqual({
            name: "Mine",
            url: "https://example.com/presets/",
            gitHubBranch: "",
            id: "",
            official: false,
        });
    });

    it("keeps a given branch and id", () => {
        const source = new PresetSource("Mine", "https://github.com/user/presets", "dev", "source-1");

        expect(source.gitHubBranch).toBe("dev");
        expect(source.id).toBe("source-1");
    });

    it.each([
        ["https://github.com/user/presets", true],
        ["  HTTPS://GitHub.com/user/presets  ", true],
        ["https://presets.betaflight.com/firmware-presets/", false],
        ["http://github.com/user/presets", false],
        ["", false],
        [undefined, false],
        [null, false],
    ])("isUrlGithubRepo(%j) is %s", (url, expected) => {
        expect(PresetSource.isUrlGithubRepo(url)).toBe(expected);
    });

    it.each([
        ["https://github.com/user/presets/tree/dev", true],
        ["https://github.com/user/presets", false],
        ["https://github.com/user/treehouse", false],
        [undefined, false],
        [null, false],
    ])("containsBranchName(%j) is %s", (url, expected) => {
        expect(PresetSource.containsBranchName(url)).toBe(expected);
    });

    it("reads the branch from a GitHub tree URL", () => {
        expect(PresetSource.getBranchName("https://github.com/user/presets/tree/dev")).toBe("dev");
        expect(PresetSource.getBranchName("https://github.com/user/presets/tree/dev/presets/4.5")).toBe("dev");
    });

    it("returns null when the URL names no branch", () => {
        expect(PresetSource.getBranchName("https://github.com/user/presets")).toBeNull();
        expect(PresetSource.getBranchName("https://example.com/user/presets/tree/dev")).toBeNull();
    });
});
