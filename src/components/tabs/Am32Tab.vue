<template>
    <BaseTab tab-name="am32" @mounted="onTabMounted" @cleanup="onTabCleanup">
        <div class="content_wrapper">
            <div class="tab_title">AM32 ESC</div>

            <div class="grid-row grid-box col6">
                <div class="col-span-2">
                    <UiBox title="AM32 passthrough" type="neutral" class="sm:h-full">
                        <p>
                            Uses Betaflight 4-way ESC passthrough over the active GIGFlight connection. No second USB
                            handler is opened.
                        </p>

                        <UAlert
                            v-if="!fcConnected"
                            color="warning"
                            variant="soft"
                            title="Flight controller not connected"
                            description="Connect to the flight controller first, then open this tab and read AM32 ESCs."
                        />

                        <div class="flex flex-wrap gap-2">
                            <UButton
                                color="primary"
                                :loading="busy"
                                :disabled="!fcConnected || busy"
                                @click="readEscs"
                            >
                                Read ESCs
                            </UButton>
                            <UButton
                                color="error"
                                variant="outline"
                                :disabled="!sessionActive || busy"
                                @click="exitPassthrough"
                            >
                                Exit passthrough
                            </UButton>
                        </div>

                        <UProgress v-if="busy || flashProgress > 0" :model-value="flashProgress" />

                        <UAlert v-if="error" color="error" variant="soft" title="AM32 error" :description="error" />
                        <UAlert
                            v-else-if="sessionActive"
                            color="success"
                            variant="soft"
                            title="4-way passthrough active"
                            :description="`Detected ${expectedCount} ESC${expectedCount === 1 ? '' : 's'}.`"
                        />
                    </UiBox>

                    <UiBox title="Firmware flash" type="neutral" class="mt-4">
                        <p>
                            Upload an AM32 Intel HEX file and flash it to the selected ESCs. Keep props off and connect
                            battery power before flashing.
                        </p>
                        <input type="file" accept=".hex,text/plain" :disabled="busy" @change="onHexFile" />
                        <div v-if="hexFileName" class="text-sm text-dimmed">Loaded: {{ hexFileName }}</div>
                        <UButton
                            color="warning"
                            :loading="busy && activeOperation === 'flash'"
                            :disabled="!canFlash"
                            @click="flashSelectedEscs"
                        >
                            Flash selected ESCs
                        </UButton>
                    </UiBox>
                </div>

                <div class="col-span-4">
                    <UiBox title="Detected ESCs" type="neutral">
                        <div v-if="escRows.length === 0" class="text-dimmed">No AM32 ESCs loaded yet.</div>
                        <div v-else class="am32-esc-grid">
                            <div
                                v-for="row in escRows"
                                :key="row.index"
                                class="am32-esc-card"
                                :class="{ selected: row.data?.isSelected, error: row.isError }"
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <div class="font-semibold">ESC {{ row.index + 1 }}</div>
                                    <UCheckbox
                                        v-if="row.data"
                                        :model-value="row.data.isSelected"
                                        @update:model-value="row.data.isSelected = Boolean($event)"
                                    />
                                </div>
                                <div v-if="row.isLoading" class="text-dimmed">Reading...</div>
                                <div v-else-if="row.isError" class="text-error">{{ row.error }}</div>
                                <template v-else-if="row.data">
                                    <div>{{ row.data.displayName }}</div>
                                    <div class="text-sm text-dimmed">
                                        Firmware {{ firmwareVersion(row.data) }} · EEPROM
                                        {{ row.data.settings.LAYOUT_REVISION ?? "?" }}
                                    </div>
                                    <div class="text-sm text-dimmed">
                                        Bootloader {{ row.data.bootloader.version || "?" }}
                                        <span v-if="row.data.bootloader.pin"> · {{ row.data.bootloader.pin }}</span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </UiBox>

                    <UiBox title="Settings" type="neutral" class="mt-4">
                        <div v-if="selectedEscRows.length === 0" class="text-dimmed">
                            Select at least one successfully read ESC.
                        </div>
                        <template v-else>
                            <div class="flex flex-wrap items-center gap-2 mb-2">
                                <UButton color="primary" :loading="busy && activeOperation === 'save'" @click="saveSelectedEscs">
                                    Save selected ESCs
                                </UButton>
                                <span class="text-sm text-dimmed">
                                    Editing {{ selectedEscRows.length }} ESC{{ selectedEscRows.length === 1 ? "" : "s" }}.
                                    Changes are applied to all selected ESCs.
                                </span>
                            </div>

                            <div class="am32-settings-grid">
                                <UiBox
                                    v-for="group in settingGroups"
                                    :key="group.title"
                                    :title="group.title"
                                    type="neutral"
                                >
                                    <div class="am32-field-grid">
                                        <label
                                            v-for="field in visibleFields(group.fields)"
                                            :key="field.field"
                                            class="am32-field"
                                            :class="{ 'am32-field-disabled': isFieldDisabled(field) }"
                                        >
                                            <span>{{ field.label }}</span>
                                            <UCheckbox
                                                v-if="field.type === 'switch'"
                                                :model-value="getSetting(field.field) === 1"
                                                :disabled="isFieldDisabled(field)"
                                                @update:model-value="setSetting(field.field, $event ? 1 : 0)"
                                            />
                                            <USelect
                                                v-else-if="field.type === 'select'"
                                                :model-value="getSetting(field.field)"
                                                :items="field.options"
                                                :disabled="isFieldDisabled(field)"
                                                @update:model-value="setSetting(field.field, Number($event))"
                                            />
                                            <div v-else class="flex items-center gap-2">
                                                <UInputNumber
                                                    :model-value="getDisplaySetting(field)"
                                                    :min="getFieldMin(field)"
                                                    :max="getFieldMax(field)"
                                                    :step="getFieldStep(field)"
                                                    :disabled="isFieldDisabled(field)"
                                                    @update:model-value="setDisplaySetting(field, Number($event))"
                                                />
                                                <span v-if="getFieldUnit(field)" class="text-sm text-dimmed">
                                                    {{ getFieldUnit(field) }}
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                </UiBox>
                            </div>
                        </template>
                    </UiBox>

                    <UiBox title="Log" type="neutral" class="mt-4">
                        <pre class="am32-log">{{ logLines.join("\n") }}</pre>
                    </UiBox>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import GUI from "../../js/gui";
