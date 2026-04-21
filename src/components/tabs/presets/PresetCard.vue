<template>
    <div
        :class="[
            'rounded p-4 shadow-sm',
            clickable
                ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-(--ui-primary) focus-visible:outline-offset-[-2px]'
                : '',
            isPicked ? 'border-2 border-green-500' : 'border border-(--ui-border)',
            clickable && mouseOnPanel && !mouseOnStar ? 'bg-(--ui-bg-elevated)' : 'bg-(--ui-bg-muted)',
        ]"
        :role="clickable ? 'button' : undefined"
        :tabindex="clickable ? 0 : undefined"
        @click="handleOpen"
        @keydown="handleCardKeydown"
        @mouseenter="mouseOnPanel = true"
        @mouseleave="mouseOnPanel = false"
    >
        <div class="relative text-(--ui-text-highlighted)">
            <img
                v-if="repository?.official"
                class="w-[25px] h-[25px] rounded-[5px] p-[5px] bg-origin-content bg-no-repeat absolute right-[26px] top-[-5px]"
                :src="officialIcon"
                alt=""
                aria-hidden="true"
            />
            <button
                type="button"
                class="w-[35px] h-[35px] rounded-[5px] p-[5px] absolute right-[-6px] top-[-5px] border-0 flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-(--ui-primary) focus-visible:outline-offset-1"
                :style="{ backgroundColor: starBackgroundColor }"
                :aria-pressed="isFavorite"
                :aria-label="favoriteAriaLabel"
                @click.stop="handleFavoriteToggle"
                @mouseenter="mouseOnStar = true"
                @mouseleave="mouseOnStar = false"
            >
                <img :src="starImage" alt="" class="w-[25px] h-[25px] pointer-events-none" />
            </button>
            <div>
                <span
                    class="text-lg font-bold inline-block mb-2 overflow-hidden whitespace-nowrap text-ellipsis w-[calc(100%-60px)]"
                >
                    {{ preset.title }}
                </span>
            </div>
            <div class="grid gap-0">
                <div class="grid grid-cols-[100px_minmax(0,1fr)] items-center min-h-6">
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span
                            v-show="preset.status === 'EXPERIMENTAL'"
                            class="px-1 py-0.5 inline-block text-white font-bold rounded bg-(--ui-error)"
                            >{{ $t("presetsExperimental") }}</span
                        >
                        <span
                            v-show="preset.status === 'COMMUNITY'"
                            class="px-1 py-0.5 inline-block text-black font-bold rounded bg-(--ui-primary)"
                            >{{ $t("presetsCommunity") }}</span
                        >
                        <span
                            v-show="preset.status === 'OFFICIAL'"
                            class="px-1 py-0.5 inline-block text-white font-bold rounded bg-(--ui-success)"
                            >{{ $t("presetsOfficial") }}</span
                        >
                    </div>
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span class="text-(--ui-text-highlighted) font-bold">{{ preset.category }}</span>
                    </div>
                </div>
                <div class="grid grid-cols-[100px_minmax(0,1fr)] items-center min-h-6">
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span class="text-(--ui-text-muted)" v-html="$t('presetsAuthor')"></span>
                    </div>
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span>{{ preset.author }}</span>
                    </div>
                </div>
                <div class="grid grid-cols-[100px_minmax(0,1fr)] items-center min-h-6">
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span class="text-(--ui-text-muted)" v-html="$t('presetsVersions')"></span>
                    </div>
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span class="font-bold">{{ firmwareVersions }}</span>
                    </div>
                </div>
                <div class="grid grid-cols-[100px_minmax(0,1fr)] items-center min-h-6">
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span class="text-(--ui-text-muted)" v-html="$t('presetsKeywords')"></span>
                    </div>
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span :title="keywords">{{ keywords }}</span>
                    </div>
                </div>
                <div v-if="showRepositoryName" class="grid grid-cols-[100px_minmax(0,1fr)] items-center min-h-6">
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span class="text-(--ui-text-muted)" v-html="$t('presetsSourceRepository')"></span>
                    </div>
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                        <span>{{ repository?.name }}</span>
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

const starBackgroundColor = computed(() =>
    mouseOnStar.value || (mouseOnPanel.value && props.clickable) ? "var(--ui-bg-elevated)" : "transparent",
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
