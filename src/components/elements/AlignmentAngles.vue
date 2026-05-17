<template>
    <div class="flex gap-2 flex-wrap">
        <SettingColumn v-for="axis in AXES" :key="axis" :label="$t(`${labelPrefix}${SUFFIXES[axis]}`)">
            <template #label><div :class="['alignicon', axis]"></div></template>
            <UInputNumber
                :model-value="props[axis]"
                :step="step"
                :min="-180"
                :max="360"
                :aria-label="$t(`${labelPrefix}${SUFFIXES[axis]}`)"
                orientation="vertical"
                size="xs"
                class="w-16"
                @update:model-value="emit(`update:${axis}`, $event)"
            />
        </SettingColumn>
    </div>
</template>

<script setup>
import SettingColumn from "./SettingColumn.vue";

const AXES = ["roll", "pitch", "yaw"];
const SUFFIXES = { roll: "Roll", pitch: "Pitch", yaw: "Yaw" };

const props = defineProps({
    roll: { type: Number, default: 0 },
    pitch: { type: Number, default: 0 },
    yaw: { type: Number, default: 0 },
    labelPrefix: { type: String, required: true },
    step: { type: Number, default: 0.1 },
});

const emit = defineEmits(["update:roll", "update:pitch", "update:yaw"]);
</script>
