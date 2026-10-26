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

export const OSD_CAPACITY_ALARM_KEY = "cap";

export interface OsdAlarmEntry<T> {
    key: string;
    alarm: T;
}

/**
 * The alarms to list in the OSD tab, in insertion order, without the capacity
 * alarm when the battery profile owns it.
 *
 * `OSD.data.alarms` starts out as an empty array until the first MSP_OSD_CONFIG
 * reply. That, null and undefined all give no entries.
 */
export function getVisibleAlarmEntries<T>(
    alarms: Record<string, T> | null | undefined,
    hideCapacityAlarm = false,
): OsdAlarmEntry<T>[] {
    if (!alarms || typeof alarms !== "object" || Array.isArray(alarms)) {
        return [];
    }

    return Object.entries(alarms)
        .filter(([key]) => !(hideCapacityAlarm && key === OSD_CAPACITY_ALARM_KEY))
        .map(([key, alarm]) => ({ key, alarm }));
}
