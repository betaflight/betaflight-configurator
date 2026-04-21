<template>
    <BaseTab tab-name="osd">
        <div class="content_wrapper pb-15">
            <div class="tab_title">{{ $t("osdSetupTitle") }}</div>
            <WikiButton docUrl="OSD" />

            <!-- Warning: No OSD Chip Detected -->
            <UiBox
                v-if="
                    hasLoadedConfig &&
                    osdStore.state.haveMax7456FontDeviceConfigured &&
                    !osdStore.state.isMax7456FontDeviceDetected &&
                    !osdStore.state.haveAirbotTheiaOsdDevice
                "
                type="warning"
                highlight
                class="mb-3"
            >
                <p v-html="$t('osdSetupNoOsdChipDetectWarning')"></p>
            </UiBox>

            <!-- Warning: Unsupported -->
            <UiBox v-if="hasLoadedConfig && !osdStore.isSupported" type="error" highlight class="mb-3">
                <p>{{ $t("osdSetupUnsupportedNote1") }}</p>
                <p v-html="$t('osdSetupUnsupportedNote2')"></p>
            </UiBox>

            <!-- Supported OSD Content -->
            <div v-if="hasLoadedConfig && osdStore.isSupported">
                <UiBox highlight class="mb-3">
                    <p v-html="$t('osdSetupPreviewHelp')"></p>
                </UiBox>

                <div class="grid-row grid-box col4">
                    <!-- Elements Column -->
                    <div class="col-span-1">
                        <UiBox :title="$t('osdSetupElementsTitle')" :help="$t('osdSectionHelpElements')" type="neutral">
                            <template #title>
                                <HelpIcon :text="$t('osdSetupProfilesTitle')" />
                                <span
                                    v-for="profileIdx in osdStore.numberOfProfiles"
                                    :key="profileIdx"
                                    class="inline-block w-5 text-center font-bold"
                                    >{{ profileIdx }}</span
                                >
                            </template>
                            <!-- Search box -->
                            <UInput
                                v-model="elementSearchQuery"
                                :placeholder="$t('search') + '...'"
                                icon="i-lucide-search"
                                size="sm"
                                class="mb-2"
                            />
                            <!-- Element list -->
                            <div class="flex flex-col">
                                <div
                                    v-for="field in filteredDisplayItems"
                                    :key="field.index"
                                    class="flex items-center gap-1 py-0.5 border-b border-neutral-500/30 last:border-b-0"
                                    :class="{ 'bg-neutral-500/15': isFieldHighlighted(field) }"
                                    @mouseenter="highlightField(field)"
                                    @mouseleave="unhighlightField(field)"
                                >
                                    <!-- Profile checkboxes -->
                                    <div class="flex gap-1 shrink-0">
                                        <template v-for="profileIdx in osdStore.numberOfProfiles" :key="profileIdx">
                                            <input
                                                type="checkbox"
                                                :checked="field.isVisible[profileIdx - 1]"
                                                @change="toggleFieldVisibility(field.index, profileIdx - 1, $event)"
                                                class="size-4"
                                            />
                                        </template>
                                    </div>

                                    <!-- Field label -->
                                    <span class="flex-1 ml-1 text-xs truncate cursor-default" :title="$t(field.desc)">{{
                                        $t(field.text, field.textParams)
                                    }}</span>

                                    <!-- Variant selector -->
                                    <USelect
                                        v-if="field.variants && field.variants.length > 1"
                                        :model-value="field.variant"
                                        @update:model-value="
                                            (v) => {
                                                field.variant = v;
                                                onVariantChange(field);
                                            }
                                        "
                                        :items="field.variants.map((v, i) => ({ value: i, label: $t(v) }))"
                                        size="xs"
                                        class="shrink-0"
                                    />

                                    <!-- Preset button -->
                                    <div
                                        v-if="field.positionable"
                                        class="relative flex items-center justify-center ml-auto shrink-0"
                                    >
                                        <div
                                            class="tab-osd-preset-btn"
                                            @click="openPresetMenu(field, $event)"
                                            :title="$t('presetsOptions')"
                                        >
                                            ...
                                        </div>
                                        <!-- Context Menu (Level 1) -->
                                        <div v-if="presetMenuField === field" class="tab-osd-context-menu" @click.stop>
                                            <div class="tab-osd-context-menu-item">
                                                <div
                                                    class="tab-osd-context-menu-display"
                                                    @click="showPresetSubmenu = !showPresetSubmenu"
                                                >
                                                    <span>{{ $t("osdPresetPositionAlignTitle") }}</span>
                                                    <span>
                                                        ▶
                                                        <span class="tab-osd-context-menu-content-wrapper">
                                                            <!-- Submenu (Level 2 - Grid) -->
                                                            <div
                                                                class="tab-osd-context-menu-content"
                                                                :class="{ show: showPresetSubmenu }"
                                                                @click.stop
                                                            >
                                                                <div class="tab-osd-preset-grid-wrapper">
                                                                    <div class="font-semibold text-center mb-1.5">
                                                                        {{ $t("osdPresetPositionChooseTitle") }}
                                                                    </div>
                                                                    <div class="tab-osd-preset-grid">
                                                                        <div
                                                                            v-for="cell in presetGridCells"
                                                                            :key="`${cell.col}-${cell.row}`"
                                                                            class="tab-osd-preset-grid-cell"
                                                                            :style="{
                                                                                gridColumn: cell.col + 1,
                                                                                gridRow: cell.row + 1,
                                                                            }"
                                                                            :title="cell.label"
                                                                            @click="
                                                                                applyPresetPosition(field, cell.key)
                                                                            "
                                                                        >
                                                                            <span
                                                                                class="tab-osd-preset-cell-dot"
                                                                            ></span>
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
                        </UiBox>
                    </div>

                    <!-- Preview Column -->
                    <div class="col-span-2">
                        <div class="tab-osd-preview-parent sticky top-6">
                            <!-- Preview area -->
                            <div ref="previewContainerOuter" class="relative">
                                <canvas
                                    ref="rulerCanvas"
                                    class="absolute inset-0 w-full h-full z-10 pointer-events-none"
                                    v-show="effectiveShowRulers"
                                ></canvas>
                                <div
                                    ref="previewContainer"
                                    class="tab-osd-preview"
                                    @mousedown="onPreviewMouseDown"
                                    @mouseup="onPreviewMouseUp"
                                    @mouseleave="onPreviewMouseUp"
                                >
                                    <!-- Preview elements rendered as rows/cells -->
                                    <div class="flex tab-osd-row" v-for="(row, rIdx) in previewRows" :key="rIdx">
                                        <div
                                            v-for="(cell, cIdx) in row"
                                            :key="cIdx"
                                            class="tab-osd-char"
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
                                            <img
                                                :src="
                                                    cell.img ||
                                                    'data:image/svg+xml;utf8,<svg width=\'12\' height=\'18\' xmlns=\'http://www.w3.org/2000/svg\'></svg>'
                                                "
                                                draggable="false"
                                                alt=""
                                                aria-hidden="true"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center justify-center gap-3 mt-6 text-sm font-semibold">
                                <span>{{ $t("osdSetupPreviewTitle") }}</span>
                                <span class="flex items-center gap-1.5">
                                    <USwitch v-model="showRulers" size="xs" />
                                    <label>{{ $t("osdSetupPreviewCheckRulers") }}</label>
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Settings Column -->
                    <div class="col-span-1">
                        <!-- Active Profile Selector -->
                        <UiBox :title="$t('osdSetupSelectedProfileTitle')" type="neutral">
                            <SettingRow :label="$t('osdSetupSelectedProfileTitle')">
                                <USelect v-model="activeProfile" :items="profileOptions" size="xs" />
                            </SettingRow>
                            <SettingRow :label="$t('osdSetupPreviewSelectFont')">
                                <USelect v-model="selectedFont" :items="fontSelectOptions" size="xs" />
                            </SettingRow>
                        </UiBox>

                        <!-- Video Format (MAX7456 only) -->
                        <UiBox
                            v-if="osdStore.state.haveMax7456Configured || osdStore.state.isMspDevice"
                            :title="$t('osdSetupVideoFormatTitle')"
                            :help="$t('osdSectionHelpVideoMode')"
                            type="neutral"
                        >
                            <SettingRow :label="$t('osdSetupVideoFormatTitle')">
                                <USelect
                                    :model-value="osdStore.videoSystem"
                                    @update:model-value="
                                        (v) => {
                                            osdStore.videoSystem = v;
                                            onVideoSystemChange();
                                        }
                                    "
                                    :items="videoTypeSelectItems"
                                    size="xs"
                                />
                            </SettingRow>
                        </UiBox>

                        <!-- Units -->
                        <UiBox
                            v-if="osdStore.state.haveOsdFeature"
                            :title="$t('osdSetupUnitsTitle')"
                            :help="$t('osdSectionHelpUnits')"
                            type="neutral"
                        >
                            <SettingRow :label="$t('osdSetupUnitsTitle')">
                                <USelect
                                    :model-value="osdStore.unitMode"
                                    @update:model-value="
                                        (v) => {
                                            osdStore.unitMode = v;
                                            onUnitModeChange();
                                        }
                                    "
                                    :items="unitTypeSelectItems"
                                    size="xs"
                                />
                            </SettingRow>
                        </UiBox>

                        <!-- Timers -->
                        <UiBox
                            v-if="osdStore.state.haveOsdFeature && osdStore.timers.length > 0"
                            :title="$t('osdSetupTimersTitle')"
                            :help="$t('osdSectionHelpTimers')"
                            type="neutral"
                        >
                            <div
                                v-for="(timer, idx) in osdStore.timers"
                                :key="idx"
                                class="flex flex-col gap-2 pb-3 mb-3 border-b border-neutral-500/30 last:border-b-0 last:mb-0 last:pb-0"
                            >
                                <div class="font-bold text-sm">{{ idx + 1 }}</div>
                                <SettingRow :label="$t('osdTimerSource')" :help="$t('osdTimerSourceTooltip')">
                                    <USelect
                                        :model-value="timer.src"
                                        @update:model-value="
                                            (v) => {
                                                timer.src = v;
                                                onTimerChange(timer);
                                            }
                                        "
                                        :items="timerSourceItems"
                                        size="xs"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('osdTimerPrecision')" :help="$t('osdTimerPrecisionTooltip')">
                                    <USelect
                                        :model-value="timer.precision"
                                        @update:model-value="
                                            (v) => {
                                                timer.precision = v;
                                                onTimerChange(timer);
                                            }
                                        "
                                        :items="timerPrecisionItems"
                                        size="xs"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('osdTimerAlarm')" :help="$t('osdTimerAlarmTooltip')">
                                    <UInputNumber
                                        v-model="timer.alarm"
                                        :min="0"
                                        :max="600"
                                        :step="1"
                                        :format-options="{ useGrouping: false }"
                                        size="xs"
                                        orientation="vertical"
                                        class="w-16"
                                        @update:model-value="onTimerChange(timer)"
                                    />
                                </SettingRow>
                            </div>
                        </UiBox>

                        <!-- Alarms -->
                        <UiBox
                            v-if="osdStore.state.haveOsdFeature && alarmEntries.length > 0"
                            :title="$t('osdSetupAlarmsTitle')"
                            :help="$t('osdSectionHelpAlarms')"
                            type="neutral"
                        >
                            <div
                                v-for="entry in alarmEntries"
                                :key="entry.key"
                                class="flex items-center gap-2.5 py-1.5 border-b border-neutral-500/30 last:border-b-0"
                            >
                                <UInputNumber
                                    v-model="entry.alarm.value"
                                    :min="entry.alarm.min || 0"
                                    :max="entry.alarm.max || 9999"
                                    :step="1"
                                    :format-options="{ useGrouping: false }"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                    @update:model-value="onAlarmChange"
                                />
                                <span class="text-sm">{{ entry.alarm.display_name }}</span>
                            </div>
                        </UiBox>

                        <!-- Warnings -->
                        <UiBox
                            v-if="osdStore.state.haveOsdFeature && sortedWarnings.length > 0"
                            :title="$t('osdSetupWarningsTitle')"
                            :help="$t('osdSectionHelpWarnings')"
                            type="neutral"
                        >
                            <div
                                v-for="warning in sortedWarnings"
                                :key="warning.index"
                                class="flex items-center gap-2 py-0.5"
                            >
                                <USwitch
                                    :model-value="warning.enabled"
                                    @update:model-value="
                                        (v) => {
                                            warning.enabled = v;
                                            onWarningChange();
                                        }
                                    "
                                    size="sm"
                                />
                                <span class="text-xs" :title="warning.desc ? $t(warning.desc) : undefined">{{
                                    $t(warning.text, warning.textParams)
                                }}</span>
                            </div>
                        </UiBox>

                        <!-- Post-flight Stats -->
                        <UiBox
                            v-if="osdStore.state.haveOsdFeature && sortedStatItems.length > 0"
                            :title="$t('osdSetupStatsTitle')"
                            :help="$t('osdSectionHelpStats')"
                            type="neutral"
                        >
                            <div
                                v-for="stat in sortedStatItems"
                                :key="stat.index"
                                class="flex items-center gap-2 py-0.5"
                            >
                                <USwitch
                                    :model-value="stat.enabled"
                                    @update:model-value="
                                        (v) => {
                                            stat.enabled = v;
                                            onStatChange(stat);
                                        }
                                    "
                                    size="sm"
                                />
                                <span class="text-xs" :title="stat.desc ? $t(stat.desc) : undefined">{{
                                    $t(stat.text, stat.textParams)
                                }}</span>
                            </div>
                        </UiBox>
                    </div>
                </div>

                <!-- Font Manager Dialog -->
                <dialog ref="fontManagerDialog" class="html-dialog w-[750px] h-fit">
                    <div class="flex h-12 bg-elevated border-b border-default">
                        <div class="flex-1 flex items-center px-4 font-semibold">
                            {{ $t("osdSetupFontManagerTitle") }}
                        </div>
                        <UButton
                            @click="closeFontManager"
                            icon="i-lucide-x"
                            variant="ghost"
                            color="neutral"
                            size="sm"
                            class="my-auto mr-2"
                        />
                    </div>
                    <div class="p-5">
                        <h1 class="text-lg font-bold mb-1">{{ $t("osdSetupFontPresets") }}</h1>
                        <div class="flex flex-wrap gap-0 my-3" ref="fontPreviewContainer">
                            <img
                                v-for="(url, charIdx) in fontCharacterUrls"
                                :key="charIdx"
                                :src="url"
                                :title="'0x' + charIdx.toString(16)"
                                alt=""
                                aria-hidden="true"
                            />
                        </div>
                        <div class="flex items-center gap-2 py-4">
                            <label>{{ $t("osdSetupFontPresetsSelector") }}</label>
                            <USelect
                                v-model="selectedFontPreset"
                                :items="fontPresetSelectItems"
                                :portal="false"
                                size="sm"
                                class="min-w-40"
                            />
                            <span>{{ $t("osdSetupFontPresetsSelectorOr") }}</span>
                            <UButton @click="loadCustomFontFile()" size="sm">
                                {{ $t("osdSetupOpenFont") }}
                            </UButton>
                            <span class="text-sm opacity-60">(.mcm)</span>
                        </div>

                        <!-- Logo customization -->
                        <h1 class="text-lg font-bold mb-1">{{ $t("osdSetupCustomLogoTitle") }}</h1>
                        <div class="flex mb-8">
                            <div class="p-2.5" style="background: rgba(0, 255, 0, 0.4)">
                                <div
                                    ref="logoPreview"
                                    id="font-logo-preview"
                                    style="background: rgba(0, 255, 0, 1); line-height: 0; margin: auto"
                                ></div>
                            </div>
                            <div class="flex-1 ml-8 leading-relaxed">
                                <h3 class="font-semibold mb-1">
                                    {{ $t("osdSetupCustomLogoInfoTitle") }}
                                </h3>
                                <ul class="tab-osd-logo-info-list">
                                    <li id="font-logo-info-size">{{ $t("osdSetupCustomLogoInfoImageSize") }}</li>
                                    <li id="font-logo-info-colors">{{ $t("osdSetupCustomLogoInfoColorMap") }}</li>
                                </ul>
                                <p id="font-logo-info-upload-hint" v-html="$t('osdSetupCustomLogoInfoUploadHint')"></p>
                            </div>
                        </div>

                        <div class="mb-3">
                            <UButton @click="replaceLogoImage()" size="sm">
                                <span v-html="$t('osdSetupCustomLogoOpenImageButton')"></span>
                            </UButton>
                        </div>

                        <div class="tab-osd-upload-progress mb-3">
                            <progress class="tab-osd-progress-bar" :value="uploadProgress" min="0" max="100"></progress>
                            <div class="tab-osd-progress-label">{{ uploadProgressLabel }}</div>
                        </div>

                        <UButton @click="flashFont()" color="success" size="sm">
                            {{ $t("osdSetupUploadFont") }}
                        </UButton>
                    </div>
                </dialog>
            </div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="flex gap-2 items-center">
                <UButton :disabled="!osdStore.state.isMax7456FontDeviceDetected" @click="openFontManager()">
                    {{ $t("osdSetupFontManagerTitle") }}
                </UButton>
                <UButton @click="saveConfig()" color="primary">
                    {{ saveButtonText }}
                </UButton>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useOsdStore } from "@/stores/osd";
