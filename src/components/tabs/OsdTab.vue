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
                                        :placeholder="$t('search') + '...'"
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
                                                {{ $t(variant) }}
                                            </option>
                                        </select>

                                        <!-- Preset button only (position input removed to match legacy) -->
                                        <div
                                            v-if="field.positionable"
                                            class="position-controls"
                                        >
                                            <div
                                                class="preset-pos-btn"
                                                @click="openPresetMenu(field, $event)"
                                                :title="$t('presetsOptions')"
                                            >
                                                ...
                                            </div>
                                            <!-- Context Menu (Level 1) -->
                                            <div
                                                v-if="presetMenuField === field"
                                                class="context-menu show"
                                                @click.stop
                                            >
                                                <div class="context-menu-item">
                                                    <div
                                                        class="context-menu-item-display"
                                                        @click="showPresetSubmenu = !showPresetSubmenu"
                                                    >
                                                        <span>Align to position</span>
                                                        <span>
                                                            ▶
                                                            <span class="context-menu-item-content-wrapper">
                                                                <!-- Submenu (Level 2 - Grid) -->
                                                                <div
                                                                    class="context-menu-item-content"
                                                                    :class="{ show: showPresetSubmenu }"
                                                                    @click.stop
                                                                >
                                                                    <div id="preset-pos-grid-wrapper">
                                                                        <div class="preset-popover-title">Choose Position</div>
                                                                        <div class="preset-grid">
                                                                            <div
                                                                                v-for="cell in presetGridCells"
                                                                                :key="`${cell.col}-${cell.row}`"
                                                                                class="preset-grid-cell"
                                                                                :style="{
                                                                                    gridColumn: cell.col + 1,
                                                                                    gridRow: cell.row + 1,
                                                                                }"
                                                                                :title="cell.label"
                                                                                @click="
                                                                                    applyPresetPosition(field, cell.key)
                                                                                "
                                                                            >
                                                                                <span class="preset-cell-dot"></span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Preview Column -->
                    <div class="col-span-2 osd-preview">
                        <div class="gui_box grey preview-parent requires-osd-feature">
                            <div class="gui_box_titlebar image preview-controls-bar">
                                <div class="spacer_box_title">
                                    <span class="preview-controls-wrapper">
                                        <label v-html="$t('osdSetupPreviewSelectProfileTitle')"></label>
                                        <select
                                            v-model.number="previewProfile"
                                            class="osdprofile-selector small"
                                        >
                                            <option
                                                v-for="idx in osdStore.numberOfProfiles"
                                                :key="idx"
                                                :value="idx - 1"
                                            >
                                                {{ $t('osdSetupPreviewSelectProfileElement', { profileNumber: idx }) }}
                                            </option>
                                        </select>

                                        <label v-html="$t('osdSetupPreviewSelectFont')"></label>
                                        <select
                                            v-model.number="selectedFont"
                                            class="osdfont-selector small"
                                        >
                                            <option
                                                v-for="(font, idx) in fontTypes"
                                                :key="idx"
                                                :value="idx"
                                            >
                                                {{ $t(font.name) }}
                                            </option>
                                        </select>
                                        
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
                                <div ref="previewContainerOuter" class="preview-container">
                                    <canvas ref="rulerCanvas" class="ruler-overlay" v-show="effectiveShowRulers"></canvas>
                                    <div
                                        ref="previewContainer"
                                        class="preview"
                                        @mousedown="onPreviewMouseDown"
                                        @mouseup="onPreviewMouseUp"
                                        @mouseleave="onPreviewMouseUp"
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
                                                :data-position="rIdx * osdStore.displaySize.x + cIdx"
                                                :draggable="cell.field?.positionable"
                                                @dragstart="onDragStart($event, cell)"
                                                @dragover.prevent="onDragOverCell($event)"
                                                @dragleave="onDragLeaveCell($event)"
                                                @drop.prevent="onDropCell($event)"
                                                @dragend="onPreviewMouseUp"
                                                @mouseenter="onCellMouseEnter(cell)"
                                                @mouseleave="onCellMouseLeave(cell)"
                                            >
                                                <img :src="cell.img || 'data:image/svg+xml;utf8,<svg width=\'12\' height=\'18\' xmlns=\'http://www.w3.org/2000/svg\'></svg>'" draggable="false" />
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
                                        {{ $t('osdSetupPreviewSelectProfileElement', { profileNumber: idx }) }}
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
                                    <div
                                        v-for="(timer, idx) in osdStore.timers"
                                        :key="idx"
                                        class="timer-config"
                                    >
                                        <div class="timer-index">{{ idx + 1 }}</div>
                                        <div class="timer-fields">
                                            <div class="timer-row osd_tip" :title="$t('osdTimerSourceTooltip')">
                                                <label>{{ $t("osdTimerSource") }}</label>
                                                <select
                                                    v-model.number="timer.src"
                                                    @change="updatePreview"
                                                >
                                                    <option
                                                        v-for="(src, sIdx) in timerSources"
                                                        :key="sIdx"
                                                        :value="sIdx"
                                                    >
                                                        {{ $t(src) }}
                                                    </option>
                                                </select>
                                            </div>
                                            <div class="timer-row osd_tip" :title="$t('osdTimerPrecisionTooltip')">
                                                <label>{{ $t("osdTimerPrecision") }}</label>
                                                <select
                                                    v-model.number="timer.precision"
                                                    @change="updatePreview"
                                                >
                                                    <option
                                                        v-for="(prec, pIdx) in timerPrecisions"
                                                        :key="pIdx"
                                                        :value="pIdx"
                                                    >
                                                        {{ $t(prec) }}
                                                    </option>
                                                </select>
                                            </div>
                                            <div class="timer-row osd_tip" :title="$t('osdTimerAlarmTooltip')">
                                                <label>{{ $t("osdTimerAlarm") }}</label>
                                                <input
                                                    type="number"
                                                    v-model.number="timer.alarm"
                                                    min="0"
                                                    max="600"
                                                    @change="updatePreview"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Alarms -->
                        <div
                            v-if="osdStore.state.haveOsdFeature && alarmEntries.length > 0"
                            class="gui_box grey alarms-container requires-osd-feature"
                        >
                            <div class="gui_box_titlebar cf_tip">
                                <div class="spacer_box_title" v-html="$t('osdSetupAlarmsTitle')"></div>
                            </div>
                            <div class="spacer_box">
                                <div class="alarms">
                                    <div v-for="(alarm, key) in alarmEntries" :key="key" class="alarm-config">
                                        <label>{{ alarm.display_name }}</label>
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
                                    <div v-for="(warning, idx) in osdStore.warnings" :key="idx" class="switchable-field" :class="[`field-${warning.index}`, { 'osd_tip': warning.desc }]" :title="warning.desc ? $t(warning.desc) : undefined">
                                        <input type="checkbox" :name="warning.name" class="togglesmall" v-model="warning.enabled" @change="updatePreview" />
                                        <label :for="warning.name" class="char-label">{{ $t(warning.text) }}</label>
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
                                    <div v-for="(stat, idx) in osdStore.statItems" :key="idx" class="switchable-field" :class="[`field-${stat.index}`, { 'osd_tip': stat.desc }]" :title="stat.desc ? $t(stat.desc) : undefined">
                                        <input type="checkbox" :name="stat.name" class="togglesmall" v-model="stat.enabled" @change="updatePreview" />
                                        <label :for="stat.name" class="char-label">{{ $t(stat.text) }}</label>
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
                            <div class="content_wrapper font-preview" ref="fontPreviewContainer">
                                <img
                                    v-for="(url, charIdx) in fontCharacterUrls"
                                    :key="charIdx"
                                    :src="url"
                                    :title="'0x' + charIdx.toString(16)"
                                />
                            </div>
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
        <div class="content_toolbar toolbar_fixed_bottom supported" style="position: fixed">
            <div class="btn">
                <a
                    class="fonts"
                    :class="{ disabled: !osdStore.state.isMax7456FontDeviceDetected }"
                    @click="openFontManager"
                    v-html="i18n.getMessage('osdSetupFontManagerTitle')"
                ></a>
            </div>
            <div class="btn save">
                <a class="active save" href="#" @click.prevent="saveConfig">{{ saveButtonText }}</a>
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
import { OSD, FONT, SYM } from "@/js/tabs/osd";
import { positionConfigs, getPresetGridCells } from "@/js/tabs/osd_positions";
import LogoManager from "@/js/LogoManager";
import GUI from "@/js/gui";
import { gui_log } from "@/js/gui_log";
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
// const previewZoom = ref(false); // Removed
const showRulers = ref(false);
const activeProfile = ref(0);
const selectedFontPreset = ref(-1);
const uploadProgress = ref(0);
const uploadProgressLabel = ref("");
const fontVersionInfo = ref("");
const isSaving = ref(false);
const saveButtonText = ref(i18n.getMessage("osdSetupSave"));
// State for popover
const presetMenuField = ref(null);
const showPresetSubmenu = ref(false); // Track click state for submenu
const presetGridCells = getPresetGridCells();

