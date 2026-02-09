<template>
    <BaseTab tab-name="osd">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('osdSetupTitle')"></div>
            <WikiButton docUrl="OSD" />

            <!-- Warning: No OSD Chip Detected -->
            <div
                v-if="!osdStore.state.isMax7456FontDeviceDetected && osdStore.state.haveMax7456Video"
                class="noOsdChipDetect"
            >
                <p class="note" v-html="$t('osdSetupNoOsdChipDetectWarning')"></p>
            </div>

            <!-- Warning: Unsupported -->
            <div v-if="!osdStore.isSupported" class="unsupported">
                <p class="note" v-html="$t('osdSetupUnsupportedNote1')"></p>
                <p class="note" v-html="$t('osdSetupUnsupportedNote2')"></p>
            </div>

            <!-- Supported OSD Content -->
            <div v-if="osdStore.isSupported" class="supported">
                <div style="margin-bottom: 10px">
                    <p class="note" v-html="$t('osdSetupPreviewHelp')"></p>
                </div>

                <div class="grid-row grid-box col4">
                    <!-- Elements Column -->
                    <div class="col-span-1 elements requires-osd-feature osd-feature">
                        <div class="gui_box grey">
                            <div class="gui_box_titlebar" style="margin-bottom: 0px">
                                <div class="spacer_box_title">
                                    <span class="osd-profiles-header cf_tip" :title="$t('osdSetupProfilesTitle')">
                                        <template v-for="profileIdx in osdStore.numberOfProfiles" :key="profileIdx">
                                            <span class="profile-label">{{ profileIdx }}</span>
                                        </template>
                                    </span>
                                    <span v-html="$t('osdSetupElementsTitle')"></span>
                                </div>
                            </div>
                            <div class="spacer_box">
                                <!-- Search box -->
                                <div class="element-search">
                                    <input
                                        type="text"
                                        v-model="elementSearchQuery"
                                        :placeholder="$t('osdSetupElementsSearch') || 'Search...'"
                                        class="search-input"
                                    />
                                </div>
                                <div id="element-fields" class="switchable-fields">
                                    <div
                                        v-for="(field, index) in filteredDisplayItems"
                                        :key="field.name"
                                        class="switchable-field display-field"
                                        :class="{ highlighted: isFieldHighlighted(field) }"
                                        @mouseenter="highlightField(field)"
                                        @mouseleave="unhighlightField(field)"
                                    >
                                        <!-- Multi-profile checkboxes -->
                                        <div class="profile-checkboxes">
                                            <template v-for="profileIdx in osdStore.numberOfProfiles" :key="profileIdx">
                                                <input
                                                    type="checkbox"
                                                    :checked="field.isVisible[profileIdx - 1]"
                                                    @change="toggleFieldVisibility(field.index, profileIdx - 1, $event)"
                                                    class="profile-checkbox"
                                                />
                                            </template>
                                        </div>

                                        <!-- Field label -->
                                        <span
                                            class="field-label cf_tip"
                                            :title="$t(field.desc)"
                                            v-html="$t(field.text)"
                                        ></span>

                                        <!-- Variant selector -->
                                        <select
                                            v-if="field.variants && field.variants.length > 1"
                                            v-model="field.variant"
                                            @change="onVariantChange(field)"
                                            class="variant-selector"
                                        >
                                            <option v-for="(variant, vIdx) in field.variants" :key="vIdx" :value="vIdx">
                                                {{ variant }}
                                            </option>
                                        </select>

                                        <!-- Position input and preset button -->
                                        <div
                                            v-if="field.positionable && isFieldVisible(field)"
                                            class="position-controls"
                                        >
                                            <input
                                                type="number"
                                                v-model.number="field.position"
                                                @change="onPositionChange(field)"
                                                class="position-input"
                                            />
                                            <button
                                                class="preset-btn"
                                                @click="openPresetMenu(field, $event)"
                                                title="Preset positions"
                                            >
                                                ...
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Preview Column -->
                    <div class="col-span-2 osd-preview">
                        <div class="gui_box grey preview-parent requires-osd-feature">
                            <div class="gui_box_titlebar image">
                                <div class="spacer_box_title">
                                    <span class="cf_tip" :title="$t('osdSetupPreviewForTitle')">
                                        <label v-html="$t('osdSetupPreviewSelectProfileTitle')"></label>
                                        <select v-model.number="previewProfile" class="osdprofile-selector small">
                                            <option
                                                v-for="idx in osdStore.numberOfProfiles"
                                                :key="idx"
                                                :value="idx - 1"
                                            >
                                                {{ idx }}
                                            </option>
                                        </select>

                                        <label v-html="$t('osdSetupPreviewSelectFont')"></label>
                                        <select v-model.number="selectedFont" class="osdfont-selector small">
                                            <option v-for="(font, idx) in fontTypes" :key="idx" :value="idx">
                                                {{ $t(font.name) }}
                                            </option>
                                        </select>

                                        <span class="osd-preview-zoom-group">
                                            <input
                                                type="checkbox"
                                                id="osd-preview-zoom-selector"
                                                v-model="previewZoom"
                                            />
                                            <label
                                                for="osd-preview-zoom-selector"
                                                v-html="$t('osdSetupPreviewCheckZoom')"
                                            ></label>
                                        </span>

                                        <span class="osd-preview-rulers-group">
                                            <input
                                                type="checkbox"
                                                id="osd-preview-rulers-selector"
                                                v-model="showRulers"
                                            />
                                            <label
                                                for="osd-preview-rulers-selector"
                                                v-html="$t('osdSetupPreviewCheckRulers')"
                                            ></label>
                                        </span>
                                    </span>
                                </div>
                            </div>

                            <div class="display-layout">
                                <div ref="previewContainerOuter" class="preview-container" :class="{ zoomed: previewZoom }">
                                    <canvas ref="rulerCanvas" class="ruler-overlay" v-show="showRulers"></canvas>
                                    <div
                                        ref="previewContainer"
                                        class="preview"
                                        @dragover.prevent="onDragOver"
                                        @drop.prevent="onDrop"
                                        @dragleave="onDragLeave"
                                    >
                                        <!-- Preview elements rendered as rows/cells -->
                                        <div class="row" v-for="(row, rIdx) in previewRows" :key="rIdx">
                                            <div
                                                v-for="(cell, cIdx) in row"
                                                :key="cIdx"
                                                class="char"
                                                :class="getPreviewCellClass(cell)"
                                                :data-x="cIdx"
                                                :data-y="rIdx"
                                                :draggable="cell.field?.positionable"
                                                @dragstart="onDragStart($event, cell.field, cell.field ? cell.field.position : -1)"
                                            >
                                                <img v-if="cell.img" :src="cell.img" draggable="false" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="gui_box_bottombar">
                                <div class="spacer_box_title" v-html="$t('osdSetupPreviewTitle')"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Settings Column -->
                    <div class="col-span-1 osd-profile">
                        <!-- Active Profile Selector -->
                        <div class="gui_box osdprofile-selected-container grey">
                            <div class="gui_box_titlebar cf_tip">
                                <div class="spacer_box_title" v-html="$t('osdSetupSelectedProfileTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <label v-html="$t('osdSetupSelectedProfileLabel')"></label>
                                <select v-model.number="activeProfile" class="osdprofile-active">
                                    <option v-for="idx in osdStore.numberOfProfiles" :key="idx" :value="idx - 1">
                                        {{ idx }}
                                    </option>
                                </select>
                            </div>
                        </div>

                        <!-- Video Format (MAX7456 only) -->
                        <div
                            v-if="osdStore.state.haveMax7456Video"
                            class="gui_box videomode-container grey requires-max7456"
                        >
                            <div class="gui_box_titlebar cf_tip">
                                <div class="spacer_box_title" v-html="$t('osdSetupVideoFormatTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div class="video-types">
                                    <label v-for="(type, idx) in videoTypes" :key="idx" class="video-type-option">
                                        <input
                                            type="radio"
                                            :value="idx"
                                            v-model.number="osdStore.videoSystem"
                                            @change="onVideoSystemChange"
                                        />
                                        <span>{{ type }}</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Units -->
                        <div
                            v-if="osdStore.state.haveOsdFeature"
                            class="gui_box grey units-container requires-osd-feature"
                        >
                            <div class="gui_box_titlebar cf_tip">
                                <div class="spacer_box_title" v-html="$t('osdSetupUnitsTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div class="units">
                                    <label v-for="(unit, idx) in unitTypes" :key="idx" class="unit-option">
                                        <input
                                            type="radio"
                                            :value="idx"
                                            v-model.number="osdStore.unitMode"
                                            @change="updatePreview"
                                        />
                                        <span>{{ unit }}</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Timers -->
                        <div
                            v-if="osdStore.state.haveOsdFeature && osdStore.timers.length > 0"
                            class="gui_box grey timers-container requires-osd-feature"
                        >
                            <div class="gui_box_titlebar cf_tip" style="margin-bottom: 0px">
                                <div class="spacer_box_title" v-html="$t('osdSetupTimersTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div id="timer-fields" class="switchable-fields">
                                    <div v-for="(timer, idx) in osdStore.timers" :key="idx" class="timer-config">
                                        <label class="timer-label">{{
                                            $t("osdTimerLabel", { index: idx + 1 }) || `Timer ${idx + 1}`
                                        }}</label>
                                        <div class="timer-controls">
                                            <select
                                                v-model.number="timer.src"
                                                @change="updatePreview"
                                                class="timer-source"
                                            >
                                                <option v-for="(src, sIdx) in timerSources" :key="sIdx" :value="sIdx">
                                                    {{ $t(src) }}
                                                </option>
                                            </select>
                                            <select
                                                v-model.number="timer.precision"
                                                @change="updatePreview"
                                                class="timer-precision"
                                            >
                                                <option
                                                    v-for="(prec, pIdx) in timerPrecisions"
                                                    :key="pIdx"
                                                    :value="pIdx"
                                                >
                                                    {{ prec }}
                                                </option>
                                            </select>
                                            <input
                                                type="number"
                                                v-model.number="timer.alarm"
                                                min="0"
                                                max="600"
                                                class="timer-alarm"
                                                @change="updatePreview"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Alarms -->
                        <div
                            v-if="osdStore.state.haveOsdFeature && osdStore.alarms.length > 0"
                            class="gui_box grey alarms-container requires-osd-feature"
                        >
                            <div class="gui_box_titlebar cf_tip">
                                <div class="spacer_box_title" v-html="$t('osdSetupAlarmsTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div class="alarms">
                                    <div v-for="(alarm, idx) in osdStore.alarms" :key="idx" class="alarm-config">
                                        <label>{{ $t(alarm.text) }}</label>
                                        <input
                                            type="number"
                                            v-model.number="alarm.value"
                                            :min="alarm.min || 0"
                                            :max="alarm.max || 9999"
                                            @change="updatePreview"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Warnings -->
                        <div
                            v-if="osdStore.state.haveOsdFeature && osdStore.warnings.length > 0"
                            class="gui_box grey warnings-container requires-osd-feature"
                        >
                            <div class="gui_box_titlebar cf_tip" style="margin-bottom: 0px">
                                <div class="spacer_box_title" v-html="$t('osdSetupWarningsTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div id="warnings-fields" class="switchable-fields">
                                    <div v-for="(warning, idx) in osdStore.warnings" :key="idx" class="warning-field">
                                        <label class="checkbox-label">
                                            <input type="checkbox" v-model="warning.enabled" @change="updatePreview" />
                                            <span class="cf_tip" :title="$t(warning.desc)">{{ $t(warning.text) }}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Post-flight Stats -->
                        <div
                            v-if="osdStore.state.haveOsdFeature && osdStore.statItems.length > 0"
                            class="gui_box grey stats-container requires-osd-feature"
                        >
                            <div class="gui_box_titlebar" style="margin-bottom: 0px">
                                <div class="spacer_box_title" v-html="$t('osdSetupStatsTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div id="post-flight-stat-fields" class="switchable-fields">
                                    <div v-for="(stat, idx) in osdStore.statItems" :key="idx" class="stat-field">
                                        <label class="checkbox-label">
                                            <input type="checkbox" v-model="stat.enabled" @change="updatePreview" />
                                            <span class="cf_tip" :title="$t(stat.desc)">{{ $t(stat.text) }}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Font Manager Dialog -->
                <dialog ref="fontManagerDialog" id="fontmanagerdialog" class="html-dialog" style="width: 750px">
                    <div class="html-dialog-content">
                        <div class="font-picker">
                            <h1 class="tab_title" v-html="$t('osdSetupFontPresets')"></h1>
                            <label class="font-manager-version-info">{{ fontVersionInfo }}</label>
                            <div class="content_wrapper font-preview" ref="fontPreviewContainer"></div>
                            <div class="fontpresets_wrapper">
                                <label v-html="$t('osdSetupFontPresetsSelector')"></label>
                                <select v-model.number="selectedFontPreset" class="fontpresets">
                                    <option
                                        :value="-1"
                                        disabled
                                        v-html="$t('osdSetupFontPresetsSelectorCustomOption')"
                                    ></option>
                                    <option v-for="(font, idx) in fontTypes" :key="idx" :value="idx">
                                        {{ $t(font.name) }}
                                    </option>
                                </select>
                                <span v-html="$t('osdSetupFontPresetsSelectorOr')"></span>
                            </div>

                            <!-- Logo customization -->
                            <h1 class="tab_title" v-html="$t('osdSetupCustomLogoTitle')"></h1>
                            <div id="font-logo">
                                <div id="font-logo-preview-container">
                                    <div id="font-logo-preview" ref="logoPreview"></div>
                                </div>
                                <div id="font-logo-info">
                                    <h3 v-html="$t('osdSetupCustomLogoInfoTitle')"></h3>
                                    <ul>
                                        <li v-html="$t('osdSetupCustomLogoInfoImageSize')"></li>
                                        <li v-html="$t('osdSetupCustomLogoInfoColorMap')"></li>
                                    </ul>
                                    <p v-html="$t('osdSetupCustomLogoInfoUploadHint')"></p>
                                </div>
                            </div>

                            <div class="default_btn">
                                <a
                                    class="replace_logo"
                                    @click="replaceLogoImage"
                                    v-html="$t('osdSetupCustomLogoOpenImageButton')"
                                ></a>
                            </div>

                            <div class="info">
                                <progress class="progress" :value="uploadProgress" min="0" max="100"></progress>
                                <div class="progressLabel">{{ uploadProgressLabel }}</div>
                            </div>

                            <div class="default_btn green">
                                <a class="flash_font active" @click="flashFont" v-html="$t('osdSetupUploadFont')"></a>
                            </div>
                        </div>
                    </div>
                </dialog>
            </div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom supported">
            <div class="btn" v-if="osdStore.state.isMax7456FontDeviceDetected">
                <a class="fonts" @click="openFontManager" v-html="$t('osdSetupFontManager')"></a>
            </div>
            <div class="btn save">
                <a class="active save" href="#" @click.prevent="saveConfig" v-html="$t('osdSetupSave')"></a>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useOsdStore } from "@/stores/osd";