import { useFlightControllerStore } from "@/stores/fc";
import { useOsdPreview } from "@/composables/useOsdPreview";
import { useOsdRuler } from "@/composables/useOsdRuler";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import { i18n } from "@/js/localization";

import { FONT, SYM } from "@/js/utils/osdFont";
import { OSD_CONSTANTS } from "./osd/osd_constants";
import { positionConfigs, getPresetGridCells } from "./osd/osd_positions";
import LogoManager from "@/js/LogoManager";
import GUI from "@/js/gui";
import MSP from "@/js/msp";
import { reinitializeConnection } from "@/js/serial_backend";
import { gui_log } from "@/js/gui_log";
import { tracking } from "@/js/Analytics";
import semver from "semver";
import { API_VERSION_1_45 } from "@/js/data_storage";

const osdStore = useOsdStore();
const fcStore = useFlightControllerStore();

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

const showRulers = ref(false);
const activeProfile = ref(0);
const selectedFontPreset = ref(selectedFont.value);
const uploadProgress = ref(0);
const uploadProgressLabel = ref("");
const isSaving = ref(false);
const saveButtonTextOverride = ref(null);
const saveButtonText = computed(() => saveButtonTextOverride.value || i18n.getMessage("osdSetupSave"));
const hasLoadedConfig = ref(false);
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
    if (!alarmsObj || typeof alarmsObj !== "object" || Array.isArray(alarmsObj)) {
        return [];
    }
    return Object.entries(alarmsObj).map(([key, alarm]) => ({ key, alarm }));
});
useOsdRuler(rulerCanvas, previewContainerOuter, effectiveShowRulers);

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
const videoTypeOptions = computed(() => {
    const types = ["AUTO", "PAL", "NTSC", "HD"];
    const labelKeys = {
        AUTO: "osdSetupVideoFormatOptionAuto",
        PAL: "osdSetupVideoFormatOptionPal",
        NTSC: "osdSetupVideoFormatOptionNtsc",
        HD: "osdSetupVideoFormatOptionHd",
    };
    const buildOptions = fcStore.config?.buildOptions || [];
    const apiVersion = fcStore.config?.apiVersion;
    const hasBuildOptionGating = apiVersion && semver.gte(apiVersion, API_VERSION_1_45) && buildOptions.length > 0;

    return types.map((type, value) => {
        let disabled = false;
        if (hasBuildOptionGating) {
            if (type !== "HD" && !buildOptions.includes("USE_OSD_SD")) {
                disabled = true;
            }
            if (type === "HD" && !buildOptions.includes("USE_OSD_HD")) {
                disabled = true;
            }
        }

        return {
            type,
            value,
            label: labelKeys[type],
            disabled,
        };
    });
});

