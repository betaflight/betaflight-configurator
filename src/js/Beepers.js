import { bit_check, bit_clear, bit_set } from "./bit";

class Beepers {
    constructor(config, supportedConditions) {
        const self = this;

        const beepers = [
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

        if (supportedConditions) {
            self._beepers = [];
            beepers.forEach(function (beeper) {
                if (
                    supportedConditions.some(function (supportedCondition) {
                        return supportedCondition === beeper.name;
                    })
                ) {
                    self._beepers.push(beeper);
                }
            });
        } else {
            self._beepers = beepers.slice();
        }

        self._beeperDisabledMask = 0;
    }
    getDisabledMask() {
        const self = this;

        return self._beeperDisabledMask;
    }
    setDisabledMask(beeperDisabledMask) {
        const self = this;

        self._beeperDisabledMask = beeperDisabledMask;
    }
    isEnabled(beeperName) {
        const self = this;

        for (let i = 0; i < self._beepers.length; i++) {
            if (self._beepers[i].name === beeperName && bit_check(self._beeperOfMask, self._beepers[i].bit)) {
                return true;
            }
        }
        return false;
    }
    generateElements(template, destination) {
        const self = this;

        for (let i = 0; i < self._beepers.length; i++) {
            if (self._beepers[i].visible) {
                const element = template.cloneNode(true);
                destination.appendChild(element);

                const inputElement = element.querySelector("input");
                const labelElement = element.querySelector("div");
                const spanElement = element.querySelector("span");

                if (inputElement) {
                    inputElement.id = `beeper-${i}`;
                    inputElement.name = self._beepers[i].name;
                    inputElement.title = self._beepers[i].name;
                    inputElement.checked = !bit_check(self._beeperDisabledMask, self._beepers[i].bit);
                    inputElement.dataset.bit = self._beepers[i].bit;
                }

                if (labelElement) {
                    labelElement.textContent = self._beepers[i].name;
                }
                if (spanElement) {
                    spanElement.setAttribute("i18n", `beeper${self._beepers[i].name}`);
                }

                element.style.display = "";
            }
        }
    }
    updateData(beeperElement) {
        const self = this;

        const type = beeperElement.type ?? beeperElement.getAttribute?.("type");

        if (type === "checkbox") {
            const bit = Number.parseInt(beeperElement.dataset?.bit ?? beeperElement.getAttribute?.("data-bit"), 10);

            if (beeperElement.checked) {
                self._beeperDisabledMask = bit_clear(self._beeperDisabledMask, bit);
            } else {
                self._beeperDisabledMask = bit_set(self._beeperDisabledMask, bit);
            }
        }
    }
}

export default Beepers;
