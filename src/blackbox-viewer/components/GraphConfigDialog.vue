<template>
    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-fit' }" class="overflow-visible">
        <template #header>
            <div class="flex items-center justify-between w-full">
                <h4 class="font-semibold">Configure graphs</h4>
                <div class="flex items-center gap-2">
                    <UDropdownMenu :items="addGraphItems" :content="{ class: 'z-[300]' }">
                        <UButton
                            variant="outline"
                            color="neutral"
                            icon="i-lucide-plus"
                            label="Add graph"
                            trailing-icon="i-lucide-chevron-down"
                            size="xs"
                        />
                    </UDropdownMenu>
                    <UButton
                        v-if="localGraphs.length > 0"
                        variant="ghost"
                        color="error"
                        icon="i-lucide-trash-2"
                        label="Remove all"
                        size="xs"
                        @click="
                            localGraphs = [];
                            emitUpdate();
                        "
                    />
                </div>
            </div>
            <div id="menu-portal-container"></div>
        </template>

        <template #body>
            <div ref="graphListEl" class="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                <!-- Graph panels (drag the handle to reorder) -->
                <UiBox
                    v-for="(graph, gIdx) in localGraphs"
                    :key="graph._uid"
                    :title="`Graph ${gIdx + 1}${graph.label ? ' — ' + graph.label : ''}`"
                >
                    <template #title>
                        <UIcon
                            name="i-lucide-grip-vertical"
                            class="drag-handle size-3.5 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100"
                            title="Drag to reorder graph"
                        />
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-chevron-up"
                            size="2xs"
                            class="disabled:opacity-30"
                            :ui="{ leadingIcon: 'text-black!' }"
                            :disabled="gIdx === 0"
                            :aria-label="`Move graph ${gIdx + 1} up`"
                            @click.stop="moveGraph(gIdx, gIdx - 1)"
                        />
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-chevron-down"
                            size="2xs"
                            class="disabled:opacity-30"
                            :ui="{ leadingIcon: 'text-black!' }"
                            :disabled="gIdx === localGraphs.length - 1"
                            :aria-label="`Move graph ${gIdx + 1} down`"
                            @click.stop="moveGraph(gIdx, gIdx + 1)"
                        />
                    </template>
                    <div class="flex flex-col gap-1">
                        <!-- Graph settings row -->
                        <div class="flex items-center gap-3 mb-1 text-xs">
                            <span class="text-dimmed">Label</span>
                            <UInput
                                v-model="graph.label"
                                placeholder="Axis label"
                                size="xs"
                                class="w-44"
                                @change="emitUpdate()"
                            />
                            <span class="text-dimmed">Height</span>
                            <USelect
                                v-model.number="graph.height"
                                :items="heightOptions"
                                :ui="{ content: 'z-[300]' }"
                                size="xs"
                                class="w-16"
                                @change="emitUpdate()"
                            />
                            <div class="flex-1" />
                            <UButton
                                variant="ghost"
                                color="error"
                                icon="i-lucide-trash-2"
                                size="xs"
                                @click="
                                    localGraphs.splice(gIdx, 1);
                                    emitUpdate();
                                "
                            />
                        </div>

                        <!-- Field grid (PID table style) -->
                        <div
                            class="grid grid-cols-[11rem_auto_auto_auto_2rem_auto_auto_2rem] gap-x-3 gap-y-1 items-center min-w-0"
                        >
                            <!-- Header -->
                            <div />
                            <div class="text-xs text-center text-dimmed">Smooth</div>
                            <div class="text-xs text-center text-dimmed">Expo</div>
                            <div class="text-xs text-center text-dimmed">Line</div>
                            <div class="text-xs text-center text-dimmed">Color</div>
                            <div class="text-xs text-center text-dimmed">Min</div>
                            <div class="text-xs text-center text-dimmed">Max</div>
                            <div />

                            <!-- Field rows -->
                            <template v-for="(field, fIdx) in graph.fields" :key="fIdx">
                                <USelectMenu
                                    v-model="field.name"
                                    :items="fieldItems"
                                    value-key="value"
                                    size="xs"
                                    :ui="{ content: 'z-[300] max-h-72' }"
                                    :search-input="{ placeholder: 'Search fields...' }"
                                    @update:model-value="
                                        onFieldChange(graph, field);
                                        emitUpdate();
                                    "
                                >
                                    <template #default>
                                        <span v-if="field.name" class="truncate">{{ friendlyName(field.name) }}</span>
                                        <span v-else class="opacity-50 truncate">Choose a field</span>
                                    </template>
                                </USelectMenu>
                                <UInputNumber
                                    :model-value="(field.smoothing ?? 0) / 100"
                                    :step="1"
                                    :min="0"
                                    :max="100"
                                    :format-options="noGrouping"
                                    size="xs"
                                    orientation="vertical"
                                    :ui="{ root: 'w-16' }"
                                    @update:model-value="
                                        field.smoothing = $event * 100;
                                        emitUpdate();
                                    "
                                />
                                <UInputNumber
                                    :model-value="Math.round((field.curve?.power ?? 1) * 100)"
                                    :step="10"
                                    :min="0"
                                    :max="500"
                                    :format-options="noGrouping"
                                    size="xs"
                                    orientation="vertical"
                                    :ui="{ root: 'w-16' }"
                                    @update:model-value="
                                        if (!field.curve) field.curve = {};
                                        field.curve.power = $event / 100;
                                        emitUpdate();
                                    "
                                />
                                <UInputNumber
                                    v-model="field.lineWidth"
                                    :step="1"
                                    :min="1"
                                    :max="5"
                                    :format-options="noGrouping"
                                    size="xs"
                                    orientation="vertical"
                                    :ui="{ root: 'w-12' }"
                                    @update:model-value="emitUpdate()"
                                />
                                <div class="flex justify-center">
                                    <span
                                        class="inline-block w-6 h-6 rounded-sm cursor-pointer border border-neutral-200 dark:border-neutral-700"
                                        :style="{ backgroundColor: field.color }"
                                        :title="palette.find((c) => c.color === field.color)?.name || 'Color'"
                                        @click="cycleColor(field)"
                                    />
                                </div>
                                <UContextMenu
                                    :items="menuItems"
                                    portal="#menu-portal-container"
                                    :ui="{ content: 'z-[9999] relative' }"
                                >
                                    <div style="display: contents" @contextmenu="(e) => onContextMenu(e, graph, field)">
                                        <UInputNumber
                                            :model-value="field.curve?.MinMax?.min ?? -500"
                                            :step="field.curve?.highPrecise ? smallMinMaxStep : normalMinMaxStep"
                                            :class="{ italic: field.curve?.highPrecise }"
                                            :format-options="noGrouping"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-20' }"
                                            @update:model-value="
                                                setMin(field, $event);
                                                emitUpdate();
                                            "
                                            @dblclick="
                                                resetMin(field);
                                                emitUpdate();
                                            "
                                            @keydown="
                                                (e) => {
                                                    if (e.key === 'Control' && field.curve) {
                                                        field.curve.highPrecise = !field.curve.highPrecise;
                                                    }
                                                }
                                            "
                                        />
                                        <UInputNumber
                                            :model-value="field.curve?.MinMax?.max ?? 500"
                                            :step="field.curve?.highPrecise ? smallMinMaxStep : normalMinMaxStep"
                                            :class="{ italic: field.curve?.highPrecise }"
                                            :format-options="noGrouping"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-20' }"
                                            @update:model-value="
                                                setMax(field, $event);
                                                emitUpdate();
                                            "
                                            @dblclick="
                                                resetMax(field);
                                                emitUpdate();
                                            "
                                            @keydown="
                                                (e) => {
                                                    if (e.key === 'Control' && field.curve) {
                                                        field.curve.highPrecise = !field.curve.highPrecise;
                                                    }
                                                }
                                            "
                                        />
                                    </div>
                                </UContextMenu>
                                <UButton
                                    variant="ghost"
                                    color="error"
                                    icon="i-lucide-trash-2"
                                    size="2xs"
                                    @click="removeField(graph, fIdx)"
                                />
                            </template>
                        </div>

                        <!-- Add field -->
                        <div class="flex justify-end mt-1">
                            <UButton
                                variant="link"
                                color="neutral"
                                icon="i-lucide-plus"
                                label="Add field"
                                size="xs"
                                @click="addField(graph)"
                            />
                        </div>
                    </div>
                </UiBox>
            </div>
        </template>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton variant="outline" color="neutral" label="Cancel" @click="onCancel" />
                <UButton color="primary" label="Apply changes" @click="onSave" />
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref, watch, computed, onBeforeUnmount } from "vue";
import Sortable from "sortablejs";
import UiBox from "./UiBox.vue";
import { GraphConfig } from "../graph_config.js";
import { FlightLogFieldPresenter } from "../flightlog_fields_presenter.js";

