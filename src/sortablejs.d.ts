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

// sortablejs ships no types; this covers only what the blackbox viewer's
// GraphConfigDialog and HeaderDialog call. @types/sortablejs would replace it.
declare module "sortablejs" {
    interface SortableEvent {
        oldIndex?: number;
        newIndex?: number;
    }

    interface SortableOptions {
        handle?: string;
        ghostClass?: string;
        animation?: number;
        onStart?: (event: SortableEvent) => void;
        onEnd?: (event: SortableEvent) => void;
    }

    interface Sortable {
        destroy(): void;
    }

    const Sortable: {
        create(element: HTMLElement, options?: SortableOptions): Sortable;
    };
    export default Sortable;
}
