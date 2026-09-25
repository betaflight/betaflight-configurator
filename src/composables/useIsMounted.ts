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

import { onMounted, onUnmounted, ref, type Ref } from "vue";

/**
 * Tracks whether the current component is mounted.
 * @returns true between mount and unmount
 */
export function useIsMounted(): Ref<boolean> {
    const isMounted = ref(false);

    onMounted(() => {
        isMounted.value = true;
    });

    onUnmounted(() => {
        isMounted.value = false;
    });

    return isMounted;
}
