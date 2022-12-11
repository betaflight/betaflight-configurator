'use strict';

const Features = function (config) {
    const self = this;

    const features = [
        {bit: 0, group: 'rxMode', mode: 'select', name: 'RX_PPM'},
        {bit: 1, group: 'batteryVoltage', name: 'VBAT'},
        {bit: 2, group: 'other', name: 'INFLIGHT_ACC_CAL'},
        {bit: 3, group: 'rxMode', mode: 'select', name: 'RX_SERIAL'},
        {bit: 4, group: 'escMotorStop', name: 'MOTOR_STOP'},
        {bit: 5, group: 'other', name: 'SERVO_TILT', haveTip: true},
        {bit: 6, group: 'other', name: 'SOFTSERIAL', haveTip: true},
        {bit: 7, group: 'gps', name: 'GPS', haveTip: true},
        {bit: 9, group: 'other', name: 'SONAR'},
        {bit: 10, group: 'telemetry', name: 'TELEMETRY'},
        {bit: 11, group: 'batteryCurrent', name: 'CURRENT_METER'},
        {bit: 12, group: '3D', name: '3D'},
        {bit: 13, group: 'rxMode', mode: 'select', name: 'RX_PARALLEL_PWM'},
        {bit: 14, group: 'rxMode', mode: 'select', name: 'RX_MSP'},
        {bit: 15, group: 'rssi', name: 'RSSI_ADC'},
        {bit: 16, group: 'other', name: 'LED_STRIP'},
        {bit: 17, group: 'other', name: 'DISPLAY', haveTip: true},
        {bit: 18, group: 'other', name: 'OSD'},
        {bit: 19, group: 'other', name: 'BLACKBOX', haveTip: true},
        {bit: 20, group: 'other', name: 'CHANNEL_FORWARDING'},
        {bit: 21, group: 'other', name: 'TRANSPONDER', haveTip: true},
        {bit: 22, group: 'other', name: 'AIRMODE'},
        {bit: 25, group: 'rxMode', mode: 'select', name: 'RX_SPI'},
        {bit: 27, group: 'escSensor', name: 'ESC_SENSOR'},
        {bit: 28, group: 'antiGravity', name: 'ANTI_GRAVITY', haveTip: true, hideName: true},
    ];

    if (semver.lt(config.apiVersion, API_VERSION_1_44)) { // DYNAMIC_FILTER got removed from FEATURES in BF 4.3 / API 1.44
        features.push(
            {bit: 29, group: 'other', name: 'DYNAMIC_FILTER'},
        );
    }

    self._features = features;
    self._featureMask = 0;

    self._analyticsChanges = {};
};

Features.prototype.getMask = function () {
    const self = this;

    analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self._analyticsChanges);
    self._analyticsChanges = {};

    return self._featureMask;
};

Features.prototype.setMask = function (featureMask) {
    const self = this;

    self._featureMask = featureMask;
};

Features.prototype.isEnabled = function (featureName) {
    const self = this;

    for (const element of self._features) {
        if (element.name === featureName && bit_check(self._featureMask, element.bit)) {
            return true;
        }
    }
    return false;
};

Features.prototype.enable = function (featureName) {
    const self = this;

    for (const element of self._features) {
        if (element.name === featureName) {
            self._featureMask = bit_set(self._featureMask, element.bit);
        }
    }
};

Features.prototype.disable = function (featureName) {
    const self = this;

    for (const element of self._features) {
        if (element.name === featureName) {
            self._featureMask = bit_clear(self._featureMask, element.bit);
        }
    }
};

Features.prototype.generateElements = function (featuresElements) {
    const self = this;

    self._featureChanges = {};

    const listElements = [];

    for (let i = 0; i < self._features.length; i++) {
        let feature_tip_html = '';
        const rawFeatureName = self._features[i].name;
        const featureBit = self._features[i].bit;

        if (self._features[i].haveTip) {
            feature_tip_html = `<div class="helpicon cf_tip" i18n_title="feature${rawFeatureName}Tip"></div>`;
        }

        const newElements = [];

        if (self._features[i].mode === 'select') {
            if (listElements.length === 0) {
                newElements.push($('<option class="feature" value="-1" i18n="featureNone" />'));
            }
            const newElement = $(`<option class="feature" id="feature${i}" name="${rawFeatureName}" value="${featureBit}" i18n="feature${rawFeatureName}" />`);

            newElements.push(newElement);
            listElements.push(newElement);
        } else {
            let featureName = '';
            if (!self._features[i].hideName) {
                featureName = `<td><div>${rawFeatureName}</div></td>`;
            }

            let element = `<tr><td><input class="feature toggle" id="feature${i}"`;
            element += `name="${self._features[i].name}" title="${self._features[i].name}"`;
            element += `type="checkbox"/></td><td><div>${featureName}</div>`;
            element += `<span class="xs" i18n="feature${self._features[i].name}"></span></td>`;
            element += `<td><span class="sm-min" i18n="feature${self._features[i].name}"></span>`;
            element += `${feature_tip_html}</td></tr>`;

            const newElement = $(element);

            const featureElement = newElement.find('input.feature');

            featureElement.prop('checked', bit_check(self._featureMask, featureBit));
            featureElement.data('bit', featureBit);

            newElements.push(newElement);
        }

        featuresElements.each(function () {
            if ($(this).hasClass(self._features[i].group)) {
                $(this).append(newElements);
            }
        });
    }

    for (const element of listElements) {
        const bit = parseInt(element.attr('value'));
        const state = bit_check(self._featureMask, bit);

        element.prop('selected', state);
    }
};

Features.prototype.findFeatureByBit = function (bit) {
    const self = this;

    for (const feature of self._features) {
        if (feature.bit === bit) {
            return feature;
        }
    }
};

Features.prototype.updateData = function (featureElement) {
    const self = this;

    if (featureElement.attr('type') === 'checkbox') {
        const bit = featureElement.data('bit');
        let featureValue;

        if (featureElement.is(':checked')) {
            self._featureMask = bit_set(self._featureMask, bit);
            featureValue = 'On';
        } else {
            self._featureMask = bit_clear(self._featureMask, bit);
            featureValue = 'Off';
        }
        self._analyticsChanges[`Feature${self.findFeatureByBit(bit).name}`] = featureValue;
    } else if (featureElement.prop('localName') === 'select') {
        const controlElements = featureElement.children();
        const selectedBit = featureElement.val();
        if (selectedBit !== -1) {
            let selectedFeature;
            for (const controlElement of controlElements) {
                const bit = controlElement.value;
                if (selectedBit === bit) {
                    self._featureMask = bit_set(self._featureMask, bit);
                    selectedFeature = self.findFeatureByBit(bit);
                } else {
                    self._featureMask = bit_clear(self._featureMask, bit);
                }
            }
            if (selectedFeature) {
                self._analyticsChanges[`FeatureGroup-${selectedFeature.group}`] = selectedFeature.name;
            }
        }
    }
};
