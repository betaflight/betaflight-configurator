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
            <span
                v-if="repository?.official"
                class="preset_title_panel_betaflight_official"
                :style="{ backgroundImage: `url(${officialIcon})` }"
            ></span>
            <span
                class="preset_title_panel_star"
                :style="{ backgroundImage: `url(${starImage})`, backgroundColor: starBackgroundColor }"
                role="button"
                tabindex="0"
                :aria-pressed="isFavorite"
                :aria-label="favoriteAriaLabel"
                @click.stop="handleFavoriteToggle"
                @keydown.enter.stop="handleFavoriteToggle"
                @keydown.space.stop.prevent="handleFavoriteToggle"
                @mouseenter="mouseOnStar = true"
                @mouseleave="mouseOnStar = false"
            ></span>
            <div>
                <span class="preset_title_panel_title">{{ preset.title }}</span>
            </div>
            <div>
                <table class="presets_title_panel_table" role="presentation">
                    <tbody>
                        <tr>
                            <td>
                                <span
                                    class="preset_title_panel_official preset_title_panel_status_experimental"
                                    :class="{ hidden: preset.status !== 'EXPERIMENTAL' }"
                                    v-html="$t('presetsExperimental')"
                                ></span>
                                <span
                                    class="preset_title_panel_official preset_title_panel_status_community"
                                    :class="{ hidden: preset.status !== 'COMMUNITY' }"
                                    v-html="$t('presetsCommunity')"
                                ></span>
                                <span
                                    class="preset_title_panel_official preset_title_panel_status_official"
                                    :class="{ hidden: preset.status !== 'OFFICIAL' }"
                                    v-html="$t('presetsOfficial')"
                                ></span>
                            </td>
                            <td>
                                <span class="preset_title_panel_category">{{ preset.category }}</span>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <span
                                    class="preset_title_panel_label preset_title_panel_author_label"
                                    v-html="$t('presetsAuthor')"
                                ></span>
                            </td>
                            <td>
                                <span class="preset_title_panel_author_text">{{ preset.author }}</span>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <span
                                    class="preset_title_panel_label preset_title_panel_versions_label"
                                    v-html="$t('presetsVersions')"
                                ></span>
                            </td>
                            <td>
                                <span class="preset_title_panel_versions_text">{{ firmwareVersions }}</span>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <span
                                    class="preset_title_panel_label preset_title_panel_keywords_label"
                                    v-html="$t('presetsKeywords')"
                                ></span>
                            </td>
                            <td>
                                <span class="preset_title_panel_keywords_text" :title="keywords">{{ keywords }}</span>
                            </td>
                        </tr>
                        <tr v-if="showRepositoryName" class="preset_title_panel_repository_row">
                            <td>
                                <span
                                    class="preset_title_panel_label preset_title_panel_repository_label"
                                    v-html="$t('presetsSourceRepository')"
                                ></span>
                            </td>
                            <td>
                                <span class="preset_title_panel_repository_text">{{ repository?.name }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
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
});

const emit = defineEmits(["open", "toggle-favorite"]);

const mouseOnPanel = ref(false);
const mouseOnStar = ref(false);

const firmwareVersions = computed(() => props.preset.firmware_version?.join("; ") ?? "");
const keywords = computed(() => props.preset.keywords?.join("; ") ?? "");
const isFavorite = computed(() => Boolean(props.preset.lastPickDate));
const favoriteAriaLabel = computed(() => (isFavorite.value ? "Remove favorite" : "Add favorite"));

const wrapperClasses = computed(() => ({
    preset_title_panel_border: true,
    preset_title_panel_clickable: props.clickable,
    preset_title_panel_wrapper: true,
}));

const wrapperStyle = computed(() => ({
    border: props.preset.isPicked ? "2px solid green" : "1px solid var(--surface-500)",
    backgroundColor:
        props.clickable && mouseOnPanel.value && !mouseOnStar.value ? "var(--surface-500)" : "var(--surface-200)",
}));

const starBackgroundColor = computed(() =>
    mouseOnStar.value || (mouseOnPanel.value && props.clickable) ? "var(--surface-500)" : "var(--surface-200)",
);

const starImage = computed(() => {
    if (isFavorite.value) {
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
    if (!props.clickable) {
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
    width: 25px;
    height: 25px;
    background-size: cover;
    border-radius: 5px;
    padding: 5px;
    background-origin: content-box;
    background-repeat: no-repeat;
    position: absolute;
    cursor: pointer;
    right: -6px;
    top: -5px;
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

.presets_title_panel_table {
    table-layout: fixed;
    width: 100%;
    border-collapse: collapse;
}

.presets_title_panel_table td {
    overflow: hidden;
    height: 24px;
    width: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.presets_title_panel_table td:nth-child(1) {
    width: 100px;
}

.preset_title_panel_label {
    color: var(--surface-800);
}
</style>
