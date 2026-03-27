<template>
    <dialog id="presets_detailed_dialog" ref="dialogRef" @close="emit('close')" @cancel.prevent="requestClose">
        <div id="presets_detailed_dialog_content_wrapper">
            <div id="presets_detailed_dialog_content">
                <div v-if="!loading && preset" id="presets_detailed_dialog_properties">
                    <PresetCard
                        :preset="preset"
                        :repository="repository"
                        :clickable="false"
                        :show-repository-name="showRepositoryName"
                        :is-favorite="isFavorite"
                        :is-picked="isPicked"
                        @toggle-favorite="emit('toggle-favorite')"
                    />

                    <details
                        v-if="preset?.options?.length"
                        id="presets_options_panel"
                        :open="optionsExpanded"
                        @toggle="handleOptionsToggle"
                    >
                        <summary>
                            <span id="preset_options_label" v-html="$t('presetsOptions')"></span>
                            <span class="preset-options-summary-value" :title="optionsSummary">{{
                                optionsSummary
                            }}</span>
                        </summary>
                        <div class="preset-options-list">
                            <div v-for="(option, optionIndex) in preset.options" :key="`${option.name}-${optionIndex}`">
                                <template v-if="Array.isArray(option.childs)">
                                    <fieldset class="preset-options-group">
                                        <legend>{{ option.name }}</legend>
                                        <label
                                            v-for="(child, childIndex) in option.childs"
                                            :key="`${child.name}-${childIndex}`"
                                            class="preset-option-label"
                                        >
                                            <input
                                                v-if="option.isExclusive"
                                                type="radio"
                                                :name="`preset-option-group-${optionIndex}`"
                                                :checked="selectedOptionIds.includes(child.id)"
                                                @change="
                                                    emit('select-exclusive-option', {
                                                        selectedOptionId: child.id,
                                                        groupOptionIds: option.childs.map(
                                                            (groupOption) => groupOption.id,
                                                        ),
                                                    })
                                                "
                                            />
                                            <input
                                                v-else
                                                type="checkbox"
                                                :checked="selectedOptionIds.includes(child.id)"
                                                @change="
                                                    emit('toggle-option', {
                                                        optionId: child.id,
                                                        checked: $event.target.checked,
                                                    })
                                                "
                                            />
                                            <span>{{ child.name }}</span>
                                        </label>
                                    </fieldset>
                                </template>
                                <label v-else class="preset-option-label">
                                    <input
                                        type="checkbox"
                                        :checked="selectedOptionIds.includes(option.id)"
                                        @change="
                                            emit('toggle-option', {
                                                optionId: option.id,
                                                checked: $event.target.checked,
                                            })
                                        "
                                    />
                                    <span>{{ option.name }}</span>
                                </label>
                            </div>
                        </div>
                    </details>

                    <div
                        v-if="!showCli && !isDescriptionHtml"
                        id="presets_detailed_dialog_text_description"
                        class="presets_detailed_dialog_text"
                    >
                        {{ descriptionText }}
                    </div>
                    <div
                        v-if="!showCli && isDescriptionHtml"
                        id="presets_detailed_dialog_html_description"
                        class="presets_detailed_dialog_text"
                        v-html="descriptionHtml"
                    ></div>
                    <div v-if="showCli" id="presets_detailed_dialog_text_cli" class="presets_detailed_dialog_text">
                        {{ cliText }}
                    </div>
                </div>
                <div v-if="loading" id="presets_detailed_dialog_loading" class="data-loading"></div>
                <div v-if="error" id="presets_detailed_dialog_error">{{ error }}</div>
            </div>

            <div class="content_toolbar">
                <div class="btn">
                    <div class="left-panel">
                        <a
                            id="presets_cli_show"
                            v-show="!showCli"
                            href="#"
                            class="tool regular-button"
                            @click.prevent="emit('toggle-cli-visible', true)"
                            :aria-label="showCliLabel"
                            >{{ showCliLabel }}</a
                        >
                        <a
                            id="presets_cli_hide"
                            v-show="showCli"
                            href="#"
                            class="tool regular-button"
                            @click.prevent="emit('toggle-cli-visible', false)"
                            :aria-label="hideCliLabel"
                            >{{ hideCliLabel }}</a
                        >
                        <a
                            id="presets_open_online"
                            class="tool regular-button"
                            target="_blank"
                            rel="noopener noreferrer"
                            :href="onlineLink"
                            :aria-label="viewOnlineLabel"
                            >{{ viewOnlineLabel }}</a
                        >
                        <a
                            id="presets_open_discussion"
                            class="tool regular-button"
                            target="_blank"
                            rel="noopener noreferrer"
                            :href="discussionHref"
                            :class="{ disabled: !discussionLink }"
                            :aria-label="discussionLabel"
                            >{{ discussionLabel }}</a
                        >
                    </div>
                    <div>
                        <a
                            href="#"
                            id="presets_detailed_dialog_applybtn"
                            class="tool regular-button mainButton"
                            :class="{ disabled: loading || !!error }"
                            @click.prevent="handleApply"
                            >{{ $t("presetsApply") }}</a
                        >
                        <a
                            href="#"
                            id="presets_detailed_dialog_closebtn"
                            class="tool regular-button mainButton"
                            @click.prevent="requestClose"
                            >{{ $t("close") }}</a
                        >
                    </div>
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { i18n } from "@/js/localization";
import PresetCard from "./PresetCard.vue";

