<template>
    <BaseTab tab-name="autotune">
        <div class="content_wrapper grid-box col1">
            <!-- Import Section (always visible) -->
            <AutotuneImport />

            <!-- Analysis Results (visible after successful analysis) -->
            <template v-if="store.analysisState === 'done' && store.analysisResult">
                <BodePlot />
                <SpectrogramPlot />
                <GainRecommendation />
            </template>
        </div>
    </BaseTab>
</template>

<script setup>
import BaseTab from "./BaseTab.vue";
import AutotuneImport from "./autotune/AutotuneImport.vue";
import BodePlot from "./autotune/BodePlot.vue";
import SpectrogramPlot from "./autotune/SpectrogramPlot.vue";
import GainRecommendation from "./autotune/GainRecommendation.vue";
import { useAutotuneStore } from "@/stores/autotune";

const store = useAutotuneStore();
</script>