import { serial } from "../../js/serial.js";
import Am32FourWaySession from "../../js/am32/four_way.js";

const session = new Am32FourWaySession();
const fcConnected = ref(Boolean(serial.connected));
const sessionActive = ref(false);
const expectedCount = ref(0);
const busy = ref(false);
const activeOperation = ref("");
const error = ref("");
const escRows = ref([]);
const logLines = ref([]);
const hexFileName = ref("");
const hexFileContent = ref("");
const flashProgress = ref(0);
const autoReadAttempted = ref(false);

const protocolOptions = [
    { value: 0, label: "Auto" },
    { value: 1, label: "DShot" },
    { value: 2, label: "Servo" },
    { value: 3, label: "Serial" },
    { value: 4, label: "EDT ARM" },
];

const pwmTypeOptions = [
    { value: 0, label: "Fixed" },
    { value: 1, label: "Variable" },
    { value: 2, label: "By RPM" },
];

const settingGroups = [
    {
        title: "Essentials",
        fields: [
            { field: "ESC_PROTOCOL", label: "Protocol", type: "select", options: protocolOptions },
            { field: "MOTOR_DIRECTION", label: "Reversed", type: "switch" },
            { field: "BIDIRECTIONAL_MODE", label: "3D mode", type: "switch" },
            { field: "DISABLE_STICK_CALIBRATION", label: "Disable stick calibration", type: "switch" },
        ],
    },
    {
        title: "Motor",
        fields: [
            { field: "TIMING_ADVANCE", label: "Timing advance", type: "timing", unit: "°" },
            { field: "STARTUP_POWER", label: "Startup power", min: 0, max: 255 },
            {
                field: "MOTOR_KV",
                label: "Motor KV",
                min: 20,
                max: 10220,
                step: 40,
                displayFactor: 40,
                offset: 20,
            },
            { field: "MOTOR_POLES", label: "Motor poles", min: 0, max: 255 },
            { field: "PWM_FREQUENCY", label: "PWM frequency", min: 8, max: 144, unit: "kHz" },
            { field: "BEEP_VOLUME", label: "Beep volume", min: 0, max: 255 },
            { field: "STUCK_ROTOR_PROTECTION", label: "Stuck rotor protection", type: "switch" },
            { field: "STALL_PROTECTION", label: "Stall protection", type: "switch" },
            { field: "COMPLEMENTARY_PWM", label: "Complementary PWM", type: "switch" },
            { field: "AUTO_ADVANCE", label: "Auto timing advance", type: "switch" },
            { field: "VARIABLE_PWM_FREQUENCY", label: "PWM Type", type: "select", options: pwmTypeOptions },
        ],
    },
    {
        title: "Limits",
        fields: [
            { field: "TEMPERATURE_LIMIT", label: "Temperature limit", min: 0, max: 255 },
            { field: "CURRENT_LIMIT", label: "Current limit", min: 0, max: 255 },
            { field: "LOW_VOLTAGE_THRESHOLD", label: "Low voltage threshold", min: 0, max: 255 },
            { field: "ABSOLUTE_VOLTAGE_CUTOFF", label: "Absolute voltage cutoff", min: 0, max: 255 },
            { field: "LOW_VOLTAGE_CUTOFF", label: "Low voltage cutoff", type: "switch" },
        ],
    },
    {
        title: "Brake and sine",
        fields: [
            { field: "BRAKE_ON_STOP", label: "Brake on stop", type: "switch" },
            { field: "RC_CAR_REVERSING", label: "RC car reversing", type: "switch" },
            { field: "SINUSOIDAL_STARTUP", label: "Sinusoidal startup", type: "switch" },
            { field: "BRAKE_STRENGTH", label: "Brake strength", min: 0, max: 255 },
            { field: "RUNNING_BRAKE_LEVEL", label: "Running brake", min: 0, max: 255 },
            { field: "ACTIVE_BRAKE_POWER", label: "Active brake power", min: 0, max: 255 },
            { field: "SINE_MODE_RANGE", label: "Sine mode range", min: 0, max: 255 },
            { field: "SINE_MODE_POWER", label: "Sine mode power", min: 0, max: 255 },
        ],
    },
];

