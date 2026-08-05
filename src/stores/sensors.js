import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export const useSensorsStore = defineStore("sensors", () => {
    // Sensor visibility checkboxes
    const checkboxes = ref([false, false, false, false, false, false]);

    // Global refresh rate (ms). Setting it applies the same rate to every graph
    // so they stay in sync; individual graphs can still be tuned afterwards.
    const globalRate = ref(50);

    // Per-graph refresh rates (ms)
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

    // Per-column debug scales (0 = Auto / dynamic). Indexed by debug column.
    const debugScales = ref(new Array(8).fill(0));

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
            if (typeof config.globalRate === "number") {
                globalRate.value = config.globalRate;
            } else if (config.rates) {
                // Seed the global control from the fastest saved per-sensor rate.
                const legacy = Object.values(config.rates).filter((v) => typeof v === "number");
                if (legacy.length) {
                    globalRate.value = Math.min(...legacy);
                }
            }
            if (config.scales) {
                Object.assign(scales, config.scales);
            }
            if (Array.isArray(config.debugScales)) {
                for (let i = 0; i < debugScales.value.length; i++) {
                    debugScales.value[i] = config.debugScales[i] ?? 0;
                }
            }
            if (config.debugColumns) {
                debugColumns.value = config.debugColumns;
            }
        }
    }

    function saveToConfig() {
        setConfig("sensors_tab", {
            checkboxes: checkboxes.value,
            globalRate: globalRate.value,
            rates,
            scales,
            debugScales: debugScales.value,
            debugColumns: debugColumns.value,
        });
    }

    function updateRate(sensor, value) {
        rates[sensor] = value;
        saveToConfig();
    }

    function updateGlobalRate(value) {
        globalRate.value = value;
        // Apply the global rate to every graph so they stay in sync.
        for (const sensor of Object.keys(rates)) {
            rates[sensor] = value;
        }
        saveToConfig();
    }

    function updateScale(sensor, value) {
        scales[sensor] = value;
        saveToConfig();
    }

    function updateDebugScale(index, value) {
        debugScales.value[index] = value;
        saveToConfig();
    }

    function updateCheckbox(index, value) {
        checkboxes.value[index] = value;
        saveToConfig();
    }

    return {
        checkboxes,
        globalRate,
        rates,
        scales,
        debugScales,
        debugColumns,
        loadFromConfig,
        saveToConfig,
        updateRate,
        updateGlobalRate,
        updateScale,
        updateDebugScale,
        updateCheckbox,
    };
});
