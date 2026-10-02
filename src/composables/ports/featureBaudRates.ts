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

/**
 * Baud rates each feature actually honours, as CLI lookup names.
 *
 * These are narrower than the ports tab's lists, which offered every rate the shared port table
 * could hold. From API 1.49 the rate belongs to the feature, so only the ones its driver acts on
 * are worth offering.
 */

// AUTO is deliberately absent: it matches no entry in the firmware's gpsInitData table, so gpsInit
// falls through to its first one and connects at 230400 without saying so.
export const GPS_BAUD_RATES = ["9600", "19200", "38400", "57600", "115200", "230400"];