const open = defineModel("open", { type: Boolean, default: false });

const props = defineProps({
    flightLog: { type: Object, default: null },
    graphConfig: { type: Object, default: null },
    grapher: { type: Object, default: null },
});

const emit = defineEmits(["save", "update"]);

const palette = GraphConfig.PALETTE;
const noGrouping = { useGrouping: false };
const localGraphs = ref([]);
const prevConfig = ref(null);
const offeredFields = ref([]);
const exampleGraphs = ref([]);

// --- Drag-and-drop reordering of graph panels (Sortable.js) ---
// Stable per-panel id so Vue's keyed reconciliation cooperates with Sortable's
// DOM move instead of corrupting the list (index keys would break after a drag).
let uidCounter = 0;
function nextUid() {
    uidCounter += 1;
    return uidCounter;
}

const graphListEl = ref(null);
let sortable = null;

// Move a graph panel from one position to another. Shared by the drag handle
// (Sortable) and the keyboard-accessible move up/down buttons. Guards against
// out-of-bounds / undefined indices (Sortable can report undefined indices in
// edge cases, and splice(undefined, ...) would corrupt the list).
function moveGraph(oldIndex, newIndex) {
    if (
        oldIndex === newIndex ||
        oldIndex == null ||
        newIndex == null ||
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= localGraphs.value.length ||
        newIndex >= localGraphs.value.length
    ) {
        return;
    }
    const [moved] = localGraphs.value.splice(oldIndex, 1);
    localGraphs.value.splice(newIndex, 0, moved);
    emitUpdate();
}