import { useFlightControllerStore } from "@/stores/fc";
import { useNavigationStore } from "@/stores/navigation";
import { useReboot } from "@/composables/useReboot";
import { useOsdPreview } from "@/composables/useOsdPreview";
import { useOsdRuler } from "@/composables/useOsdRuler";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { i18n } from "@/js/localization";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { OSD } from "@/js/tabs/osd";
import GUI from "@/js/gui";
import { tracking } from "@/js/Analytics";

const osdStore = useOsdStore();
const _fcStore = useFlightControllerStore();
const _navigationStore = useNavigationStore();
const { reboot: _reboot } = useReboot();

// Refs for DOM elements
const previewContainer = ref(null);
const previewContainerOuter = ref(null);
const rulerCanvas = ref(null);
const fontManagerDialog = ref(null);
const fontPreviewContainer = ref(null);
const logoPreview = ref(null);

// Local reactive state
const elementSearchQuery = ref("");
const previewProfile = ref(0);
const selectedFont = ref(0);
const previewZoom = ref(false);
const showRulers = ref(false);
const activeProfile = ref(0);
const selectedFontPreset = ref(-1);
const uploadProgress = ref(0);
const uploadProgressLabel = ref("");
const fontVersionInfo = ref("");
const isSaving = ref(false);

