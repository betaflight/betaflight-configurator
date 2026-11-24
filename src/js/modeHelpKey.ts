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

// Permanent IDs of the PINIO user modes (BOXUSER1..4 in firmware msp_box.c).
const USER_MODE_FIRST_ID = 40;
const USER_MODE_COUNT = 4;

/**
 * i18n key for a mode's help text.
 *
 * USER1..4 may be renamed per board (BOX_USERn_NAME in config.h, e.g. "VTX PWR", "CAM SW").
 * Those labels are free text, so we never derive a key from them: user modes always use
 * the generic USERn help, picked by mode ID.
 */
export function getModeHelpKey(modeId: number, boxName: string): string {
    const userIndex = modeId - USER_MODE_FIRST_ID;
    if (userIndex >= 0 && userIndex < USER_MODE_COUNT) {
        return `auxiliaryHelpMode_USER${userIndex + 1}`;
    }

    return `auxiliaryHelpMode_${boxName.replaceAll(" ", "")}`;
}
