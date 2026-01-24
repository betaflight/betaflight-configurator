<template>
    <BaseTab tab-name="led-strip" @mounted="onTabMounted">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabLedStrip')"></div>
            <WikiButton doc-url="led-strip" />

            <div class="note">
                <p v-html="$t('ledStripHelp')"></p>
            </div>

            <!-- LED Grid Container -->
            <div class="grid-container">
                <!-- LED Grid with custom selection -->
                <LedGrid
                    :grid-leds="gridLeds"
                    :wire-mode="wireMode"
                    :selected-indices="selectedIndices"
                    :hsv-to-color="hsvToColor"
                    :led-colors="ledColors"
                    @selection-change="onSelectionChange"
                    @selection-end="onSelectionEnd"
                />

                <!-- Grid sections overlay -->
                <div class="gridSections">
                    <div class="block" v-for="i in 16" :key="i"></div>
                </div>
            </div>

            <!-- Controls Panel -->
            <div class="controls">
                <div class="top-controls">
                    <!-- Wires Remaining -->
                    <div class="wires-remaining">
                        <div>{{ wiresRemaining }}</div>
                        <span v-html="$t('ledStripRemainingText')"></span>
                    </div>

                    <div class="clear-buttons-container">
                        <!-- Clear Buttons -->
                        <button
                            class="funcClear"
                            :disabled="!hasSelection"
                            @click="clearSelected"
                            v-html="$t('ledStripClearSelectedButton')"
                        ></button>
                        <button class="funcClearAll" @click="clearAll" v-html="$t('ledStripClearAllButton')"></button>
                    </div>
                </div>
                <!-- Function Selection -->
                <div class="section" v-html="$t('ledStripFunctionSection')"></div>

                <div class="select">
                    <span v-html="$t('ledStripFunctionTitle')"></span>
                    <select
                        id="ledStripFunctionSelect"
                        class="functionSelect"
                        v-model="selectedFunction"
                        @change="onFunctionChange"
                    >
                        <option value="" v-html="$t('ledStripFunctionNoneOption')"></option>
                        <option value="function-c" v-html="$t('ledStripFunctionColorOption')"></option>
                        <option value="function-f" v-html="$t('ledStripFunctionModesOption')"></option>
                        <option value="function-a" v-html="$t('ledStripFunctionArmOption')"></option>
                        <option value="function-l" v-html="$t('ledStripFunctionBatteryOption')"></option>
                        <option value="function-s" v-html="$t('ledStripFunctionRSSIOption')"></option>
                        <option value="function-g" v-html="$t('ledStripFunctionGPSOption')"></option>
                        <option value="function-r" v-html="$t('ledStripFunctionRingOption')"></option>
                        <option value="function-p" v-html="$t('ledStripFunctionGPSBarOption')"></option>
                        <option value="function-e" v-html="$t('ledStripFunctionBatteryBarOption')"></option>
                        <option value="function-u" v-html="$t('ledStripFunctionAltitudeOption')"></option>
                    </select>
                </div>

                <!-- Color Modifiers -->
                <div class="modifiers" v-show="showModifiers">
                    <span class="header" v-html="$t('ledStripColorModifierTitle')"></span>

                    <div class="checkbox">
                        <input
                            type="checkbox"
                            id="throttleHue"
                            name="ThrottleHue"
                            class="toggle function-t"
                            v-model="modifiers.throttleHue"
                            @change="onModifierChange('t')"
                        />
                        <label for="throttleHue">
                            <select
                                id="auxSelectThrottle"
                                class="auxSelect"
                                v-model="auxChannelValue"
                                aria-label="Aux Channel"
                            >
                                <option value="0" v-html="$t('controlAxisRoll')"></option>
                                <option value="1" v-html="$t('controlAxisPitch')"></option>
                                <option value="2" v-html="$t('controlAxisYaw')"></option>
                                <option value="3" v-html="$t('controlAxisThrottle')"></option>
                                <option value="4" v-html="$t('controlAxisAux1')"></option>
                                <option value="5" v-html="$t('controlAxisAux2')"></option>
                                <option value="6" v-html="$t('controlAxisAux3')"></option>
                                <option value="7" v-html="$t('controlAxisAux4')"></option>
                                <option value="8" v-html="$t('controlAxisAux5')"></option>
                                <option value="9" v-html="$t('controlAxisAux6')"></option>
                                <option value="10" v-html="$t('controlAxisAux7')"></option>
                                <option value="11" v-html="$t('controlAxisAux8')"></option>
                            </select>
                            <span class="labelSelect" v-html="$t('controlAxisThrottle')"></span>
                        </label>
                    </div>

                    <div class="checkbox">
                        <input
                            type="checkbox"
                            id="larsonScanner"
                            name="LarsonScanner"
                            class="toggle function-o"
                            v-model="modifiers.larsonScanner"
                            @change="onModifierChange('o')"
                        />
                        <label for="larsonScanner"><span v-html="$t('ledStripLarsonOverlay')"></span></label>
                    </div>

                    <div class="checkbox">
                        <input
                            type="checkbox"
                            id="blink"
                            name="blink"
                            class="toggle function-b"
                            v-model="modifiers.blink"
                            @change="onModifierChange('b')"
                        />
                        <label for="blink"><span v-html="$t('ledStripBlinkAlwaysOverlay')"></span></label>
                    </div>

                    <div class="checkbox rainbowOverlay" v-show="showRainbow">
                        <input
                            type="checkbox"
                            id="rainbow"
                            name="Rainbow"
                            class="toggle function-y"
                            v-model="modifiers.rainbow"
                            @change="onModifierChange('y')"
                        />
                        <label for="rainbow"><span v-html="$t('ledStripRainbowOverlay')"></span></label>
                        <div class="sliders-group" v-show="modifiers.rainbow">
                            <span v-html="$t('ledStripRainbowDeltaSliderTitle')"></span>
                            <div class="slider-control">
                                <Vue3Slider
                                    v-model="rainbowDelta"
                                    :min="0"
                                    :max="359"
                                    width="150px"
                                    :height="6"
                                    color="var(--primary-500)"
                                    track-color="var(--surface-400)"
                                    :tooltip="true"
                                    tooltip-color="var(--primary-500)"
                                />
                                <div class="helpicon cf_tip" :title="$t('ledStripRainbowDeltaSliderHelp')"></div>
                            </div>
                            <span v-html="$t('ledStripRainbowFreqSliderTitle')"></span>
                            <div class="slider-control">
                                <Vue3Slider
                                    v-model="rainbowFreq"
                                    :min="1"
                                    :max="360"
                                    width="150px"
                                    :height="6"
                                    color="var(--primary-500)"
                                    track-color="var(--surface-400)"
                                    :tooltip="true"
                                    tooltip-color="var(--primary-500)"
                                />
                                <div class="helpicon cf_tip" :title="$t('ledStripRainbowFreqSliderHelp')"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Overlays -->
                <div class="overlays" v-show="showOverlays">
                    <span class="header" v-html="$t('ledStripOverlayTitle')"></span>
                    <div class="checkbox warningOverlay" v-show="showWarning">
                        <input
                            type="checkbox"
                            id="warnings"
                            name="Warnings"
                            class="toggle function-w"
                            v-model="overlayStates.warnings"
                            @change="onOverlayChange('w')"
                        />
                        <label for="warnings"><span v-html="$t('ledStripWarningsOverlay')"></span></label>
                    </div>
                    <div class="checkbox indicatorOverlay">
                        <input
                            type="checkbox"
                            id="indicator"
                            name="Indicator"
                            class="toggle function-i"
                            v-model="overlayStates.indicator"
                            @change="onOverlayChange('i')"
                        />
                        <label for="indicator"><span v-html="$t('ledStripIndecatorOverlay')"></span></label>
                    </div>
                    <div class="checkbox vtxOverlay" v-show="showVtx">
                        <input
                            type="checkbox"
                            id="vtx"
                            name="Vtx"
                            class="toggle function-v"
                            v-model="overlayStates.vtx"
                            @change="onOverlayChange('v')"
                        />
                        <label for="vtx"><span v-html="$t('ledStripVtxOverlay')"></span></label>
                    </div>
                </div>

                <!-- Mode Colors -->
                <div class="mode_colors" v-show="showModeColors">
                    <div class="section" v-html="$t('ledStripModeColorsTitle')"></div>

                    <select id="ledStripModeColorsModeSelect" class="modeSelect gps" v-model="modeColorsMode">
                        <option value="0" v-html="$t('ledStripModeColorsModeOrientation')"></option>
                        <option value="1" v-html="$t('ledStripModeColorsModeHeadfree')"></option>
                        <option value="2" v-html="$t('ledStripModeColorsModeHorizon')"></option>
                        <option value="3" v-html="$t('ledStripModeColorsModeAngle')"></option>
                        <option value="4" v-html="$t('ledStripModeColorsModeMag')"></option>
                        <option value="5" v-html="$t('ledStripModeColorsModeBaro')"></option>
                    </select>

                    <button
                        v-for="i in 6"
                        :key="`mode-${i - 1}`"
                        :class="getModeColorButtonClass(modeColorsMode, i - 1)"
                        :style="getModeColorButtonStyle(modeColorsMode, i - 1)"
                        @click="handleModeColorClick(modeColorsMode, i - 1)"
                        v-html="$t(getModeColorButtonLabel(i - 1))"
                    ></button>
                </div>

                <!-- Directions -->
                <div class="section" v-html="$t('ledStripModesOrientationTitle')"></div>
                <div class="directions">
                    <button
                        v-for="dir in directions"
                        :key="dir"
                        :class="['dir-' + dir, { btnOn: activeDirections.has(dir) }]"
                        @click="toggleDirection(dir)"
                        v-html="$t('ledStripDir' + dir.toUpperCase())"
                    ></button>
                </div>

                <!-- Colors -->
                <div class="colors">
                    <div class="colorDefineSliders" ref="colorDefineSliders">
                        <div v-html="$t('ledStripColorSetupTitle')"></div>
                        <div class="colorDefineSliderContainer">
                            <label for="colorSliderH" class="colorDefineSliderLabel" v-html="$t('ledStripH')"></label>
                            <input
                                id="colorSliderH"
                                class="sliderHSV"
                                type="range"
                                min="0"
                                max="359"
                                v-model.number="colorHSV.h"
                                @input="onColorSliderChange"
                            />
                            <span class="colorDefineSliderValue Hvalue">{{ colorHSV.h }}</span>
                        </div>
                        <div class="colorDefineSliderContainer">
                            <label for="colorSliderS" class="colorDefineSliderLabel" v-html="$t('ledStripS')"></label>
                            <input
                                id="colorSliderS"
                                class="sliderHSV"
                                type="range"
                                min="0"
                                max="255"
                                v-model.number="colorHSV.s"
                                @input="onColorSliderChange"
                            />
                            <span class="colorDefineSliderValue Svalue">{{ colorHSV.s }}</span>
                        </div>
                        <div class="colorDefineSliderContainer">
                            <label for="colorSliderV" class="colorDefineSliderLabel" v-html="$t('ledStripV')"></label>
                            <input
                                id="colorSliderV"
                                class="sliderHSV"
                                type="range"
                                min="0"
                                max="255"
                                v-model.number="colorHSV.v"
                                @input="onColorSliderChange"
                            />
                            <span class="colorDefineSliderValue Vvalue">{{ colorHSV.v }}</span>
                        </div>
                    </div>
                    <button
                        v-for="i in 16"
                        :key="`color-${i - 1}`"
                        :class="['color-' + (i - 1), { btnOn: selectedColorIndex === i - 1 }]"
                        :style="{ backgroundColor: getColorStyle(i - 1) }"
                        :title="$t(getColorTitle(i - 1))"
                        @click="selectColor(i - 1)"
                        @dblclick="openColorSliders($event)"
                    >
                        {{ i - 1 }}
                    </button>
                </div>

                <!-- Special Colors -->
                <div class="special_colors mode_colors" v-show="showSpecialColors">
                    <div class="section" v-html="$t('ledStripModesSpecialColorsTitle')"></div>

                    <select id="ledStripModeGpsModeSelect" class="modeSelect flightmode" v-model="specialColorsMode">
                        <option value="0" v-html="$t('ledStripModeGpsDefault')"></option>
                        <option value="1" v-html="$t('ledStripModeGpsBar')"></option>
                    </select>

                    <button
                        v-for="config in specialColorButtons"
                        :key="config.key"
                        v-show="config.show"
                        :class="getModeColorButtonClass(6, config.direction)"
                        :style="getModeColorButtonStyle(6, config.direction)"
                        :title="$t(config.titleKey)"
                        @click="handleModeColorClick(6, config.direction)"
                        v-html="$t(config.labelKey)"
                    ></button>
                </div>

                <!-- Brightness Slider -->
                <div class="slider-container" v-show="showBrightness">
                    <span v-html="$t('ledStripBrightnessSliderTitle')"></span>
                    <div class="slider-control">
                        <Vue3Slider
                            v-model="brightness"
                            :min="5"
                            :max="100"
                            width="150px"
                            :height="6"
                            color="var(--primary-500)"
                            track-color="var(--surface-400)"
                            :tooltip="true"
                            tooltip-color="var(--primary-500)"
                        />
                        <div class="helpicon cf_tip" :title="$t('ledStripBrightnessSliderHelp')"></div>
                    </div>
                </div>

                <!-- Wiring Mode -->
                <div class="section" v-html="$t('ledStripWiring')"></div>
                <div class="wiring-container">
                    <button
                        class="funcWire w100"
                        :class="{ btnOn: wireMode }"
                        @click="toggleWireMode"
                        v-html="$t('ledStripWiringMode')"
                    ></button>
                    <div class="wiringControls">
                        <button
                            class="funcWireClearSelect w50"
                            @click="clearWiresSelected"
                            v-html="$t('ledStripWiringClearControl')"
                        ></button>
                        <button
                            class="funcWireClear w50"
                            @click="clearWiresAll"
                            v-html="$t('ledStripWiringClearAllControl')"
                        ></button>
                    </div>
                </div>
                <p v-html="$t('ledStripWiringMessage')"></p>
            </div>

            <div class="clear-both"></div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn save_btn">
                <a class="save" href="#" @click.prevent="save">
                    <span v-html="saveButtonText"></span>
                </a>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import LedGrid from "./led_strip/LedGrid.vue";
