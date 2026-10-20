<template>
    <BaseTab tab-name="frame">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabFrame") }}</div>

            <UAlert
                v-if="!quad"
                color="neutral"
                variant="subtle"
                icon="i-lucide-info"
                :description="$t('frameTabQuadOnly')"
            />
            <UAlert
                v-else-if="unsupported"
                color="neutral"
                variant="subtle"
                icon="i-lucide-info"
                :description="$t('frameTabUnsupported')"
            />

            <FrameSpectrumPanel v-if="quad" />

            <div v-if="quad" class="grid-row grid-box col2 max-[1055px]:!grid-cols-1">
                <!-- the steps in order on the left (bench test, then the autotune in flight), the motors on the right -->
                <div class="col-span-1 flex flex-col gap-4">
                    <FrameTestPanel @finished="filterTune.afterFrameTest()" />
                    <FilterTunePanel />
                </div>
                <div class="col-span-1 flex flex-col gap-4">
                    <FrameHealthPanel v-if="filterTune.supported" />
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import BaseTab from "./BaseTab.vue";
import FrameTestPanel from "@/components/frame-test/FrameTestPanel.vue";
import FrameHealthPanel from "@/components/frame-test/FrameHealthPanel.vue";
import FilterTunePanel from "@/components/frame-test/FilterTunePanel.vue";
import FrameSpectrumPanel from "@/components/frame-test/FrameSpectrumPanel.vue";
import { useFilterTuneStore } from "@/stores/filterTune";
import { useFrameWizardStore } from "@/stores/frameWizard";
import { useFlightControllerStore } from "@/stores/fc";
import { isQuadMixer } from "@/components/sidebar/sidebar_items";

const filterTune = useFilterTuneStore();
const wizard = useFrameWizardStore();
const fcStore = useFlightControllerStore();

// Quads only for now: the frame test and the autotune assume four motors in a quad.
const quad = computed(() => isQuadMixer(fcStore.mixerConfig.mixer, fcStore.motorConfig?.motor_count));

// Firmware without the frame test and without the filter autotune: nothing here applies.
const unsupported = computed(() => wizard.supported === false && filterTune.supported === false);

onMounted(async () => {
    await filterTune.load();
    await wizard.loadLastResult(filterTune.frameMap);
    filterTune.startPolling();
});

onUnmounted(() => {
    filterTune.detach();
});
</script>