const unitTypeOptions = [
    { value: 0, label: "osdSetupUnitsOptionImperial" },
    { value: 1, label: "osdSetupUnitsOptionMetric" },
    { value: 2, label: "osdSetupUnitsOptionBritish" },
];
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
const fontTypes = computed(() => OSD_CONSTANTS.FONT_TYPES || []);

// USelect computed items
const profileOptions = computed(() =>
    Array.from({ length: osdStore.numberOfProfiles }, (_, i) => ({
        value: i,
        label: i18n.getMessage("osdSetupPreviewSelectProfileElement", { profileNumber: i + 1 }),
    })),
);

function buildFontItems(selectedValue) {
    const items = [];
    if (selectedValue === -1) {
        items.push({
            value: -1,
            label: i18n.getMessage("osdSetupFontPresetsSelectorCustomOption"),
            disabled: true,
        });
    }
    fontTypes.value.forEach((font, idx) => {
        items.push({ value: idx, label: i18n.getMessage(font.name) });
    });
    return items;
}

const fontSelectOptions = computed(() => buildFontItems(selectedFont.value));

const fontPresetSelectItems = computed(() => buildFontItems(selectedFontPreset.value));

const videoTypeSelectItems = computed(() =>
    videoTypeOptions.value.map((opt) => ({
        value: opt.value,
        label: i18n.getMessage(opt.label),
        disabled: opt.disabled,
    })),
);