// Preview composable
const { previewRows, previewBuffer, updatePreviewBuffer, searchLimitsElement } = useOsdPreview();

// Ruler composable
const isDraggingGrid = ref(false);
const effectiveShowRulers = computed(() => showRulers.value);

// Convert alarms object to array for template iteration
const alarmEntries = computed(() => {
    const alarmsObj = osdStore.alarms;
    if (!alarmsObj || typeof alarmsObj !== 'object' || Array.isArray(alarmsObj)) {
        return [];
    }
    return Object.entries(alarmsObj).map(([key, alarm]) => ({
        key,
        ...alarm,
    }));
});
const { drawRulers } = useOsdRuler(rulerCanvas, previewContainerOuter, effectiveShowRulers);

// Handlers for temporary grid visibility
const onPreviewMouseDown = () => {
    isDraggingGrid.value = true;
};

const onPreviewMouseUp = () => {
    isDraggingGrid.value = false;
};

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
const timerPrecisions = [
    "osdTimerPrecisionOptionSecond",
    "osdTimerPrecisionOptionHundredth",
    "osdTimerPrecisionOptionTenth",
];
const timerSources = [
    "osdTimerSourceOptionOnTime",
    "osdTimerSourceOptionTotalArmedTime",
    "osdTimerSourceOptionLastArmedTime",
    "osdTimerSourceOptionOnArmTime",
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
        highlighted: cell.field != null && cell.field === highlightedField.value,
    };
    
    if (cell.field) {
        classes[`field-${cell.field.index}`] = true;
    }
    
    return classes;
}

