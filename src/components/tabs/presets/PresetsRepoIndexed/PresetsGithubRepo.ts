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

import PresetsRepoIndexed from "./PresetsRepoIndexed";

/**
 * A preset repository hosted on GitHub. Presets are fetched from
 * raw.githubusercontent.com and linked to the github.com blob view.
 */
export default class PresetsGithubRepo extends PresetsRepoIndexed {
    /**
     * @param urlRepo repository URL, starting with `https://github.com/`
     * @param branch branch name; `undefined` is read as empty, since sources
     *   restored from storage may predate the field
     */
    constructor(urlRepo: string, branch: string | undefined, official: boolean, name: string) {
        let correctUrlRepo = urlRepo.trim();

        if (!correctUrlRepo.endsWith("/")) {
            correctUrlRepo += "/";
        }

        let correctBranch = (branch ?? "").trim();

        if (correctBranch.startsWith("/")) {
            correctBranch = correctBranch.slice(1);
        }

        if (correctBranch.endsWith("/")) {
            correctBranch = correctBranch.slice(0, -1);
        }

        const urlRaw = `https://raw.githubusercontent.com${correctUrlRepo.slice(
            "https://github.com".length,
        )}${correctBranch}/`;
        const urlViewOnline = `${correctUrlRepo}blob/${correctBranch}/`;

        super(urlRaw, urlViewOnline, official, name);
    }
}