const unitTypeSelectItems = computed(() =>
    unitTypeOptions.map((opt) => ({
        value: opt.value,
        label: i18n.getMessage(opt.label),
    })),
);

const timerSourceItems = computed(() =>
    timerSources.map((src, idx) => ({
        value: idx,
        label: i18n.getMessage(src),
    })),
);

const timerPrecisionItems = computed(() =>
    timerPrecisions.map((prec, idx) => ({
        value: idx,
        label: i18n.getMessage(prec),
    })),
);

function getLocalizedFieldText(field) {
    return i18n.getMessage(field.text, field.textParams) || "";
}

function compareLocalizedFields(a, b) {
    if (a.name === "UNKNOWN" && b.name !== "UNKNOWN") {
        return 1;
    }
    if (a.name !== "UNKNOWN" && b.name === "UNKNOWN") {
        return -1;
    }

    const locale = i18n.getCurrentLocale().replace("_", "-");
    const textA = getLocalizedFieldText(a);
    const textB = getLocalizedFieldText(b);
    return textA.localeCompare(textB, locale, { sensitivity: "base" });
}

// Filtered display items based on search
const filteredDisplayItems = computed(() => {
    const query = elementSearchQuery.value.toLowerCase();
    const filtered = osdStore.displayItems.filter((field) => {
        if (!field.name) {
            return false;
        }
        const text = i18n.getMessage(field.text, field.textParams)?.toLowerCase() || "";
        const name = field.name?.toLowerCase() || "";
        return !query || text.includes(query) || name.includes(query);
    });
    return [...filtered].sort(compareLocalizedFields);
});