watch(graphListEl, (el) => {
    if (sortable) {
        sortable.destroy();
        sortable = null;
    }
    if (!el) {
        return;
    }
    sortable = Sortable.create(el, {
        handle: ".drag-handle",
        ghostClass: "opacity-30",
        animation: 150,
        onEnd({ oldIndex, newIndex }) {
            moveGraph(oldIndex, newIndex);
        },
    });
});

onBeforeUnmount(() => {
    sortable?.destroy();
    sortable = null;
});

const heightOptions = [
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5", value: 5 },
];

// Build USelect items from offered fields
const fieldItems = computed(() =>
    offeredFields.value.map((fn) => ({
        label: friendlyName(fn),
        value: fn,
    })),
);

// Build UDropdownMenu items for "Add graph"
const addGraphItems = computed(() => [
    exampleGraphs.value.map((eg) => ({
        label: eg.label,
        onSelect() {
            addExampleGraph(eg);
        },
    })),
]);

const BLACKLISTED_FIELDS = {
    time: true,
    loopIteration: true,
    "setpoint[0]": true,
    "setpoint[1]": true,
    "setpoint[2]": true,
    "setpoint[3]": true,
};
const ARRAY_FIELD_PATTERN = /^(.+)\[\d+\]$/;

function collectFieldsFromLog(fieldNames, result, seen) {
    let lastRoot = null;
    for (const name of fieldNames) {
        if (BLACKLISTED_FIELDS[name]) {
            continue;
        }
        const m = name.match(ARRAY_FIELD_PATTERN);
        if (m && m[1] !== lastRoot) {
            lastRoot = m[1];
            const allName = `${lastRoot}[all]`;
            result.push(allName);
            seen[allName] = true;
        } else if (!m) {
            lastRoot = null;
        }
        result.push(name);
        seen[name] = true;
    }
}

