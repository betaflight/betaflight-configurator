import { bit_check, bit_set, bit_clear } from "./bit";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "./data_storage";
import semver from "semver";
import { tracking } from "./Analytics";

const Features = function (config) {
    const self = this;

    const features = [
        { bit: 0, group: "rxMode", mode: "select", name: "RX_PPM", dependsOn: "RX_PPM" },
        { bit: 2, group: "other", name: "INFLIGHT_ACC_CAL" },
        { bit: 3, group: "rxMode", mode: "select", name: "RX_SERIAL" },
        { bit: 4, group: "escMotorStop", name: "MOTOR_STOP", haveTip: true },
        { bit: 5, group: "other", name: "SERVO_TILT", haveTip: true, dependsOn: "SERVOS" },
        { bit: 6, group: "other", name: "SOFTSERIAL", haveTip: true },
        { bit: 7, group: "gps", name: "GPS", dependsOn: "GPS" },
        { bit: 9, group: "other", name: "SONAR", haveTip: true, dependsOn: "RANGEFINDER" },
        { bit: 10, group: "telemetry", name: "TELEMETRY", haveTip: true, dependsOn: "TELEMETRY" },
        { bit: 12, group: "3D", name: "3D", haveTip: true },
        { bit: 13, group: "rxMode", mode: "select", name: "RX_PARALLEL_PWM" },
        { bit: 14, group: "rxMode", mode: "select", name: "RX_MSP" },
        { bit: 15, group: "rssi", name: "RSSI_ADC" },
        { bit: 16, group: "other", name: "LED_STRIP", haveTip: true, dependsOn: "LED_STRIP" },
        { bit: 17, group: "other", name: "DISPLAY", haveTip: true, dependsOn: "DASHBOARD" },
        { bit: 18, group: "other", name: "OSD", haveTip: true, dependsOn: "OSD" },
        { bit: 20, group: "other", name: "CHANNEL_FORWARDING", dependsOn: "SERVOS" },
        { bit: 21, group: "other", name: "TRANSPONDER", haveTip: true, dependsOn: "TRANSPONDER" },
        { bit: 22, group: "other", name: "AIRMODE", haveTip: true },
        { bit: 25, group: "rxMode", mode: "select", name: "RX_SPI" },
        { bit: 27, group: "escSensor", name: "ESC_SENSOR" },
        { bit: 28, group: "antiGravity", name: "ANTI_GRAVITY", haveTip: true, hideName: true },
    ];

    self._features = features;

    function addFeatureDependsOn(obj, featureName, dependsOn) {
        obj.forEach((f) => {
            if (f.name === featureName) {
                f.dependsOn = dependsOn;
            }
        });
    }

    if (semver.gte(config.apiVersion, API_VERSION_1_47)) {
        addFeatureDependsOn(self._features, "SOFTSERIAL", "SOFTSERIAL");
    }

    if (config.buildOptions?.length) {
        // Filter features based on build options
        if (semver.gte(config.apiVersion, API_VERSION_1_45)) {
            self._features = [];

            for (const feature of features) {
                if (
                    config.buildOptions.some((opt) => opt.includes(feature.dependsOn)) ||
                    feature.dependsOn === undefined
                ) {
                    self._features.push(feature);
                }
            }
        }

        // Add TELEMETRY feature if any of the following protocols are used: CRSF, GHST, FPORT, JETI
        if (semver.gte(config.apiVersion, API_VERSION_1_46)) {
            let enableTelemetry = false;
            if (
                config.buildOptions.some(
                    (opt) =>
                        opt.includes("CRSF") || opt.includes("GHST") || opt.includes("FPORT") || opt.includes("JETI"),
                )
            ) {
                enableTelemetry = true;
            }

            const telemetryFeature = self._features.filter((f) => f.name === "TELEMETRY")?.[0];
            if (enableTelemetry && !telemetryFeature) {
                self._features.push({
                    bit: 10,
                    group: "telemetry",
                    name: "TELEMETRY",
                    haveTip: true,
                    dependsOn: "TELEMETRY",
                });
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

    let noneOptAppended = false;

    // Normalize to an array of native DOM elements
    const containers =
        featuresElements instanceof NodeList || Array.isArray(featuresElements)
            ? Array.from(featuresElements)
            : [featuresElements];

    for (const feature of self._features) {
        let feature_tip_html = "";
        const featureName = feature.name;
        const featureBit = feature.bit;

        if (feature.haveTip) {
            feature_tip_html = `<div class="helpicon cf_tip" i18n_title="feature${featureName}Tip"></div>`;
        }

        if (feature.mode === "select") {
            if (!noneOptAppended) {
                const noneOpt = document.createElement("option");
                noneOpt.className = "feature";
                noneOpt.value = "-1";
                noneOpt.setAttribute("i18n", "featureNone");
                for (const c of containers) {
                    if (c.classList.contains(feature.group)) {
                        c.appendChild(noneOpt.cloneNode(true));
                    }
                }
                noneOptAppended = true;
            }
            const opt = document.createElement("option");
            opt.className = "feature";
            opt.id = `feature${featureBit}`;
            opt.setAttribute("name", featureName);
            opt.value = `${featureBit}`;
            opt.setAttribute("i18n", `feature${featureName}`);

            opt.selected = bit_check(self._featureMask, featureBit);

            for (const c of containers) {
                if (c.classList.contains(feature.group)) {
                    c.appendChild(opt.cloneNode(true));
                }
            }
        } else {
            let newFeatureName = "";
            if (!feature.hideName) {
                newFeatureName = featureName;
            }

            let html = `<tr><td><input class="feature toggle" id="feature${featureBit}"`;
            html += `name="${featureName}" title="${featureName}"`;
            html += `type="checkbox"/></td><td><div>${newFeatureName}</div>`;
            html += `<span class="xs" i18n="feature${featureName}"></span></td>`;
            html += `<td><span class="sm-min" i18n="feature${featureName}"></span>`;
            if (feature.haveTip) {
                html += feature_tip_html;
            }
            html += "</td></tr>";

            const template = document.createElement("template");
            template.innerHTML = html;
            const newElement = template.content.firstElementChild;

            const featureInput = newElement.querySelector("input.feature");
            if (featureInput) {
                featureInput.checked = bit_check(self._featureMask, featureBit);
                featureInput.dataset.bit = featureBit;
            }

            for (const c of containers) {
                if (c.classList.contains(feature.group)) {
                    c.appendChild(newElement.cloneNode(true));
                }
            }
        }
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

    // Support both native DOM elements and plain objects { name, checked }
    const type = featureElement.type ?? featureElement.getAttribute?.("type");
    const localName = featureElement.localName ?? featureElement.tagName?.toLowerCase();

    if (type === "checkbox") {
        const bit = Number.parseInt(featureElement.dataset?.bit ?? featureElement.getAttribute?.("data-bit"), 10);
        const checked = featureElement.checked;
        let featureValue;

        if (checked) {
            self._featureMask = bit_set(self._featureMask, bit);
            featureValue = "On";
        } else {
            self._featureMask = bit_clear(self._featureMask, bit);
            featureValue = "Off";
        }
        self._analyticsChanges[`Feature${self.findFeatureByBit(bit).name}`] = featureValue;
    } else if (localName === "select") {
        const controlElements = featureElement.children;
        const selectedBit = Number.parseInt(featureElement.value, 10);
        let selectedFeature;
        for (const controlElement of controlElements) {
            const bit = Number.parseInt(controlElement.value, 10);
            if (bit === -1) {
                continue;
            }
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
    } else if (featureElement.name) {
        // Plain object path: { name, checked } — used by Vue components
        const feature = self._features.find((f) => f.name === featureElement.name);
        if (feature) {
            if (featureElement.checked) {
                self._featureMask = bit_set(self._featureMask, feature.bit);
            } else {
                self._featureMask = bit_clear(self._featureMask, feature.bit);
            }
            self._analyticsChanges[`Feature${feature.name}`] = featureElement.checked ? "On" : "Off";
        }
    }
};

export default Features;