import slider from "vue3-slider";
import { useLedStrip } from "@/composables/useLedStrip";
import { i18n } from "@/js/localization";
import { gui_log } from "@/js/gui_log";
import GUI from "@/js/gui";
import semver from "semver";
import FC from "@/js/fc";
import { API_VERSION_1_46 } from "@/js/data_storage";

// Register vue3-slider component
const Vue3Slider = slider;

const {
    wireMode,
    directions,
    baseFuncs,
    overlays,
    ledColors,
    ledConfigValues,
    loadData,
    saveConfig,
    buildLedStripFromGrid,
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
} = useLedStrip();

// Grid state (256 LEDs in 16x16 grid)
const gridLeds = reactive(
    Array.from({ length: 256 }, () => ({
        wireNumber: "",
        functions: [],
        directions: [],
        colorIndex: 0,
        overlays: {},
    })),
);

// Selection state
const selectedIndices = ref(new Set());
const selectedFunction = ref("");
const selectedColorIndex = ref(0);

// Modifier states
const modifiers = reactive({
    throttleHue: false,
    larsonScanner: false,
    blink: false,
    rainbow: false,
});

// Overlay states
const overlayStates = reactive({
    warnings: false,
    indicator: false,
    vtx: false,
});

// Other state
const activeDirections = ref(new Set());
const modeColorsMode = ref(0);
const specialColorsMode = ref(0);
const selectedModeColor = ref(null);
const auxChannelValue = ref("3");
const colorDefineSliders = ref(null);
const colorHSV = reactive({ h: 0, s: 0, v: 0 });
const saveButtonText = ref(i18n.getMessage("ledStripButtonSave"));