// Drag and drop handlers
function onDragStart(event, cell) {
    const field = cell.field;
    if (!field?.positionable) return;

    const displayItem = osdStore.displayItems[field.index];
    if (!displayItem) return;

    let xPos = parseInt(event.currentTarget.dataset.x);
    let yPos = parseInt(event.currentTarget.dataset.y);
    let offsetX = 6;
    let offsetY = 9;

    // For array-type previews, adjust offset to account for element bounds
    if (Array.isArray(displayItem.preview)) {
        const limits = searchLimitsElement(displayItem.preview);
        xPos -= limits.minX;
        yPos -= limits.minY;
        offsetX += xPos * 12;
        offsetY += yPos * 18;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(field.index));
    event.dataTransfer.setData("x", String(event.currentTarget.dataset.x));
    event.dataTransfer.setData("y", String(event.currentTarget.dataset.y));

    // Set drag image if available and not on Linux
    if (field.preview_img && navigator.platform.indexOf("Linux") === -1) {
        event.dataTransfer.setDragImage(field.preview_img, offsetX, offsetY);
    }

    dragState.value.field = field;
    dragState.value.startIdx = field.position;
    isDraggingGrid.value = true;
}

function onDragOverCell(event) {
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.style.background = "rgba(0,0,0,.5)";
}

function onDragLeaveCell(event) {
    event.currentTarget.removeAttribute("style");
}

function onDropCell(event) {
    event.currentTarget.removeAttribute("style");

    const fieldId = parseInt(event.dataTransfer.getData("text/plain"));
    const displayItem = osdStore.displayItems[fieldId];
    if (!displayItem) return;

    const displaySize = osdStore.displaySize;
    let position = parseInt(event.currentTarget.dataset.position);
    const cursorX = position % displaySize.x;

    // For array-type previews, adjust position based on drag offset
    if (Array.isArray(displayItem.preview)) {
        const x = parseInt(event.dataTransfer.getData("x"));
        const y = parseInt(event.dataTransfer.getData("y"));
        position -= x;
        position -= y * displaySize.x;
    }

    // Position clamping to prevent overflow
    if (!displayItem.ignoreSize) {
        if (!Array.isArray(displayItem.preview)) {
            // Standard string preview
            const overflowsLine = displaySize.x - ((position % displaySize.x) + displayItem.preview.length);
            if (overflowsLine < 0) {
                position += overflowsLine;
            }
        } else {
            // Array-type preview
            const arrayElements = displayItem.preview;
            const limits = searchLimitsElement(arrayElements);
            const selectedPositionX = position % displaySize.x;
            let selectedPositionY = Math.trunc(position / displaySize.x);

            if (typeof arrayElements[0] === 'string') {
                if (position < 0) return;
                if (selectedPositionX > cursorX) {
                    // Detected wrap around
                    position += displaySize.x - selectedPositionX;
                    selectedPositionY++;
                } else if (selectedPositionX + limits.maxX > displaySize.x) {
                    // Right border beyond screen edge
                    position -= selectedPositionX + limits.maxX - displaySize.x;
                }
                if (selectedPositionY < 0) {
                    position += Math.abs(selectedPositionY) * displaySize.x;
                } else if (selectedPositionY + limits.maxY > displaySize.y) {
                    position -= (selectedPositionY + limits.maxY - displaySize.y) * displaySize.x;
                }
            } else {
                // Object array elements
                if (limits.minX < 0 && selectedPositionX + limits.minX < 0) {
                    position += Math.abs(selectedPositionX + limits.minX);
                } else if (limits.maxX > 0 && selectedPositionX + limits.maxX >= displaySize.x) {
                    position -= selectedPositionX + limits.maxX + 1 - displaySize.x;
                }
                if (limits.minY < 0 && selectedPositionY + limits.minY < 0) {
                    position += Math.abs(selectedPositionY + limits.minY) * displaySize.x;
                } else if (limits.maxY > 0 && selectedPositionY + limits.maxY >= displaySize.y) {
                    position -= (selectedPositionY + limits.maxY - displaySize.y + 1) * displaySize.x;
                }
            }
        }
    }

    // Update display item position
    displayItem.position = position;
    trackChange("position", displayItem.name);
    updatePreview();

    dragState.value.field = null;
    dragState.value.startIdx = -1;
}

