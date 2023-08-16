import { bit_check, bit_set, bit_clear } from "./bit";
import { API_VERSION_1_44, API_VERSION_1_45 } from './data_storage';
import semver from "semver";
import { tracking } from "./Analytics";
import $ from 'jquery';

const Features = function (config) {
    const self = this;

    const features = [
        {bit: 0, group: 'rxMode', mode: 'select', name: 'RX_PPM'},
        {bit: 2, group: 'other', name: 'INFLIGHT_ACC_CAL'},
        {bit: 3, group: 'rxMode', mode: 'select', name: 'RX_SERIAL'},
        {bit: 4, group: 'escMotorStop', name: 'MOTOR_STOP'},
        {bit: 5, group: 'other', name: 'SERVO_TILT', haveTip: true, dependsOn: 'SERVOS'},
        {bit: 6, group: 'other', name: 'SOFTSERIAL', haveTip: true},
        {bit: 7, group: 'other', name: 'GPS', haveTip: true, dependsOn: 'GPS'},
        {bit: 9, group: 'other', name: 'SONAR', haveTip: true, dependsOn: 'RANGEFINDER'},
        {bit: 10, group: 'telemetry', name: 'TELEMETRY', haveTip: true, dependsOn: 'TELEMETRY'},
        {bit: 12, group: '3D', name: '3D', haveTip: true},
        {bit: 13, group: 'rxMode', mode: 'select', name: 'RX_PARALLEL_PWM'},
        {bit: 14, group: 'rxMode', mode: 'select', name: 'RX_MSP'},
        {bit: 15, group: 'rssi', name: 'RSSI_ADC'},
        {bit: 16, group: 'other', name: 'LED_STRIP', haveTip: true, dependsOn: 'LED_STRIP'},
        {bit: 17, group: 'other', name: 'DISPLAY', haveTip: true, dependsOn: 'DASHBOARD'},
        {bit: 18, group: 'other', name: 'OSD', haveTip: true, dependsOn: 'OSD'},
        {bit: 20, group: 'other', name: 'CHANNEL_FORWARDING', dependsOn: 'SERVOS'},
        {bit: 21, group: 'other', name: 'TRANSPONDER', haveTip: true, dependsOn: 'TRANSPONDER'},
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

    // Filter features based on build options
    if (semver.gte(config.apiVersion, API_VERSION_1_45) && config.buildOptions.length) {
        self._features = [];

        for (const feature of features) {
            if (config.buildOptions.some(opt => opt.includes(feature.dependsOn)) || feature.dependsOn === undefined) {
                self._features.push(feature);
            }
        }
    }

    self._features.sort((a, b) => a.name.localeCompare(b.name, window.navigator.language, { ignorePunctuation: true }));
    self._featureMask = 0;

    self._analyticsChanges = {};
};

Features.prototype.getMask = function () {
    const self = this;

    tracking.sendChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self._analyticsChanges);
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

    for (const feature of self._features) {
        let feature_tip_html = '';
        const featureName = feature.name;
        const featureBit = feature.bit;

        if (feature.haveTip) {
            feature_tip_html = `<div class="helpicon cf_tip" i18n_title="feature${featureName}Tip"></div>`;
        }

        const newElements = [];

        if (feature.mode === 'select') {
            if (listElements.length === 0) {
                newElements.push($('<option class="feature" value="-1" i18n="featureNone" />'));
            }
            const newElement = $(`<option class="feature" id="feature${featureBit}" name="${featureName}" value="${featureBit}" i18n="feature${featureName}" />`);

            newElements.push(newElement);
            listElements.push(newElement);
        } else {
            let newFeatureName = '';
            if (!feature.hideName) {
                newFeatureName = `<td><div>${featureName}</div></td>`;
            }

            let element = `<tr><td><input class="feature toggle" id="feature${featureBit}"`;
            element += `name="${featureName}" title="${featureName}"`;
            element += `type="checkbox"/></td><td><div>${newFeatureName}</div>`;
            element += `<span class="xs" i18n="feature${featureName}"></span></td>`;
            element += `<td><span class="sm-min" i18n="feature${featureName}"></span>`;
            element += `${feature_tip_html}</td></tr>`;

            const newElement = $(element);

            const featureElement = newElement.find('input.feature');

            featureElement.prop('checked', bit_check(self._featureMask, featureBit));
            featureElement.data('bit', featureBit);

            newElements.push(newElement);
        }

        featuresElements.each(function () {
            if ($(this).hasClass(feature.group)) {
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

export default Features;
