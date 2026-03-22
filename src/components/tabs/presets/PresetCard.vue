<template>
    <div
        :class="wrapperClasses"
        :style="wrapperStyle"
        :role="clickable ? 'button' : undefined"
        :tabindex="clickable ? 0 : undefined"
        @click="handleOpen"
        @keydown="handleCardKeydown"
        @mouseenter="mouseOnPanel = true"
        @mouseleave="mouseOnPanel = false"
    >
        <div class="preset_title_panel">
            <img
                v-if="repository?.official"
                class="preset_title_panel_betaflight_official"
                :src="officialIcon"
                alt=""
            />
            <button
                type="button"
                class="preset_title_panel_star"
                :style="{ backgroundColor: starBackgroundColor }"
                :aria-pressed="isFavorite"
                :aria-label="favoriteAriaLabel"
                @click.stop="handleFavoriteToggle"
                @mouseenter="mouseOnStar = true"
                @mouseleave="mouseOnStar = false"
            >
                <img :src="starImage" alt="" class="preset_title_panel_star_img" />
            </button>
            <div>
                <span class="preset_title_panel_title">{{ preset.title }}</span>
            </div>
            <div class="presets_title_panel_meta">
                <div class="presets_title_panel_row">
                    <div class="presets_title_panel_key">
                        <span
                            class="preset_title_panel_official preset_title_panel_status_experimental"
                            v-show="preset.status === 'EXPERIMENTAL'"
                        >{{ $t('presetsExperimental') }}</span>
                        <span
                            class="preset_title_panel_official preset_title_panel_status_community"
                            v-show="preset.status === 'COMMUNITY'"
                        >{{ $t('presetsCommunity') }}</span>
                        <span
                            class="preset_title_panel_official preset_title_panel_status_official"
                            v-show="preset.status === 'OFFICIAL'"
                        >{{ $t('presetsOfficial') }}</span>
                    </div>
                    <div class="presets_title_panel_value">
                        <span class="preset_title_panel_category">{{ preset.category }}</span>
                    </div>
                </div>
                <div class="presets_title_panel_row">
                    <div class="presets_title_panel_key">
                        <span
                            class="preset_title_panel_label preset_title_panel_author_label"
                            v-html="$t('presetsAuthor')"
                        ></span>
                    </div>
                    <div class="presets_title_panel_value">
                        <span class="preset_title_panel_author_text">{{ preset.author }}</span>
                    </div>
                </div>
                <div class="presets_title_panel_row">
                    <div class="presets_title_panel_key">
                        <span
                            class="preset_title_panel_label preset_title_panel_versions_label"
                            v-html="$t('presetsVersions')"
                        ></span>
                    </div>
                    <div class="presets_title_panel_value">
                        <span class="preset_title_panel_versions_text">{{ firmwareVersions }}</span>
                    </div>
                </div>
                <div class="presets_title_panel_row">
                    <div class="presets_title_panel_key">
                        <span
                            class="preset_title_panel_label preset_title_panel_keywords_label"
                            v-html="$t('presetsKeywords')"
                        ></span>
                    </div>
                    <div class="presets_title_panel_value">
                        <span class="preset_title_panel_keywords_text" :title="keywords">{{ keywords }}</span>
                    </div>
                </div>
                <div v-if="showRepositoryName" class="presets_title_panel_row preset_title_panel_repository_row">
                    <div class="presets_title_panel_key">
                        <span
                            class="preset_title_panel_label preset_title_panel_repository_label"
                            v-html="$t('presetsSourceRepository')"
                        ></span>
                    </div>
                    <div class="presets_title_panel_value">
                        <span class="preset_title_panel_repository_text">{{ repository?.name }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from "vue";
import officialIcon from "@/images/icons/cf_icon_welcome_orange.svg";
import starActive from "@/images/icons/star_orange.svg";
import starHover from "@/images/icons/star_orange_stroke.svg";
import starTransparent from "@/images/icons/star_transparent.svg";
import { i18n } from "@/js/localization";

const props = defineProps({
    preset: {
        type: Object,
        required: true,
    },
    repository: {
        type: Object,
        default: null,
    },
    clickable: {
        type: Boolean,
        default: true,
    },
    showRepositoryName: {
        type: Boolean,
        default: false,
    },
    isFavorite: {
        type: Boolean,
        default: false,
    },
    isPicked: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(["open", "toggle-favorite"]);

const mouseOnPanel = ref(false);
const mouseOnStar = ref(false);

const firmwareVersions = computed(() => props.preset.firmware_version?.join("; ") ?? "");
const keywords = computed(() => props.preset.keywords?.join("; ") ?? "");
const favoriteAriaLabel = computed(() =>
    i18n.getMessage(props.isFavorite ? "presetsFavoriteRemoveAriaLabel" : "presetsFavoriteAddAriaLabel"),
);

const wrapperClasses = computed(() => ({
    preset_title_panel_border: true,
    preset_title_panel_clickable: props.clickable,
    preset_title_panel_wrapper: true,
}));

const wrapperStyle = computed(() => ({
    border: props.isPicked ? "2px solid green" : "1px solid var(--surface-500)",
    backgroundColor:
        props.clickable && mouseOnPanel.value && !mouseOnStar.value ? "var(--surface-500)" : "var(--surface-200)",
}));

const starBackgroundColor = computed(() =>
    mouseOnStar.value || (mouseOnPanel.value && props.clickable) ? "var(--surface-500)" : "transparent",
);

const starImage = computed(() => {
    if (props.isFavorite) {
        return starActive;
    }

    if (mouseOnStar.value || (mouseOnPanel.value && props.clickable)) {
        return starHover;
    }

    return starTransparent;
});

function handleFavoriteToggle() {
    emit("toggle-favorite", props.preset, props.repository);
}

function handleOpen() {
    if (props.clickable) {
        emit("open", props.preset, props.repository);
    }
}

function handleCardKeydown(event) {
    if (!props.clickable || event.target !== event.currentTarget) {
        return;
    }

    if (event.key === "Enter") {
        handleOpen();
        return;
    }

    if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        handleOpen();
    }
}
</script>

<style lang="less">
.preset_title_panel_wrapper {
    border-radius: 4px;
}

.preset_title_panel {
    color: var(--text);
    position: relative;
}

.preset_title_panel_border {
    padding: 1.5ex;
    box-shadow: 2px 2px 5px rgba(92, 92, 92, 0.25);
    border-radius: 4px;
}

.preset_title_panel_clickable {
    cursor: pointer;

    &:focus-visible {
        outline: 2px solid var(--primary-500);
        outline-offset: -2px;
    }
}

.preset_title_panel_title {
    font-size: 1.5em;
    font-weight: bold;
    display: inline-block;
    margin-bottom: 1ex;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    width: calc(100% - 60px);
}

.preset_title_panel_star {
    width: 35px;
    height: 35px;
    border-radius: 5px;
    padding: 5px;
    position: absolute;
    cursor: pointer;
    right: -6px;
    top: -5px;
    border: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:focus-visible {
        outline: 2px solid var(--primary-500);
        outline-offset: 1px;
    }
}

.preset_title_panel_star_img {
    width: 25px;
    height: 25px;
    pointer-events: none;
}

.preset_title_panel_betaflight_official {
    width: 25px;
    height: 25px;
    background-size: cover;
    border-radius: 5px;
    padding: 5px;
    background-origin: content-box;
    background-repeat: no-repeat;
    position: absolute;
    right: 26px;
    top: -5px;
}

.preset_title_panel_category {
    color: var(--surface-950);
    font-weight: bold;
}

.preset_title_panel_official {
    padding: 3px;
    display: inline-block;
    color: white;
    font-weight: 700;
    border-radius: 4px;
}

.preset_title_panel_status_official {
    background-color: var(--success-500);
}

.preset_title_panel_status_community {
    background-color: var(--primary-500);
}

.preset_title_panel_status_experimental {
    background-color: var(--error-500);
}

.preset_title_panel_versions_text {
    font-weight: bold;
}

.preset_title_panel_keywords_text,
.preset_title_panel_repository_text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.presets_title_panel_meta {
    display: grid;
    gap: 0;
}

.presets_title_panel_row {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    align-items: center;
    min-height: 24px;
}

.presets_title_panel_key,
.presets_title_panel_value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.preset_title_panel_label {
    color: var(--surface-800);
}
</style>