// Mouse hover cross-highlighting
function onCellMouseEnter(cell) {
    if (cell.field) {
        highlightedField.value = cell.field;
    }
}

function onCellMouseLeave(cell) {
    if (highlightedField.value === cell.field) {
        highlightedField.value = null;
    }
}

// Preset position system
function openPresetMenu(field, event) {
    event.stopPropagation();
    // Reset submenu state when opening main menu
    showPresetSubmenu.value = false;
    presetMenuField.value = presetMenuField.value === field ? null : field;
}

function closePresetMenu() {
    presetMenuField.value = null;
}

function applyPresetPosition(field, positionKey) {
    if (!positionKey) return;

    const config = positionConfigs[positionKey];
    if (!config) return;

    const displaySize = osdStore.displaySize;
    const preview = field.preview;

    let elementWidth = typeof preview === 'string' ? preview.length : 1;
    let elementHeight = 1;
    let adjustOffsetX = 0;
    let adjustOffsetY = 0;

    if (Array.isArray(preview)) {
        const limits = searchLimitsElement(preview);
        elementWidth = limits.maxX - limits.minX + 1;
        elementHeight = limits.maxY - limits.minY + 1;
        adjustOffsetX = limits.minX;
        adjustOffsetY = limits.minY;
    }

    const target = config.coords(elementWidth, elementHeight, displaySize);

    // Clamp target within bounds
    if (target.x < 1) target.x = 1;
    if (target.y < 1) target.y = 1;
    if (target.x + elementWidth > displaySize.x - 1) {
        target.x = Math.max(1, displaySize.x - elementWidth - 1);
    }
    if (target.y + elementHeight > displaySize.y - 1) {
        target.y = Math.max(1, displaySize.y - elementHeight - 1);
    }

    // Find available position with growth logic
    let finalPosition = null;
    const grow = config.grow || { x: 0, y: 0 };

    for (let offset = 0; offset < Math.max(displaySize.x, displaySize.y); offset++) {
        const testX = target.x + grow.x * offset;
        const testY = target.y + grow.y * offset;

        // Bounds check
        if (testX < 1 || testX + elementWidth > displaySize.x - 1 ||
            testY < 1 || testY > displaySize.y - 2) {
            break;
        }

        // Collision check against current preview buffer
        let canPlace = true;
        const buf = previewBuffer.value;
        for (let row = 0; row < elementHeight && canPlace; row++) {
            for (let col = 0; col < elementWidth && canPlace; col++) {
                const checkPos = (testY + row) * displaySize.x + testX + col;
                const cell = buf[checkPos];
                if (cell?.field?.index != null &&
                    cell.field.index !== field.index &&
                    !(Array.isArray(cell.field.preview) || Array.isArray(preview))) {
                    canPlace = false;
                }
            }
        }

        if (canPlace) {
            finalPosition = testY * displaySize.x + testX;
            finalPosition -= adjustOffsetX;
            finalPosition -= adjustOffsetY * displaySize.x;
            break;
        }
    }

    if (finalPosition !== null) {
        field.position = finalPosition;
        trackChange("position", field.name);
        updatePreview();
    } else {
        console.warn("Unable to place element - not enough space available");
    }

    closePresetMenu();
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
        gui_log(i18n.getMessage("osdSettingsSaved"));
        saveButtonText.value = i18n.getMessage("osdButtonSaved");
        setTimeout(() => {
            saveButtonText.value = i18n.getMessage("osdSetupSave");
        }, 2000);
    } catch (error) {
        console.error("Failed to save OSD configuration:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD configuration" }));
    } finally {
        isSaving.value = false;
    }
}

