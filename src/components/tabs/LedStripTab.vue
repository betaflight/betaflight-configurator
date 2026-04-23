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
                        <UButton
                            size="sm"
                            color="neutral"
                            variant="soft"
                            :disabled="!hasSelection"
                            :label="$t('ledStripClearSelectedButton')"
                            @click="clearSelected"
                        />
                        <UButton
                            size="sm"
                            color="error"
                            variant="soft"
                            :label="$t('ledStripClearAllButton')"
                            @click="clearAll"
                        />
                    </div>
                </div>
                <!-- Function Selection -->
                <div class="section" v-html="$t('ledStripFunctionSection')"></div>

                <div class="select">
                    <span v-html="$t('ledStripFunctionTitle')"></span>
                    <USelect
                        id="ledStripFunctionSelect"
                        :class="['functionSelect', 'min-w-48', selectedFunction]"
                        size="sm"
                        :items="functionItems"
                        v-model="selectedFunction"
                        @update:model-value="onFunctionChange"
                    />
                </div>

                <!-- Color Modifiers -->
                <div class="modifiers" v-show="showModifiers">
                    <span class="header" v-html="$t('ledStripColorModifierTitle')"></span>

                    <div class="modifier-row">
                        <USwitch
                            id="throttleHue"
                            size="sm"
                            v-model="modifiers.throttleHue"
                            @update:model-value="onModifierChange('t')"
                            :label="$t('ledStripThrottleHue')"
                        />
                        <USelect
                            id="auxSelectThrottle"
                            class="auxSelect"
                            size="sm"
                            :items="auxChannelItems"
                            v-model="auxChannelValue"
                            :aria-label="$t('ledStripThrottleHueChannel')"
                        />
                    </div>

                    <div class="modifier-row">
                        <USwitch
                            id="larsonScanner"
                            size="sm"
                            v-model="modifiers.larsonScanner"
                            @update:model-value="onModifierChange('o')"
                            :label="$t('ledStripLarsonOverlay')"
                        />
                    </div>

                    <div class="modifier-row">
                        <USwitch
                            id="blink"
                            size="sm"
                            v-model="modifiers.blink"
                            @update:model-value="onModifierChange('b')"
                            :label="$t('ledStripBlinkAlwaysOverlay')"
                        />
                    </div>

                    <div class="modifier-row rainbowOverlay" v-show="showRainbow">
                        <USwitch
                            id="rainbow"
                            size="sm"
                            v-model="modifiers.rainbow"
                            @update:model-value="onModifierChange('y')"
                            :label="$t('ledStripRainbowOverlay')"
                        />
                        <div class="sliders-group" v-show="modifiers.rainbow">
                            <span v-html="$t('ledStripRainbowDeltaSliderTitle')"></span>
                            <div class="slider-control">
                                <span class="slider-value">{{ rainbowDelta }}</span>
                                <USlider v-model="rainbowDelta" :min="0" :max="359" class="w-40" />
                                <HelpIcon :text="$t('ledStripRainbowDeltaSliderHelp')" />
                            </div>
                            <span v-html="$t('ledStripRainbowFreqSliderTitle')"></span>
                            <div class="slider-control">
                                <span class="slider-value">{{ rainbowFreq }}</span>
                                <USlider v-model="rainbowFreq" :min="1" :max="360" class="w-40" />
                                <HelpIcon :text="$t('ledStripRainbowFreqSliderHelp')" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Overlays -->
                <div class="overlays" v-show="showOverlays">
                    <span class="header" v-html="$t('ledStripOverlayTitle')"></span>
                    <div class="modifier-row warningOverlay" v-show="showWarning">
                        <USwitch
                            id="warnings"
                            size="sm"
                            v-model="overlayStates.warnings"
                            @update:model-value="onOverlayChange('w')"
                            :label="$t('ledStripWarningsOverlay')"
                        />
                    </div>
                    <div class="modifier-row indicatorOverlay">
                        <USwitch
                            id="indicator"
                            size="sm"
                            v-model="overlayStates.indicator"
                            @update:model-value="onOverlayChange('i')"
                            :label="$t('ledStripIndecatorOverlay')"
                        />
                    </div>
                    <div class="modifier-row vtxOverlay" v-show="showVtx">
                        <USwitch
                            id="vtx"
                            size="sm"
                            v-model="overlayStates.vtx"
                            @update:model-value="onOverlayChange('v')"
                            :label="$t('ledStripVtxOverlay')"
                        />
                    </div>
                </div>

                <!-- Mode Colors -->
                <div class="mode_colors" v-show="showModeColors">
                    <div class="section" v-html="$t('ledStripModeColorsTitle')"></div>

                    <USelect
                        id="ledStripModeColorsModeSelect"
                        class="modeSelect gps min-w-48"
                        size="sm"
                        :items="modeColorsModeItems"
                        v-model="modeColorsMode"
                    />

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
                    <UButton
                        v-for="dir in directions"
                        :key="dir"
                        size="sm"
                        color="primary"
                        :variant="activeDirections.has(dir) ? 'solid' : 'soft'"
                        :class="'dir-' + dir"
                        :label="$t('ledStripDir' + dir.toUpperCase())"
                        @click="toggleDirection(dir)"
                    />
                </div>

                <!-- Colors -->
                <div class="colors">
                    <div class="colorDefineSliders" ref="colorDefineSliders">
                        <div v-html="$t('ledStripColorSetupTitle')"></div>
                        <div class="colorDefineSliderContainer">
                            <span class="colorDefineSliderLabel" v-html="$t('ledStripH')"></span>
                            <USlider
                                id="colorSliderH"
                                class="sliderHSV"
                                :min="0"
                                :max="359"
                                :aria-label="$t('ledStripH')"
                                v-model="colorHSV.h"
                                @update:model-value="onColorSliderChange"
                            />
                            <span class="colorDefineSliderValue Hvalue">{{ colorHSV.h }}</span>
                        </div>
                        <div class="colorDefineSliderContainer">
                            <span class="colorDefineSliderLabel" v-html="$t('ledStripS')"></span>
                            <USlider
                                id="colorSliderS"
                                class="sliderHSV"
                                :min="0"
                                :max="255"
                                :aria-label="$t('ledStripS')"
                                v-model="colorHSV.s"
                                @update:model-value="onColorSliderChange"
                            />
                            <span class="colorDefineSliderValue Svalue">{{ colorHSV.s }}</span>
                        </div>
                        <div class="colorDefineSliderContainer">
                            <span class="colorDefineSliderLabel" v-html="$t('ledStripV')"></span>
                            <USlider
                                id="colorSliderV"
                                class="sliderHSV"
                                :min="0"
                                :max="255"
                                :aria-label="$t('ledStripV')"
                                v-model="colorHSV.v"
                                @update:model-value="onColorSliderChange"
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
                        <span class="slider-value">{{ brightness }}%</span>
                        <USlider v-model="brightness" :min="5" :max="100" class="w-40" />
                        <HelpIcon :text="$t('ledStripBrightnessSliderHelp')" />
                    </div>
                </div>

                <!-- Wiring Mode -->
                <div class="section" v-html="$t('ledStripWiring')"></div>
                <div class="wiring-container">
                    <UButton
                        block
                        size="sm"
                        color="primary"
                        :variant="wireMode ? 'solid' : 'soft'"
                        :label="$t('ledStripWiringMode')"
                        @click="toggleWireMode"
                    />
                    <div class="wiringControls">
                        <UButton
                            size="sm"
                            color="neutral"
                            variant="soft"
                            class="w50"
                            :label="$t('ledStripWiringClearControl')"
                            @click="clearWiresSelected"
                        />
                        <UButton
                            size="sm"
                            color="error"
                            variant="soft"
                            class="w50"
                            :label="$t('ledStripWiringClearAllControl')"
                            @click="clearWiresAll"
                        />
                    </div>
                </div>
                <p v-html="$t('ledStripWiringMessage')"></p>
            </div>

            <div class="clear-both"></div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <UButton size="md" color="primary" class="save_btn" :label="saveButtonText" @click="save" />
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import LedGrid from "./led_strip/LedGrid.vue";
import HelpIcon from "../elements/HelpIcon.vue";
import { useLedStrip } from "@/composables/useLedStrip";
import { i18n } from "@/js/localization";
import { gui_log } from "@/js/gui_log";
import GUI from "@/js/gui";
import semver from "semver";
import FC from "@/js/fc";
import { API_VERSION_1_46 } from "@/js/data_storage";