const sortedWarnings = computed(() => {
    return osdStore.warnings.filter((warning) => warning.name).sort(compareLocalizedFields);
});

const sortedStatItems = computed(() => {
    return osdStore.statItems.filter((stat) => stat.name).sort(compareLocalizedFields);
});

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
    osdStore.saveDisplayItem(osdStore.displayItems[fieldIndex]).catch((error) => {
        console.error("Failed to update display item visibility:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save visibility change" }));
    });
    updatePreview();
}

// Handle variant change
function onVariantChange(field) {
    trackChange("variant", field.name);
    osdStore.saveDisplayItem(field).catch((error) => {
        console.error("Failed to update display item variant:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save variant change" }));
    });
    updatePreview();
}

// Handle video system change
function onVideoSystemChange() {
    osdStore.updateDisplaySize();
    osdStore.saveOtherConfig().catch((error) => {
        console.error("Failed to update OSD video system:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD video system" }));
    });
    updatePreview();
}

function onUnitModeChange() {
    osdStore.saveOtherConfig().catch((error) => {
        console.error("Failed to update OSD unit mode:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD unit mode" }));
    });
    updatePreview();
}

function onTimerChange(timer) {
    osdStore.saveTimerConfig(timer).catch((error) => {
        console.error("Failed to update OSD timer:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD timer" }));
    });
    updatePreview();
}

function onAlarmChange() {
    osdStore.saveOtherConfig().catch((error) => {
        console.error("Failed to update OSD alarms:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD alarms" }));
    });
    updatePreview();
}

function onWarningChange() {
    osdStore.saveOtherConfig().catch((error) => {
        console.error("Failed to update OSD warnings:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD warnings" }));
    });
    updatePreview();
}

function onStatChange(stat) {
    osdStore.saveStatisticItem(stat).catch((error) => {
        console.error("Failed to update OSD statistic:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save OSD statistic" }));
    });
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
    if (!field?.positionable) {
        return;
    }

    const displayItem = osdStore.displayItems[field.index];
    if (!displayItem) {
        return;
    }

    let xPos = Number.parseInt(event.currentTarget.dataset.x);
    let yPos = Number.parseInt(event.currentTarget.dataset.y);
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
    if (field.preview_img && !navigator.platform.includes("Linux")) {
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

function isStringArrayPreview(preview) {
    return Array.isArray(preview) && typeof preview[0] === "string";
}

function applyArrayDragOffset(displayItem, position, event, displaySize, startIdx) {
    if (!Array.isArray(displayItem.preview)) {
        return position;
    }

    const x = Number.parseInt(event.dataTransfer.getData("x"), 10);
    const y = Number.parseInt(event.dataTransfer.getData("y"), 10);
    if (Number.isNaN(x) || Number.isNaN(y)) {
        return position;
    }

    const draggedCellIdx = x + y * displaySize.x;
    const offsetIdx = position - draggedCellIdx;
    return startIdx + offsetIdx;
}

function clampStringPreviewPosition(displayItem, position, displaySize) {
    const overflowsLine = displaySize.x - ((position % displaySize.x) + displayItem.preview.length);
    if (overflowsLine < 0) {
        return position + overflowsLine;
    }
    return position;
}

function clampStringArrayPreviewPosition(position, displaySize, cursorX, limits) {
    const selectedPositionX = position % displaySize.x;
    let selectedPositionY = Math.trunc(position / displaySize.x);

    if (position < 0) {
        return null;
    }
    if (selectedPositionX > cursorX) {
        position += displaySize.x - selectedPositionX;
        selectedPositionY++;
    } else if (selectedPositionX + limits.maxX > displaySize.x) {
        position -= selectedPositionX + limits.maxX - displaySize.x;
    }
    if (selectedPositionY < 0) {
        position += Math.abs(selectedPositionY) * displaySize.x;
    } else if (selectedPositionY + limits.maxY > displaySize.y) {
        position -= (selectedPositionY + limits.maxY - displaySize.y) * displaySize.x;
    }

    return position;
}

function clampObjectArrayPreviewPosition(position, displaySize, limits) {
    const selectedPositionX = position % displaySize.x;
    const selectedPositionY = Math.trunc(position / displaySize.x);

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

    return position;
}

function clampArrayPreviewPosition(displayItem, position, displaySize, cursorX) {
    const limits = searchLimitsElement(displayItem.preview);
    if (isStringArrayPreview(displayItem.preview)) {
        return clampStringArrayPreviewPosition(position, displaySize, cursorX, limits);
    }
    return clampObjectArrayPreviewPosition(position, displaySize, limits);
}

function onDropCell(event) {
    event.currentTarget.removeAttribute("style");

    const fieldId = Number.parseInt(event.dataTransfer.getData("text/plain"));
    const displayItem = osdStore.displayItems[fieldId];
    if (!displayItem) {
        return;
    }

    const displaySize = osdStore.displaySize;
    let position = Number.parseInt(event.currentTarget.dataset.position);
    const cursorX = position % displaySize.x;

    const startIdx =
        dragState.value.field?.index === fieldId && dragState.value.startIdx >= 0
            ? dragState.value.startIdx
            : displayItem.position;
    position = applyArrayDragOffset(displayItem, position, event, displaySize, startIdx);

    if (!displayItem.ignoreSize) {
        if (Array.isArray(displayItem.preview)) {
            position = clampArrayPreviewPosition(displayItem, position, displaySize, cursorX);
            if (position === null) {
                return;
            }
        } else {
            position = clampStringPreviewPosition(displayItem, position, displaySize);
        }
    }

    // Update display item position
    displayItem.position = position;
    trackChange("position", displayItem.name);
    osdStore.saveDisplayItem(displayItem).catch((error) => {
        console.error("Failed to update display item position:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save display item position" }));
    });
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
    if (!positionKey) {
        return;
    }

    const config = positionConfigs[positionKey];
    if (!config) {
        return;
    }

    const displaySize = osdStore.displaySize;
    const preview = field.preview;

    let elementWidth = typeof preview === "string" ? preview.length : 1;
    let elementHeight = 1;
    let adjustOffsetX = 0;
    let adjustOffsetY = 0;

    if (Array.isArray(preview)) {
        const limits = searchLimitsElement(preview);
        elementWidth = limits.maxX - limits.minX;
        elementHeight = limits.maxY - limits.minY;
        adjustOffsetX = limits.minX;
        adjustOffsetY = limits.minY;
    }

    const target = config.coords(elementWidth, elementHeight, displaySize);

    // Clamp target within bounds
    if (target.x < 1) {
        target.x = 1;
    }
    if (target.y < 1) {
        target.y = 1;
    }
    if (target.x + elementWidth > displaySize.x - 1) {
        target.x = Math.max(1, displaySize.x - elementWidth - 1);
    }
    if (target.y + elementHeight > displaySize.y - 1) {
        target.y = Math.max(1, displaySize.y - elementHeight - 1);
    }

    // Check collisions and find first available position
    const finalPosition = findAvailablePosition({
        target,
        grow: config.grow,
        elementWidth,
        elementHeight,
        displaySize,
        previewBufferData: previewBuffer.value,
        field,
        adjustOffsetX,
        adjustOffsetY,
    });

    if (finalPosition === null) {
        console.warn("Unable to place element - not enough space available");
        closePresetMenu();
        return;
    }

    field.position = finalPosition;
    trackChange("position", field.name);
    osdStore.saveDisplayItem(field).catch((error) => {
        console.error("Failed to apply preset position:", error);
        gui_log(i18n.getMessage("error", { errorMessage: "Failed to save preset position" }));
    });
    updatePreview();

    closePresetMenu();
}

