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

import type { Preset } from "../../../stores/presets_helpers";
import type PresetsRepoIndexed from "./PresetsRepoIndexed/PresetsRepoIndexed";

/** A preset the user has picked to apply, with the CLI it resolved to. */
export default class PickedPreset {
    preset: Preset;
    presetCli: string[];
    /** `undefined` when the preset was picked without a repository, so it cannot be keyed or favourited. */
    presetRepo: PresetsRepoIndexed | undefined;
    presetKey: string | undefined;

    constructor(
        preset: Preset,
        presetCli: string[],
        presetRepo: PresetsRepoIndexed | undefined,
        presetKey: string | undefined,
    ) {
        this.preset = preset;
        this.presetCli = presetCli;
        this.presetRepo = presetRepo;
        this.presetKey = presetKey;
    }
}