// Sliders
const brightness = ref(50);
const rainbowDelta = ref(0);
const rainbowFreq = ref(1);

// Computed properties
const wiresRemaining = computed(() => {
    const usedCount = gridLeds.filter((led) => led.wireNumber !== "").length;
    return FC.LED_STRIP.length - usedCount;
});

const hasSelection = computed(() => selectedIndices.value.size > 0);

const showModifiers = computed(() => areModifiersActive(selectedFunction.value));
const showOverlays = computed(() => areOverlaysActive(selectedFunction.value));
const showRainbow = computed(() => isRainbowActive(selectedFunction.value));
const showWarning = computed(() => isWarningActive(selectedFunction.value));
const showVtx = computed(() => isVtxActive(selectedFunction.value));
const showModeColors = computed(() => selectedFunction.value === "function-f");
const showBrightness = computed(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46));

const showSpecialColors = computed(() => {
    const func = selectedFunction.value;
    return func === "function-g" || func === "function-a" || func === "function-b";
});

const specialColorButtons = computed(() => [
    {
        key: "disarmed",
        direction: 0,
        show: selectedFunction.value === "function-a",
        titleKey: "colorGreen",
        labelKey: "ledStripModeColorsModeDisarmed",
    },
    {
        key: "armed",
        direction: 1,
        show: selectedFunction.value === "function-a",
        titleKey: "colorBlue",
        labelKey: "ledStripModeColorsModeArmed",
    },
    {
        key: "animation",
        direction: 2,
        show: false,
        titleKey: "colorWhite",
        labelKey: "ledStripModeColorsModeAnimation",
    },
    {
        key: "blinkBg",
        direction: 4,
        show: selectedFunction.value === "function-b",
        titleKey: "colorBlack",
        labelKey: "ledStripModeColorsModeBlinkBg",
    },
    {
        key: "gpsNoSats",
        direction: 5,
        show: selectedFunction.value === "function-g",
        titleKey: "colorRed",
        labelKey: "ledStripModeColorsModeGPSNoSats",
    },
    {
        key: "gpsNoLock",
        direction: 6,
        show: selectedFunction.value === "function-g",
        titleKey: "colorOrange",
        labelKey: "ledStripModeColorsModeGPSNoLock",
    },
    {
        key: "gpsLocked",
        direction: 7,
        show: selectedFunction.value === "function-g",
        titleKey: "colorGreen",
        labelKey: "ledStripModeColorsModeGPSLocked",
    },
]);