// Font Manager
const fontCharacterUrls = computed(() => {
    // Trigger reactivity on fontDataVersion
    fontDataVersion.value;
    if (!FONT.data?.character_image_urls?.length) return [];
    return FONT.data.character_image_urls.slice(0, SYM.LOGO || 256);
});

const fontDataVersion = ref(0);

function openFontManager() {
    if (!osdStore.state.isMax7456FontDeviceDetected) {
        return;
    }
    FONT.initData();
    // Initialize LogoManager if not already
    LogoManager.init(FONT, SYM.LOGO);
    // Load default font on first open if no font loaded
    if (!FONT.data.character_image_urls.length && fontTypes.value.length > 0) {
        selectedFontPreset.value = 0;
        loadFontPreset(0);
    }
    fontManagerDialog.value?.showModal?.();
}

function loadFontPreset(index) {
    const font = fontTypes.value[index];
    if (!font) return;

    const fontVer = 2;
    fontVersionInfo.value = i18n.getMessage(`osdDescribeFontVersion${fontVer}`);

    fetch(`./resources/osd/${fontVer}/${font.file}.mcm`)
        .then(res => res.text())
        .then(data => {
            FONT.parseMCMFontFile(data);
            fontDataVersion.value++;
            LogoManager.drawPreview();
            // Re-render preview with new font character images
            updatePreviewBuffer();
        })
        .catch(err => console.error('Failed to load font preset:', err));
}

function replaceLogoImage() {
    if (GUI.connect_lock) return;

    LogoManager.openImage()
        .then((ctx) => {
            LogoManager.replaceLogoInFont(ctx);
            LogoManager.drawPreview();
            LogoManager.showUploadHint();
            fontDataVersion.value++;
        })
        .catch((error) => console.error(error));
}

async function flashFont() {
    if (GUI.connect_lock) return;

    uploadProgress.value = 0;
    uploadProgressLabel.value = i18n.getMessage('osdSetupUploadingFont');

    // Create a shim that mimics jQuery's $progress.val() for FONT.upload
    const progressShim = {
        val(v) {
            if (v !== undefined) {
                uploadProgress.value = v;
                return progressShim;
            }
            return uploadProgress.value;
        },
    };

    try {
        await FONT.upload(progressShim);
        uploadProgressLabel.value = i18n.getMessage('osdSetupUploadingFontEnd', {
            length: FONT.data.characters.length,
        });
    } catch (err) {
        console.error('Font upload failed:', err);
        uploadProgressLabel.value = 'Upload failed';
    }
}

// Watch for font preset changes
watch(selectedFontPreset, (newVal) => {
    if (newVal >= 0) {
        loadFontPreset(newVal);
    }
});

// Watch for profile changes
watch(previewProfile, (newVal) => {
    osdStore.setSelectedPreviewProfile(newVal);
    updatePreview();
});

// Watch for font selection in header
watch(selectedFont, (newVal) => {
    // Sync preset selection for UI consistency
    selectedFontPreset.value = newVal;
    // Directly load the font (avoids issue if selectedFontPreset was already this value)
    loadFontPreset(newVal);
});

watch(activeProfile, (newVal) => {
    osdStore.osdProfiles.selected = newVal;
});

// Lifecycle
const handleClickOutside = () => closePresetMenu();

onMounted(async () => {
    document.addEventListener('click', handleClickOutside);
    // Initialize LogoManager to inject logo size i18n resources
    LogoManager.init(FONT, SYM.LOGO);
    await loadConfig();
    await nextTick();
    GUI.content_ready();
});

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
    analyticsChanges.value = {};
});
</script>

<style scoped>
.content_wrapper {
    padding-bottom: 60px;
}

/* Base styles */
:deep(input[type="checkbox"]) {
    width: 18px;
    height: 18px;
}

:deep(select) {
    background: var(--surface-200);
    color: var(--text);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    padding: 2px;
}

:deep(input) {
    background: var(--surface-200);
    color: var(--text);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
}

/* Info Progress Bars */
.info {
    display: grid;
    grid-template-areas: "area";
    width: 100%;
    margin-bottom: 10px;
}

