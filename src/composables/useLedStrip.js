import { ref, computed } from "vue";
import FC from "@/js/fc.js";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import semver from "semver";
import { API_VERSION_1_46 } from "@/js/data_storage";

// Helper functions moved to outer scope
function getGridPosition(index) {
    const gridNumber = index + 1;
    const row = Math.ceil(gridNumber / 16) - 1;
    let col = ((gridNumber / 16) % 1) * 16 - 1;
    if (col < 0) {
        col = 15;
    }
    return { x: col, y: row };
}

function buildUsedWireNumbers(gridState) {
    const usedWireNumbers = [];
    gridState.forEach((led) => {
        const wireNumber = Number.parseInt(led.wireNumber, 10);
        if (wireNumber >= 0 && !Number.isNaN(wireNumber)) {
            usedWireNumbers.push(wireNumber);
        }
    });
    usedWireNumbers.sort((a, b) => a - b);
    return usedWireNumbers;
}

function hsvToColor(input) {
    if (!input) {
        return "";
    }

    let HSV = { h: Number(input.h), s: Number(input.s), v: Number(input.v) };

    if (HSV.s === 0 && HSV.v === 0) {
        return "";
    }

    HSV = { h: HSV.h, s: 1 - HSV.s / 255, v: HSV.v / 255 };

    const HSL = { h: 0, s: 0, l: 0 };
    HSL.h = HSV.h;
    HSL.l = ((2 - HSV.s) * HSV.v) / 2;

    if (HSL.l && HSL.l < 1) {
        if (HSL.l < 0.5) {
            HSL.s = (HSV.s * HSV.v) / (HSL.l * 2);
        } else {
            HSL.s = (HSV.s * HSV.v) / (2 - HSL.l * 2);
        }
    }

    return `hsl(${HSL.h},${HSL.s * 100}%,${HSL.l * 100}%)`;
}

function areModifiersActive(activeFunction) {
    return ["function-c", "function-a", "function-f"].includes(activeFunction);
}

function areOverlaysActive(activeFunction) {
    const activeFunctions = [
        "",
        "function-c",
        "function-a",
        "function-f",
        "function-p",
        "function-e",
        "function-u",
        "function-s",
        "function-l",
        "function-r",
        "function-y",
        "function-o",
        "function-b",
        "function-g",
    ];
    return activeFunctions.includes(activeFunction);
}

function isWarningActive(activeFunction) {
    const inactiveFunctions = ["function-l", "function-s", "function-g"];
    return !inactiveFunctions.includes(activeFunction);
}

function isVtxActive(activeFunction) {
    const activeFunctions = ["function-v", "function-c", "function-a", "function-f"];
    return activeFunctions.includes(activeFunction);
}

