<template>
    <div class="am32-flasher-content">
        <UiBox class="release_info col-span-1 mt-4">
            <div class="release_info_grid">
                <div class="info_row">
                    <strong>Target</strong>
                    <span>{{ targetText }}</span>
                    <div></div>
                </div>

                <div class="info_row">
                    <strong>ESCs</strong>
                    <span>{{ escStatusText }}</span>
                    <div></div>
                </div>

                <div class="info_row">
                    <strong>Firmware</strong>
                    <span>{{ firmwareStatusText }}</span>
                    <div></div>
                </div>

                <div v-if="sessionActive" class="info_row">
                    <strong>Passthrough</strong>
                    <span>4-way passthrough active</span>
                    <div></div>
                </div>

                <div v-if="flashStatusVisible" class="info_row">
                    <strong>{{ $t("firmwareFlasherFlashStatus") }}</strong>
                    <div class="status_ring_wrapper">
                        <ProgressRing
                            :value="flashProgress"
                            :indeterminate="busy && activeOperation === 'flash' && flashProgress === 0"
                            :size="48"
                            :stroke-width="4"
                            :color="flashStatusColor"
                            :label="$t('firmwareFlasherFlashingProgress')"
                        />
                        <div class="status_text">
                            <span :class="{ 'flash-status-error-text': Boolean(error) }">
                                {{ flashStatusText }}<template v-if="busy && activeOperation === 'flash'">
                                    {{ $t("firmwareFlasherPleaseWait") }}</template
                                >
                            </span>
                        </div>
                    </div>
                    <div></div>
                </div>
            </div>
        </UiBox>

        <UiBox title="AM32 firmware flash" type="neutral" class="mt-4">
            <p>
                Flash AM32 ESC firmware through Betaflight/GIGFLIGHT 4-way passthrough over the active flight controller
                USB connection. Load firmware, read ESCs, then flash selected ESCs. Keep props off and connect battery power
                before flashing.
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

            <pre class="am32-flash-log">{{ logLines.join("\n") }}</pre>
        </UiBox>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import UiBox from "../../elements/UiBox.vue";
import ProgressRing from "@/components/ProgressRing.vue";
import { serial } from "../../../js/serial.js";
import Am32FourWaySession from "../../../js/am32/four_way.js";
import DeviceHandler from "../../../js/device_handler.js";
import MSPConnectorImpl from "../../../js/msp/MSPConnector.js";
import FileSystem from "../../../js/FileSystem.js";

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
const lastFlashResultText = ref("");

const selectedEscRows = computed(() => escRows.value.filter((row) => row.data && row.data.isSelected && !row.isError));
const canFlash = computed(() => Boolean(hexFileContent.value) && !busy.value);
const canRead = computed(() => !busy.value);
const canLoadOnlineFirmware = computed(() => false);
const canLoadLocalFirmware = computed(() => !busy.value);
const showConnectionWarning = computed(() => connectionAttempted.value && !fcConnected.value && !busy.value);
const targetText = computed(() => "AM32 ESC via 4-way passthrough");
const escStatusText = computed(() => {
    if (busy.value && activeOperation.value === "read") {
        return "Reading ESCs...";
    }
    if (escRows.value.length === 0) {
        return "Not read";
    }

    const selectable = selectedEscRows.value.length;
    return `${escRows.value.length} detected · ${selectable} selected`;
});
const firmwareStatusText = computed(() => {
    if (!hexFileName.value) {
        return "No firmware loaded";
    }
    return `${hexFileName.value} (${hexFileContent.value.length} bytes)`;
});
const flashStatusVisible = computed(() => busy.value || flashProgress.value > 0 || Boolean(error.value) || Boolean(lastFlashResultText.value));
const flashStatusColor = computed(() => {
    if (error.value) {
        return "error";
    }
    if (flashProgress.value >= 100 && !busy.value) {
        return "success";
    }
    return "primary";
});
const flashStatusText = computed(() => {
    if (error.value) {
        return error.value;
    }
    if (busy.value && activeOperation.value === "flash") {
        return `Flashing AM32 ESCs (${Math.floor(flashProgress.value)}%). `;
    }
    if (busy.value && activeOperation.value === "read") {
        return "Reading AM32 ESCs...";
    }
    if (busy.value && activeOperation.value === "load-local") {
        return "Loading AM32 firmware...";
    }
    return lastFlashResultText.value || "Ready";
});

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

async function loadOnlineFirmware() {
    addLog("AM32 online firmware loading is not configured yet. Use Load local firmware from the menu.");
}

async function loadLocalFirmware() {
    if (!canLoadLocalFirmware.value) {
        return;
    }

    busy.value = true;
    activeOperation.value = "load-local";
    error.value = "";
    lastFlashResultText.value = "";
    flashProgress.value = 0;

    try {
        const file = await FileSystem.pickOpenFile("AM32 HEX firmware", [".hex"]);
        if (!file) {
            return;
        }

        const content = await FileSystem.readFile(file);
        hexFileName.value = file.name ?? "AM32 firmware.hex";
        hexFileContent.value = content;
        addLog(`Loaded local AM32 firmware: ${hexFileName.value} (${content.length} bytes).`);
    } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : String(loadError);
        addLog(error.value);
    } finally {
        busy.value = false;
        activeOperation.value = "";
    }
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
        flashProgress.value = 100;
        lastFlashResultText.value = `Flashed ${rows.length} AM32 ESC${rows.length === 1 ? "" : "s"}.`;
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

defineExpose({
    busy,
    activeOperation,
    canRead,
    canFlash,
    canLoadOnlineFirmware,
    canLoadLocalFirmware,
    sessionActive,
    loadOnlineFirmware,
    loadLocalFirmware,
    readEscs,
    flashSelectedEscs,
    exitPassthrough,
});
</script>

<style lang="less">
.tab-firmware_flasher,
.tab-am32_flasher {
    .release_info_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
    }

    .release_info_grid .info_row {
        display: contents;
    }

    .release_info_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .release_info_grid span,
    .release_info_grid a {
        text-align: left;
    }

    .status_ring_wrapper {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .status_text {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.85rem;
    }

    .flash-status-error-text {
        color: var(--error-500);
        font-weight: 600;
    }

    h3 {
        margin-bottom: 0.5rem;
        font-size: 13px;
        font-weight: 600;
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
