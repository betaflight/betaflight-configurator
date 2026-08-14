<template>
    <UModal v-model:open="open" :title="title">
        <template #body>
            <div class="connect-options">
                <p class="connect-options__help">
                    {{ mode === "virtual" ? $t("connectVirtualDescription") : $t("connectManualDescription") }}
                </p>
                <label v-if="mode === 'virtual'" class="connect-options__field">
                    <span>{{ $t("virtualMSPVersion") }}</span>
                    <USelect
                        v-model="version"
                        :items="firmwareVersions"
                        size="sm"
                        :ui="{ content: 'max-h-96 z-3002' }"
                    />
                </label>
                <template v-else>
                    <label class="connect-options__field">
                        <span>{{ $t("portOverrideText") }}</span>
                        <UInput
                            v-model="portOverride"
                            size="sm"
                            autofocus
                            autocapitalize="none"
                            autocorrect="off"
                            spellcheck="false"
                            @keydown.enter="onConfirm"
                        />
                    </label>
                    <div class="connect-options__field">
                        <!-- The name box and its save button sit on one row, so the label
                             points at the input by id rather than wrapping the row. -->
                        <label for="connect-bookmark-name">{{ $t("connectBookmarkName") }}</label>
                        <div class="flex items-center gap-2">
                            <UInput
                                id="connect-bookmark-name"
                                v-model="bookmarkName"
                                size="sm"
                                class="min-w-0 grow"
                                :placeholder="portOverride.trim() || $t('connectBookmarkNamePlaceholder')"
                                :disabled="!canSaveBookmark"
                                @keydown.enter.prevent="onSaveBookmark"
                            />
                            <UButton
                                color="neutral"
                                variant="soft"
                                size="sm"
                                icon="i-lucide-bookmark-plus"
                                :disabled="!canSaveBookmark"
                                @click="onSaveBookmark"
                            >
                                {{ saveBookmarkLabel }}
                            </UButton>
                        </div>
                    </div>
                    <div v-if="bookmarks.length" class="connect-options__field">
                        <span>{{ $t("connectBookmarks") }}</span>
                        <ul class="m-0 flex max-h-48 list-none flex-col gap-0.5 overflow-y-auto p-0">
                            <li v-for="bookmark in bookmarks" :key="bookmark.url" class="flex items-center gap-1">
                                <UButton
                                    color="neutral"
                                    variant="ghost"
                                    size="sm"
                                    icon="i-lucide-bookmark"
                                    class="min-w-0 grow justify-start truncate"
                                    :title="bookmark.url"
                                    @click="applyBookmark(bookmark)"
                                >
                                    {{ bookmark.name }}
                                </UButton>
                                <UButton
                                    color="error"
                                    variant="ghost"
                                    size="sm"
                                    square
                                    icon="i-lucide-trash-2"
                                    :aria-label="$t('connectBookmarkRemove')"
                                    :title="$t('connectBookmarkRemove')"
                                    @click="removeBookmark(bookmark)"
                                />
                            </li>
                        </ul>
                    </div>
                </template>
            </div>
        </template>
        <template #footer>
            <div class="connect-options__actions">
                <UButton color="neutral" variant="soft" size="sm" @click="onCancel">
                    {{ $t("cancel") }}
                </UButton>
                <UButton color="success" variant="soft" size="sm" :disabled="!canConfirm" @click="onConfirm">
                    {{ $t("connect") }}
                </UButton>
            </div>
        </template>
    </UModal>
</template>

<script>
import { computed, defineComponent, ref, watch } from "vue";
import { i18n } from "../../js/localization";
import { useConnectionBookmarksStore } from "../../stores/connectionBookmarks";

/**
 * @typedef {object} ConnectionBookmark
 * @property {string} name - the label shown in the list and the connect menu
 * @property {string} url - the manual target, e.g. "tcp://192.168.4.1:5761"
 */