// Lifecycle
const onTabMounted = async () => {
    try {
        await loadData();
        initializeGrid();
        loadConfigValues();
        GUI.content_ready();
    } catch (error) {
        console.error("Failed to load LED strip data:", error);
    }
};

// Initialize grid from LED strip config
function initializeGrid() {
    // Reset grid
    gridLeds.forEach((led) => {
        led.wireNumber = "";
        led.functions = [];
        led.directions = [];
        led.colorIndex = 0;
        led.overlays = {};
    });

    // Populate from LED strip
    FC.LED_STRIP.forEach((led, ledIndex) => {
        if (
            !led ||
            (led.functions[0] === "c" &&
                led.functions.length === 1 &&
                led.directions.length === 0 &&
                led.color === 0 &&
                led.x === 0 &&
                led.y === 0)
        ) {
            return;
        }

        // Find grid index from coordinates
        const gridIndex = led.y * 16 + led.x;
        if (gridIndex >= 0 && gridIndex < 256) {
            gridLeds[gridIndex].wireNumber = String(ledIndex);
            gridLeds[gridIndex].functions = Array.from(led.functions || "");
            gridLeds[gridIndex].directions = Array.from(led.directions || "");
            gridLeds[gridIndex].colorIndex = led.color || 0;
        }
    });
}

// Load config values
function loadConfigValues() {
    brightness.value = ledConfigValues.value?.brightness || 50;
    rainbowDelta.value = ledConfigValues.value?.rainbow_delta || 0;
    rainbowFreq.value = ledConfigValues.value?.rainbow_freq || 1;
}

// Selection handlers for custom grid
function onSelectionChange(newSelection) {
    selectedIndices.value = newSelection;
}

function onSelectionEnd() {
    handleSelectionComplete();
}