function isCandidateWithinBounds(testX, testY, elementWidth, elementHeight, displaySize) {
    return (
        testX >= 1 &&
        testX + elementWidth <= displaySize.x - 1 &&
        testY >= 1 &&
        testY + elementHeight <= displaySize.y - 2
    );
}

function canPlaceAtCandidate({ testX, testY, elementWidth, elementHeight, displaySize, previewBufferData, field }) {
    for (let row = 0; row < elementHeight; row++) {
        for (let col = 0; col < elementWidth; col++) {
            const checkPos = (testY + row) * displaySize.x + testX + col;
            const cell = previewBufferData[checkPos];
            const isOccupiedByOtherField =
                cell?.field?.index != null &&
                cell.field.index !== field.index &&
                !(Array.isArray(cell.field.preview) || Array.isArray(field.preview));

            if (isOccupiedByOtherField) {
                return false;
            }
        }
    }
    return true;
}

function findAvailablePosition({
    target,
    grow,
    elementWidth,
    elementHeight,
    displaySize,
    previewBufferData,
    field,
    adjustOffsetX = 0,
    adjustOffsetY = 0,
}) {
    for (let offset = 0; offset < Math.max(displaySize.x, displaySize.y); offset++) {
        const testX = target.x + grow.x * offset;
        const testY = target.y + grow.y * offset;

        if (!isCandidateWithinBounds(testX, testY, elementWidth, elementHeight, displaySize)) {
            break;
        }

        if (
            canPlaceAtCandidate({
                testX,
                testY,
                elementWidth,
                elementHeight,
                displaySize,
                previewBufferData,
                field,
            })
        ) {
            let finalPos = testY * displaySize.x + testX;
            finalPos -= adjustOffsetX;
            finalPos -= adjustOffsetY * displaySize.x;
            return finalPos;
        }
    }
    return null;
}

// Update preview rendering
function updatePreview() {
    osdStore.syncToLegacy();
    updatePreviewBuffer();
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

        // Sync font state from memory
        if (FONT.data?.loaded_font_file) {
            const loadedIndex = fontTypes.value.findIndex((f) => f.file === FONT.data.loaded_font_file);
            if (loadedIndex !== -1 && loadedIndex !== selectedFont.value) {
                selectedFont.value = loadedIndex;
                selectedFontPreset.value = loadedIndex;
            } else if (loadedIndex === -1 && selectedFont.value !== -1) {
                selectedFont.value = -1;
                selectedFontPreset.value = -1;
            }
        }

        updatePreview();
    } catch (error) {
        console.error("Failed to load OSD configuration:", error);
    } finally {
        hasLoadedConfig.value = true;
    }
}