.info .progressLabel {
    grid-area: area;
    width: 100%;
    height: 26px;
    line-height: 26px;
    text-align: center;
    color: white;
    font-weight: bold;
}

.info .progressLabel a {
    color: white;
}

.info .progressLabel a:hover {
    text-decoration: underline;
}

.info .progress {
    grid-area: area;
    width: 100%;
    height: 26px;
    border-radius: 5px;
    border: 1px solid var(--surface-500);
    -webkit-appearance: none;
    appearance: none;
}

.info .progress::-webkit-progress-bar {
    background-color: var(--text);
    border-radius: 4px;
    box-shadow: inset 0 0 5px #2f2f2f;
}

.info .progress::-webkit-progress-value {
    background-color: #f86008;
    border-radius: 4px;
}

.info .progress.valid::-webkit-progress-bar,
.info .progress.valid::-webkit-progress-value {
    background-color: #56ac1d;
    border-radius: 4px;
}

.info .progress.invalid::-webkit-progress-bar,
.info .progress.invalid::-webkit-progress-value {
    background-color: #a62e32;
    border-radius: 4px;
}

/* Options */
.options {
    position: relative;
    margin-bottom: 10px;
    line-height: 18px;
    text-align: left;
}

.options label input {
    margin-top: 2px;
}

.options label span {
    font-weight: bold;
    margin-left: 6px;
}

.options select {
    width: 300px;
    height: 20px;
    border: 1px solid var(--surface-500);
}

.options .releases select {
    width: 280px;
}

.options .description {
    position: relative;
    left: 0;
    font-style: italic;
    color: #818181;
}

.options .flash_on_connect_wrapper {
    display: none;
}

.options .manual_baud_rate select {
    width: 75px;
    margin-left: 19px;
}

.option.releases {
    margin: 0 0 2px 0;
    line-height: 20px;
}

/* Display Layout / Elements */
.display-layout {
    height: 100%;
}

.display-layout label {
    margin: 0.25em 0.1em;
    display: inline-block;
}

.display-layout input {
    margin: 0.1em 1em;
}

.display-layout input.position {
    width: 5em;
    border-bottom: 1px solid var(--surface-500);
}

/* Switchable Fields (Core Element List) */
.switchable-fields {
    margin-top: 5px;
    margin-bottom: 8px;
    width: 100%;
    /* Removed overflow/height constraints to allow absolute position popups to overflow */
}

.switchable-fields .elements-search-field,
.element-search {
    margin: 0 0 5px 0.5rem;
}

.switchable-field,
.display-field { /* Keep compatibility with template class */
    flex: 1;
    display: flex; /* Added for alignment */
    align-items: center; /* Added for alignment */
    padding: 3px;
    border: 1px solid transparent;
    border-bottom: 1px solid var(--surface-500);
}

.switchable-field input,
.display-field input {
    border-radius: 3px;
    border: 1px solid var(--surface-500);
    padding: 2px;
}

.switchable-field label,
.display-field .field-label {
    margin-left: 5px;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.switchable-field:last-child,
.display-field:last-child {
    border-bottom: 0;
}

.switchable-field.mouseover,
.switchable-field.highlighted,
.display-field.mouseover,
.display-field.highlighted {
    background: var(--surface-200);
    /* border: 1px solid var(--surface-500); Removed per user request */
    /* font-weight: 800; Removed per user request */
}

/* Profile Checkboxes */
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

/* Variant Selector */
.variant-selector {
    width: 100px;
}

/* Preview Area */
.preview-parent {
    position: sticky;
    top: 1.5rem;
}

.preview-container {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
}

.ruler-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
}

.preview {
    background: url(../../images/osd-bg-1.jpg);
    background-size: cover;
    background-repeat: no-repeat;
    margin-top: 20px;
    margin-left: 20px;
}

.gui_box_titlebar label {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    white-space: nowrap;
    vertical-align: text-bottom;
}

.gui_box_bottombar {
    text-align: center;
    margin-top: 30px;
}

.preview-parent .row {
    display: flex;
}

.char {
    display: flex;
    padding: 0;
    margin: 0;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    border: 1px solid transparent;
}

.char[draggable="true"] {
    cursor: move;
}

.char img {
    flex: 1 1 auto;
    max-width: 100%;
    height: auto;
    image-rendering: pixelated;
}

.char.mouseover {
    background: rgba(255, 255, 255, 0.4);
}

.char.highlighted {
    background: rgba(255, 255, 255, 0.4);
}

.char.dragging {
    background: rgba(255, 255, 255, 0.4);
}