const selectedEscRows = computed(() => escRows.value.filter((row) => row.data && row.data.isSelected && !row.isError));
const primaryEsc = computed(() => selectedEscRows.value[0]?.data ?? null);
const canFlash = computed(() => sessionActive.value && selectedEscRows.value.length > 0 && hexFileContent.value && !busy.value);

function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logLines.value = [...logLines.value.slice(-80), `[${timestamp}] ${message}`];
}

function updateFcConnected() {
    const wasConnected = fcConnected.value;
    fcConnected.value = Boolean(serial.connected);
    if (!wasConnected && fcConnected.value) {
        void autoReadEscs();
    }
}

function onTabMounted() {
    GUI.content_ready();
}

async function onTabCleanup() {
    await cleanupSession();
}

function firmwareVersion(esc) {
    return `${esc.settings.MAIN_REVISION ?? "?"}.${esc.settings.SUB_REVISION ?? "?"}`;
}

function visibleFields(fields) {
    const settings = primaryEsc.value?.settings ?? {};
    return fields.filter((field) => Object.hasOwn(settings, field.field));
}

function getSetting(field) {
    return primaryEsc.value?.settings?.[field] ?? 0;
}

function setSetting(field, value) {
    for (const row of selectedEscRows.value) {
        row.data.settings[field] = value;
        row.data.settingsDirty = true;
    }
}