// Save OSD configuration to FC
// Save OSD configuration to FC
async function saveConfig() {
    if (isSaving.value) {
        return;
    }
    isSaving.value = true;

    try {
        // Sync store state to the shared OSD.data bridge used by legacy helpers.
        osdStore.syncToLegacy();

        // Legacy parity: Save button commits pending in-memory config to EEPROM.
        await osdStore.saveToEeprom();

        // Track analytics
        const changes = analyticsChanges.value;
        if (Object.keys(changes).length > 0) {
            tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, changes, "osd");
            analyticsChanges.value = {};
        }

        // Show success
        gui_log(i18n.getMessage("osdSettingsSaved"));
        saveButtonTextOverride.value = i18n.getMessage("osdButtonSaved");
        setTimeout(() => {
            saveButtonTextOverride.value = null;
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
    // Force recomputation when font data is refreshed out-of-band.
    const fontVersion = fontDataVersion.value;
    if (fontVersion < 0) {
        return [];
    }
    if (!FONT.data?.character_image_urls?.length) {
        return [];
    }
    return FONT.data.character_image_urls.slice(0, SYM.LOGO || 256);
});

const fontDataVersion = ref(0);
let lastFontPresetRequestId = 0;

function closeFontManager() {
    fontManagerDialog.value?.close();
}

function loadCustomFontFile() {
    // Cancel any in-flight preset load so custom font stays authoritative.
    lastFontPresetRequestId++;
    FONT.openFontFile()
        .then(() => {
            LogoManager.drawPreview();
            fontDataVersion.value++;
            updatePreviewBuffer();

            selectedFontPreset.value = -1;
        })
        .catch((err) => console.error("Failed to load custom font file:", err));
}

async function openFontManager() {
    if (!osdStore.state.isMax7456FontDeviceDetected) {
        return;
    }
    FONT.initData();

    // Show the dialog first so DOM elements are available for LogoManager
    fontManagerDialog.value?.showModal?.();
    await nextTick();

    // Initialize LogoManager (caches DOM elements via querySelector)
    LogoManager.init(FONT, SYM.LOGO);

    // Load selected/default preset on first open if no font is loaded yet.
    if (!FONT.data.character_image_urls.length && fontTypes.value.length > 0) {
        const presetToLoad = Math.max(0, selectedFontPreset.value);
        selectedFontPreset.value = presetToLoad;
        loadFontPreset(presetToLoad);
    } else {
        // Keep dialog previews in sync when font data was loaded earlier (e.g. during tab init).
        LogoManager.drawPreview();
        fontDataVersion.value++;
    }
}

function loadFontPreset(index) {
    const font = fontTypes.value[index];
    if (!font) {
        return;
    }

    const fontVer = 2;

    // If this font is already loaded in memory, just trigger reactivity
    if (FONT.data?.loaded_font_file === font.file && FONT.data?.characters?.length > 0) {
        fontDataVersion.value++;
        LogoManager.drawPreview();
        updatePreviewBuffer();
        return;
    }

    const requestId = ++lastFontPresetRequestId;

    fetch(`./resources/osd/${fontVer}/${font.file}.mcm`)
        .then((res) => res.text())
        .then((data) => {
            if (requestId !== lastFontPresetRequestId) {
                return;
            }
            FONT.parseMCMFontFile(data);
            FONT.data.loaded_font_file = font.file;
            fontDataVersion.value++;
            LogoManager.drawPreview();
            // Re-render preview with new font character images
            updatePreviewBuffer();
        })
        .catch((err) => console.error("Failed to load font preset:", err));
}

function applyLegacyMobilePreviewZoom() {
    if (!previewContainer.value) {
        return;
    }

    if (window.innerWidth < 390) {
        const previewZoom = (window.innerWidth - 30) / 360;
        previewContainer.value.style.zoom = String(previewZoom);
    } else {
        previewContainer.value.style.zoom = "";
    }
}

function replaceLogoImage() {
    if (GUI.connect_lock) {
        return;
    }

    LogoManager.openImage()
        .then((ctx) => {
            LogoManager.replaceLogoInFont(ctx);
            FONT.data.loaded_font_file = "custom";
            lastFontPresetRequestId++;
            LogoManager.drawPreview();
            LogoManager.showUploadHint();

            selectedFontPreset.value = -1;
            fontDataVersion.value++;
            updatePreviewBuffer();
        })
        .catch((error) => console.error(error));
}

async function flashFont() {
    if (GUI.connect_lock) {
        return;
    }

    GUI.connect_lock = true;

    // If "User supplied font" is selected but no custom font file has been loaded yet,
    // prompt the user to pick a file before proceeding to upload.
    if (
        selectedFontPreset.value === -1 &&
        (!FONT.data.loaded_font_file || fontTypes.value.some((f) => f.file === FONT.data.loaded_font_file))
    ) {
        try {
            await FONT.openFontFile();
            LogoManager.drawPreview();
            fontDataVersion.value++;
            updatePreviewBuffer();
        } catch (err) {
            console.error("User cancelled custom font selection or error occurred", err);
            GUI.connect_lock = false;
            return; // Cancel the upload process
        }
    }

    uploadProgress.value = 0;
    uploadProgressLabel.value = i18n.getMessage("osdSetupUploadingFont");

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
        uploadProgress.value = 100;
        uploadProgressLabel.value = i18n.getMessage("osdSetupUploadingFontEnd", {
            length: FONT.data.characters.length,
        });
        // Close the dialog before rebooting so the user isn't left with
        // a stale modal over a disconnected UI.
        closeFontManager();
        // Reset MSP parser state and flush pending callbacks to prevent
        // CRC errors from residual serial data before the reboot command.
        MSP.disconnect_cleanup();
        // Reboot FC to apply the new font — reinitializeConnection sends
        // MSP_SET_REBOOT (fire-and-forget) and sets rebootTimestamp so the
        // serial backend auto-reconnects after the device comes back.
        reinitializeConnection();
    } catch (err) {
        console.error("Font upload failed:", err);
        uploadProgressLabel.value = i18n.getMessage("osdSetupUploadingFontFailed");
    } finally {
        GUI.connect_lock = false;
    }
}

watch(selectedFontPreset, (newVal) => {
    if (selectedFont.value !== newVal) {
        selectedFont.value = newVal;
    }
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
    // selectedFontPreset watcher performs loading
});

watch(activeProfile, (newVal) => {
    osdStore.osdProfiles.selected = newVal;
    if (previewProfile.value !== newVal) {
        previewProfile.value = newVal;
    }
    if (hasLoadedConfig.value) {
        osdStore.saveOtherConfig().catch((error) => {
            console.error("Failed to update active OSD profile:", error);
            gui_log(i18n.getMessage("error", { errorMessage: "Failed to save active OSD profile" }));
        });
    }
});

// Lifecycle
const handleClickOutside = () => closePresetMenu();

