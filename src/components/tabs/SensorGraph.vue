<template>
    <div class="wrapper" :class="[sensorType, { 'debug-item': isDebug }]" v-show="visible">
        <div v-if="!isDebug" class="gui_box grey">
            <div class="graph-grid">
                <svg :id="svgId" ref="svgElement" class="sensor-graph">
                    <g class="grid x" transform="translate(40, 120)"></g>
                    <g class="grid y" transform="translate(40, 10)"></g>
                    <g class="data" transform="translate(41, 10)"></g>
                    <g class="axis x" transform="translate(40, 120)"></g>
                    <g class="axis y" transform="translate(40, 10)"></g>
                </svg>
                <div class="plot_control">
                    <div class="title">
                        <span v-html="title"></span>
                        <div v-if="hint" class="helpicon cf_tip" :title="hint"></div>
                    </div>
                    <dl>
                        <dt v-if="showRefreshRate" v-html="$t('sensorsRefresh')"></dt>
                        <dd v-if="showRefreshRate" class="rate">
                            <select :value="rate" @change="$emit('update:rate', Number($event.target.value))">
                                <option
                                    v-for="option in REFRESH_RATE_OPTIONS"
                                    :key="option.value"
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </option>
                            </select>
                        </dd>
                        <dt v-if="scaleOptions" v-html="$t('sensorsScale')"></dt>
                        <dd v-if="scaleOptions" class="scale">
                            <select :value="scale" @change="$emit('update:scale', Number($event.target.value))">
                                <option v-for="option in scaleOptions" :key="option" :value="option">
                                    {{ option }}
                                </option>
                            </select>
                        </dd>
                        <template v-if="displayValues.length === 3">
                            <dt>X:</dt>
                            <dd class="x">{{ displayValues[0] }}</dd>
                            <dt>Y:</dt>
                            <dd class="y">{{ displayValues[1] }}</dd>
                            <dt>Z:</dt>
                            <dd class="z">{{ displayValues[2] }}</dd>
                        </template>
                        <template v-else>
                            <dt>X:</dt>
                            <dd class="x">{{ displayValues[0] }}</dd>
                        </template>
                    </dl>
                </div>
            </div>
        </div>
        <!-- Debug layout (no grey box wrapper) -->
        <template v-else>
            <svg :id="svgId" ref="svgElement" class="sensor-graph">
                <g class="grid x" transform="translate(40, 120)"></g>
                <g class="grid y" transform="translate(40, 10)"></g>
                <g class="data" transform="translate(41, 10)"></g>
                <g class="axis x" transform="translate(40, 120)"></g>
                <g class="axis y" transform="translate(40, 10)"></g>
            </svg>
            <div class="plot_control">
                <div class="title">{{ title }}</div>
                <dl>
                    <template v-if="showRefreshRate">
                        <dt v-html="$t('sensorsRefresh')"></dt>
                        <dd class="rate">
                            <select :value="rate" @change="$emit('update:rate', Number($event.target.value))">
                                <option
                                    v-for="option in REFRESH_RATE_OPTIONS"
                                    :key="option.value"
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </option>
                            </select>
                        </dd>
                    </template>
                    <dt>X:</dt>
                    <dd class="x">{{ displayValues[0] }}</dd>
                </dl>
            </div>
        </template>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { REFRESH_RATE_OPTIONS } from "./sensors/constants";

const svgElement = ref(null);

defineProps({
    sensorType: {
        type: String,
        required: true,
    },
    svgId: {
        type: String,
        required: true,
    },
    visible: {
        type: Boolean,
        default: true,
    },
    title: {
        type: String,
        required: true,
    },
    hint: {
        type: String,
        default: null,
    },
    showRefreshRate: {
        type: Boolean,
        default: true,
    },
    rate: {
        type: Number,
        default: 50,
    },
    scale: {
        type: Number,
        default: null,
    },
    scaleOptions: {
        type: Array,
        default: null,
    },
    displayValues: {
        type: Array,
        required: true,
    },
    isDebug: {
        type: Boolean,
        default: false,
    },
});

defineEmits(["update:rate", "update:scale"]);

defineExpose({ svgElement });
</script>

<style scoped>
.wrapper .gui_box {
    display: flex;
    flex-direction: row-reverse;
}

.graph-grid {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
}

.debug-item {
    display: flex;
    flex-direction: row;
    gap: 10px;
}

.plot_control {
    width: fit-content;
    min-width: 200px;
    flex-shrink: 0;
}

.plot_control .title {
    font-weight: bold;
    margin-bottom: 0.75rem;
}

.plot_control .helpicon {
    margin: 2px 4px;
}

.plot_control dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
}

.plot_control dt,
.plot_control dd {
    display: flex;
    align-items: center;
}

.plot_control dt {
    font-weight: bold;
}

.plot_control select {
    min-width: 100%;
}

.plot_control .x,
.plot_control .y,
.plot_control .z {
    border-radius: 0.25rem;
    padding: 0.25rem;
    text-align: center;
}

.sensor-graph {
    width: 100%;
    height: 140px;
    flex: 1;
}

:deep(.grid .tick) {
    stroke: silver;
    stroke-width: 1px;
    shape-rendering: crispEdges;
}

:deep(.grid path) {
    stroke-width: 0;
}

:deep(.data .line) {
    stroke-width: 2px;
    fill: none;
}

:deep(text) {
    stroke: none;
    fill: var(--text);
    font-size: 10px;
}

:deep(.line:nth-child(1)) {
    stroke: #00a8f0;
}

:deep(.line:nth-child(2)) {
    stroke: #c0d800;
}

:deep(.line:nth-child(3)) {
    stroke: #cb4b4b;
}

:deep(.line:nth-child(4)) {
    stroke: #4da74d;
}
</style>
