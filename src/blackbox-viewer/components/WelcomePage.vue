<template>
    <div v-if="!logStore.hasLog" class="welcome-page">
        <!-- Dimmed "as though a log were loaded" graph backdrop -->
        <img class="welcome-backdrop" src="/images/blackbox-default-backdrop.png" alt="" aria-hidden="true" />

        <!-- Centred open / download dialog -->
        <UCard class="welcome-dialog">
            <div class="welcome-body">
                <h2 class="welcome-title">Open a flight log</h2>
                <p class="welcome-tagline">
                    Analyse a recorded log, or download one from a connected flight controller.
                </p>

                <div class="welcome-actions">
                    <LogFileInput size="lg" label="Open log file" @files-selected="$emit('files-selected', $event)" />

                    <UTooltip
                        :text="
                            downloadAvailable
                                ? 'Download the onboard log from the connected flight controller'
                                : 'Connect a flight controller that has a recorded log'
                        "
                    >
                        <UButton
                            size="lg"
                            color="primary"
                            variant="soft"
                            icon="i-lucide-download"
                            :loading="pulling"
                            :disabled="!downloadAvailable || pulling"
                            :label="pulling ? `Downloading… ${Math.round(progress)}%` : 'Download from FC'"
                            @click="onDownload"
                        />
                    </UTooltip>
                </div>

                <div class="welcome-help">
                    <UIcon name="i-lucide-help-circle" class="welcome-help-icon" />
                    <ULink
                        to="https://github.com/betaflight/betaflight/blob/master/docs/Blackbox.md"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Getting started with Blackbox
                    </ULink>
                </div>
            </div>
        </UCard>
    </div>
</template>

<script setup>
import { computed, inject } from "vue";
import { useLogStore } from "../stores/log.js";
import { useAppStore } from "../stores/app.js";
import LogFileInput from "./LogFileInput.vue";

defineEmits(["files-selected"]);
const logStore = useLogStore();
const appStore = useAppStore();

// Host-provided FC dataflash pull capability (null when not embedded / unavailable).
// Its fields are refs nested in a plain object, so unwrap them via local computeds
// (nested refs are not auto-unwrapped in templates).
const dataflash = inject("bbvDataflash", null);
const downloadAvailable = computed(() => !!dataflash?.available?.value);
const pulling = computed(() => !!dataflash?.pulling?.value);
const progress = computed(() => dataflash?.progress?.value ?? 0);

async function onDownload() {
    if (!dataflash || !downloadAvailable.value || dataflash.pulling.value) {
        return;
    }
    try {
        const buffer = await dataflash.pull();
        appStore.loadLogBuffer?.(buffer, "FC dataflash.BBL");
    } catch (e) {
        alert(`Could not download the log from the flight controller:\n\n${e.message}`);
    }
}
</script>

<style scoped>
.welcome-page {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--graph-background, #0c0c0c);
    overflow: hidden;
}

/* Dimmed graph image behind the dialog */
.welcome-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: left center;
    opacity: 0.28;
    filter: saturate(0.9);
    pointer-events: none;
    user-select: none;
}

.welcome-dialog {
    position: relative;
    z-index: 1;
    width: min(30rem, 90%);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.welcome-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
}

.welcome-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
}

.welcome-tagline {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin: 0 0 0.5rem;
    line-height: 1.4;
}

.welcome-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
}

.welcome-help {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    line-height: 1;
}

.welcome-help-icon {
    width: 0.9rem;
    height: 0.9rem;
    flex: none;
}
</style>