// Handle selection complete (update UI state)
function handleSelectionComplete() {
    if (selectedIndices.value.size === 0) {
        return;
    }

    // Auto-wire in wire mode
    if (wireMode.value) {
        selectedIndices.value.forEach((index) => {
            if (gridLeds[index].wireNumber === "") {
                const nextWire = getNextWireNumber(gridLeds);
                if (nextWire < FC.LED_STRIP.length) {
                    gridLeds[index].wireNumber = String(nextWire);
                }
            }
        });
    }

    // Update UI state from last selected LED
    const lastSelected = Array.from(selectedIndices.value).pop();
    const led = gridLeds[lastSelected];

    // Update selected color
    selectedColorIndex.value = led.colorIndex;

    // Update selected function
    const baseFunc = led.functions.find((f) => baseFuncs.includes(f));
    selectedFunction.value = baseFunc ? `function-${baseFunc}` : "";

    // Update directions
    activeDirections.value = new Set(led.directions);

    // Update overlays
    overlays.forEach((overlay) => {
        const key = getOverlayStateKey(overlay);
        if (key) {
            overlayStates[key] = led.functions.includes(overlay);
        }
    });

    // Update modifiers
    modifiers.throttleHue = led.functions.includes("t");
    modifiers.larsonScanner = led.functions.includes("o");
    modifiers.blink = led.functions.includes("b");
    modifiers.rainbow = led.functions.includes("y");

    // Update color sliders
    updateColorSliders(led.colorIndex);

    // Update LED strip
    buildLedStripFromGrid(gridLeds);
}

// Clear functions
function clearSelected() {
    if (selectedIndices.value.size === 0) {
        return;
    }

    selectedIndices.value.forEach((index) => {
        gridLeds[index].functions = [];
        gridLeds[index].directions = [];
        gridLeds[index].wireNumber = "";
        gridLeds[index].colorIndex = 0;
    });

    // Clear UI state
    selectedFunction.value = "";
    activeDirections.value.clear();
    Object.keys(overlayStates).forEach((key) => {
        overlayStates[key] = false;
    });
    Object.keys(modifiers).forEach((key) => {
        modifiers[key] = false;
    });

    buildLedStripFromGrid(gridLeds);
}

function clearAll() {
    gridLeds.forEach((led) => {
        led.functions = [];
        led.directions = [];
        led.wireNumber = "";
        led.colorIndex = 0;
    });

    // Clear UI state
    selectedFunction.value = "";
    activeDirections.value.clear();
    Object.keys(overlayStates).forEach((key) => {
        overlayStates[key] = false;
    });
    Object.keys(modifiers).forEach((key) => {
        modifiers[key] = false;
    });

    // Clear selection
    selectedIndices.value = new Set();

    buildLedStripFromGrid(gridLeds);
}

// Function change
function onFunctionChange() {
    if (selectedIndices.value.size === 0) {
        return;
    }

    const funcLetter = selectedFunction.value.replace("function-", "");

    selectedIndices.value.forEach((index) => {
        if (gridLeds[index].wireNumber !== "") {
            // Remove all base functions
            gridLeds[index].functions = gridLeds[index].functions.filter((f) => !baseFuncs.includes(f));

            // Add new function
            if (funcLetter && baseFuncs.includes(funcLetter)) {
                gridLeds[index].functions.push(funcLetter);
            }
        }
    });

    buildLedStripFromGrid(gridLeds);
}

// Direction toggle
function toggleDirection(dir) {
    if (selectedIndices.value.size === 0) {
        return;
    }

    const isActive = activeDirections.value.has(dir);

    selectedIndices.value.forEach((index) => {
        if (isActive) {
            const dirIndex = gridLeds[index].directions.indexOf(dir);
            if (dirIndex !== -1) {
                gridLeds[index].directions.splice(dirIndex, 1);
            }
        } else if (!gridLeds[index].directions.includes(dir)) {
            gridLeds[index].directions.push(dir);
        }
    });

    if (isActive) {
        activeDirections.value.delete(dir);
    } else {
        activeDirections.value.add(dir);
    }

    buildLedStripFromGrid(gridLeds);
}

// Modifier change
function onModifierChange(modifier) {
    if (selectedIndices.value.size === 0) {
        return;
    }

    const isActive = getModifierState(modifier);

    // Disable conflicting modifiers
    if (modifier === "o" && isActive && modifiers.blink) {
        modifiers.blink = false;
        removeOverlayFromSelected("b");
    } else if (modifier === "b" && isActive && modifiers.larsonScanner) {
        modifiers.larsonScanner = false;
        removeOverlayFromSelected("o");
    }

    selectedIndices.value.forEach((index) => {
        if (isActive) {
            if (!gridLeds[index].functions.includes(modifier)) {
                gridLeds[index].functions.push(modifier);
            }
        } else {
            const modIndex = gridLeds[index].functions.indexOf(modifier);
            if (modIndex !== -1) {
                gridLeds[index].functions.splice(modIndex, 1);
            }
        }
    });

    buildLedStripFromGrid(gridLeds);
}