function collectFieldsFromConfig(graphConfig, result, seen) {
    const graphs = graphConfig.getGraphs();
    for (const g of graphs) {
        for (const f of g.fields) {
            if (!seen[f.name]) {
                result.push(f.name);
                seen[f.name] = true;
            }
        }
    }
}

// Build the offered field names list
function buildOfferedFields() {
    if (!props.flightLog) {
        return;
    }

    const fieldNames = props.flightLog.getMainFieldNames();
    const result = [];
    const seen = {};

    collectFieldsFromLog(fieldNames, result, seen);

    // Include any fields from current config that aren't in this log
    if (props.graphConfig) {
        collectFieldsFromConfig(props.graphConfig, result, seen);
    }

    offeredFields.value = result;
}

function buildExampleGraphs() {
    if (!props.flightLog) {
        return;
    }
    const examples = GraphConfig.getExampleGraphConfigs(props.flightLog);
    examples.unshift({
        label: "Custom graph",
        fields: [{ name: "" }],
        dividerAfter: true,
    });
    exampleGraphs.value = examples;
}

function cloneGraphs(graphs) {
    return structuredClone(graphs);
}

// Convert internal graph config to the format expected by legacy code
function convertToConfig() {
    return localGraphs.value.map((g) => ({
        label: g.label || "",
        height: g.height || 1,
        fields: g.fields
            .filter((f) => f.name)
            .map((f) => ({
                name: f.name,
                smoothing: f.smoothing,
                curve: {
                    power: f.curve?.power ?? 1,
                    MinMax: {
                        min: f.curve?.MinMax?.min ?? -500,
                        max: f.curve?.MinMax?.max ?? 500,
                    },
                },
                default: {
                    smoothing: f.smoothing,
                    power: f.curve?.power ?? 1,
                    MinMax: {
                        min: f.curve?.MinMax?.min ?? -500,
                        max: f.curve?.MinMax?.max ?? 500,
                    },
                },
                color: f.color,
                lineWidth: f.lineWidth || 1,
            })),
    }));
}

function friendlyName(fieldName) {
    const debugMode = props.flightLog?.getSysConfig()?.debug_mode;
    return FlightLogFieldPresenter.fieldNameToFriendly(
        fieldName,
        debugMode,
        props.flightLog?.getSysConfig()?.apiVersion,
    );
}

function getDefaults(fieldName) {
    if (!props.flightLog) {
        return { smoothing: 0, power: 1, MinMax: { min: -500, max: 500 } };
    }
    const smoothing = GraphConfig.getDefaultSmoothingForField(props.flightLog, fieldName);
    const curve = GraphConfig.getDefaultCurveForField(props.flightLog, fieldName);
    return { smoothing, ...curve };
}

function formatSmoothing(field) {
    return `${((field.smoothing ?? 0) / 100).toFixed(0)}%`;
}

function parseSmoothing(field, val) {
    field.smoothing = Number.parseInt(val) * 100;
}

function formatExpo(field) {
    return `${((field.curve?.power ?? 1) * 100).toFixed(0)}%`;
}

function parseExpo(field, val) {
    if (!field.curve) {
        field.curve = {};
    }
    field.curve.power = Number.parseInt(val) / 100;
}

