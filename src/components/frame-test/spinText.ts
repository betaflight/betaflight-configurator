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

import { i18n } from "@/js/localization";
import type { SpinVerdict } from "@/stores/frameSpinCheck";

const list = (motors: number[]) => motors.map((m) => m + 1).join(", ");

/** The spin check in words: all as Quad X, or which motor turns the wrong way or gave no answer. */
export function spinText(verdict: SpinVerdict): string {
    if (verdict.ok) {
        return i18n.getMessage("frameSpinOk");
    }
    const parts: string[] = [];
    if (verdict.wrongWay.length) {
        parts.push(i18n.getMessage("frameSpinWrongWay", { list: list(verdict.wrongWay) }));
    }
    if (verdict.silent.length) {
        parts.push(i18n.getMessage("frameSpinSilent", { list: list(verdict.silent) }));
    }
    return parts.join(" ");
}
