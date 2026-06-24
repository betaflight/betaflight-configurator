<template>
    <UModal
        :open="open"
        :close="false"
        :ui="{
            overlay: 'z-3000',
            content: 'w-[600px] max-w-[calc(100vw-2rem)] h-[520px] z-3001',
            body: 'overflow-visible min-h-0',
        }"
        @update:open="onOpenChange"
    >
        <template #body>
            <div class="flex flex-col flex-1 min-h-0 h-full">
                <div v-if="!loading && preset" class="flex flex-col flex-1 min-h-0">
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
                        ref="optionsDetailsRef"
                        class="relative min-h-[38px] overflow-visible mt-1.5 w-fit min-w-[200px]"
                        :open="optionsExpanded"
                        @toggle="handleOptionsToggle"
                    >
                        <summary
                            class="flex items-center gap-3 min-h-[38px] px-3 border border-(--ui-primary) rounded cursor-pointer list-none preset-options-summary"
                        >
                            <span class="shrink-0" v-html="$t('presetsOptions')"></span>
                            <span class="min-w-0 text-(--ui-text-muted) truncate" :title="optionsSummary">{{
                                optionsSummary
                            }}</span>
                        </summary>
                        <div
                            class="absolute top-full left-0 z-30 grid gap-2.5 min-w-full max-h-60 mt-0 p-3 overflow-auto border border-(--ui-border) border-t-0 rounded-b bg-(--ui-bg) shadow-lg w-fit"
                        >
                            <div v-for="(option, optionIndex) in preset.options" :key="`${option.name}-${optionIndex}`">
                                <template v-if="Array.isArray(option.childs)">
                                    <fieldset class="m-0 p-0 border-0 min-w-0">
                                        <legend class="mb-1.5 font-bold">{{ option.name }}</legend>
                                        <label
                                            v-for="(child, childIndex) in option.childs"
                                            :key="`${child.name}-${childIndex}`"
                                            class="flex gap-2 items-center mb-1.5 pl-1"
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
                                <label v-else class="flex gap-2 items-center mb-1.5 pl-1">
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
                        v-if="!showCli"
                        class="preset-description-text preset-description-html"
                        data-testid="preset-html-description"
                        v-html="descriptionHtml"
                    ></div>
                    <div v-if="showCli" class="preset-description-text">
                        {{ cliText }}
                    </div>
                </div>
                <div v-if="loading" class="data-loading h-[300px]"></div>
                <div v-if="error" class="p-5 text-(--ui-error)">{{ error }}</div>
            </div>
        </template>

        <template #footer>
            <div class="flex flex-wrap items-center justify-end gap-2 w-full">
                <div class="flex items-center flex-wrap gap-1.5">
                    <UButton
                        v-if="!showCli"
                        :label="showCliLabel"
                        variant="outline"
                        size="xs"
                        @click="emit('toggle-cli-visible', true)"
                    />
                    <UButton
                        v-if="showCli"
                        :label="hideCliLabel"
                        variant="outline"
                        size="xs"
                        @click="emit('toggle-cli-visible', false)"
                    />
                    <UButton
                        :label="viewOnlineLabel"
                        variant="outline"
                        size="xs"
                        :as="'a'"
                        target="_blank"
                        rel="noopener noreferrer"
                        :href="onlineLink"
                    />
                    <UButton
                        :label="discussionLabel"
                        variant="outline"
                        size="xs"
                        :as="'a'"
                        target="_blank"
                        rel="noopener noreferrer"
                        :href="discussionHref"
                        :disabled="!discussionLink"
                        data-testid="preset-discussion-link"
                    />
                </div>
                <div class="flex flex-wrap justify-end gap-1.5">
                    <UButton :label="$t('presetsApply')" :disabled="loading || !!error" @click="handleApply" />
                    <UButton :label="$t('close')" variant="outline" @click="requestClose" />
                </div>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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

const optionsDetailsRef = ref(null);

function handleClickOutside(event) {
    if (optionsDetailsRef.value?.open && !optionsDetailsRef.value.contains(event.target)) {
        optionsDetailsRef.value.open = false;
        emit("options-expanded-change", false);
    }
}

onMounted(() => {
    document.addEventListener("click", handleClickOutside);
});

onBeforeUnmount(() => {
    document.removeEventListener("click", handleClickOutside);
});

const descriptionText = computed(() => props.preset?.description?.join("\n") ?? "");
const cliText = computed(() => props.cliStrings.join("\n"));
const totalOptionsCount = computed(() => {
    if (!props.preset?.options) {
        return 0;
    }

    return props.preset.options.reduce((count, option) => {
        if (Array.isArray(option.childs)) {
            return count + option.childs.length;
        }

        return count + 1;
    }, 0);
});
const optionsSummary = computed(() => {
    const selected = props.selectedOptionIds.length;

    if (selected === 0) {
        return `0 of ${totalOptionsCount.value} selected`;
    }

    return `${selected} of ${totalOptionsCount.value} selected`;
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
    if (!descriptionText.value) {
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

function requestClose() {
    emit("close");
}

function onOpenChange(value) {
    if (!value && props.open) {
        requestClose();
    }
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

<style>
/* Preset description styling (modal body is teleported, so no .tab-presets ancestor) */
.preset-description-text + .preset-description-text,
.preset-description-text {
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

/* Options panel summary arrow */
.preset-options-summary::-webkit-details-marker {
    display: none;
}

.preset-options-summary::after {
    content: "";
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--ui-text);
    justify-self: end;
    opacity: 0.65;
    transition: transform 0.2s ease;
}

details[open] > .preset-options-summary {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

details[open] > .preset-options-summary::after {
    transform: rotate(180deg);
}

/* Markdown description HTML styling */
.preset-description-html {
    white-space: normal;
}

.preset-description-html h1,
.preset-description-html h2 {
    padding-top: 10px;
    padding-bottom: 3px;
}

.preset-description-html h3 {
    padding-top: 5px;
    padding-bottom: 0;
}

.preset-description-html h4,
.preset-description-html h5,
.preset-description-html h6 {
    padding-top: 0;
    padding-bottom: 0;
}

.preset-description-html ul,
.preset-description-html ol {
    padding-left: 25px;
}

.preset-description-html ul li {
    padding-left: 12px;
    list-style-type: disclosure-closed;
}

.preset-description-html ol li {
    padding-left: 12px;
    list-style-type: decimal;
}

.preset-description-html img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
}

@media all and (max-width: 575px) {
    .preset-description-text {
        height: unset;
        padding-bottom: 100px;
    }
}
</style>
