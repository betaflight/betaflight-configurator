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

import { bit_check, bit_clear, bit_set } from "./bit";

export interface Beeper {
    bit: number;
    name: string;
    visible: boolean;
}

/** The checkbox shape updateData() reads; an HTMLInputElement satisfies it. */
export interface BeeperCheckbox {
    type?: string;
    checked: boolean;
    dataset?: { bit?: string };
    getAttribute?(name: string): string | null;
}

class Beepers {
    _beepers: Beeper[];
    _beeperDisabledMask: number;

    // The first argument is FC.CONFIG, accepted for the callers' sake and not read.
    constructor(_config?: unknown, supportedConditions?: string[]) {
        const beepers: Beeper[] = [
            { bit: 0, name: "GYRO_CALIBRATED", visible: true },
            { bit: 1, name: "RX_LOST", visible: true },
            { bit: 2, name: "RX_LOST_LANDING", visible: true },
            { bit: 3, name: "DISARMING", visible: true },
            { bit: 4, name: "ARMING", visible: true },
            { bit: 5, name: "ARMING_GPS_FIX", visible: true },
            { bit: 6, name: "BAT_CRIT_LOW", visible: true },
            { bit: 7, name: "BAT_LOW", visible: true },
            { bit: 8, name: "GPS_STATUS", visible: true },
            { bit: 9, name: "RX_SET", visible: true },
            { bit: 10, name: "ACC_CALIBRATION", visible: true },
            { bit: 11, name: "ACC_CALIBRATION_FAIL", visible: true },
            { bit: 12, name: "READY_BEEP", visible: true },
            { bit: 13, name: "MULTI_BEEPS", visible: false },
            { bit: 14, name: "DISARM_REPEAT", visible: true },
            { bit: 15, name: "ARMED", visible: true },
            { bit: 16, name: "SYSTEM_INIT", visible: true },
            { bit: 17, name: "USB", visible: true },
            { bit: 18, name: "BLACKBOX_ERASE", visible: true },
            { bit: 19, name: "CRASH_FLIP", visible: true },
            { bit: 20, name: "CAM_CONNECTION_OPEN", visible: true },
            { bit: 21, name: "CAM_CONNECTION_CLOSE", visible: true },
            { bit: 22, name: "RC_SMOOTHING_INIT_FAIL", visible: true },
        ];

        this._beepers = supportedConditions
            ? beepers.filter((beeper) => supportedConditions.includes(beeper.name))
            : beepers.slice();

        this._beeperDisabledMask = 0;
    }
    getDisabledMask() {
        return this._beeperDisabledMask;
    }
    setDisabledMask(beeperDisabledMask: number) {
        this._beeperDisabledMask = beeperDisabledMask;
    }
    isEnabled(beeperName: string) {
        const beeper = this._beepers.find((b) => b.name === beeperName);

        return beeper ? !bit_check(this._beeperDisabledMask, beeper.bit) : false;
    }
    setEnabled(beeperName: string, enabled: boolean) {
        const beeper = this._beepers.find((b) => b.name === beeperName);

        if (beeper) {
            if (enabled) {
                this._beeperDisabledMask = bit_clear(this._beeperDisabledMask, beeper.bit);
            } else {
                this._beeperDisabledMask = bit_set(this._beeperDisabledMask, beeper.bit);
            }
        }
    }
    generateElements(template: HTMLElement, destination: HTMLElement) {
        for (let i = 0; i < this._beepers.length; i++) {
            if (this._beepers[i].visible) {
                const element = template.cloneNode(true) as HTMLElement;
                destination.appendChild(element);

                const inputElement = element.querySelector("input");
                const labelElement = element.querySelector("div");
                const spanElement = element.querySelector("span");

                if (inputElement) {
                    inputElement.id = `beeper-${i}`;
                    inputElement.name = this._beepers[i].name;
                    inputElement.title = this._beepers[i].name;
                    inputElement.checked = !bit_check(this._beeperDisabledMask, this._beepers[i].bit);
                    inputElement.dataset.bit = String(this._beepers[i].bit);
                }

                if (labelElement) {
                    labelElement.textContent = this._beepers[i].name;
                }
                if (spanElement) {
                    spanElement.setAttribute("i18n", `beeper${this._beepers[i].name}`);
                }

                element.style.display = "";
            }
        }
    }
    updateData(beeperElement: BeeperCheckbox) {
        const type = beeperElement.type ?? beeperElement.getAttribute?.("type");

        if (type === "checkbox") {
            const bit = Number.parseInt(
                beeperElement.dataset?.bit ?? beeperElement.getAttribute?.("data-bit") ?? "",
                10,
            );

            if (beeperElement.checked) {
                this._beeperDisabledMask = bit_clear(this._beeperDisabledMask, bit);
            } else {
                this._beeperDisabledMask = bit_set(this._beeperDisabledMask, bit);
            }
        }
    }
}

export default Beepers;
