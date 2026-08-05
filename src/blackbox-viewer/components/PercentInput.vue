<template>
    <div class="flex items-center gap-2">
        <label class="text-sm text-dimmed w-24">{{ label }}</label>
        <UInputNumber
            :model-value="parseVal(modelValue)"
            :min="0"
            :max="100"
            :step="1"
            :format-options="{ useGrouping: false }"
            size="xs"
            orientation="vertical"
            :ui="{ root: 'w-16' }"
            @update:model-value="$emit('update:modelValue', `${$event ?? 0}%`)"
        />
        <span class="text-xs text-dimmed">%</span>
    </div>
</template>

<script setup>
defineProps({
    modelValue: { type: String, default: "0%" },
    label: { type: String, default: "Value" },
});

defineEmits(["update:modelValue"]);

function parseVal(v) {
    return Number.parseInt(v) || 0;
}
</script>
