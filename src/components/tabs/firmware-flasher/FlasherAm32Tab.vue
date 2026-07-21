<template>
    <UiBox title="AM32 firmware flash" type="neutral">
        <p>
            Flash AM32 ESC firmware through Betaflight/GIGFlight 4-way passthrough over the active flight controller
            USB connection. Keep props off and connect battery power before flashing.
        </p>

        <UAlert
            v-if="showConnectionWarning"
            class="mb-3"
            color="warning"
            variant="soft"
            title="Flight controller not connected"
            description="Choose the flight controller USB device if the browser asks for permission, then flash again."
        />
        <UAlert v-if="error" class="mb-3" color="error" variant="soft" title="AM32 error" :description="error" />

        <div class="flex flex-wrap items-center gap-2 mb-3">
            <UButton type="button" color="primary" :loading="busy && activeOperation === 'read'" :disabled="busy" @click="readEscs">
                Read ESCs
            </UButton>
            <UButton type="button" color="error" variant="outline" :disabled="!sessionActive || busy" @click="exitPassthrough">
                Exit passthrough
            </UButton>
            <span v-if="sessionActive" class="text-sm text-dimmed">
                4-way passthrough active · detected {{ expectedCount }} ESC{{ expectedCount === 1 ? "" : "s" }}
            </span>
        </div>

        <div class="am32-flash-grid">
            <div>
                <h3>Detected ESCs</h3>
                <div v-if="escRows.length === 0" class="text-dimmed">No AM32 ESCs loaded yet.</div>
                <div v-else class="am32-flash-esc-grid">
                    <div
                        v-for="row in escRows"
                        :key="row.index"
                        class="am32-flash-esc-card"
                        :class="{ selected: row.data?.isSelected, error: row.isError }"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <div class="font-semibold">ESC {{ row.index + 1 }}</div>
                            <UCheckbox
                                v-if="row.data"
                                :model-value="row.data.isSelected"
                                :disabled="busy"
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
            </div>

            <div>
                <h3>Firmware file</h3>
                <input type="file" accept=".hex,text/plain" :disabled="busy" @change="onHexFile" />
                <div v-if="hexFileName" class="text-sm text-dimmed mt-2">Loaded: {{ hexFileName }}</div>
                <UButton
                    type="button"
                    class="mt-3"
                    color="warning"
                    :loading="busy && activeOperation === 'flash'"
                    :disabled="!canFlash"
                    @click="flashSelectedEscs"
                >
                    Flash selected ESCs
                </UButton>
                <UProgress v-if="busy || flashProgress > 0" class="mt-3" :model-value="flashProgress" />
            </div>
        </div>

        <pre class="am32-flash-log">{{ logLines.join("\n") }}</pre>
    </UiBox>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import UiBox from "../../elements/UiBox.vue";
import { serial } from "../../../js/serial.js";
import Am32FourWaySession from "../../../js/am32/four_way.js";
import DeviceHandler from "../../../js/device_handler.js";
import MSPConnectorImpl from "../../../js/msp/MSPConnector.js";

const session = new Am32FourWaySession();
const mspConnector = new MSPConnectorImpl();
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
const connectionAttempted = ref(false);

const selectedEscRows = computed(() => escRows.value.filter((row) => row.data && row.data.isSelected && !row.isError));
const canFlash = computed(() => Boolean(hexFileContent.value) && !busy.value);
const showConnectionWarning = computed(() => connectionAttempted.value && !fcConnected.value && !busy.value);

function firmwareVersion(esc) {
    return `${esc.settings.MAIN_REVISION ?? "?"}.${esc.settings.SUB_REVISION ?? "?"}`;
}

function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logLines.value = [...logLines.value.slice(-80), `[${timestamp}] ${message}`];
}

function updateFcConnected() {
    fcConnected.value = Boolean(serial.connected);
}

async function ensureSession() {
    if (!sessionActive.value) {
        expectedCount.value = await session.enter();
        mspConnector.detach();
        sessionActive.value = true;
    }
}

async function ensureFcConnected() {
    connectionAttempted.value = true;
    updateFcConnected();

    if (fcConnected.value) {
        return true;
    }

    if (DeviceHandler.devicePicker.selectedDevice === "noselection") {
        DeviceHandler.selectActivePort();
    }

    if (DeviceHandler.devicePicker.selectedDevice === "noselection") {
        await DeviceHandler.requestDevicePermission("serial");
    }

    if (DeviceHandler.devicePicker.selectedDevice === "noselection") {
        throw new Error("No flight controller USB device selected.");
    }

    addLog("Opening flight controller for AM32 passthrough...");
    await new Promise((resolve, reject) => {
        mspConnector.connect(
            DeviceHandler.devicePicker.selectedDevice,
            DeviceHandler.devicePicker.selectedBauds,
            resolve,
            () => reject(new Error("Timed out waiting for MSP response from the flight controller.")),
            () => reject(new Error("Could not open the flight controller serial port.")),
        );
    });
    updateFcConnected();
    return true;
}

async function readEscRows() {
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
}

async function readEscs() {
    busy.value = true;
    activeOperation.value = "read";
    error.value = "";
    flashProgress.value = 0;
    try {
        if (!(await ensureFcConnected())) {
            return;
        }

        await readEscRows();
    } catch (readError) {
        error.value = readError instanceof Error ? readError.message : String(readError);
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
        if (!(await ensureFcConnected())) {
            return;
        }
        if (selectedEscRows.value.length === 0) {
            addLog("Detecting ESCs before flash...");
            await readEscRows();
        }
        const rows = selectedEscRows.value;
        if (rows.length === 0) {
            throw new Error("No selectable AM32 ESCs detected.");
        }
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            addLog(`Flashing ESC ${row.index + 1} with ${hexFileName.value}...`);
            await session.writeHex(row.index, hexFileContent.value, {
                onProgress: (progress) => {
                    flashProgress.value = ((i + progress / 100) / rows.length) * 100;
                },
            });
            addLog(`Flashed ESC ${row.index + 1}. Re-read ESCs before flashing again.`);
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
        if (serial.connected) {
            await session.exit({ disconnect: true });
        } else {
            session.cleanup();
        }
        sessionActive.value = false;
    }
}

session.addEventListener("log", (event) => addLog(event.detail));

onMounted(() => {
    serial.addEventListener("connect", updateFcConnected);
    serial.addEventListener("disconnect", updateFcConnected);
    updateFcConnected();
});

onBeforeUnmount(async () => {
    serial.removeEventListener("connect", updateFcConnected);
    serial.removeEventListener("disconnect", updateFcConnected);
    await cleanupSession();
});
</script>

<style lang="less">
.tab-firmware_flasher {
    .am32-flash-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
        gap: 1rem;
        margin-top: 1rem;

        h3 {
            margin-bottom: 0.5rem;
            font-size: 13px;
            font-weight: 600;
        }
    }

    .am32-flash-esc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 0.75rem;
    }

    .am32-flash-esc-card {
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

    .am32-flash-log {
        max-height: 180px;
        overflow: auto;
        white-space: pre-wrap;
        margin: 1rem 0 0;
        font-size: 12px;
    }

    @media all and (max-width: 900px) {
        .am32-flash-grid {
            grid-template-columns: 1fr;
        }
    }
}
</style>
