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

interface FilterableMode {
    displayName: string;
    entries: readonly unknown[];
}

/**
 * Filter displayed mode names without changing their order or configuration.
 * Search starts at two non-padding characters and combines with the unused-mode filter.
 */
export function filterModes<T extends FilterableMode>(
    modes: readonly T[],
    searchQuery: string,
    hideUnused: boolean,
): T[] {
    const query = searchQuery.trim().toLowerCase();
    // Keep all modes available when none are configured, matching the existing toggle behavior.
    const onlyUsed = hideUnused && modes.some((mode) => mode.entries.length);

    return modes.filter(
        (mode) =>
            (!onlyUsed || mode.entries.length) && (query.length < 2 || mode.displayName.toLowerCase().includes(query)),
    );
}
