<template>
    <div class="flex items-center gap-3 mt-1">
        <span class="text-sm text-dimmed w-16 shrink-0">{{ label }}</span>
        <div class="flex items-center gap-1">
            <label class="text-xs text-dimmed">Top</label>
            <UInputNumber
                :model-value="parseVal(top)"
                :min="0"
                :max="100"
                :step="1"
                :format-options="{ useGrouping: false }"
                size="xs"
                orientation="vertical"
                :ui="{ root: 'w-14' }"
                @update:model-value="$emit('update:top', toPercent($event))"
            />
            <span class="text-xs text-dimmed">%</span>
        </div>
        <div class="flex items-center gap-1">
            <label class="text-xs text-dimmed">Left</label>
            <UInputNumber
                :model-value="parseVal(left)"
                :min="0"
                :max="100"
                :step="1"
                :format-options="{ useGrouping: false }"
                size="xs"
                orientation="vertical"
                :ui="{ root: 'w-14' }"
                @update:model-value="$emit('update:left', toPercent($event))"
            />
            <span class="text-xs text-dimmed">%</span>
        </div>
        <div v-if="size !== undefined" class="flex items-center gap-1">
            <label class="text-xs text-dimmed">{{ sizeLabel }}</label>
            <UInputNumber
                :model-value="parseVal(size)"
                :min="0"
                :max="100"
                :step="1"
                :format-options="{ useGrouping: false }"
                size="xs"
                orientation="vertical"
                :ui="{ root: 'w-14' }"
                @update:model-value="$emit('update:size', toPercent($event))"
            />
            <span class="text-xs text-dimmed">%</span>
        </div>
    </div>
</template>

<script setup>
defineProps({
    top: { type: String, default: "0%" },
    left: { type: String, default: "0%" },
    size: { type: String, default: undefined },
    label: { type: String, default: "Position" },
    sizeLabel: { type: String, default: "Size" },
});

defineEmits(["update:top", "update:left", "update:size"]);

function parseVal(v) {
    return Number.parseInt(v) || 0;
}

function toPercent(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
        return "0%";
    }
    return `${Math.min(100, Math.max(0, Math.round(n)))}%`;
}
</script>
