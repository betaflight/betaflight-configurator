<template>
    <UModal :open="open" :title="status" :close="false" :dismissible="false">
        <template #body>
            <UProgress :model-value="progress" :max="100" />
        </template>
    </UModal>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { getConnectionState } from "@/js/connection_state";
import { useDialogStore } from "@/stores/dialog";
import CONFIGURATOR from "@/js/data_storage";
import { i18n } from "@/js/localization";

// How long the outcome stays on screen before the dialog closes itself.
const RESULT_LINGER_MS = 1000;
const TICK_MS = 100;

const dialogStore = useDialogStore();
const open = ref(false);

// The reboot window is nulled the moment the reboot concludes, so snapshot its numbers —
// the last frame still needs them to draw a full bar.
const startedAt = getConnectionState().rebootWindowStartedAt;
const durationMs = getConnectionState().rebootWindowMs || 1;

const now = ref(Date.now());
const ticker = setInterval(() => (now.value = Date.now()), TICK_MS);

// serial_backend's reconnect cycle owns the window: it waits for the FC, retries, and
// concludes. This dialog only reports what that owner decided.
const rebooting = computed(() => getConnectionState().isRebootWindowOpen);
const progress = computed(() => (rebooting.value ? Math.min(100, ((now.value - startedAt) / durationMs) * 100) : 100));
const status = computed(() => {
    if (rebooting.value) {
        return i18n.getMessage("rebootFlightController");
    }
    return i18n.getMessage(
        CONFIGURATOR.connectionValid ? "rebootFlightControllerReady" : "rebootFlightControllerFailed",
    );
});

let lingerTimer = null;

// The dialog store holds one activeDialog. A user disconnect closes this dialog through
// serial_backend, unmounting the component — a linger timer left running would then close
// whatever dialog took the slot in the meantime.
function stopTimers() {
    clearInterval(ticker);
    clearTimeout(lingerTimer);
    lingerTimer = null;
}

watch(
    rebooting,
    (stillRebooting) => {
        if (stillRebooting) {
            return;
        }
        clearInterval(ticker);
        lingerTimer = setTimeout(() => {
            lingerTimer = null;
            dialogStore.close();
        }, RESULT_LINGER_MS);
    },
    { immediate: true },
);

onBeforeUnmount(stopTimers);

defineExpose({
    show: () => (open.value = true),
    close: () => (open.value = false),
});
</script>