// Preview composable
const { previewRows, updatePreviewBuffer } = useOsdPreview();

// Ruler composable
const { drawRulers } = useOsdRuler(rulerCanvas, previewContainerOuter, showRulers);

// Current drag state
const dragState = ref({
    field: null,
    startIdx: -1,
});

// Highlighted field for hover effects
const highlightedField = ref(null);

// Analytics tracking
const analyticsChanges = ref({});

// Constants from OSD module
const videoTypes = ["AUTO", "PAL", "NTSC", "HD"];
const unitTypes = ["IMPERIAL", "METRIC", "BRITISH"];
const timerPrecisions = ["SECOND", "HUNDREDTH", "TENTH"];
const timerSources = [
    "osdTimerSourceOnTime",
    "osdTimerSourceTotalArmedTime",
    "osdTimerSourceLastArmedTime",
    "osdTimerSourceOnArmTime",
];

// Font types from OSD constants
const fontTypes = computed(() => OSD.constants?.FONT_TYPES || []);

// Filtered display items based on search
const filteredDisplayItems = computed(() => {
    const query = elementSearchQuery.value.toLowerCase();
    if (!query) {
        return osdStore.displayItems;
    }
    return osdStore.displayItems.filter((field) => {
        const text = i18n.getMessage(field.text)?.toLowerCase() || "";
        const name = field.name?.toLowerCase() || "";
        return text.includes(query) || name.includes(query);
    });
});