function ensureCurveMinMax(field) {
    if (!field.curve) {
        field.curve = {};
    }
    if (!field.curve.MinMax) {
        field.curve.MinMax = {};
    }
}

function setMin(field, val) {
    ensureCurveMinMax(field);
    const num = Number.parseFloat(val);
    if (Number.isFinite(num)) {
        field.curve.MinMax.min = num;
    }
}

function setMax(field, val) {
    ensureCurveMinMax(field);
    const num = Number.parseFloat(val);
    if (Number.isFinite(num)) {
        field.curve.MinMax.max = num;
    }
}

function resetMin(field) {
    const defaults = getDefaults(field.name);
    setMin(field, defaults.MinMax.min);
}

function resetMax(field) {
    const defaults = getDefaults(field.name);
    setMax(field, defaults.MinMax.max);
}

function onFieldChange(graph, field) {
    if (!field.name || !props.flightLog || !props.graphConfig) {
        return;
    }

    // Check if this is a group field that expands
    const expanded = props.graphConfig.extendFields(props.flightLog, {
        name: field.name,
    });
    if (expanded.length > 1) {
        // Replace this field with the expanded set
        const idx = graph.fields.indexOf(field);
        const colorStart = idx;
        const newFields = expanded.map((ef, i) => {
            const c = palette[(colorStart + i) % palette.length].color;
            return makeField(ef.name, ef, c);
        });
        graph.fields.splice(idx, 1, ...newFields);
    } else {
        // Apply defaults for the selected field
        const defaults = getDefaults(field.name);
        field.smoothing = defaults.smoothing;
        field.curve = { power: defaults.power, MinMax: { ...defaults.MinMax } };
    }
}

function makeField(name, existing, color) {
    const defaults = getDefaults(name);
    return {
        name,
        smoothing: existing?.smoothing ?? defaults.smoothing,
        curve: {
            power: existing?.curve?.power ?? defaults.power,
            MinMax: existing?.curve?.MinMax ? { ...existing.curve.MinMax } : { ...defaults.MinMax },
        },
        color: color || existing?.color || palette[0].color,
        lineWidth: existing?.lineWidth ?? 1,
    };
}

function cycleColor(field) {
    const idx = palette.findIndex((c) => c.color === field.color);
    field.color = palette[(idx + 1) % palette.length].color;
    emitUpdate();
}

function addField(graph) {
    const colorIdx = graph.fields.length;
    const color = palette[colorIdx % palette.length].color;
    graph.fields.push(makeField("", {}, color));
}

function removeField(graph, fIdx) {
    graph.fields.splice(fIdx, 1);
    if (graph.fields.length === 0) {
        const gIdx = localGraphs.value.indexOf(graph);
        if (gIdx !== -1) {
            localGraphs.value.splice(gIdx, 1);
        }
    }
    emitUpdate();
}

function addExampleGraph(example) {
    const colorBase = 0;
    const fields = [];
    for (const f of example.fields) {
        if (!props.flightLog || !props.graphConfig) {
            fields.push(makeField(f.name, f, palette[fields.length % palette.length].color));
            continue;
        }
        const expanded = props.graphConfig.extendFields(props.flightLog, f);
        for (const ef of expanded) {
            const c =
                ef.color && ef.color !== -1 ? ef.color : palette[(colorBase + fields.length) % palette.length].color;
            fields.push(makeField(ef.name, ef, c));
        }
    }
    localGraphs.value.push({
        _uid: nextUid(),
        label: example.label || "",
        height: example.height || 1,
        fields,
    });
    if (example.label !== "Custom graph") {
        emitUpdate();
    }
}

function emitUpdate() {
    emit("update", convertToConfig());
}

function onSave() {
    emit("save", convertToConfig());
    open.value = false;
}

