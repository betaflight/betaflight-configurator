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

import { bit_check, bit_set, bit_clear } from "./bit";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "./data_storage";
import semver from "semver";
import { getTracking } from "./Analytics";

export interface FeaturesConfig {
    apiVersion: string;
    buildOptions?: string[];
}

export interface FeatureDefinition {
    bit: number;
    group: string;
    name: string;
    mode?: "select";
    haveTip?: boolean;
    hideName?: boolean;
    dependsOn?: string;
}

/**
 * What updateData() accepts: a checkbox or select element, or a plain `{ name, checked }` from a
 * Vue component. It is read by duck typing, since the element and object paths share no type.
 */
export interface FeatureControl {
    type?: string;
    localName?: string;
    tagName?: string;
    getAttribute?(name: string): string | null;
    dataset?: DOMStringMap;
    checked?: boolean;
    children?: Iterable<Element>;
    value?: string;
    name?: string;
}

function addFeatureDependsOn(obj: FeatureDefinition[], featureName: string, dependsOn: string) {
    obj.forEach((f) => {
        if (f.name === featureName) {
            f.dependsOn = dependsOn;
        }
    });
}

class Features {
    _features: FeatureDefinition[];
    _featureMask = 0;
    _analyticsChanges: Record<string, string> = {};

    constructor(config: FeaturesConfig) {
        const features: FeatureDefinition[] = [
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
            // USE_TRANSPONDER is target-defined but absent from the reportable build-option table.
            { bit: 21, group: "other", name: "TRANSPONDER", haveTip: true },
            { bit: 22, group: "other", name: "AIRMODE", haveTip: true },
            { bit: 25, group: "rxMode", mode: "select", name: "RX_SPI" },
            { bit: 27, group: "escSensor", name: "ESC_SENSOR" },
            { bit: 28, group: "antiGravity", name: "ANTI_GRAVITY", haveTip: true, hideName: true },
        ];

        this._features = features;

        if (semver.gte(config.apiVersion, API_VERSION_1_47)) {
            addFeatureDependsOn(this._features, "SOFTSERIAL", "SOFTSERIAL");
        }

        const buildOptions = config.buildOptions;
        if (buildOptions?.length) {
            // Filter features based on build options
            if (semver.gte(config.apiVersion, API_VERSION_1_45)) {
                this._features = [];

                for (const feature of features) {
                    const dependsOn = feature.dependsOn;
                    // `includes(undefined)` looked for the text "undefined"; kept as it was.
                    if (buildOptions.some((opt) => opt.includes(String(dependsOn))) || dependsOn === undefined) {
                        this._features.push(feature);
                    }
                }
            }

            // Add TELEMETRY feature if any of the following protocols are used: CRSF, GHST, FPORT, JETI
            if (semver.gte(config.apiVersion, API_VERSION_1_46)) {
                const enableTelemetry = buildOptions.some(
                    (opt) =>
                        opt.includes("CRSF") || opt.includes("GHST") || opt.includes("FPORT") || opt.includes("JETI"),
                );

                const telemetryFeature = this._features.find((f) => f.name === "TELEMETRY");
                if (enableTelemetry && !telemetryFeature) {
                    this._features.push({
                        bit: 10,
                        group: "telemetry",
                        name: "TELEMETRY",
                        haveTip: true,
                        dependsOn: "TELEMETRY",
                    });
                }
            }
        }

        this._features.sort((a, b) =>
            a.name.localeCompare(b.name, window.navigator.language, { ignorePunctuation: true }),
        );
    }

    getMask(): number {
        const tracking = getTracking();
        tracking?.sendChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, this._analyticsChanges);
        this._analyticsChanges = {};

        return this._featureMask;
    }

    /**
     * Side-effect free counterpart to getMask(), which flushes pending analytics changes.
     * @returns the current feature bitmask
     */
    peekMask(): number {
        return this._featureMask;
    }

    setMask(featureMask: number) {
        this._featureMask = featureMask;
    }

    getFeatures(): FeatureDefinition[] {
        return this._features;
    }

    isEnabled(featureName: string): boolean {
        for (const element of this._features) {
            if (element.name === featureName && bit_check(this._featureMask, element.bit)) {
                return true;
            }
        }
        return false;
    }

    enable(featureName: string) {
        for (const element of this._features) {
            if (element.name === featureName) {
                this._featureMask = bit_set(this._featureMask, element.bit);
            }
        }
    }

    disable(featureName: string) {
        for (const element of this._features) {
            if (element.name === featureName) {
                this._featureMask = bit_clear(this._featureMask, element.bit);
            }
        }
    }

    findFeatureByBit(bit: number): FeatureDefinition | undefined {
        return this._features.find((feature) => feature.bit === bit);
    }

    updateData(featureElement: FeatureControl) {
        // Support both native DOM elements and plain objects { name, checked }
        const type = featureElement.type ?? featureElement.getAttribute?.("type");
        const localName = featureElement.localName ?? featureElement.tagName?.toLowerCase();

        if (type === "checkbox") {
            this.updateFromCheckbox(featureElement);
        } else if (localName === "select") {
            this.updateFromSelect(featureElement);
        } else if (featureElement.name) {
            // Plain object path: { name, checked } — used by Vue components
            const feature = this._features.find((f) => f.name === featureElement.name);
            if (feature) {
                if (featureElement.checked) {
                    this._featureMask = bit_set(this._featureMask, feature.bit);
                } else {
                    this._featureMask = bit_clear(this._featureMask, feature.bit);
                }
                this._analyticsChanges[`Feature${feature.name}`] = featureElement.checked ? "On" : "Off";
            }
        }
    }

    private updateFromCheckbox(featureElement: FeatureControl) {
        const bit = Number.parseInt(
            String(featureElement.dataset?.bit ?? featureElement.getAttribute?.("data-bit")),
            10,
        );
        let featureValue;

        if (featureElement.checked) {
            this._featureMask = bit_set(this._featureMask, bit);
            featureValue = "On";
        } else {
            this._featureMask = bit_clear(this._featureMask, bit);
            featureValue = "Off";
        }
        // An unknown bit threw a TypeError on `.name` of undefined; it still throws.
        const feature = this.findFeatureByBit(bit);
        if (!feature) {
            throw new TypeError(`No feature for bit ${bit}`);
        }
        this._analyticsChanges[`Feature${feature.name}`] = featureValue;
    }

    private updateFromSelect(featureElement: FeatureControl) {
        const selectedBit = Number.parseInt(String(featureElement.value), 10);
        let selectedFeature;
        for (const controlElement of featureElement.children ?? []) {
            // <option> children carry the bit; anything else parses to NaN, as it did before.
            const bit = Number.parseInt(String("value" in controlElement ? controlElement.value : undefined), 10);
            if (bit === -1) {
                continue;
            }
            if (selectedBit === bit) {
                this._featureMask = bit_set(this._featureMask, bit);
                selectedFeature = this.findFeatureByBit(bit);
            } else {
                this._featureMask = bit_clear(this._featureMask, bit);
            }
        }
        if (selectedFeature) {
            this._analyticsChanges[`FeatureGroup-${selectedFeature.group}`] = selectedFeature.name;
        }
    }
}

export default Features;
