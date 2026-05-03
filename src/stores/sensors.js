import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export const useSensorsStore = defineStore("sensors", () => {
    // Sensor visibility checkboxes
    const checkboxes = ref([false, false, false, false, false, false]);

    // Refresh rates (ms)
    const rates = reactive({
        gyro: 50,
        accel: 50,
        mag: 50,
        altitude: 100,
        sonar: 100,
        debug: 500,
    });

    // Scale values
    const scales = reactive({
        gyro: 2000,
        accel: 2,
        mag: 2000,
    });

    // Debug columns
    const debugColumns = ref(4);

    function loadFromConfig() {
        const config = getConfig("sensors_tab");
        if (config) {
            if (config.checkboxes) {
                checkboxes.value = config.checkboxes;
            }
            if (config.rates) {
                Object.assign(rates, config.rates);
            }
            if (config.scales) {
                Object.assign(scales, config.scales);
            }
            if (config.debugColumns) {
                debugColumns.value = config.debugColumns;
            }
        }
    }

    function saveToConfig() {
        setConfig("sensors_tab", {
            checkboxes: checkboxes.value,
            rates,
            scales,
            debugColumns: debugColumns.value,
        });
    }

    function updateRate(sensor, value) {
        rates[sensor] = value;
        saveToConfig();
    }

    function updateScale(sensor, value) {
        scales[sensor] = value;
        saveToConfig();
    }

    function updateCheckbox(index, value) {
        checkboxes.value[index] = value;
        saveToConfig();
    }

    return {
        checkboxes,
        rates,
        scales,
        debugColumns,
        loadFromConfig,
        saveToConfig,
        updateRate,
        updateScale,
        updateCheckbox,
    };
});