const FIRMWARE_VERSIONS = [
    { value: "1.48.0", label: "MSP: 1.48 | Firmware: 2026.06.*" },
    { value: "1.47.0", label: "MSP: 1.47 | Firmware: 2025.12.*" },
    { value: "1.46.0", label: "MSP: 1.46 | Firmware: 4.5.*" },
    { value: "1.45.0", label: "MSP: 1.45 | Firmware: 4.4.*" },
    { value: "1.44.0", label: "MSP: 1.44 | Firmware: 4.3.*" },
];

export default defineComponent({
    name: "ConnectOptionsDialog",
    props: {
        modelValue: { type: Boolean, default: false },
        mode: { type: String, default: "virtual" },
        initialVersion: { type: String, default: "1.46.0" },
        initialPortOverride: { type: String, default: "/dev/rfcomm0" },
    },
    emits: ["update:modelValue", "confirm"],
    setup(props, { emit }) {
        const open = computed({
            get: () => props.modelValue,
            set: (v) => emit("update:modelValue", v),
        });

        const version = ref(props.initialVersion);
        const portOverride = ref(props.initialPortOverride);
        const bookmarkName = ref("");

        const bookmarksStore = useConnectionBookmarksStore();
        const bookmarks = computed(() => bookmarksStore.bookmarks);

        // The bookmark for whatever address is in the field right now: its name is offered
        // back for editing, and the save button becomes an update.
        const matching = computed(() => bookmarksStore.find(portOverride.value));

        watch(
            () => props.modelValue,
            (isOpen) => {
                if (isOpen) {
                    version.value = props.initialVersion;
                    portOverride.value = props.initialPortOverride;
                    bookmarkName.value = matching.value?.name ?? "";
                }
            },
        );

        // Typing a different address must not leave the previous bookmark's name behind,
        // or saving would relabel the wrong target.
        watch(matching, (bookmark) => {
            bookmarkName.value = bookmark?.name ?? "";
        });

        const title = computed(() =>
            i18n.getMessage(props.mode === "virtual" ? "portsSelectVirtual" : "portsSelectManual"),
        );

        const canConfirm = computed(() => {
            if (props.mode === "manual") {
                return portOverride.value.trim().length > 0;
            }
            return Boolean(version.value);
        });

        const canSaveBookmark = computed(() => portOverride.value.trim().length > 0);

        const saveBookmarkLabel = computed(() =>
            i18n.getMessage(matching.value ? "connectBookmarkUpdate" : "connectBookmarkSave"),
        );

        function onSaveBookmark() {
            bookmarksStore.save(portOverride.value, bookmarkName.value);
        }

        /**
         * @param {ConnectionBookmark} bookmark - the row the user picked
         */
        function applyBookmark(bookmark) {
            portOverride.value = bookmark.url;
        }

        /**
         * @param {ConnectionBookmark} bookmark - the row the user dropped
         */
        function removeBookmark(bookmark) {
            bookmarksStore.remove(bookmark.url);
        }

        function onCancel() {
            open.value = false;
        }

        function onConfirm() {
            if (!canConfirm.value) {
                return;
            }
            emit("confirm", {
                mode: props.mode,
                version: version.value,
                portOverride: portOverride.value.trim(),
            });
            open.value = false;
        }

        return {
            open,
            version,
            portOverride,
            bookmarkName,
            bookmarks,
            canSaveBookmark,
            saveBookmarkLabel,
            firmwareVersions: FIRMWARE_VERSIONS,
            title,
            canConfirm,
            onSaveBookmark,
            applyBookmark,
            removeBookmark,
            onCancel,
            onConfirm,
        };
    },
});
</script>

<style scoped>
.connect-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: min(26rem, 80vw);
}

.connect-options__help {
    margin: 0;
    color: var(--text);
    opacity: 0.8;
    font-size: 0.875rem;
}

.connect-options__field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.connect-options__field > span,
.connect-options__field > label {
    font-size: 0.875rem;
    color: var(--text);
}

.connect-options__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}
</style>
