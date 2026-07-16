<template>
    <UButton :size="size" color="primary" :label="label" icon="i-lucide-folder-open" @click="openFilePicker" />
    <input
        ref="fileInput"
        type="file"
        style="display: none"
        accept=".bbl,.BBL,.txt,.TXT,.cfl,.CFL,.bfl,.BFL,.log,.LOG,.json,.JSON"
        :aria-label="label"
        @change="onFileChange"
    />
</template>

<script setup>
import { ref } from "vue";
import { isAndroid } from "../../js/utils/checkCompatibility";
import FileSystem from "../../js/FileSystem";

// Extensions accepted by the picker. Kept in sync with the <input> accept
// attribute above and used to filter the Android SAF picker.
const LOG_FILE_EXTENSIONS = [".bbl", ".bfl", ".cfl", ".log", ".txt", ".json"];

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

// On the Android APK the raw <input type="file"> is serviced by the WebView's
// own file chooser, which maps the accept extensions to MIME types via Android's
// MimeTypeMap. The custom blackbox extensions (.bbl/.bfl/.cfl/.log) are unknown
// to MimeTypeMap, so those files show greyed-out and cannot be selected
// (issue #5293). Route Android through the Capacitor SAF plugin instead — the
// same path every other tab uses — then wrap the bytes in a real File so the
// existing loadFiles/loadLogFile code works unchanged. Web/desktop keep using
// the native <input> below.
async function openFilePicker() {
    if (!isAndroid()) {
        fileInput.value?.click();
        return;
    }

    try {
        const descriptor = await FileSystem.pickOpenFile("Blackbox log/config/workspace file", LOG_FILE_EXTENSIONS);
        if (!descriptor) {
            // User cancelled the picker.
            return;
        }
        const blob = await FileSystem.readFileAsBlob(descriptor);
        // A File is a Blob with .name and .size, so it satisfies the downstream
        // FileReader / file.text() / URL.createObjectURL calls in main.js.
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
    // Reset input so same file can be selected again
    event.target.value = "";
}
</script>
