<template>
    <div class="presets_filter_row">
        <div class="presets_filter_table_header" v-html="$t(labelKey)"></div>
        <div class="presets_filter_table_value">
            <Multiselect
                :model-value="modelValue"
                :options="options"
                :multiple="true"
                :searchable="true"
                :show-labels="false"
                :close-on-select="false"
                :clear-on-select="false"
                :preserve-search="true"
                :placeholder="$t('dropDownFilterDisabled')"
                :class="{ presets_filter_select_nonempty: modelValue.length > 0 }"
                @update:model-value="$emit('update:modelValue', $event)"
            >
                <template #selection="{ values }">
                    <span v-if="values.length > 0 && values.length === options.length" class="multiselect__single">
                        {{ $t("dropDownAll") }}
                    </span>
                    <span v-else-if="values.length > 0" class="multiselect__single" :title="values.join('; ')">
                        {{ values.join("; ") }}
                    </span>
                </template>
            </Multiselect>
        </div>
    </div>
</template>

<script setup>
import Multiselect from "vue-multiselect";
import "vue-multiselect/dist/vue-multiselect.css";

defineProps({
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

defineEmits(["update:modelValue"]);
</script>

<style scoped lang="less">
.presets_filter_table_header {
    color: var(--text);
    border-radius: 4px;
    font-weight: normal;
    text-align: left;
    padding: 0.25rem 0;
}

.presets_filter_table_value {
    width: 100%;
}

:deep(.presets_filter_select_nonempty .multiselect__tags) {
    border-color: var(--primary-500);
    border-width: 2px;
}

.multiselect {
    width: 100%;
    min-height: 38px;
    color: var(--text);
    font-size: inherit;
}

.multiselect:deep(.multiselect__tags) {
    min-height: 38px;
    display: flex;
    align-items: center;
    padding: 0 40px 0 10px;
    border-color: var(--surface-500);
    background: var(--surface-50);
}

.multiselect:deep(.multiselect__input),
.multiselect:deep(.multiselect__single) {
    color: var(--text);
    min-height: 0;
    min-width: 0;
    display: block;
    width: 100%;
    padding: 0;
    margin: 0;
    border: 0 !important;
    border-radius: 0;
    background: transparent !important;
    box-shadow: none;
    line-height: 22px;
}

.multiselect:deep(.multiselect__input:hover),
.multiselect:deep(.multiselect__input:focus),
.multiselect:deep(.multiselect__single:hover),
.multiselect:deep(.multiselect__single:focus) {
    border: 0 !important;
    box-shadow: none;
}

.multiselect:deep(.multiselect__input::placeholder),
.multiselect:deep(.multiselect__placeholder) {
    color: var(--text);
    opacity: 0.72;
}

.multiselect:deep(.multiselect__placeholder) {
    padding: 0;
    margin: 0;
    line-height: 22px;
}

.multiselect:deep(.multiselect__select) {
    height: 36px;
}

.multiselect:deep(.multiselect__select::before) {
    color: var(--text);
    opacity: 0.65;
    border-color: var(--text) transparent transparent transparent;
}

.multiselect:deep(.multiselect__content) {
    background: var(--surface-50);
}

.multiselect:deep(.multiselect__option) {
    color: var(--text);
}

.multiselect:deep(.multiselect__option::after) {
    background: transparent;
}

.multiselect:deep(.multiselect__option--selected::after) {
    color: var(--text);
}

.multiselect:deep(.multiselect__single) {
    margin-bottom: 0;
}

.multiselect:deep(.multiselect__content-wrapper) {
    border-color: var(--surface-500);
}

.multiselect:deep(.multiselect__option--selected) {
    background: var(--primary-100);
    color: var(--text);
}

.multiselect:deep(.multiselect__option--highlight) {
    background: var(--primary-500);
}

@media all and (max-width: 575px) {
    .presets_filter_row {
        display: table-row;
    }

    .presets_filter_table_header {
        display: table-cell;
        background-color: unset;
        border-right: unset;
    }

    .presets_filter_table_value {
        display: table-cell;
    }
}
</style>
