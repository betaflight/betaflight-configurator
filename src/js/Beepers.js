'use strict';

var Beepers = function (config, supportedConditions) {
    var self = this;

    var beepers = [
        {bit: 0, name: 'GYRO_CALIBRATED', visible: true},
        {bit: 1, name: 'RX_LOST', visible: true},
        {bit: 2, name: 'RX_LOST_LANDING', visible: true},
        {bit: 3, name: 'DISARMING', visible: true},
        {bit: 4, name: 'ARMING', visible: true},
        {bit: 5, name: 'ARMING_GPS_FIX', visible: true},
        {bit: 6, name: 'BAT_CRIT_LOW', visible: true},
        {bit: 7, name: 'BAT_LOW', visible: true},
        {bit: 8, name: 'GPS_STATUS', visible: true},
        {bit: 9, name: 'RX_SET', visible: true},
        {bit: 10, name: 'ACC_CALIBRATION', visible: true},
        {bit: 11, name: 'ACC_CALIBRATION_FAIL', visible: true},
        {bit: 12, name: 'READY_BEEP', visible: true},
        {bit: 13, name: 'MULTI_BEEPS', visible: false}, // do not show
        {bit: 14, name: 'DISARM_REPEAT', visible: true},
        {bit: 15, name: 'ARMED', visible: true},
        {bit: 16, name: 'SYSTEM_INIT', visible: true},
        {bit: 17, name: 'USB', visible: true},
        {bit: 18, name: 'BLACKBOX_ERASE', visible: true},
    ];

    if (semver.gte(config.apiVersion, "1.37.0")) {
        beepers.push(
            {bit: 19, name: 'CRASH_FLIP', visible: true},
            {bit: 20, name: 'CAM_CONNECTION_OPEN', visible: true},
            {bit: 21, name: 'CAM_CONNECTION_CLOSE', visible: true},
        );
    }

    if (semver.gte(config.apiVersion, "1.39.0")) {
        beepers.push(
            {bit: 22, name: 'RC_SMOOTHING_INIT_FAIL', visible: true},
        );
    }

    if (supportedConditions) {
        self._beepers = [];
        beepers.forEach(function (beeper) {
            if (supportedConditions.some(function (supportedCondition) {
                    return supportedCondition === beeper.name;
                })) {
                self._beepers.push(beeper);
            }
        });
    } else {
        self._beepers = beepers.slice();
    }

    self._beeperMask = 0;
};

Beepers.prototype.getMask = function () {
    var self = this;

    return self._beeperMask;
};

Beepers.prototype.setMask = function (beeperMask) {
    var self = this;

    self._beeperMask = beeperMask;
};

Beepers.prototype.isEnabled = function (beeperName) {
    var self = this;

    for (var i = 0; i < self._beepers.length; i++) {
        if (self._beepers[i].name === beeperName && bit_check(self._beeperOfMask, self._beepers[i].bit)) {
            return true;
        }
    }
    return false;
};

Beepers.prototype.generateElements = function (template, destination) {
    var self = this;

    for (var i = 0; i < self._beepers.length; i++) {
        if (self._beepers[i].visible) {
            var element = template.clone();
            destination.append(element);

            var input_e = $(element).find('input');
            var label_e = $(element).find('div');
            var span_e = $(element).find('span');

            input_e.attr('id', 'beeper-' + i);
            input_e.attr('name', self._beepers[i].name);
            input_e.attr('title', self._beepers[i].name);
            input_e.prop('checked', bit_check(self._beeperMask, self._beepers[i].bit) == 0);
            input_e.data('bit', self._beepers[i].bit);

            label_e.text(self._beepers[i].name);

            span_e.attr('i18n', 'beeper' + self._beepers[i].name);

            element.show();
        }
    }
};

Beepers.prototype.updateData = function (beeperElement) {
    var self = this;

    if (beeperElement.attr('type') === 'checkbox') {
        var bit = beeperElement.data('bit');

        if (beeperElement.is(':checked')) {
            self._beeperMask = bit_clear(self._beeperMask, bit);
        } else {
            self._beeperMask = bit_set(self._beeperMask, bit);
        }
    }
};
