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

// Types for the parts of check-msp-codes.mjs the unit tests import. The script stays plain
// JavaScript run by Node; tsconfig.json has `allowJs: false`, so TypeScript reads this instead.

/** A firmware header's or MSPCodes.ts's MSP codes, by name. */
export type MspCodeMap = Map<string, number>;

/** One supported firmware ref, newest first in the lists compare() takes. */
export interface FirmwareRef {
    ref: string;
    minor?: number;
    defines: MspCodeMap;
}

/** The minor of `API_VERSION_ACCEPTED`, so the check and the app agree on the oldest firmware. */
export function acceptedApiMinor(dataStorageSource: string): number;

/** `API_VERSION_MINOR` of a firmware's msp_protocol.h. */
export function apiMinor(mspProtocolHeader: string): number;

/**
 * Compare the configurator's names against the firmware's, one map per firmware ref.
 * `refs` is ordered newest first, so a rename reports the current firmware name.
 */
export function compare(
    configurator: MspCodeMap,
    refs: FirmwareRef[],
): {
    errors: string[];
    firmwareOnly: string[];
};

/** Numeric `#define MSP_*` / `MSP2_*` / `MSP2TEXT_*` entries of a firmware header. */
export function parseDefines(text: string): MspCodeMap;

/** The forward entries of a numeric `enum <name> {}` block in `MSPCodes.ts`. */
export function parseEnum(text: string, name: string): MspCodeMap;

/** Both enums under the firmware's names: the text types sit in a separate enum without their prefix. */
export function readConfiguratorCodes(text: string): MspCodeMap;