const props = defineProps({
    open: {
        type: Boolean,
        default: false,
    },
    preset: {
        type: Object,
        default: null,
    },
    repository: {
        type: Object,
        default: null,
    },
    loading: {
        type: Boolean,
        default: false,
    },
    error: {
        type: String,
        default: "",
    },
    showCli: {
        type: Boolean,
        default: false,
    },
    showRepositoryName: {
        type: Boolean,
        default: false,
    },
    selectedOptionIds: {
        type: Array,
        default: () => [],
    },
    selectedOptionLabels: {
        type: Array,
        default: () => [],
    },
    optionsExpanded: {
        type: Boolean,
        default: false,
    },
    cliStrings: {
        type: Array,
        default: () => [],
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

const emit = defineEmits([
    "apply",
    "close",
    "toggle-cli-visible",
    "toggle-option",
    "select-exclusive-option",
    "toggle-favorite",
    "options-expanded-change",
]);

const dialogRef = ref(null);

const descriptionText = computed(() => props.preset?.description?.join("\n") ?? "");
const isDescriptionHtml = computed(() => props.preset?.parser === "MARKED");
const cliText = computed(() => props.cliStrings.join("\n"));
const optionsSummary = computed(() => {
    if (props.selectedOptionLabels.length === 0) {
        return "";
    }

    return props.selectedOptionLabels.join("; ");
});
const onlineLink = computed(() =>
    props.preset && props.repository ? props.repository.getPresetOnlineLink(props.preset) : "#",
);
const discussionLink = computed(() => sanitizeExternalHttpUrl(props.preset?.discussion));
const discussionHref = computed(() => discussionLink.value || undefined);
const showCliLabel = decodeHtmlEntities(i18n.getMessage("presetsShowCli"));
const hideCliLabel = decodeHtmlEntities(i18n.getMessage("presetsHideCli"));
const viewOnlineLabel = decodeHtmlEntities(i18n.getMessage("presetsViewOnline"));
const discussionLabel = decodeHtmlEntities(i18n.getMessage("presetsOpenDiscussion"));

const descriptionHtml = computed(() => {
    if (!isDescriptionHtml.value) {
        return "";
    }

    const renderedHtml = DOMPurify.sanitize(marked.parse(descriptionText.value));
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderedHtml;
    wrapper.querySelectorAll("a").forEach((link) => {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
    });
    return wrapper.innerHTML;
});

watch(
    () => props.open,
    async (isOpen) => {
        await nextTick();

        if (!dialogRef.value) {
            return;
        }

        if (isOpen && !dialogRef.value.open) {
            dialogRef.value.showModal();
        } else if (!isOpen && dialogRef.value.open) {
            dialogRef.value.close();
        }
    },
    { immediate: true },
);

function requestClose() {
    emit("close");
}

function sanitizeExternalHttpUrl(rawUrl) {
    if (!rawUrl) {
        return "";
    }

    try {
        const url = new URL(rawUrl);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

function decodeHtmlEntities(text) {
    if (!text) {
        return "";
    }

    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}

function handleApply() {
    if (!props.loading && !props.error) {
        emit("apply");
    }
}

function handleOptionsToggle(event) {
    emit("options-expanded-change", event.target.open);
}
</script>

<style lang="less">
#presets_detailed_dialog {
    width: 600px;
    height: 520px;
    padding: 12px 12px 0 12px;
    flex-direction: column;

    .content_toolbar {
        width: auto;
        margin-top: auto;
        margin-left: -12px;
        margin-right: -12px;
        justify-content: space-between;

        .btn {
            display: contents;
        }
    }
}

#presets_detailed_dialog[open] {
    display: flex;
}

#presets_detailed_dialog_content_wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    .preset_title_panel_title {
        padding-bottom: 0.5ex;
        border-bottom: 1px solid var(--primary-500);
        margin-bottom: 2ex;
    }

    .left-panel {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
        padding-left: 20px;

        .regular-button {
            margin-top: 0;
            margin-bottom: 0;
        }
    }
}

#presets_detailed_dialog_content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

#presets_detailed_dialog_properties {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

#presets_detailed_dialog_loading {
    height: 300px;
}

