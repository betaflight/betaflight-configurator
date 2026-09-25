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

import { computed, onScopeDispose, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

export interface TransientLabel {
    label: ComputedRef<string>;
    flash: (text: string, ms: number) => void;
}

export function useTransientLabel(baseLabel: MaybeRefOrGetter<string>): TransientLabel {
    const transientText = ref<string | null>(null);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const label = computed(() => transientText.value ?? toValue(baseLabel));

    function clear() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function flash(text: string, ms: number) {
        clear();
        transientText.value = text;
        timer = setTimeout(() => {
            timer = null;
            transientText.value = null;
        }, ms);
    }

    onScopeDispose(clear);

    return {
        label,
        flash,
    };
}
