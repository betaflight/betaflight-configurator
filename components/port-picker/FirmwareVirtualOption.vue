<template>
    <div id="firmware-virtual-option" :style="{ display: isVirtual ? 'block' : 'none' }">
        <div class="dropdown dropdown-dark">
            <select
                id="firmware-version-dropdown"
                :value="modelValue"
                class="dropdown-select"
                :title="$t('virtualMSPVersion')"
                @input="updateValue($event.target.value)"
            >
                <option v-for="(version, index) in firmwareVersions" :key="index" :value="version.value">
                    {{ version.label }}
                </option>
            </select>
        </div>
    </div>
</template>

<script>
import { defineComponent, ref } from "vue";

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
        const updateValue = (value) => {
            emit("update:modelValue", value);
        };

        const firmwareVersions = ref([
            { value: "1.47.0", label: "MSP: 1.47 | Firmware: 2025.12.*" },
            { value: "1.46.0", label: "MSP: 1.46 | Firmware: 4.5.*" },
            { value: "1.45.0", label: "MSP: 1.45 | Firmware: 4.4.*" },
            { value: "1.44.0", label: "MSP: 1.44 | Firmware: 4.3.*" },
        ]);

        return {
            firmwareVersions,
            updateValue,
        };
    },
});
</script>