/* Crosshair and grid lines on mouse-down (legacy :active behavior) */
.preview-parent:active::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 40%;
    border-top: 0.3em dashed var(--gimbalCrosshair);
    width: 20%;
    transform: translateY(-50%);
    pointer-events: none;
}

.preview-parent:active::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 40%;
    border-top: 0.3em dashed var(--gimbalCrosshair);
    width: 20%;
    transform: translateY(-50%) rotate(90deg);
    pointer-events: none;
}

.preview-parent:active .char {
    border: 1px dashed rgba(55, 55, 55, 0.5);
}

.osd-feature .gui_box_titlebar {
    left: 0;
}

/* Preview Controls Bar */
.preview-controls-bar {
    background-color: var(--primary-500) !important;
    border-radius: 20px;
    padding: 5px 15px !important;
    margin-bottom: 10px;
    height: auto !important;
    border: none !important;
    display: flex;
    align-items: center;
}

.preview-controls-bar .spacer_box_title {
    width: 100%;
}

.preview-controls-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    color: #000; /* Dark text on gold background */
    font-weight: 600;
}

.preview-controls-wrapper label {
    margin-right: 5px;
    white-space: nowrap;
}

.preview-controls-wrapper select.dark-select {
    background-color: var(--surface-800);
    color: #ffffff; /* Force white text for readability against dark background */
    border: 1px solid var(--surface-900);
    border-radius: 4px;
    padding: 2px 5px;
    margin-right: 10px;
    height: 24px;
}

.osd-preview-rulers-group {
    margin-left: auto; /* Push to right */
    display: flex;
    align-items: center;
}

.osd-preview-rulers-group input {
    margin-right: 5px;
}

/* Fix specificity for legacy overrides */
.gui_box_titlebar.image.preview-controls-bar {
    line-height: normal;
}

