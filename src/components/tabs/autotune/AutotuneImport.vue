<template>
    <UiBox :title="$t('autotuneImportTitle')">
        <!-- Idle / ready to import -->
        <div v-if="store.analysisState === 'idle'" class="flex items-center justify-between gap-4">
            <p v-html="$t('autotuneImportDescription')"></p>
            <UButton @click="importAndAnalyze" size="sm">
                {{ $t("autotuneImportButton") }}
            </UButton>
        </div>

        <!-- In-progress (importing or analyzing) -->
        <div
            v-if="store.analysisState === 'importing' || store.analysisState === 'analyzing'"
            class="flex items-center gap-3 py-2"
        >
            <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-[var(--color-primary)]" />
            <span class="text-dimmed">{{ store.progressMessage }}</span>
        </div>

        <!-- Error -->
        <div v-if="store.analysisState === 'error'">
            <p class="text-red-500 font-bold mb-2">{{ store.errorMessage }}</p>
            <UButton @click="importAndAnalyze" size="sm">
                {{ $t("autotuneImportRetry") }}
            </UButton>
        </div>

        <!-- Done / summary -->
        <div
            v-if="store.analysisState === 'done' && store.analysisResult"
            class="flex items-center justify-between gap-4"
        >
            <div class="flex gap-5">
                <div class="flex flex-col">
                    <span class="text-xs text-dimmed" v-html="$t('autotuneFile')"></span>
                    <span class="font-bold">{{ store.analysisResult.filename }}</span>
                </div>
                <div class="flex flex-col">
                    <span class="text-xs text-dimmed" v-html="$t('autotuneSampleRate')"></span>
                    <span class="font-bold">{{ store.analysisResult.sampleRate }} Hz</span>
                </div>
                <div class="flex flex-col">
                    <span class="text-xs text-dimmed" v-html="$t('autotuneAxesDetected')"></span>
                    <span class="font-bold">{{ detectedAxes }}</span>
                </div>
            </div>
            <UButton @click="importAndAnalyze" size="sm">
                {{ $t("autotuneImportAnother") }}
            </UButton>
        </div>
    </UiBox>
</template>

<script setup>
import { computed } from "vue";
import { useAutotuneStore } from "@/stores/autotune";
import { useAutotune } from "@/composables/useAutotune";
import UiBox from "../../elements/UiBox.vue";

const store = useAutotuneStore();
const { importAndAnalyze } = useAutotune();

const detectedAxes = computed(() => {
    if (!store.analysisResult?.axes) {
        return "";
    }
    return Object.keys(store.analysisResult.axes)
        .map((a) => a.charAt(0).toUpperCase() + a.slice(1))
        .join(", ");
});
</script>