// Overlay change
function onOverlayChange(overlay) {
    if (selectedIndices.value.size === 0) {
        return;
    }

    const key = getOverlayStateKey(overlay);
    const isActive = overlayStates[key];

    selectedIndices.value.forEach((index) => {
        if (isActive) {
            if (!gridLeds[index].functions.includes(overlay)) {
                gridLeds[index].functions.push(overlay);
            }
        } else {
            const overlayIndex = gridLeds[index].functions.indexOf(overlay);
            if (overlayIndex !== -1) {
                gridLeds[index].functions.splice(overlayIndex, 1);
            }
        }
    });

    buildLedStripFromGrid(gridLeds);
}

// Color selection
function selectColor(colorIndex) {
    selectedColorIndex.value = colorIndex;

    if (selectedIndices.value.size > 0) {
        selectedIndices.value.forEach((index) => {
            gridLeds[index].colorIndex = colorIndex;
        });
        buildLedStripFromGrid(gridLeds);
    }

    updateColorSliders(colorIndex);

    // If mode color is selected, update it
    if (selectedModeColor.value) {
        setModeColor(selectedModeColor.value.mode, selectedModeColor.value.direction, colorIndex);
    }
}

function updateColorSliders(colorIndex) {
    const color = ledColors.value[colorIndex];
    if (color) {
        colorHSV.h = color.h;
        colorHSV.s = color.s;
        colorHSV.v = color.v;
    }
}

function onColorSliderChange() {
    if (selectedColorIndex.value !== null) {
        ledColors.value[selectedColorIndex.value].h = colorHSV.h;
        ledColors.value[selectedColorIndex.value].s = colorHSV.s;
        ledColors.value[selectedColorIndex.value].v = colorHSV.v;
        buildLedStripFromGrid(gridLeds);
    }
}

function openColorSliders(event) {
    const target = event.currentTarget;
    const position = target.getBoundingClientRect();
    const sliders = colorDefineSliders.value;

    if (sliders) {
        const slidersWidth = sliders.offsetWidth;
        const targetWidth = target.offsetWidth;

        if (position.left + slidersWidth / 2 + targetWidth + 14 > window.innerWidth) {
            sliders.style.left = "auto";
            sliders.style.right = "0";
        } else {
            sliders.style.left = `${position.left - slidersWidth / 2 + targetWidth}px`;
            sliders.style.right = "auto";
        }

        sliders.style.top = `${position.top + 26}px`;
        sliders.style.display = "block";
    }
}

// Mode color handlers
function handleModeColorClick(mode, direction) {
    const modeColorActive = selectedModeColor.value?.mode === mode && selectedModeColor.value?.direction === direction;

    if (modeColorActive) {
        selectedModeColor.value = null;
    } else {
        selectedModeColor.value = { mode, direction };
        const colorIndex = getModeColor(mode, direction);
        selectColor(colorIndex);
    }
}

function getModeColorButtonClass(mode, direction) {
    return `mode_color-${mode}-${direction}`;
}

function getModeColorButtonStyle(mode, direction) {
    const colorIndex = getModeColor(mode, direction);
    return {
        backgroundColor: getColorStyle(colorIndex),
    };
}

function getModeColorButtonLabel(direction) {
    const labels = ["ledStripDirN", "ledStripDirE", "ledStripDirS", "ledStripDirW", "ledStripDirU", "ledStripDirD"];
    return labels[direction] || "";
}

// Wiring
function toggleWireMode() {
    wireMode.value = !wireMode.value;
}

function clearWiresSelected() {
    selectedIndices.value.forEach((index) => {
        gridLeds[index].wireNumber = "";
    });
    buildLedStripFromGrid(gridLeds);
}

function clearWiresAll() {
    gridLeds.forEach((led) => {
        led.wireNumber = "";
    });
    buildLedStripFromGrid(gridLeds);
}

// Watch slider changes and update LED config values
watch(brightness, (newValue) => {
    updateLedConfigValue("brightness", newValue);
});

watch(rainbowDelta, (newValue) => {
    updateLedConfigValue("rainbow_delta", newValue);
});

watch(rainbowFreq, (newValue) => {
    updateLedConfigValue("rainbow_freq", newValue);
});

// Save
async function save() {
    const saveButton = saveButtonText;
    const oldText = i18n.getMessage("ledStripButtonSave");

    try {
        saveButton.value = i18n.getMessage("buttonSaving");
        await saveConfig();

        saveButton.value = i18n.getMessage("buttonSaved");
        setTimeout(() => {
            saveButton.value = oldText;
        }, 1500);

        gui_log(i18n.getMessage("eeprom_saved_ok"));
    } catch (error) {
        console.error("Save failed:", error);
        saveButton.value = oldText;
    }
}

// Helper functions
function getColorStyle(colorIndex) {
    return hsvToColor(ledColors.value[colorIndex]);
}

function getColorTitle(colorIndex) {
    const colorNames = [
        "colorBlack",
        "colorWhite",
        "colorRed",
        "colorOrange",
        "colorYellow",
        "colorLimeGreen",
        "colorGreen",
        "colorMintGreen",
        "colorCyan",
        "colorLightBlue",
        "colorBlue",
        "colorDarkViolet",
        "colorMagenta",
        "colorDeepPink",
        "colorBlack",
        "colorBlack",
    ];
    return colorNames[colorIndex] || "colorBlack";
}

