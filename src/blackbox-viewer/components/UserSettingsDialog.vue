<template>
    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-4xl' }">
        <template #header>
            <h4 class="font-semibold">Advanced User Settings</h4>
        </template>

        <template #body>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 max-h-[70vh] overflow-y-auto text-sm">
                <!-- Left column -->
                <div class="flex flex-col gap-4">
                    <!-- Mixer Settings -->
                    <UiBox title="Mixer Settings">
                        <SettingRow label="Custom" help="Select custom craft display">
                            <USwitch v-model="customMixBool" size="sm" />
                        </SettingRow>
                        <div v-if="local.customMix" class="flex items-center gap-4 mt-2">
                            <USelect
                                v-model="local.mixerConfiguration"
                                :items="mixerOptions"
                                :ui="{ content: 'z-[300]' }"
                                size="sm"
                                class="flex-1"
                            />
                            <img
                                :src="`./images/motor_order/${mixerImageName}.svg`"
                                class="w-16 h-16 object-contain"
                                :alt="mixerName"
                            />
                        </div>
                    </UiBox>

                    <!-- Stick Settings -->
                    <UiBox title="Stick Settings">
                        <SettingRow label="Units" help="Display actual units on stick display">
                            <USwitch v-model="local.stickUnits" size="sm" />
                        </SettingRow>
                        <SettingRow label="Stick Trails" help="Show stick trails">
                            <USwitch v-model="local.stickTrails" size="sm" />
                        </SettingRow>
                        <SettingRow label="Invert Yaw" help="Invert yaw in stick display">
                            <USwitch v-model="local.stickInvertYaw" size="sm" />
                        </SettingRow>
                        <SettingRow label="Mode">
                            <template #trailing>
                                <img
                                    :src="`./images/stick_modes/Mode_${local.stickMode}.png`"
                                    class="w-48 h-40 object-contain"
                                    alt="Stick mode preview"
                                />
                            </template>
                            <USelect
                                v-model="local.stickMode"
                                :items="stickModeOptions"
                                :ui="{ content: 'z-[300]' }"
                                size="sm"
                                class="min-w-24"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- Display Settings -->
                    <UiBox title="Display">
                        <SettingRow label="Legend units" help="Display actual units on legend">
                            <USwitch v-model="local.legendUnits" size="sm" />
                        </SettingRow>
                        <SettingRow label="Gradient" help="Show the gradient background">
                            <USwitch v-model="local.drawGradient" size="sm" />
                        </SettingRow>
                        <SettingRow label="TimeBar" help="Show the vertical timebar">
                            <USwitch v-model="local.drawVerticalBar" size="sm" />
                        </SettingRow>
                    </UiBox>

                    <!-- Preferences -->
                    <UiBox title="Preferences">
                        <SettingRow label="Speed units">
                            <USelect
                                v-model="local.speedUnits"
                                :items="speedOptions"
                                :ui="{ content: 'z-[300]' }"
                                size="sm"
                                class="min-w-24"
                            />
                        </SettingRow>
                        <SettingRow label="Altitude units">
                            <USelect
                                v-model="local.altitudeUnits"
                                :items="altitudeOptions"
                                :ui="{ content: 'z-[300]' }"
                                size="sm"
                                class="min-w-24"
                            />
                        </SettingRow>
                        <SettingRow label="Dark mode">
                            <USelect
                                v-model="local.darkMode"
                                :items="darkModeOptions"
                                :ui="{ content: 'z-[300]' }"
                                size="sm"
                                class="min-w-40"
                            />
                        </SettingRow>
                    </UiBox>
                </div>

                <!-- Right column -->
                <div class="flex flex-col gap-4">
                    <!-- Analyser Settings -->
                    <UiBox title="Analyser Settings">
                        <SettingRow label="Hanning" help="Use Hanning window for analyser">
                            <USwitch v-model="local.analyserHanning" size="sm" />
                        </SettingRow>
                    </UiBox>

                    <!-- Map Settings -->
                    <UiBox title="Map Settings">
                        <SettingRow label="ACT" help="Use Altitude Colored Trail (slower at loading/changing logs)">
                            <USwitch v-model="local.mapTrailAltitudeColored" size="sm" />
                        </SettingRow>
                    </UiBox>

                    <!-- Video Overlay -->
                    <UiBox title="Video Overlay">
                        <SettingRow label="Watermark" help="Show the watermark">
                            <USwitch v-model="local.drawWatermark" size="sm" />
                        </SettingRow>
                        <div v-if="local.drawWatermark" class="flex flex-col gap-2 mt-2 ml-6">
                            <div class="flex items-center gap-3">
                                <label class="text-sm">Logo</label>
                                <input type="file" accept="image/*" class="text-sm" @change="onLogoChange" />
                            </div>
                            <img
                                v-if="local.watermark.logo"
                                :src="local.watermark.logo"
                                class="w-24 h-16 object-contain border rounded border-default"
                                alt="Watermark logo"
                            />
                            <PercentInput v-model="local.watermark.transparency" label="Transparency" />
                        </div>
                        <SettingRow label="Lap Timer" help="Show the lap timer">
                            <USwitch v-model="local.drawLapTimer" size="sm" />
                        </SettingRow>
                        <div v-if="local.drawLapTimer" class="ml-6">
                            <PercentInput v-model="local.laptimer.transparency" label="Transparency" />
                            <p class="text-xs text-dimmed mt-1">
                                Set a "start time" bookmark at the beginning of the log/video plus additional bookmarks
                                to mark the start of each lap.
                            </p>
                        </div>
                    </UiBox>

                    <!-- Overlay Positions (collapsible) -->
                    <UiBox title="Overlay Positions">
                        <details>
                            <summary class="text-xs cursor-pointer text-dimmed hover:text-default select-none">
                                Adjust position and size of overlays
                            </summary>
                            <div
                                class="grid grid-cols-[4.5rem_repeat(3,auto)] gap-x-1 gap-y-1.5 items-center text-xs mt-3"
                            >
                                <template v-for="row in positionRows" :key="row.label">
                                    <span class="text-dimmed truncate">{{ row.label }}</span>
                                    <div class="flex items-center gap-0.5">
                                        <span class="text-dimmed w-6">Top</span>
                                        <UInputNumber
                                            :model-value="pv(row.obj[row.topKey])"
                                            :min="0"
                                            :max="100"
                                            :step="1"
                                            :format-options="{ useGrouping: false }"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-12' }"
                                            @update:model-value="row.obj[row.topKey] = `${$event}%`"
                                        />
                                        <span class="text-dimmed">%</span>
                                    </div>
                                    <div class="flex items-center gap-0.5">
                                        <span class="text-dimmed w-6">Left</span>
                                        <UInputNumber
                                            :model-value="pv(row.obj[row.leftKey])"
                                            :min="0"
                                            :max="100"
                                            :step="1"
                                            :format-options="{ useGrouping: false }"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-12' }"
                                            @update:model-value="row.obj[row.leftKey] = `${$event}%`"
                                        />
                                        <span class="text-dimmed">%</span>
                                    </div>
                                    <div v-if="row.sizeKey" class="flex items-center gap-0.5">
                                        <span class="text-dimmed w-6">{{ row.sizeLabel || "Size" }}</span>
                                        <UInputNumber
                                            :model-value="pv(row.obj[row.sizeKey])"
                                            :min="0"
                                            :max="100"
                                            :step="1"
                                            :format-options="{ useGrouping: false }"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-12' }"
                                            @update:model-value="row.obj[row.sizeKey] = `${$event}%`"
                                        />
                                        <span class="text-dimmed">%</span>
                                    </div>
                                    <div v-else />
                                </template>
                            </div>
                        </details>
                    </UiBox>
                </div>
            </div>
        </template>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton variant="outline" color="neutral" label="Cancel" @click="open = false" />
                <UButton color="primary" label="Save" @click="onSave" />
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref, watch, computed, toRaw } from "vue";
import UiBox from "./UiBox.vue";
import SettingRow from "./SettingRow.vue";
import PercentInput from "./PercentInput.vue";
import { mixerList } from "../user_settings_data.js";
import { useSettingsStore } from "../stores/settings.js";

