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
import PresetsGithubRepo from "../../src/components/tabs/presets/PresetsRepoIndexed/PresetsGithubRepo";
import PresetsWebsiteRepo from "../../src/components/tabs/presets/PresetsRepoIndexed/PresetsWebsiteRepo";

describe("PresetsGithubRepo", () => {
    it("fetches from raw.githubusercontent.com and links to the blob view", () => {
        const repo = new PresetsGithubRepo(
            "https://github.com/betaflight/firmware-presets",
            "master",
            true,
            "Official",
        );

        expect(repo._urlRaw).toBe("https://raw.githubusercontent.com/betaflight/firmware-presets/master/");
        expect(repo._urlViewOnline).toBe("https://github.com/betaflight/firmware-presets/blob/master/");
        expect(repo._official).toBe(true);
        expect(repo._name).toBe("Official");
    });

    it("trims whitespace and slashes from the URL and branch", () => {
        const repo = new PresetsGithubRepo("  https://github.com/user/presets/  ", " /dev/ ", false, "Mine");

        expect(repo._urlRaw).toBe("https://raw.githubusercontent.com/user/presets/dev/");
        expect(repo._urlViewOnline).toBe("https://github.com/user/presets/blob/dev/");
    });

    it("reads a missing branch as empty", () => {
        const missing = new PresetsGithubRepo("https://github.com/user/presets", undefined, false, "Mine");
        const empty = new PresetsGithubRepo("https://github.com/user/presets", "", false, "Mine");

        expect(missing._urlRaw).toBe(empty._urlRaw);
        expect(missing._urlViewOnline).toBe(empty._urlViewOnline);
    });
});

describe("PresetsWebsiteRepo", () => {
    it("uses the trimmed URL with a trailing slash for both raw files and the online view", () => {
        const repo = new PresetsWebsiteRepo("  https://presets.example.com/repo  ", false, "Site");

        expect(repo._urlRaw).toBe("https://presets.example.com/repo/");
        expect(repo._urlViewOnline).toBe("https://presets.example.com/repo/");
        expect(repo._official).toBe(false);
        expect(repo._name).toBe("Site");
    });

    it("keeps an existing trailing slash", () => {
        const repo = new PresetsWebsiteRepo("https://presets.example.com/", true, "Site");

        expect(repo._urlRaw).toBe("https://presets.example.com/");
    });
});
