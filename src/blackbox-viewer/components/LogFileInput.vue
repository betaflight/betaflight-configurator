<template>
    <UButton :size="size" color="primary" :label="label" icon="i-lucide-folder-open" @click="$refs.fileInput.click()" />
    <input
        ref="fileInput"
        type="file"
        style="display: none"
        accept=".bbl,.BBL,.txt,.TXT,.cfl,.CFL,.bfl,.BFL,.log,.LOG,.json,.JSON"
        @change="onFileChange"
    />
</template>

<script setup>
import { ref } from "vue";

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

function onFileChange(event) {
    const files = event.target.files;
    if (files.length > 0) {
        emit("files-selected", files);
    }
    // Reset input so same file can be selected again
    event.target.value = "";
}
</script>