function getLayoutVersion() {
    return Number(primaryEsc.value?.settings?.LAYOUT_REVISION ?? 0);
}

function getTimingDisplayValue(rawValue) {
    if (getLayoutVersion() >= 3) {
        return Number(((Number(rawValue) - 10) * 0.9375).toFixed(4));
    }
    return Number((Number(rawValue) * 7.5).toFixed(1));
}

function getTimingRawValue(displayValue) {
    if (getLayoutVersion() >= 3) {
        return Math.round(Number(displayValue) / 0.9375 + 10);
    }
    return Math.round(Number(displayValue) / 7.5);
}

function getDisplaySetting(field) {
    const rawValue = getSetting(field.field);
    if (field.type === "timing") {
        return getTimingDisplayValue(rawValue);
    }
    if (field.displayFactor || field.offset) {
        return rawValue * (field.displayFactor ?? 1) + (field.offset ?? 0);
    }
    return rawValue;
}

function setDisplaySetting(field, value) {
    if (field.type === "timing") {
        setSetting(field.field, getTimingRawValue(value));
        return;
    }
    if (field.displayFactor || field.offset) {
        setSetting(field.field, Math.round((value - (field.offset ?? 0)) / (field.displayFactor ?? 1)));
        return;
    }
    setSetting(field.field, value);
}

function getFieldMin(field) {
    if (field.type === "timing") {
        return 0;
    }
    return field.min ?? 0;
}

function getFieldMax(field) {
    if (field.type === "timing") {
        return getLayoutVersion() >= 3 ? 30 : 22.5;
    }
    if (field.field === "PWM_FREQUENCY" && getLayoutVersion() < 3) {
        return 48;
    }
    return field.max ?? 255;
}

function getFieldStep(field) {
    if (field.type === "timing") {
        return getLayoutVersion() >= 3 ? 0.9375 : 7.5;
    }
    return field.step ?? 1;
}

function isFieldDisabled(field) {
    if (field.field === "TIMING_ADVANCE") {
        return getSetting("AUTO_ADVANCE") === 1;
    }
    if (field.field === "PWM_FREQUENCY") {
        return getSetting("VARIABLE_PWM_FREQUENCY") === 2;
    }
    return false;
}

function formatSettingNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return String(value);
    }
    return Number.isInteger(numericValue) ? String(numericValue) : String(Number(numericValue.toFixed(4)));
}

function getFieldUnit(field) {
    if (field.field === "PWM_FREQUENCY") {
        const pwmType = getSetting("VARIABLE_PWM_FREQUENCY");
        if (pwmType === 1) {
            return `kHz - ${formatSettingNumber(getDisplaySetting(field) * 2)} kHz`;
        }
        if (pwmType === 2) {
            return "by RPM";
        }
    }
    return field.unit ?? "";
}

async function ensureSession() {
    if (!sessionActive.value) {
        expectedCount.value = await session.enter();
        sessionActive.value = true;
    }
}

async function readEscs() {
    busy.value = true;
    activeOperation.value = "read";
    error.value = "";
    flashProgress.value = 0;
    try {
        await ensureSession();
        escRows.value = Array.from({ length: expectedCount.value }, (_unused, index) => ({
            index,
            isLoading: true,
            isError: false,
            error: "",
            data: null,
        }));

        for (const row of escRows.value) {
            try {
                addLog(`Reading ESC ${row.index + 1}...`);
                row.data = await session.getInfo(row.index);
                row.data.isSelected = true;
                addLog(`Read ESC ${row.index + 1}: ${row.data.displayName}`);
            } catch (readError) {
                row.isError = true;
                row.error = readError instanceof Error ? readError.message : String(readError);
                addLog(`ESC ${row.index + 1} failed: ${row.error}`);
            } finally {
                row.isLoading = false;
            }
        }
    } catch (readError) {
        error.value = readError instanceof Error ? readError.message : String(readError);
        addLog(error.value);
    } finally {
        busy.value = false;
        activeOperation.value = "";
    }
}