function onCancel() {
    // Restore previous config
    if (prevConfig.value) {
        emit("update", prevConfig.value);
    }
    open.value = false;
}

function cloneGraphToLocal(g) {
    const fields = [];
    for (const f of g.fields) {
        if (!props.flightLog) {
            continue;
        }
        const expanded = props.graphConfig.extendFields(props.flightLog, f);
        for (const ef of expanded) {
            const c = ef.color && ef.color !== -1 ? ef.color : palette[fields.length % palette.length].color;
            fields.push(makeField(ef.name, ef, c));
        }
    }
    return { _uid: nextUid(), label: g.label || "", height: g.height || 1, fields };
}

// Initialize when dialog opens
watch(open, (val) => {
    if (!val) {
        return;
    }
    buildOfferedFields();
    buildExampleGraphs();

    // Clone current graphs into local state
    if (props.graphConfig) {
        localGraphs.value = props.graphConfig.getGraphs().map(cloneGraphToLocal);
        prevConfig.value = convertToConfig();
        defineFieldsResolution();
    }
});

// Set curves min-max values changes step. Switch between normal 10 or precesion 0.1 step by using Ctrl key.
// The precesion value input has italic font.

const normalMinMaxStep = 10;
const smallMinMaxStep = 0.1;

function defineFieldsResolution() {
    for (const graph of localGraphs.value) {
        for (const field of graph.fields) {
            const min = field?.curve?.MinMax?.min;
            const max = field?.curve?.MinMax?.max;
            if (min != null && max != null) {
                field.curve.highPrecise = min % normalMinMaxStep !== 0 || max % normalMinMaxStep !== 0;
            }
        }
    }
}

// Context menu to manage curves min-max values
// Right mouse click at min-max input to show simple menu
// Shift + right mouse click to show extended menu

const currentState = ref({
    graph: null,
    field: null,
    isFieldChecked: null,
    shiftKey: false,
});

function setMinMaxToDefault(setCheckedOnly) {
    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                resetMin(field);
                resetMax(field);
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedDefault() {
    if (currentState.value.field) {
        resetMin(currentState.value.field);
        resetMax(currentState.value.field);
        emitUpdate();
    }
}

function setMinMaxLikeThis(setCheckedOnly) {
    const mm = currentState.value.field?.curve?.MinMax;
    if (currentState.value.graph?.fields && mm?.min !== undefined && mm?.max !== undefined) {
        const min = mm.min;
        const max = mm.max;
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                setMin(field, min);
                setMax(field, max);
            }
        }
        emitUpdate();
    }
}

function setMinMaxOneScale(setCheckedOnly) {
    let max = -Number.MAX_VALUE;
    let min = Number.MAX_VALUE;

    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = field?.curve?.MinMax;
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    max = Math.max(max, mm.max);
                    min = Math.min(min, mm.min);
                }
            }
        }

        if (min !== Number.MAX_VALUE) {
            for (const [index, field] of currentState.value.graph.fields.entries()) {
                if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                    setMin(field, min);
                    setMax(field, max);
                }
            }
            emitUpdate();
        }
    }
}

function setMinMaxCentered(setCheckedOnly) {
    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = field?.curve?.MinMax;
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    let min = mm.min;
                    let max = mm.max;
                    max = Math.max(Math.abs(min), Math.abs(max));
                    min = -max;
                    setMin(field, min);
                    setMax(field, max);
                }
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedCentered() {
    const mm = currentState.value.field?.curve?.MinMax;
    if (mm?.min !== undefined && mm?.max !== undefined) {
        const max = Math.max(Math.abs(mm.min), Math.abs(mm.max));
        const min = -max;
        setMin(currentState.value.field, min);
        setMax(currentState.value.field, max);
        emitUpdate();
    }
}

