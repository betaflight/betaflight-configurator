<template>
    <div class="flex items-center gap-2" :class="centered ? 'justify-center' : ''">
        <span class="text-xs text-[var(--surface-700)]">{{ $t("magCalibrationCalValues") }}</span>
        <UInputNumber
            v-model="editX"
            :step="1"
            :min="-32768"
            :max="32767"
            :disabled="!offsets"
            aria-label="X"
            orientation="vertical"
            size="xs"
            class="w-20"
        />
        <UInputNumber
            v-model="editY"
            :step="1"
            :min="-32768"
            :max="32767"
            :disabled="!offsets"
            aria-label="Y"
            orientation="vertical"
            size="xs"
            class="w-20"
        />
        <UInputNumber
            v-model="editZ"
            :step="1"
            :min="-32768"
            :max="32767"
            :disabled="!offsets"
            aria-label="Z"
            orientation="vertical"
            size="xs"
            class="w-20"
        />
        <UButton
            v-if="showSave"
            size="xs"
            :label="$t('magCalibrationSaveValues')"
            :disabled="!dirty || !offsets"
            :loading="saving"
            @click="$emit('save', { x: editX, y: editY, z: editZ })"
        />
    </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
    offsets: {
        type: Object,
        default: null,
    },
    saving: {
        type: Boolean,
        default: false,
    },
    showSave: {
        type: Boolean,
        default: true,
    },
    centered: {
        type: Boolean,
        default: false,
    },
});

defineEmits(["save"]);

const editX = ref(0);
const editY = ref(0);
const editZ = ref(0);

watch(
    () => props.offsets,
    (o) => {
        editX.value = o?.x ?? 0;
        editY.value = o?.y ?? 0;
        editZ.value = o?.z ?? 0;
    },
    { immediate: true },
);

const dirty = computed(() => {
    const fw = props.offsets;
    if (!fw) {
        return editX.value !== 0 || editY.value !== 0 || editZ.value !== 0;
    }
    return editX.value !== fw.x || editY.value !== fw.y || editZ.value !== fw.z;
});
</script>