// Decode HTML entities in translations (some use &amp; etc) so plain-text
// component props (e.g. USelect item labels) render correctly.
function decodeHtmlEntities(text) {
    if (!text) {
        return text;
    }
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}
const t = (key) => decodeHtmlEntities(i18n.getMessage(key));

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
const selectedFunction = ref("none");
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

// USelect item arrays
const functionItems = computed(() => [
    { label: t("ledStripFunctionNoneOption"), value: "none" },
    { label: t("ledStripFunctionColorOption"), value: "function-c" },
    { label: t("ledStripFunctionModesOption"), value: "function-f" },
    { label: t("ledStripFunctionArmOption"), value: "function-a" },
    { label: t("ledStripFunctionBatteryOption"), value: "function-l" },
    { label: t("ledStripFunctionRSSIOption"), value: "function-s" },
    { label: t("ledStripFunctionGPSOption"), value: "function-g" },
    { label: t("ledStripFunctionRingOption"), value: "function-r" },
    { label: t("ledStripFunctionGPSBarOption"), value: "function-p" },
    { label: t("ledStripFunctionBatteryBarOption"), value: "function-e" },
    { label: t("ledStripFunctionAltitudeOption"), value: "function-u" },
]);

const auxChannelItems = computed(() => [
    { label: t("controlAxisRoll"), value: "0" },
    { label: t("controlAxisPitch"), value: "1" },
    { label: t("controlAxisYaw"), value: "2" },
    { label: t("controlAxisThrottle"), value: "3" },
    { label: t("controlAxisAux1"), value: "4" },
    { label: t("controlAxisAux2"), value: "5" },
    { label: t("controlAxisAux3"), value: "6" },
    { label: t("controlAxisAux4"), value: "7" },
    { label: t("controlAxisAux5"), value: "8" },
    { label: t("controlAxisAux6"), value: "9" },
    { label: t("controlAxisAux7"), value: "10" },
    { label: t("controlAxisAux8"), value: "11" },
]);