function setMinMaxZoom(zoom, setCheckedOnly) {
    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = field?.curve?.MinMax;
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    const middle = (mm.min + mm.max) / 2;
                    const halfRange = (mm.max - mm.min) / 2;
                    setMin(field, middle - halfRange * zoom);
                    setMax(field, middle + halfRange * zoom);
                }
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedZoom(zoom) {
    const mm = currentState.value.field?.curve?.MinMax;
    if (mm?.min !== undefined && mm?.max !== undefined) {
        const middle = (mm.min + mm.max) / 2;
        const halfRange = (mm.max - mm.min) / 2;
        setMin(currentState.value.field, middle - halfRange * zoom);
        setMax(currentState.value.field, middle + halfRange * zoom);
        emitUpdate();
    }
}

function setMinMaxToFullRangeDuringAllTime(setCheckedOnly) {
    if (currentState.value.graph?.fields && props.flightLog) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = props.flightLog.getMinMaxForFieldDuringAllTime(field.name);
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    setMin(field, mm.min);
                    setMax(field, mm.max);
                }
            }
        }
        emitUpdate();
    }
}

function getMinMaxForFieldDuringWindowTimeInterval(setCheckedOnly) {
    if (currentState.value.graph?.fields && props.flightLog && props.grapher) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = GraphConfig.getMinMaxForFieldDuringWindowTimeInterval(
                    props.flightLog,
                    props.grapher,
                    field.name,
                );
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    setMin(field, mm.min);
                    setMax(field, mm.max);
                }
            }
        }
        emitUpdate();
    }
}

function getMinMaxForFieldDuringMarkedInterval(setCheckedOnly) {
    if (currentState.value.graph?.fields && props.flightLog && props.grapher) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = GraphConfig.getMinMaxForFieldDuringMarkedInterval(
                    props.flightLog,
                    props.grapher,
                    field.name,
                );
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    setMin(field, mm.min);
                    setMax(field, mm.max);
                }
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedToFullRangeDuringAllTime() {
    if (currentState.value.field?.name && props.flightLog) {
        const mm = props.flightLog.getMinMaxForFieldDuringAllTime(currentState.value.field?.name);
        if (mm?.min !== undefined && mm?.max !== undefined) {
            setMin(currentState.value.field, mm.min);
            setMax(currentState.value.field, mm.max);
            emitUpdate();
        }
    }
}

const zoom = 1.1;

const simpleMenuItems = computed(() => [
    [
        {
            label: "Like this one",
            onSelect() {
                setMinMaxLikeThis();
            },
        },
        {
            label: "Full range",
            onSelect() {
                setMinMaxToFullRangeDuringAllTime();
            },
        },
        {
            label: "One scale",
            onSelect() {
                setMinMaxOneScale();
            },
        },
        {
            label: "Centered",
            onSelect() {
                setMinMaxCentered();
            },
        },
    ],
    [
        {
            label: "Zoom In",
            onSelect(e) {
                e.preventDefault();
                setMinMaxZoom(1 / zoom);
            },
        },
        {
            label: "Zoom Out",
            onSelect(e) {
                e.preventDefault();
                setMinMaxZoom(zoom);
            },
        },
    ],
    [
        {
            label: "Default",
            onSelect() {
                setMinMaxToDefault();
            },
        },
    ],
    [
        {
            label: friendlyName(currentState.value.field?.name ?? ""),
            children: [
                [
                    {
                        label: "Full range",
                        onSelect() {
                            setMinMaxSelectedToFullRangeDuringAllTime();
                        },
                    },
                    {
                        label: "Centered",
                        onSelect() {
                            setMinMaxSelectedCentered();
                        },
                    },
                ],
                [
                    {
                        label: "Zoom In",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(1 / zoom);
                        },
                    },
                    {
                        label: "Zoom Out",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(zoom);
                        },
                    },
                ],
                [
                    {
                        label: "Default",
                        onSelect() {
                            setMinMaxSelectedDefault();
                        },
                    },
                ],
            ],
        },
    ],
]);