/* Preset Button - Explicitly Legacy */
.preset-pos-btn {
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--surface-500, #999);
    color: var(--text, #fff);
    border: 1px solid var(--primary-800, #666);
    transition: background-color 0.25s, transform 0.25s;
    border-radius: 2px;
    font-size: 10px;
    line-height: 0;
    margin-left: 4px;
}

.preset-pos-btn:hover {
    background-color: var(--surface-700, #666);
    transform: scale(1.1);
}

.preset-pos-btn:active {
    transform: scale(0.9);
}

/* Position Controls Container - Anchor for absolute menu */
.position-controls {
    position: relative;
    display: flex; /* Ensure button aligns */
    align-items: center;
    justify-content: center;
    margin-left: auto; /* Push to right of flex container */
    flex-shrink: 0;
}

/* Context Menu Structure (Matches Legacy osd.less) */
.context-menu {
    position: absolute;
    display: inline-block;
    min-width: 140px; /* Legacy width */
    top: -5px; /* Slight offset up to align nicely with button center */
    left: 100%; /* Align to right of button container */
    margin-left: 5px; /* Space from button */
    padding: 2px;
    background-color: var(--surface-50); /* Legacy background */
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    z-index: 10001; /* Legacy z-index */
    transition: opacity 0.2s;
    opacity: 1;
    box-shadow: 2px 2px 5px rgba(0,0,0,0.5);
}

.context-menu-item {
    position: relative;
}

/* The list "item" */
.context-menu-item-display {
    position: relative;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-size: 11px; /* Legacy font size match */
    transition: all 0.15s;
    border-radius: 2px;
    color: var(--text);
    white-space: nowrap;
}

.context-menu-item-display:hover {
    background-color: var(--surface-700);
    color: #fff;
}

/* Submenu Content (The Grid) */
.context-menu-item-content {
    position: absolute;
    /* Position relative to the .context-menu-item-display (parent of this tree) */
    /* Since it's nested deep in spans, we need to ensure it breaks out correctly */
    left: 100%; 
    top: -5px;
    margin-left: 5px;
    display: none;
    opacity: 0;
    /* pointer-events handled by show class */
    z-index: 10002;
}

.context-menu-item-content.show {
    display: block;
    opacity: 1;
    pointer-events: all;
}

/* Preset Button - Explicitly Legacy */
.preset-pos-btn {
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--surface-500, #999);
    color: var(--text, #fff);
    border: 1px solid var(--primary-800, #666);
    transition: background-color 0.25s, transform 0.25s;
    border-radius: 2px;
    font-size: 10px;
    line-height: 0;
    /* Margin removed to allow precise absolute positioning of menu */
}

.preset-pos-btn:hover {
    background-color: var(--surface-700, #666);
    transform: scale(1.1);
}

.preset-pos-btn:active {
    transform: scale(0.9);
}

/* Preset Popover Grid Container */
#preset-pos-grid-wrapper {
    background-color: var(--surface-50);
    border-radius: 5px;
    padding: 10px;
    gap: 10px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.preset-popover-title {
    font-weight: 600;
    text-align: center;
    margin-bottom: 6px;
    color: var(--text);
    /* Legacy didn't have specific title class in this context but keeping for structure */
}

.preset-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 6px;
    width: 150px;
    height: 120px;
    padding: 10px;
    background-color: var(--surface-100);
    border-radius: 5px;
    border: 2px solid var(--surface-700);
}

.preset-grid-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 8px;
    cursor: pointer;
    background-color: var(--primary-500);
    border-radius: 5px;
    transition: transform 0.25s;
    color: var(--text);
}


/* Hover transform removed per user request */

/* Tooltip for cell */
.preset-grid-cell .preset-pos-cell-tooltip {
    position: absolute;
    top: -25px;
    font-size: 8px;
    white-space: nowrap;
    color: var(--text);
    background-color: color-mix(in srgb, var(--surface-300) 70%, var(--primary-500) 30%);
    opacity: 0;
    transition: opacity 0.25s;
    pointer-events: none;
    padding: 5px;
    border-radius: 5px;
}

.preset-grid-cell:hover .preset-pos-cell-tooltip {
    opacity: 1;
}

.preset-cell-dot {
    content: "";
    position: absolute;
    width: 4px;
    height: 4px;
    background: currentColor;
    border-radius: 50%;
    opacity: 0.8;
}


/* Timers */
.timer-config {
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--surface-500);
}

.timer-config:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.timer-row {
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.timer-row label {
    flex: 1;
}

.timer-row select,
.timer-row input {
    width: 140px;
}

/* Alarms */
.alarms label {
    display: block;
    width: 100%;
    border-bottom: 1px solid var(--surface-500);
    margin-top: 5px;
    padding-bottom: 5px;
}

.alarms label:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.alarms input {
    width: 55px;
    padding-left: 3px;
    height: 18px;
    line-height: 20px;
    text-align: left;
    border-radius: 3px;
    margin-right: 11px;
    font-size: 11px;
    font-weight: normal;
}

.warning-field,
.stat-field {
    margin-bottom: 4px;
}

/* Font Manager */
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
    background: var(--surface-200);
    color: var(--text);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
}

#font-logo {
    display: flex;
    margin-bottom: 2em;
}

#font-logo-preview-container {
    background: rgba(0, 255, 0, 0.4);
    margin-bottom: 10px;
    padding: 10px;
}

#font-logo-preview {
    background: rgba(0, 255, 0, 1);
    line-height: 0;
    margin: auto;
}

#font-logo-info {
    flex: 1;
    margin-left: 2em;
    line-height: 150%;
}

#font-logo-info h3 {
    margin-bottom: 0.2em;
}

#font-logo-info ul li:before {
    content: "\2022\20";
}

#font-logo-info ul li.valid {
    color: #00a011;
}

#font-logo-info ul li.valid:before {
    content: "\2714\20";
}

#font-logo-info ul li.invalid {
    color: #a01100;
}

#font-logo-info ul li.invalid:before {
    content: "\2715\20";
}

button {
    padding: 4px 10px !important;
    font-weight: 600;
    font-size: 9pt !important;
    cursor: pointer;
}

/* Spacers */
.spacer_box div label {
    display: inline-flex;
    gap: 3px;
    margin-right: 10px;
}

/* Timers */
.timer-option {
    padding: 2px;
    display: inline !important;
}

.timers-container .timer-detail {
    padding-left: 15px;
    padding-top: 3px;
    padding-bottom: 3px;
}

.timers-container label {
    margin-right: 5px !important;
    display: inline-block;
    width: 80px;
}

.timers-container input,
.timers-container select {
    width: 150px;
}

/* Media Queries */
@media all and (max-width: 1455px) {
    .grid-box .col-span-2 {
        grid-column: span 4;
        grid-row-start: 1;
        grid-row-end: 1;
    }
    .grid-box .col-span-1 {
        grid-column: span 2;
    }
}

@media all and (max-width: 575px) {
    .grid-box.col4 {
        grid-template-columns: 1fr;
    }
    .grid-box.col4 .col-span-2 {
        grid-column: span 1;
    }
    .grid-box.col4 .col-span-1 {
        grid-column: span 1;
    }
}
</style>