function getModifierState(modifier) {
    const map = { t: "throttleHue", o: "larsonScanner", b: "blink", y: "rainbow" };
    return modifiers[map[modifier]] || false;
}

function getOverlayStateKey(overlay) {
    const map = { w: "warnings", i: "indicator", v: "vtx" };
    return map[overlay];
}

function removeOverlayFromSelected(overlay) {
    selectedIndices.value.forEach((index) => {
        const overlayIndex = gridLeds[index].functions.indexOf(overlay);
        if (overlayIndex !== -1) {
            gridLeds[index].functions.splice(overlayIndex, 1);
        }
    });
}

// Watch aux channel
watch(auxChannelValue, (newVal) => {
    setModeColor(7, 0, Number.parseInt(newVal, 10));
});

// Mounted hook
onMounted(() => {
    onTabMounted();
});
</script>

<style scoped>
.content_wrapper {
    position: relative;
    padding: 1rem;
}

.cf_column {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.note {
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background: var(--surface-100);
    border-left: 3px solid var(--primary-500);
}

.section {
    color: var(--text);
    font-size: 1.1em;
    margin: 20px 0 5px 0;
    border-bottom: 1px solid var(--primary-500);
}

/* Grid Container */
.grid-container {
    position: relative;
    float: left;
    margin-right: 30px;
    width: calc((24px + 7px) * 16);
    height: calc((24px + 7px) * 16);
}

/* Grid Sections Overlay */
.gridSections {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    width: calc((24px + 7px) * 16);
    height: calc((24px + 7px) * 16);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    pointer-events: none;
    user-select: none;
}

.gridSections .block {
    width: 122px;
    height: 122px;
    float: left;
    border: 1px solid var(--surface-500);
}

/* Controls Panel */
.controls {
    position: relative;
    float: left;
    width: 325px;
}

/* Top controls layout */
.top-controls {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.clear-buttons-container {
    display: flex;
    gap: 4px;
    flex: 1;
}

.clear-buttons-container button {
    flex: 1;
    margin: 0;
}

.wires-remaining {
    text-align: center;
    font-size: 14px;
    flex-shrink: 0;
}

.wires-remaining div {
    font-size: 40px;
    color: var(--primary-500);
    margin-bottom: -5px;
    margin-top: -10px;
}

.wires-remaining.error div {
    color: var(--error-500);
}

/* Buttons */
button {
    text-align: center;
    font-weight: bold;
    border: 1px solid var(--primary-600);
    background-color: var(--primary-500);
    border-radius: 3px;
    padding: 7px 6px;
    margin: 3px 0;
    cursor: pointer;
    transition: all 0.2s ease;
    color: black;
}

/* Buttons within controls - add left/right padding */
.controls button {
    padding: 7px 10px;
    margin: 3px 4px;
}

button:hover:not(:disabled) {
    background-color: var(--primary-600);
    border-color: var(--primary-700);
}

button:active:not(:disabled) {
    transform: scale(0.98);
}

/* Disabled button styles */
button:disabled,
button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--surface-300);
    border-color: var(--surface-500);
    color: white;
}

button:disabled:hover,
button.disabled:hover {
    background-color: var(--surface-300);
    border-color: var(--surface-500);
}

button:disabled:active,
button.disabled:active {
    transform: none;
}

/* Save button specific styling */
a.save {
    display: inline-block;
    min-width: 64px;
    text-align: center;
    color: black;
}

.funcWire.btnOn {
    background: rgb(15, 171, 22);
    border-color: rgb(15, 171, 22);
}

.w100 {
    width: 100%;
}

.w50 {
    width: 49%;
}

/* Wiring section layout */
.wiring-container {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 10px;
}

.wiring-container > button {
    margin: 3px 0;
}

.wiringControls {
    display: flex;
    justify-content: space-between;
    width: 100%;
}

.wiringControls button {
    margin: 3px 0;
    flex: 0 0 calc(50% - 5px);
}

/* Select Dropdowns */
.select span {
    display: block;
    margin-bottom: 5px;
    margin-left: 3px;
}

.functionSelect,
.modeSelect,
.auxSelect {
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    background: var(--surface-200);
    color: var(--text);
    width: 100%;
    padding: 5px;
}

/* Function-specific select backgrounds */
.select .functionSelect.function-c {
    background: linear-gradient(
        to bottom right,
        rgba(255, 0, 0, 0.5) 0%,
        rgba(255, 255, 0, 0.5) 15%,
        rgba(0, 255, 0, 0.5) 30%,
        rgba(0, 255, 255, 0.5) 50%,
        rgba(0, 0, 255, 0.5) 65%,
        rgba(255, 0, 255, 0.5) 80%,
        rgba(255, 0, 0, 0.5) 100%
    );
}

.select .functionSelect.function-f {
    background: rgb(50, 205, 50);
}

.select .functionSelect.function-a {
    background: rgb(52, 155, 255);
}

.select .functionSelect.function-u {
    background: linear-gradient(
        to bottom right,
        rgba(191, 0, 255, 0.5) 0%,
        rgba(0, 179, 255, 0.5) 33%,
        rgba(0, 4, 255, 0.5) 66%,
        rgba(191, 0, 255, 0.5) 100%
    );
}

