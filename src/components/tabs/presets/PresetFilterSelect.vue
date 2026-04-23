<template>
    <div class="flex flex-col gap-0.5">
        <div class="text-left font-normal py-0.5" v-html="$t(labelKey)"></div>
        <USelectMenu
            v-model="selectedItems"
            multiple
            value-key="value"
            :items="items"
            :search-input="{
                placeholder: $t('dropDownFilterDisabled'),
            }"
            :ui="{ content: 'max-h-72 z-[9999]' }"
            class="w-full"
            :class="{ 'ring-2 ring-(--ui-primary) rounded-md': modelValue.length > 0 }"
        >
            <template #default>
                <span v-if="modelValue.length > 0 && modelValue.length === options.length" class="truncate">
                    {{ $t("dropDownAll") }}
                </span>
                <span v-else-if="modelValue.length > 0" class="truncate" :title="modelValue.join('; ')">
                    {{ modelValue.join("; ") }}
                </span>
                <span v-else class="opacity-70 truncate">
                    {{ $t("dropDownFilterDisabled") }}
                </span>
            </template>
        </USelectMenu>
    </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
    labelKey: {
        type: String,
        required: true,
    },
    modelValue: {
        type: Array,
        default: () => [],
    },
    options: {
        type: Array,
        default: () => [],
    },
});

const emit = defineEmits(["update:modelValue"]);

const items = computed(() => props.options.map((opt) => ({ value: opt, label: opt })));

const selectedItems = computed({
    get() {
        return props.modelValue;
    },
    set(newValues) {
        emit("update:modelValue", newValues);
    },
});
</script>