// Check if a field is visible in current preview profile
function isFieldVisible(field) {
    return field.isVisible[previewProfile.value];
}

// Check if field is highlighted
function isFieldHighlighted(field) {
    return highlightedField.value === field;
}

// Highlight field on hover
function highlightField(field) {
    highlightedField.value = field;
    updatePreview();
}

// Unhighlight field
function unhighlightField() {
    highlightedField.value = null;
    updatePreview();
}

// Toggle field visibility for a specific profile
function toggleFieldVisibility(fieldIndex, profileIndex, event) {
    osdStore.updateDisplayItemVisibility(fieldIndex, profileIndex, event.target.checked);
    trackChange("displayItem", osdStore.displayItems[fieldIndex].name);
    updatePreview();
}

// Handle variant change
function onVariantChange(field) {
    trackChange("variant", field.name);
    updatePreview();
}

// Handle position change
function onPositionChange(field) {
    trackChange("position", field.name);
    updatePreview();
}

// Handle video system change
function onVideoSystemChange() {
    osdStore.updateDisplaySize();
    updatePreview();
}

// Track analytics changes
function trackChange(type, name) {
    if (!analyticsChanges.value[type]) {
        analyticsChanges.value[type] = {};
    }
    analyticsChanges.value[type][name] = true;
}

