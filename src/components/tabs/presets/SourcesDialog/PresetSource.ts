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

export default class PresetSource {
    name: string;
    url: string;
    gitHubBranch: string;
    id: string;
    official: boolean;

    constructor(name: string, url: string, gitHubBranch = "", id = "") {
        this.name = name;
        this.url = url;
        this.gitHubBranch = gitHubBranch;
        this.id = id;
        this.official = false;
    }

    static isUrlGithubRepo(url: string | null | undefined): boolean {
        return (url ?? "").trim().toLowerCase().startsWith("https://github.com/");
    }

    static containsBranchName(url: string | null | undefined): boolean {
        return (url ?? "").includes("/tree/");
    }

    /** The branch in a `https://github.com/<owner>/<repo>/tree/<branch>` URL, or `null` if there is none. */
    static getBranchName(url: string): string | null {
        const pattern = /https:\/\/github\.com\/[^\/]+\/[^\/]+\/tree\/([^\/]+)/;
        const match = url.match(pattern);

        return match ? match[1] : null;
    }
}
