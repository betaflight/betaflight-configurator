<template>
    <div v-if="isManual" id="port-override-option">
        <label for="port-override">
            <span>{{ $t("portOverrideText") }}</span>
            <input id="port-override" type="text" :value="modelValue" @input="inputValueChanged($event.target.value)" />
        </label>
    </div>
</template>

<script>
import { defineComponent } from "vue";
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
        const inputValueChanged = (newValue) => {
            setConfig({ portOverride: newValue });
            emit("update:modelValue", newValue);
        };

        return {
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