// Get preview character class
function getPreviewCellClass(cell) {
    const classes = {
        "preview-element": !!cell.field,
        draggable: cell.field?.positionable,
        highlighted: cell.field === highlightedField.value,
    };
    
    if (cell.field) {
        classes[`field-${cell.field.index}`] = true;
    }
    
    return classes;
}

// Drag and drop handlers
function onDragStart(event, field, idx) {
    if (!field?.positionable) return;
    dragState.value.field = field;
    dragState.value.startIdx = idx;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", field.name);
}

function onDragOver(event) {
    event.dataTransfer.dropEffect = "move";
}

function onDragLeave() {
    // Clear any drag hover styles
}

function onDrop(event) {
    const field = dragState.value.field;
    if (!field) return;

    const container = previewContainer.value;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / 12);
    const y = Math.floor((event.clientY - rect.top) / 18);
    const newPosition = y * osdStore.displaySize.x + x;

    // Update field position
    field.position = newPosition;
    trackChange("position", field.name);
    updatePreview();

    dragState.value.field = null;
    dragState.value.startIdx = -1;
}

// Open preset position menu
function openPresetMenu(field, _event) {
    // TODO: Implement context menu for preset positions
    console.log("Open preset menu for", field.name);
}

// Update preview rendering
function updatePreview() {
    // Reactivity handled by useOsdPreview composable watching the store
    // Sync to legacy if needed for other tabs/logic
    osdStore.syncToLegacy();
}

// Load OSD configuration from FC
// Load OSD configuration from FC
async function loadConfig() {
    try {
        // Fetch OSD config via Store
        await osdStore.fetchOsdConfig();

        // Set initial profile from store state
        previewProfile.value = osdStore.osdProfiles.selected || 0;
        activeProfile.value = osdStore.osdProfiles.selected || 0;

        updatePreview();
    } catch (error) {
        console.error("Failed to load OSD configuration:", error);
    }
}