const open = defineModel("open", { type: Boolean, default: false });

const settingsStore = useSettingsStore();

const emit = defineEmits(["save"]);

// Deep-clone store settings into local state for editing
function cloneSettings() {
    return JSON.parse(JSON.stringify(toRaw(settingsStore.userSettings))); // NOSONAR
}

const local = ref(cloneSettings());

// Re-clone when dialog opens to pick up any external changes
watch(open, (val) => {
    if (val) {
        local.value = cloneSettings();
    }
});

// customMix is truthy object or null — expose as boolean for USwitch
const customMixBool = computed({
    get: () => !!local.value.customMix,
    set: (val) => {
        local.value.customMix = val ? {} : null;
    },
});

// Mixer helpers
const mixerOptions = mixerList.map((m, i) => ({ label: m.name, value: i + 1 }));

const mixerImageName = computed(() => {
    const idx = (local.value.mixerConfiguration || 3) - 1;
    return mixerList[idx]?.image ?? "custom";
});

const mixerName = computed(() => {
    const idx = (local.value.mixerConfiguration || 3) - 1;
    return mixerList[idx]?.name ?? "Custom";
});

// Option data
const stickModeOptions = [
    { label: "Mode 1", value: 1 },
    { label: "Mode 2", value: 2 },
    { label: "Mode 3", value: 3 },
    { label: "Mode 4", value: 4 },
];

const speedOptions = [
    { label: "m/s", value: 1 },
    { label: "kph", value: 2 },
    { label: "mph", value: 3 },
];

const altitudeOptions = [
    { label: "meters", value: 1 },
    { label: "feet", value: 2 },
];

const darkModeOptions = [
    { label: "Auto (system)", value: 2 },
    { label: "Off (light)", value: 1 },
    { label: "On (dark)", value: 0 },
];

// Overlay position rows — driven by local state so grid columns align
const positionRows = computed(() => {
    const rows = [
        { label: "Sticks", obj: local.value.sticks, topKey: "top", leftKey: "left", sizeKey: "size" },
        { label: "Craft", obj: local.value.craft, topKey: "top", leftKey: "left", sizeKey: "size" },
        { label: "Analyser", obj: local.value.analyser, topKey: "top", leftKey: "left", sizeKey: "size" },
        {
            label: "Anlsr legend",
            obj: local.value.analyser_legend,
            topKey: "top",
            leftKey: "left",
            sizeKey: "width",
            sizeLabel: "W",
        },
        { label: "Map", obj: local.value.map, topKey: "top", leftKey: "left", sizeKey: "size" },
    ];
    if (local.value.drawWatermark) {
        rows.push({ label: "Watermark", obj: local.value.watermark, topKey: "top", leftKey: "left", sizeKey: "size" });
    }
    if (local.value.drawLapTimer) {
        rows.push({ label: "Lap timer", obj: local.value.laptimer, topKey: "top", leftKey: "left" });
    }
    return rows;
});

function pv(v) {
    return Number.parseInt(v) || 0;
}

function onLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        local.value.watermark.logo = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function onSave() {
    const raw = JSON.parse(JSON.stringify(toRaw(local.value))); // NOSONAR
    emit("save", raw);
    open.value = false;
}
</script>