function getFieldsCheckboxedSubmenu() {
    const fields = currentState.value.graph?.fields;
    if (fields && currentState.value.isFieldChecked) {
        return currentState.value.graph.fields.map((field, index) => ({
            type: "checkbox",
            label: friendlyName(field.name),
            checked: currentState.value.isFieldChecked[index],
            onUpdateChecked(state) {
                currentState.value.isFieldChecked[index] = state;
            },
            onSelect(e) {
                e.preventDefault();
            },
        }));
    } else {
        return [];
    }
}

const extendedMenuItems = computed(() => [
    [
        {
            label: "Like this one",
            children: [
                [
                    {
                        type: "label",
                        label: "SET MIN-MAX VALUES",
                    },
                    {
                        type: "label",
                        label: "TO SELECTED CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET",
                        onSelect(e) {
                            setMinMaxLikeThis(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
        {
            label: "Set full range",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        type: "label",
                        label: "SET FULL RANGE:",
                    },
                ],
                [
                    {
                        label: "At the all time",
                        onSelect(e) {
                            setMinMaxToFullRangeDuringAllTime(true);
                            e.preventDefault();
                        },
                    },
                    {
                        label: "At the window time",
                        onSelect(e) {
                            getMinMaxForFieldDuringWindowTimeInterval(true);
                            e.preventDefault();
                        },
                    },
                    {
                        label: "At the markers time",
                        onSelect(e) {
                            getMinMaxForFieldDuringMarkedInterval(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
        {
            label: "One scale",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET CURVES TO SAME SCALE",
                        onSelect(e) {
                            setMinMaxOneScale(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
        {
            label: "Centered",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET CURVES TO ZERO OFFSET",
                        onSelect(e) {
                            setMinMaxCentered(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
    ],
    [
        {
            label: "Zoom",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "ZOOM IN",
                        onSelect(e) {
                            setMinMaxZoom(1 / zoom, true);
                            e.preventDefault();
                        },
                    },
                    {
                        label: "ZOOM OUT",
                        onSelect(e) {
                            setMinMaxZoom(zoom, true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
    ],
    [
        {
            label: "Default",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET CURVES TO DEFAULT",
                        onSelect(e) {
                            setMinMaxToDefault(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
    ],
    [
        {
            label: friendlyName(currentState.value.field?.name ?? ""),
            children: [
                [
                    {
                        label: "Full range",
                        children: [
                            [
                                {
                                    label: "At the all time",
                                    onSelect(e) {
                                        setMinMaxSelectedToFullRangeDuringAllTime();
                                        e.preventDefault();
                                    },
                                },
                                {
                                    label: "At the window time",
                                    disabled: true,
                                    onSelect(e) {
                                        e.preventDefault();
                                    },
                                },
                                {
                                    label: "At the markers time",
                                    disabled: true,
                                    onSelect(e) {
                                        e.preventDefault();
                                    },
                                },
                            ],
                        ],
                    },
                    {
                        label: "Centered",
                        onSelect() {
                            setMinMaxSelectedCentered();
                        },
                    },
                ],
                [
                    {
                        label: "Zoom In",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(1 / zoom);
                        },
                    },
                    {
                        label: "Zoom Out",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(zoom);
                        },
                    },
                ],
                [
                    {
                        label: "Default",
                        onSelect() {
                            setMinMaxSelectedDefault();
                        },
                    },
                ],
            ],
        },
    ],
]);

const menuItems = computed(() => {
    if (currentState.value.shiftKey) {
        return extendedMenuItems.value;
    } else {
        return simpleMenuItems.value;
    }
});

function onContextMenu(event, graph, field) {
    currentState.value.graph = graph;
    currentState.value.field = field;
    currentState.value.shiftKey = event.shiftKey;
    if (currentState.value.graph?.fields) {
        currentState.value.isFieldChecked = currentState.value.graph.fields.map(() => true);
    }
}
</script>
