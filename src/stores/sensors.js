import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export const useSensorsStore = defineStore("sensors", () => {
    // Sensor visibility checkboxes
    const checkboxes = ref([false, false, false, false, false, false]);

    // Global refresh rate (ms) shared by every graph so they stay in sync
    const globalRate = ref(50);

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
            if (typeof config.globalRate === "number") {
                globalRate.value = config.globalRate;
            } else if (config.rates) {
                // Migrate legacy per-sensor rates to a single global rate.
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
            scales,
            debugScales: debugScales.value,
            debugColumns: debugColumns.value,
        });
    }

    function updateGlobalRate(value) {
        globalRate.value = value;
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
        scales,
        debugScales,
        debugColumns,
        loadFromConfig,
        saveToConfig,
        updateGlobalRate,
        updateScale,
        updateDebugScale,
        updateCheckbox,
    };
});
