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

import { betaflightModel } from "../../components/init";
import { isExpertModeEnabled } from "./isExpertModeEnabled";

// Delegate tab visibility to Vue via template v-show bindings. This function now
// only syncs the expert mode state to the global Vue model if present. The features
// argument is no longer read; callers still pass it.
export function updateTabList(_features?: unknown): void {
    try {
        if (betaflightModel.expertMode !== undefined) {
            betaflightModel.expertMode = isExpertModeEnabled();
        }
    } catch {
        // noop: if Vue model not available, do nothing
    }
}
