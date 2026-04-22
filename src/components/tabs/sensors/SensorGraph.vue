<template>
    <div :class="sensorType" v-show="visible">
        <!-- Normal sensor layout -->
        <UiBox v-if="!isDebug" type="neutral">
            <div class="grid grid-cols-[1fr_10rem] gap-4 w-full">
                <svg :id="svgId" ref="svgElement" class="w-full h-full">
                    <g class="grid x" transform="translate(40, 120)"></g>
                    <g class="grid y" transform="translate(40, 10)"></g>
                    <g class="data" transform="translate(41, 10)"></g>
                    <g class="axis x" transform="translate(40, 120)"></g>
                    <g class="axis y" transform="translate(40, 10)"></g>
                </svg>
                <div class="text-[10px] flex flex-col gap-1 [&_button]:!text-[10px] [&_[data-slot=base]]:!text-[10px]">
                    <div class="font-bold mb-2 flex items-center gap-1">
                        <span v-html="title"></span>
                        <HelpIcon v-if="hint" :text="hint" />
                    </div>
                    <div v-if="showRefreshRate" class="flex items-center gap-2">
                        <span class="flex-1" v-html="$t('sensorsRefresh')"></span>
                        <USelect
                            :model-value="rate"
                            :items="refreshRateItems"
                            @update:model-value="$emit('update:rate', Number($event))"
                            class="min-w-24"
                            size="xs"
                        />
                    </div>
                    <div v-if="scaleOptions" class="flex items-center gap-2">
                        <span class="flex-1" v-html="$t('sensorsScale')"></span>
                        <USelect
                            :model-value="scale"
                            :items="scaleItems"
                            @update:model-value="$emit('update:scale', Number($event))"
                            class="min-w-24"
                            size="xs"
                        />
                    </div>
                    <template v-if="displayValues.length === 3">
                        <div v-for="(axis, i) in ['x', 'y', 'z']" :key="axis" class="flex justify-between py-0.5">
                            <span>{{ axis.toUpperCase() }}:</span>
                            <span
                                class="w-24 text-right px-[3px] py-[2px] text-black rounded-[3px]"
                                :class="{
                                    'bg-[#1fb1f0]': axis === 'x',
                                    'bg-[#97d800]': axis === 'y',
                                    'bg-[#e24761]': axis === 'z',
                                }"
                                >{{ displayValues[i] }}</span
                            >
                        </div>
                    </template>
                    <template v-else>
                        <div class="flex justify-between py-0.5">
                            <span>X:</span>
                            <span class="w-24 text-right px-[3px] py-[2px] text-black rounded-[3px] bg-[#1fb1f0]">{{
                                displayValues[0]
                            }}</span>
                        </div>
                    </template>
                </div>
            </div>
        </UiBox>
        <!-- Debug layout (own UiBox, same graph-grid as normal sensors) -->
        <UiBox v-else type="neutral">
            <div class="grid grid-cols-[1fr_10rem] gap-4 w-full">
                <svg :id="svgId" ref="svgElement" class="w-full h-[140px]">
                    <g class="grid x" transform="translate(40, 120)"></g>
                    <g class="grid y" transform="translate(40, 10)"></g>
                    <g class="data" transform="translate(41, 10)"></g>
                    <g class="axis x" transform="translate(40, 120)"></g>
                    <g class="axis y" transform="translate(40, 10)"></g>
                </svg>
                <div class="text-[10px] flex flex-col gap-1 [&_button]:!text-[10px] [&_[data-slot=base]]:!text-[10px]">
                    <div class="font-bold mb-2"><span v-html="title"></span></div>
                    <div v-if="showRefreshRate" class="flex items-center gap-2">
                        <span class="flex-1" v-html="$t('sensorsRefresh')"></span>
                        <USelect
                            :model-value="rate"
                            :items="refreshRateItems"
                            @update:model-value="$emit('update:rate', Number($event))"
                            class="min-w-24"
                            size="xs"
                        />
                    </div>
                    <div class="flex justify-between py-0.5">
                        <span>Value:</span>
                        <span class="w-24 text-right px-[3px] py-[2px] text-black rounded-[3px] bg-[#1fb1f0]">{{
                            displayValues[0]
                        }}</span>
                    </div>
                </div>
            </div>
        </UiBox>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { REFRESH_RATE_OPTIONS } from "./constants";
import UiBox from "@/components/elements/UiBox.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";

const svgElement = ref(null);

const props = defineProps({
    sensorType: { type: String, required: true },
    svgId: { type: String, required: true },
    visible: { type: Boolean, default: true },
    title: { type: String, required: true },
    hint: { type: String, default: null },
    showRefreshRate: { type: Boolean, default: true },
    rate: { type: Number, default: 50 },
    scale: { type: Number, default: null },
    scaleOptions: { type: Array, default: null },
    displayValues: { type: Array, required: true },
    isDebug: { type: Boolean, default: false },
});

const refreshRateItems = REFRESH_RATE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

const scaleItems = computed(() => props.scaleOptions?.map((v) => ({ value: v, label: String(v) })) ?? []);

defineEmits(["update:rate", "update:scale"]);
defineExpose({ svgElement });
</script>

<style>
/* D3 runtime-generated elements — cannot use Tailwind */
.tab-sensors svg g.grid .tick {
    stroke: silver;
    stroke-width: 1px;
    shape-rendering: crispEdges;
}
.tab-sensors svg g.grid path {
    stroke-width: 0;
}
.tab-sensors .data .line {
    stroke-width: 2px;
    fill: none;
}
.tab-sensors svg text {
    stroke: none;
    fill: var(--text);
    font-size: 10px;
}
</style>