// Save OSD configuration to FC
// Save OSD configuration to FC
async function saveConfig() {
    if (isSaving.value) return;
    isSaving.value = true;

    try {
        // Sync store to legacy OSD.data (keeps legacy preview/analytics consistent)
        osdStore.syncToLegacy();

        // Save via Store Action
        await osdStore.saveOsdConfig();

        // Track analytics
        const changes = analyticsChanges.value;
        if (Object.keys(changes).length > 0) {
            tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, { name: "osd" }, changes);
        }

        // Show success
        GUI.log(i18n.getMessage("osdSettingsSaved"));
    } catch (error) {
        console.error("Failed to save OSD configuration:", error);
        GUI.log(i18n.getMessage("osdSettingsSaveError"));
    } finally {
        isSaving.value = false;
    }
}

// Font Manager
function openFontManager() {
    fontManagerDialog.value?.showModal?.();
}

function replaceLogoImage() {
    // TODO: Implement logo replacement
}

async function flashFont() {
    // TODO: Implement font flashing
}

// Watch for profile changes
watch(previewProfile, (newVal) => {
    osdStore.setSelectedPreviewProfile(newVal);
    updatePreview();
});

watch(activeProfile, (newVal) => {
    osdStore.osdProfiles.selected = newVal;
});

// Lifecycle
onMounted(async () => {
    await loadConfig();
    await nextTick();
    GUI.content_ready();
});

onUnmounted(() => {
    // Cleanup
    analyticsChanges.value = {};
});
</script>

<style scoped>
.content_wrapper {
    padding-bottom: 60px; /* Space for fixed toolbar */
}

/* Element fields */
.switchable-fields {
    max-height: 600px;
    overflow-y: auto;
}

.display-field {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--box-border);
    gap: 8px;
}

.display-field:hover,
.display-field.highlighted {
    background: var(--table-altBackground);
}

.profile-checkboxes {
    display: flex;
    gap: 4px;
}

.profile-checkbox {
    width: 16px;
    height: 16px;
}

.profile-label {
    display: inline-block;
    width: 20px;
    text-align: center;
    font-weight: bold;
}

.field-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.variant-selector {
    width: 100px;
}

.position-controls {
    display: flex;
    gap: 4px;
}

.position-input {
    width: 60px;
}

.preset-btn {
    padding: 2px 6px;
    cursor: pointer;
}

/* Search box */
.element-search {
    padding: 8px;
    border-bottom: 1px solid var(--box-border);
}

.search-input {
    width: 100%;
    padding: 4px 8px;
}

/* Preview area */
.preview-container {
    position: relative;
    min-height: 300px;
    background: #000;
    overflow: hidden;
}

.preview-container.zoomed {
    transform: scale(1.5);
    transform-origin: top left;
}

.preview {
    position: relative;
    width: 100%;
    height: 100%;
}

/* Grid cell highlighting */
.char.highlighted {
    outline: 2px solid var(--accent-color);
}

.char.draggable {
    cursor: grab;
}

.char img {
    image-rendering: pixelated;
}

.ruler-overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 10;
}

/* Video types */
.video-types,
.units {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.video-type-option,
.unit-option {
    display: flex;
    align-items: center;
    gap: 8px;
}

/* Timer config */
.timer-config {
    padding: 8px 0;
    border-bottom: 1px solid var(--box-border);
}

.timer-controls {
    display: flex;
    gap: 4px;
    margin-top: 4px;
}

.timer-source {
    flex: 1;
}

.timer-precision {
    width: 100px;
}

.timer-alarm {
    width: 60px;
}

/* Alarm config */
.alarm-config {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
}

.alarm-config input {
    width: 80px;
}

/* Warning/Stat fields */
.warning-field,
.stat-field {
    padding: 4px 0;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
}

/* Toolbar */
.content_toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

/* Font Manager Dialog */
.font-picker {
    padding: 20px;
}

.fontpresets_wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px 0;
}

.fontpresets {
    flex: 1;
}

#font-logo {
    display: flex;
    gap: 16px;
    margin: 16px 0;
}

#font-logo-preview-container {
    width: 288px;
    height: 144px;
    background: #000;
    border: 1px solid var(--box-border);
}

#font-logo-info {
    flex: 1;
}

.progress {
    width: 100%;
    height: 20px;
}

.progressLabel {
    text-align: center;
    margin-top: 4px;
}
</style>
