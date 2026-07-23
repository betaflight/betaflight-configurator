<template>
    <UButton :size="size" color="primary" :label="label" icon="i-lucide-folder-open" @click="openFilePicker" />
    <input
        ref="fileInput"
        type="file"
        style="display: none"
        :accept="acceptAttribute"
        :aria-label="label"
        @change="onFileChange"
    />
</template>

<script setup>
import { ref } from "vue";
import { isAndroid } from "../../js/utils/checkCompatibility";
import FileSystem from "../../js/FileSystem";

// Accepted extensions (lower-case); source for both the <input> accept attribute
// and the Android SAF picker.
const LOG_FILE_EXTENSIONS = [".bbl", ".bfl", ".cfl", ".log", ".txt", ".json"];

// accept matches extensions case-sensitively; list both cases.
const acceptAttribute = LOG_FILE_EXTENSIONS.flatMap((ext) => [ext, ext.toUpperCase()]).join(",");

defineProps({
    size: {
        type: String,
        default: "sm",
    },
    label: {
        type: String,
        default: "Open log file/video",
    },
});

const emit = defineEmits(["files-selected"]);
const fileInput = ref(null);

// Android WebView maps <input accept> extensions via MimeTypeMap, which lacks
// .bbl/.bfl/.cfl/.log and greys them out (#5293). Route Android through the
// Capacitor SAF plugin and return a File; other platforms use the <input>.
async function openFilePicker() {
    if (!isAndroid()) {
        fileInput.value?.click();
        return;
    }

    try {
        const descriptor = await FileSystem.pickOpenFile("Blackbox log/config/workspace file", LOG_FILE_EXTENSIONS);
        if (!descriptor) {
            // Cancelled.
            return;
        }
        const blob = await FileSystem.readFileAsBlob(descriptor);
        // File carries .name/.size for the FileReader path in main.js.
        const file = new File([blob], descriptor.name, { type: blob.type });
        emit("files-selected", [file]);
    } catch (error) {
        if (error?.name !== "AbortError") {
            console.error("Failed to open blackbox file:", error);
        }
    }
}

function onFileChange(event) {
    const files = event.target.files;
    if (files.length > 0) {
        emit("files-selected", files);
    }
    // Reset so the same file re-triggers change.
    event.target.value = "";
}
</script>