.select .functionSelect.function-l {
    background: magenta;
}

.select .functionSelect.function-s {
    background: brown;
}

.select .functionSelect.function-g {
    background: green;
}

.select .functionSelect.function-r {
    background: var(--surface-500);
}

/* Headers */
.header {
    color: var(--surface-600);
    font-size: 13px;
    font-weight: 600;
    display: block;
    margin-bottom: 5px;
}

/* Modifiers */
.modifiers {
    display: block;
    margin-top: 5px;
}

.modifiers .checkbox {
    margin: 5px 0;
}

.checkbox label span {
    margin-left: 3px;
}

.modifiers .auxSelect {
    margin-left: 5px;
    width: auto;
}

.modifiers .labelSelect {
    margin-left: 5px;
}

.modifiers .rainbowOverlay {
    margin-top: 1px;
}

.modifiers .sliders-group {
    margin-top: 5px;
    margin-left: 20px;
}

/* Overlays */
.overlays {
    display: block;
    margin-top: 5px;
}

.overlays .checkbox {
    margin: 5px 0;
}

/* Unified Slider Styles */
.slider-container {
    margin-top: 10px;
}

.slider-control {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 5px 0;
}

/* Vue3Slider wrapper styling */
.slider-control :deep(.vue3-slider) {
    flex-shrink: 0;
    position: relative;
    display: inline-block;
}

/* Vue3Slider track styling */
.slider-control :deep(.vue3-slider-track) {
    position: relative;
    border-radius: 3px;
    cursor: pointer;
}

/* Vue3Slider handle styling */
.slider-control :deep(.vue3-slider-handle) {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--primary-500);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.1s ease;
}

.slider-control :deep(.vue3-slider-handle:hover) {
    transform: translate(-50%, -50%) scale(1.1);
}

.slider-control :deep(.vue3-slider-handle:active) {
    transform: translate(-50%, -50%) scale(0.95);
}

/* Style the tooltip to match theme */
.slider-control :deep(.vue3-slider-tooltip) {
    background: var(--primary-500) !important;
    color: white !important;
    font-weight: 600;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
}

/* Color Define Sliders */
.colorDefineSliders {
    display: none;
    position: fixed;
    z-index: 10000;
    background: var(--surface-50);
    padding: 5px;
    border: 2px solid var(--surface-600);
    border-radius: 6px;
    width: 167px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.colorDefineSliderContainer {
    display: flex;
    align-items: center;
    margin: 5px 0;
}

.colorDefineSliderLabel {
    width: 15px;
    display: inline-block;
    margin-right: 5px;
}

.colorDefineSliderContainer input {
    flex: 1;
    margin: 0 5px;
}

.colorDefineSliderValue {
    width: 30px;
    display: inline-block;
    text-align: right;
}

/* Directions */
.directions {
    height: 130px;
    position: relative;
    display: inline-block;
    width: 49%;
}

.directions button {
    position: absolute;
    width: 30px;
    height: 30px;
}

.directions button.btnOn {
    background: var(--surface-50);
    color: var(--text);
    border-color: var(--text);
}

.directions .dir-n {
    top: 0;
    left: 32px;
}

.directions .dir-s {
    top: 64px;
    left: 32px;
}

.directions .dir-e {
    left: 64px;
    top: 32px;
}

.directions .dir-w {
    left: 0;
    top: 32px;
}

.directions .dir-u {
    right: 10px;
    top: 15px;
}

.directions .dir-d {
    right: 10px;
    top: 54px;
}

/* Colors */
.colors {
    height: 130px;
    position: relative;
    display: inline-block;
    width: 49%;
}

.colors button {
    width: 23%;
    color: white;
}

.colors button:hover {
    border-style: solid;
}

.colors button.btnOn {
    border: 2px solid var(--text);
}

/* Default color backgrounds */
.color-0 {
    background: black;
}

.color-1 {
    background: white;
    color: black !important;
}

.color-2 {
    background: red;
}

.color-3 {
    background: orange;
}

.color-4 {
    background: yellow;
    color: black !important;
}

.color-5 {
    background: greenyellow;
    color: black !important;
}

.color-6 {
    background: limegreen;
}

.color-7 {
    background: palegreen;
    color: black !important;
}

.color-8 {
    background: cyan;
    color: black !important;
}

.color-9 {
    background: lightcyan;
    color: black !important;
}

.color-10 {
    background: dodgerblue;
}

.color-11 {
    background: darkviolet;
}

.color-12 {
    background: magenta;
}

.color-13 {
    background: deeppink;
}

.color-14 {
    background: black;
}

.color-15 {
    background: black;
}

/* Mode Colors */
.mode_colors button.btnOn {
    border: 2px solid var(--text);
}

/* Special Colors */
.special_colors button.btnOn {
    border: 2px solid var(--text);
}

/* Toolbar */
.content_toolbar.toolbar_fixed_bottom {
    position: fixed;
    bottom: 2rem;
}

/* Utility */
.clear-both {
    clear: both;
}

/* Responsive */
@media all and (max-width: 575px) {
    .controls {
        width: 100%;
    }
}
</style>