async function autoReadEscs() {
    if (autoReadAttempted.value || !fcConnected.value || busy.value || escRows.value.length > 0) {
        return;
    }

    autoReadAttempted.value = true;
    addLog("Auto-reading ESCs...");
    await readEscs();
}

async function saveSelectedEscs() {
    busy.value = true;
    activeOperation.value = "save";
    error.value = "";
    try {
        await ensureSession();
        for (const row of selectedEscRows.value) {
            addLog(`Writing settings to ESC ${row.index + 1}...`);
            const changed = await session.writeSettings(row.index, row.data);
            addLog(changed ? `Saved ESC ${row.index + 1}.` : `ESC ${row.index + 1} had no changes.`);
        }
    } catch (saveError) {
        error.value = saveError instanceof Error ? saveError.message : String(saveError);
        addLog(error.value);
    } finally {
        busy.value = false;
        activeOperation.value = "";
    }
}

async function onHexFile(event) {
    const file = event.target.files?.[0];
    hexFileName.value = file?.name ?? "";
    hexFileContent.value = file ? await file.text() : "";
}

async function flashSelectedEscs() {
    busy.value = true;
    activeOperation.value = "flash";
    error.value = "";
    flashProgress.value = 0;
    try {
        await ensureSession();
        const rows = selectedEscRows.value;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            addLog(`Flashing ESC ${row.index + 1} with ${hexFileName.value}...`);
            await session.writeHex(row.index, hexFileContent.value, {
                onProgress: (progress) => {
                    flashProgress.value = ((i + progress / 100) / rows.length) * 100;
                },
            });
            addLog(`Flashed ESC ${row.index + 1}. Re-read settings before editing again.`);
        }
    } catch (flashError) {
        error.value = flashError instanceof Error ? flashError.message : String(flashError);
        addLog(error.value);
    } finally {
        busy.value = false;
        activeOperation.value = "";
    }
}

async function exitPassthrough() {
    busy.value = true;
    error.value = "";
    try {
        await session.exit({ disconnect: true });
        sessionActive.value = false;
        expectedCount.value = 0;
        updateFcConnected();
        addLog("Exited AM32 passthrough and disconnected the FC transport.");
    } catch (exitError) {
        error.value = exitError instanceof Error ? exitError.message : String(exitError);
        addLog(error.value);
    } finally {
        busy.value = false;
    }
}

async function cleanupSession() {
    if (sessionActive.value) {
        await session.exit({ disconnect: true });
        sessionActive.value = false;
    }
}

session.addEventListener("log", (event) => addLog(event.detail));

onMounted(() => {
    serial.addEventListener("connect", updateFcConnected);
    serial.addEventListener("disconnect", updateFcConnected);
    updateFcConnected();
    void autoReadEscs();
});

onBeforeUnmount(async () => {
    serial.removeEventListener("connect", updateFcConnected);
    serial.removeEventListener("disconnect", updateFcConnected);
    await cleanupSession();
});
</script>

<style lang="less">
.tab-am32 {
    .am32-esc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 0.75rem;
    }

    .am32-esc-card {
        border: 1px solid var(--surface-500);
        border-radius: 0.5rem;
        padding: 0.75rem;

        &.selected {
            border-color: var(--primary-500);
            background: color-mix(in srgb, var(--primary-500) 10%, transparent);
        }

        &.error {
            border-color: var(--error-500);
        }
    }

    .am32-settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;
    }

    .am32-field-grid {
        display: grid;
        gap: 0.5rem;
    }

    .am32-field {
        display: grid;
        grid-template-columns: 1fr minmax(120px, 170px);
        align-items: center;
        gap: 0.75rem;
    }

    .am32-field-disabled {
        opacity: 0.48;

        > *:not(:first-child) {
            filter: blur(0.8px);
        }
    }

    .am32-log {
        max-height: 220px;
        overflow: auto;
        white-space: pre-wrap;
        margin: 0;
        font-size: 12px;
    }
}
</style>
