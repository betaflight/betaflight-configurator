// Import bit manipulation functions for handling beeper statess
import { bit_check, bit_clear, bit_set } from './bit';

class Beepers {
    constructor(config, supportedConditions) {
        const self = this;

        const beepers = [
            { bit: 0, name: 'GYRO_CALIBRATED', visible: true },
            { bit: 1, name: 'RX_LOST', visible: true },
            { bit: 2, name: 'RX_LOST_LANDING', visible: true },
            { bit: 3, name: 'DISARMING', visible: true },
            { bit: 4, name: 'ARMING', visible: true },
            { bit: 5, name: 'ARMING_GPS_FIX', visible: true },
            { bit: 6, name: 'BAT_CRIT_LOW', visible: true },
            { bit: 7, name: 'BAT_LOW', visible: true },
            { bit: 8, name: 'GPS_STATUS', visible: true },
            { bit: 9, name: 'RX_SET', visible: true },
            { bit: 10, name: 'ACC_CALIBRATION', visible: true },
            { bit: 11, name: 'ACC_CALIBRATION_FAIL', visible: true },
            { bit: 12, name: 'READY_BEEP', visible: true },
            { bit: 13, name: 'MULTI_BEEPS', visible: false },
            { bit: 14, name: 'DISARM_REPEAT', visible: true },
            { bit: 15, name: 'ARMED', visible: true },
            { bit: 16, name: 'SYSTEM_INIT', visible: true },
            { bit: 17, name: 'USB', visible: true },
            { bit: 18, name: 'BLACKBOX_ERASE', visible: true },
            { bit: 19, name: 'CRASH_FLIP', visible: true },
            { bit: 20, name: 'CAM_CONNECTION_OPEN', visible: true },
            { bit: 21, name: 'CAM_CONNECTION_CLOSE', visible: true },
            { bit: 22, name: 'RC_SMOOTHING_INIT_FAIL', visible: true },
        ];

        if (supportedConditions) {
            self._beepers = beepers.filter(beeper => 
                supportedConditions.includes(beeper.name)
            );
        } else {
            self._beepers = [...beepers]; // Use spread operator for shallow copy
        }

        self._beeperDisabledMask = 0;
    }

    getDisabledMask() {
        return this._beeperDisabledMask; // Use 'this' instead of 'self'
    }

    setDisabledMask(beeperDisabledMask) {
        this._beeperDisabledMask = beeperDisabledMask; // Use 'this' instead of 'self'
    }

    isEnabled(beeperName) {
        return this._beepers.some(beeper => 
            beeper.name === beeperName && bit_check(this._beeperDisabledMask, beeper.bit)
        );
    }

    generateElements(template, destination) {
        for (let beeper of this._beepers) {
            if (beeper.visible) {
                const element = template.clone();
                destination.append(element);

                const inputElement = element.find('input');
                const labelElement = element.find('div');
                const spanElement = element.find('span');

                inputElement.attr({
                    id: `beeper-${beeper.bit}`,
                    name: beeper.name,
                    title: beeper.name,
                }).prop('checked', !bit_check(this._beeperDisabledMask, beeper.bit))
                  .data('bit', beeper.bit);

                labelElement.text(beeper.name);
                spanElement.attr('i18n', `beeper${beeper.name}`);
                
                element.show();
            }
        }
    }

    updateData(beeperElement) {
        if (beeperElement.attr('type') === 'checkbox') {
            const bit = beeperElement.data('bit');
            if (beeperElement.is(':checked')) {
                this._beeperDisabledMask = bit_clear(this._beeperDisabledMask, bit);
            } else {
                this._beeperDisabledMask = bit_set(this._beeperDisabledMask, bit);
            }
        }
    }
}

export default Beepers;