const modeColorsModeItems = computed(() => [
    { label: t("ledStripModeColorsModeOrientation"), value: 0 },
    { label: t("ledStripModeColorsModeHeadfree"), value: 1 },
    { label: t("ledStripModeColorsModeHorizon"), value: 2 },
    { label: t("ledStripModeColorsModeAngle"), value: 3 },
    { label: t("ledStripModeColorsModeMag"), value: 4 },
    { label: t("ledStripModeColorsModeBaro"), value: 5 },
]);

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
    selectedFunction.value = baseFunc ? `function-${baseFunc}` : "none";

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
    selectedFunction.value = "none";
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
    selectedFunction.value = "none";
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
    width: calc(29px * 16 + 3px);
    height: calc(29px * 16 + 3px);
}

/* Grid Sections Overlay */
.gridSections {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    width: calc(29px * 16 + 3px);
    height: calc(29px * 16 + 3px);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    pointer-events: none;
    user-select: none;
}

.gridSections .block {
    width: 25%;
    height: 25%;
    float: left;
    border: 1px solid var(--surface-500);
    box-sizing: border-box;
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

.save_btn {
    min-width: 96px;
}

.w50 {
    width: 49%;
}

/* Wiring section layout */
.wiring-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
    margin-bottom: 10px;
}

.wiringControls {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
}

.wiringControls > button {
    flex: 0 0 calc(50% - 0.25rem);
}

/* Select Dropdowns */
.select span {
    display: block;
    margin-bottom: 5px;
    margin-left: 3px;
}

/* Function-specific select backgrounds — reach USelect's trigger button */
.select .functionSelect.function-c :deep(button) {
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

.select .functionSelect.function-f :deep(button) {
    background: rgb(50, 205, 50);
}

.select .functionSelect.function-a :deep(button) {
    background: rgb(52, 155, 255);
}

.select .functionSelect.function-u :deep(button) {
    background: linear-gradient(
        to bottom right,
        rgba(191, 0, 255, 0.5) 0%,
        rgba(0, 179, 255, 0.5) 33%,
        rgba(0, 4, 255, 0.5) 66%,
        rgba(191, 0, 255, 0.5) 100%
    );
}

.select .functionSelect.function-l :deep(button) {
    background: magenta;
}

.select .functionSelect.function-s :deep(button) {
    background: brown;
}

.select .functionSelect.function-g :deep(button) {
    background: green;
}

.select .functionSelect.function-r :deep(button) {
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

.modifier-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 5px 0;
}

.modifiers .auxSelect {
    width: auto;
    min-width: 10rem;
}

.modifiers .rainbowOverlay {
    margin-top: 1px;
    flex-wrap: wrap;
}

.modifiers .sliders-group {
    margin-top: 5px;
    margin-left: 20px;
    width: 100%;
}

/* Overlays */
.overlays {
    display: block;
    margin-top: 5px;
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

.slider-value {
    min-width: 2.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--text);
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
/* Reproduce the compass-with-U/D layout from the pre-Nuxt-UI version:
 *   Row 1:  .   N   .   U
 *   Row 2:  W   .   E   D
 *   Row 3:  .   S   .   .
 * :deep() is needed because UButton renders through ULink/ULinkBase, so
 * the rendered <button> sits outside this component's scoped selector. */
.directions {
    display: inline-grid;
    grid-template-columns: 30px 30px 30px 30px;
    grid-template-rows: 30px 30px 30px;
    gap: 4px;
    vertical-align: middle;
    margin-right: 12px;
}

.directions :deep(button) {
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    line-height: 1;
}

.directions :deep(.dir-n) {
    grid-column: 2;
    grid-row: 1;
}

.directions :deep(.dir-u) {
    grid-column: 4;
    grid-row: 1;
}

.directions :deep(.dir-w) {
    grid-column: 1;
    grid-row: 2;
}

.directions :deep(.dir-e) {
    grid-column: 3;
    grid-row: 2;
}

.directions :deep(.dir-d) {
    grid-column: 4;
    grid-row: 2;
}

.directions :deep(.dir-s) {
    grid-column: 2;
    grid-row: 3;
}

/* Colors */
.colors {
    height: 130px;
    position: relative;
    display: inline-grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 4px;
    width: 49%;
    vertical-align: middle;
}

.colors > button {
    width: 100%;
    height: 100%;
    padding: 0;
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