onMounted(async () => {
    document.addEventListener("click", handleClickOutside);
    SYM.loadSymbols();
    await loadConfig();
    await nextTick();
    if (osdStore.isSupported) {
        // Dialog markup is mounted now; openFontManager() will re-run this after showModal().
        LogoManager.init(FONT, SYM.LOGO);
    }
    applyLegacyMobilePreviewZoom();
    GUI.content_ready();
});

onUnmounted(() => {
    document.removeEventListener("click", handleClickOutside);
    analyticsChanges.value = {};
});
</script>

<style>
/* OSD Preview — unscoped for runtime-generated elements */
.tab-osd-preview {
    background: url(../../images/osd-bg-1.jpg);
    background-size: cover;
    background-repeat: no-repeat;
    margin-top: 20px;
    margin-left: 20px;
}

.tab-osd-char {
    display: flex;
    padding: 0;
    margin: 0;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    border: 1px solid transparent;
}

.tab-osd-char[draggable="true"] {
    cursor: move;
}

.tab-osd-char img {
    flex: 1 1 auto;
    max-width: 100%;
    height: auto;
    image-rendering: pixelated;
}

.tab-osd-char.mouseover,
.tab-osd-char.highlighted,
.tab-osd-char.dragging {
    background: rgba(255, 255, 255, 0.4);
}

/* Crosshair and grid lines on mouse-down */
.tab-osd-preview-parent:active::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 40%;
    border-top: 0.3em dashed var(--gimbalCrosshair);
    width: 20%;
    transform: translateY(-50%);
    pointer-events: none;
}

.tab-osd-preview-parent:active::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 40%;
    border-top: 0.3em dashed var(--gimbalCrosshair);
    width: 20%;
    transform: translateY(-50%) rotate(90deg);
    pointer-events: none;
}

.tab-osd-preview-parent:active .tab-osd-char {
    border: 1px dashed rgba(55, 55, 55, 0.5);
}

/* Preset position button */
.tab-osd-preset-btn {
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--surface-500, #999);
    color: var(--text, #fff);
    border: 1px solid var(--primary-800, #666);
    transition:
        background-color 0.25s,
        transform 0.25s;
    border-radius: 2px;
    font-size: 10px;
    line-height: 0;
    margin-left: 4px;
}

.tab-osd-preset-btn:hover {
    background-color: var(--surface-700, #666);
    transform: scale(1.1);
}

.tab-osd-preset-btn:active {
    transform: scale(0.9);
}

/* Context menu */
.tab-osd-context-menu {
    position: absolute;
    display: inline-block;
    min-width: 140px;
    top: -5px;
    left: 100%;
    margin-left: 5px;
    padding: 2px;
    background-color: var(--surface-50);
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    z-index: 10001;
    transition: opacity 0.2s;
    opacity: 1;
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.5);
}

.tab-osd-context-menu-item {
    position: relative;
}

.tab-osd-context-menu-display {
    position: relative;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
    border-radius: 2px;
    color: var(--text);
    white-space: nowrap;
}

.tab-osd-context-menu-display:hover {
    background-color: var(--surface-700);
    color: #fff;
}

.tab-osd-context-menu-content {
    position: absolute;
    left: 100%;
    top: -5px;
    margin-left: 5px;
    display: none;
    opacity: 0;
    z-index: 10002;
}

.tab-osd-context-menu-content.show {
    display: block;
    opacity: 1;
    pointer-events: all;
}

/* Preset grid */
.tab-osd-preset-grid-wrapper {
    background-color: var(--surface-50);
    border-radius: 5px;
    padding: 10px;
    gap: 10px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.tab-osd-preset-grid {
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

.tab-osd-preset-grid-cell {
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

.tab-osd-preset-cell-dot {
    position: absolute;
    width: 4px;
    height: 4px;
    background: currentColor;
    border-radius: 50%;
    opacity: 0.8;
}

/* Upload progress bar */
.tab-osd-upload-progress {
    display: grid;
    grid-template-areas: "area";
    width: 100%;
}

.tab-osd-progress-bar {
    grid-area: area;
    width: 100%;
    height: 26px;
    border-radius: 5px;
    border: 1px solid var(--surface-500);
    appearance: none;
}

.tab-osd-progress-bar::-webkit-progress-bar {
    background-color: var(--text);
    border-radius: 4px;
    box-shadow: inset 0 0 5px #2f2f2f;
}

.tab-osd-progress-bar::-webkit-progress-value {
    background-color: #f86008;
    border-radius: 4px;
}

.tab-osd-progress-label {
    grid-area: area;
    width: 100%;
    height: 26px;
    line-height: 26px;
    text-align: center;
    color: white;
    font-weight: bold;
}

/* Logo info list (validation markers) */
.tab-osd-logo-info-list li::before {
    content: "\2022\20";
}
.tab-osd-logo-info-list li.valid {
    color: #00a011;
}
.tab-osd-logo-info-list li.valid::before {
    content: "\2714\20";
}
.tab-osd-logo-info-list li.invalid {
    color: #a01100;
}
.tab-osd-logo-info-list li.invalid::before {
    content: "\2715\20";
}

#font-logo-preview img {
    display: inline;
}

#font-logo-info-upload-hint {
    margin-top: 1em;
    display: none;
}

/* Responsive layout for OSD grid */
@media all and (max-width: 1455px) {
    .tab-osd .grid-box .col-span-2 {
        grid-column: span 4;
        grid-row-start: 1;
        grid-row-end: 1;
    }
    .tab-osd .grid-box .col-span-1 {
        grid-column: span 2;
    }
}

@media all and (max-width: 575px) {
    .tab-osd .grid-box.col4 {
        grid-template-columns: 1fr;
    }
    .tab-osd .grid-box.col4 .col-span-2 {
        grid-column: span 1;
    }
    .tab-osd .grid-box.col4 .col-span-1 {
        grid-column: span 1;
    }
}
</style>