#presets_detailed_dialog_error {
    padding: 20px 10px;
    color: var(--error-500);
}

#presets_options_panel {
    position: relative;
    min-height: 26px;
    margin-top: 6px;
    height: 26px;
    overflow: visible;
}

#presets_options_panel summary {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 12px;
    min-height: 38px;
    padding: 0 12px;
    border: 2px solid var(--primary-500);
    border-radius: 4px;
    background: var(--surface-50);
    cursor: pointer;
    list-style: none;
}

#presets_options_panel summary::-webkit-details-marker {
    display: none;
}

.preset-options-summary-value {
    min-width: 0;
    color: var(--text);
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#presets_options_panel summary::after {
    content: "";
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--text);
    justify-self: end;
    opacity: 0.65;
    transition: transform 0.2s ease;
}

#presets_options_panel[open] summary {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

#presets_options_panel[open] summary::after {
    transform: rotate(180deg);
}

.preset-options-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 30;
    display: grid;
    gap: 10px;
    max-height: 240px;
    margin-top: 0;
    padding: 12px 14px;
    overflow: auto;
    border: 1px solid var(--surface-500);
    border-top: 0;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    background: var(--surface-50);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
}

.preset-options-group {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
}

.preset-options-group legend {
    margin-bottom: 6px;
    font-weight: 700;
}

.preset-option-label {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
    padding-left: 4px;
}

.preset-option-label:last-child {
    margin-bottom: 0;
}

#preset_options_label {
    width: 100px;
    display: inline-block;
}

.presets_detailed_dialog_text {
    padding-top: 6px;
    padding-bottom: 6px;
    margin-top: 12px;
    margin-bottom: 12px;
    overflow-y: scroll;
    flex: 1;
    min-height: 0;
    font-size: 110%;
    white-space: pre-line;
    user-select: text;
}

#presets_detailed_dialog_html_description {
    white-space: normal;

    h1,
    h2 {
        padding-top: 10px;
        padding-bottom: 3px;
    }

    h3 {
        padding-top: 5px;
        padding-bottom: 0;
    }

    h4,
    h5,
    h6 {
        padding-top: 0;
        padding-bottom: 0;
    }

    ul,
    ol {
        padding-left: 25px;
    }

    ul li {
        padding-left: 12px;
        list-style-type: disclosure-closed;
    }

    ol li {
        padding-left: 12px;
        list-style-type: decimal;
    }

    img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
    }
}

@media all and (max-width: 575px) {
    .presets_detailed_dialog_text {
        height: unset;
        padding-bottom: 100px;
    }

    #presets_detailed_dialog {
        .content_toolbar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100vw;
            height: auto;
            min-height: 80px;
            padding: 10px;
            box-sizing: border-box;
            border-top: 1px solid var(--primary-500);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
        }

        .btn {
            display: flex;
            flex-direction: column;
            width: 100%;
            align-items: center;

            .left-panel {
                position: relative;
                left: unset;
                padding-left: 0;
                margin: 0;
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 5px;
            }
        }

        .mainButton {
            margin-top: 5px;
            display: inline-block;
        }
    }

    #presets_options_panel {
        margin-top: 6px;
        grid-template-columns: 100px 1fr;
        display: grid;
    }

    #presets_options_panel summary {
        grid-template-columns: 100px minmax(0, 1fr) 16px;
    }
}
</style>
