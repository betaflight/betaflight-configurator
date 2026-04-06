<template>
    <div v-if="isManual" id="port-override-option">
        <label for="port-override">
            <span>{{ $t("portOverrideText") }}</span>
            <UInput v-model="localValue" @update:modelValue="inputValueChanged" size="sm" />
        </label>
    </div>
</template>

<script>
import { defineComponent, ref, watch } from "vue";
import { set as setConfig } from "../../js/ConfigStorage";

export default defineComponent({
    props: {
        modelValue: {
            type: String,
            default: "/dev/rfcomm0",
        },
        isManual: {
            type: Boolean,
            default: true,
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const localValue = ref(props.modelValue);

        watch(
            () => props.modelValue,
            (v) => {
                localValue.value = v;
            },
        );

        const inputValueChanged = (newValue) => {
            setConfig({ portOverride: newValue });
            emit("update:modelValue", newValue);
        };

        return {
            localValue,
            inputValueChanged,
        };
    },
});
</script>

<style lang="less" scoped>
#port-override-option {
    label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
}
</style>
