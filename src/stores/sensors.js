import { defineStore } from "pinia";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export const useSensorsStore = defineStore("sensors", {
    state: () => ({
        // Sensor visibility checkboxes
        checkboxes: [false, false, false, false, false, false],

        // Refresh rates (ms)
        rates: {
            gyro: 50,
            accel: 50,
            mag: 50,
            altitude: 100,
            sonar: 100,
            debug: 500,
        },

        // Scale values
        scales: {
            gyro: 2000,
            accel: 2,
            mag: 2000,
        },

        // Debug columns
        debugColumns: 4,
    }),

    actions: {
        loadFromConfig() {
            const config = getConfig("sensors_tab");
            if (config) {
                if (config.checkboxes) {
                    this.checkboxes = config.checkboxes;
                }
                if (config.rates) {
                    Object.assign(this.rates, config.rates);
                }
                if (config.scales) {
                    Object.assign(this.scales, config.scales);
                }
                if (config.debugColumns) {
                    this.debugColumns = config.debugColumns;
                }
            }
        },

        saveToConfig() {
            setConfig("sensors_tab", {
                checkboxes: this.checkboxes,
                rates: this.rates,
                scales: this.scales,
                debugColumns: this.debugColumns,
            });
        },

        updateRate(sensor, value) {
            this.rates[sensor] = value;
            this.saveToConfig();
        },

        updateScale(sensor, value) {
            this.scales[sensor] = value;
            this.saveToConfig();
        },

        updateCheckbox(index, value) {
            this.checkboxes[index] = value;
            this.saveToConfig();
        },
    },
});