export function useLedStrip() {
    const wireMode = ref(false);
    const selectedColorIndex = ref(null);
    const selectedModeColor = ref(null);
    const selectedLeds = ref(new Set());

    const directions = ["n", "e", "s", "w", "u", "d"];
    const functions = ["i", "w", "f", "a", "t", "r", "c", "g", "s", "b", "l", "o", "y"];
    const baseFuncs = ["c", "f", "a", "l", "s", "g", "r", "p", "e", "u"];

    // Filter overlays based on API version
    let overlays = ["t", "y", "o", "b", "v", "i", "w"];
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        overlays = overlays.filter((x) => x !== "y");
    }

    const ledStrip = computed(() => FC.LED_STRIP);
    const ledColors = computed(() => FC.LED_COLORS);
    const ledModeColors = computed(() => FC.LED_MODE_COLORS);
    const ledConfigValues = computed(() => FC.LED_CONFIG_VALUES);

    // Load LED configuration data
    async function loadData() {
        await MSP.promise(MSPCodes.MSP_LED_STRIP_CONFIG);
        await MSP.promise(MSPCodes.MSP_LED_COLORS);
        await MSP.promise(MSPCodes.MSP_LED_STRIP_MODECOLOR);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            await MSP.promise(MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES);
        }
    }

    // Save configuration to flight controller
    async function saveConfig() {
        // Refactored to reduce nesting
        return new Promise((resolve) => {
            const saveColors = () => {
                mspHelper.sendLedStripColors(saveModeColors);
            };

            const saveModeColors = () => {
                mspHelper.sendLedStripModeColors(writeConfig);
            };

            const writeConfig = () => {
                mspHelper.writeConfiguration(false, resolve);
            };

            mspHelper.sendLedStripConfig(saveColors);
        });
    }

    // Find LED at specific grid coordinates
    function findLed(x, y) {
        for (let ledIndex = 0; ledIndex < FC.LED_STRIP.length; ledIndex++) {
            const led = FC.LED_STRIP[ledIndex];
            if (led.x === x && led.y === y) {
                return { index: ledIndex, led };
            }
        }
        return undefined;
    }

    // Build LED strip from grid state
    function buildLedStripFromGrid(gridState) {
        const ledStripLength = FC.LED_STRIP.length;
        const newLedStrip = [];

        gridState.forEach((led, index) => {
            if (led.functions.length > 0 && led.wireNumber !== "") {
                const { x, y } = getGridPosition(index);
                newLedStrip[led.wireNumber] = {
                    x,
                    y,
                    directions: led.directions.join(""),
                    functions: led.functions.join(""),
                    color: led.colorIndex,
                };
            }
        });

        // Fill empty slots with default LED
        const defaultLed = {
            x: 0,
            y: 0,
            directions: "",
            functions: "",
            color: 0,
        };

        for (let i = 0; i < ledStripLength; i++) {
            if (!newLedStrip[i]) {
                newLedStrip[i] = { ...defaultLed };
            }
        }

        FC.LED_STRIP = newLedStrip;
    }

    // Get next available wire number
    function getNextWireNumber(gridState) {
        const usedWireNumbers = buildUsedWireNumbers(gridState);
        let nextWireNumber = 0;
        for (; nextWireNumber < usedWireNumbers.length; nextWireNumber++) {
            if (usedWireNumbers[nextWireNumber] !== nextWireNumber) {
                break;
            }
        }
        return nextWireNumber;
    }

    // Get mode color
    function getModeColor(mode, dir) {
        for (const mc of FC.LED_MODE_COLORS) {
            if (mc.mode === mode && mc.direction === dir) {
                return mc.color;
            }
        }
        return 3; // Default: Throttle
    }

    // Set mode color
    function setModeColor(mode, dir, color) {
        for (const mc of FC.LED_MODE_COLORS) {
            if (mc.mode === mode && mc.direction === dir) {
                mc.color = color;
                return true;
            }
        }
        return false;
    }

    // Check if rainbow is active for function
    function isRainbowActive(activeFunction) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            return ["function-c", "function-a", "function-f"].includes(activeFunction);
        }
        return false;
    }

    // Update LED config values (brightness, rainbow delta/freq)
    async function updateLedConfigValue(key, value) {
        FC.LED_CONFIG_VALUES[key] = value;
        await mspHelper.sendLedStripConfigValues();
    }

    return {
        // State
        wireMode,
        selectedColorIndex,
        selectedModeColor,
        selectedLeds,

        // Constants
        directions,
        functions,
        baseFuncs,
        overlays,

        // Computed
        ledStrip,
        ledColors,
        ledModeColors,
        ledConfigValues,

        // Methods
        loadData,
        saveConfig,
        findLed,
        getGridPosition,
        buildLedStripFromGrid,
        buildUsedWireNumbers,
        getNextWireNumber,
        hsvToColor,
        getModeColor,
        setModeColor,
        areModifiersActive,
        areOverlaysActive,
        isRainbowActive,
        isWarningActive,
        isVtxActive,
        updateLedConfigValue,
    };
}
