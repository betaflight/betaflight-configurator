<template>
    <div id="firmware-virtual-option" :style="{ display: isVirtual ? 'block' : 'none' }">
        <USelect
            :items="firmwareVersions"
            v-model="selectedVersion"
            size="sm"
            class="sm:min-w-64 min-w-full"
            @update:modelValue="updateValue"
            :ui="{
                content: 'max-h-96',
            }"
        />
    </div>
</template>

<script>
import { defineComponent, ref, watch } from "vue";

export default defineComponent({
    props: {
        modelValue: {
            type: String,
            default: "1.47.0",
        },
        isVirtual: {
            type: Boolean,
            default: true,
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const selectedVersion = ref(props.modelValue);

        watch(
            () => props.modelValue,
            (v) => {
                selectedVersion.value = v;
            },
        );

        const updateValue = (value) => {
            emit("update:modelValue", value);
        };

        const firmwareVersions = ref([
            { value: "1.48.0", label: "MSP: 1.48 | Firmware: 2026.06.*" },
            { value: "1.47.0", label: "MSP: 1.47 | Firmware: 2025.12.*" },
            { value: "1.46.0", label: "MSP: 1.46 | Firmware: 4.5.*" },
            { value: "1.45.0", label: "MSP: 1.45 | Firmware: 4.4.*" },
            { value: "1.44.0", label: "MSP: 1.44 | Firmware: 4.3.*" },
        ]);

        return {
            firmwareVersions,
            updateValue,
            selectedVersion,
        };
    },
});
</script>
