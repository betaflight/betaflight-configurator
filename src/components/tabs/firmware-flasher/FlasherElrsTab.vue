<template>
    <UiBox title="GIGLRS firmware flash" type="neutral">
        <p>
            Flash one GIGLRS receiver through Betaflight/GIGFlight RX serial passthrough. The target list comes from
            <code>giglrs-targets</code>; online firmware comes from <code>giglrs</code> GitHub releases.
        </p>

        <UAlert
            v-if="showConnectionWarning"
            class="mb-3"
            color="warning"
            variant="soft"
            title="Flight controller not connected"
            description="Choose the flight controller USB device if the browser asks for permission, then flash again."
        />
        <UAlert v-if="error" class="mb-3" color="error" variant="soft" title="GIGLRS error" :description="error" />

        <div class="giglrs-grid">
            <div>
                <h3>Receiver target</h3>
                <SettingRow label="Target" help="Only targets from the GIGLRS targets repository are shown." full-width>
                    <USelect
                        v-model="selectedTargetId"
                        :items="targetItems"
                        :loading="loadingTargets"
                        :disabled="busy || loadingTargets"
                        class="giglrs-select"
                    />
                </SettingRow>
                <div v-if="selectedTarget" class="text-sm text-dimmed mt-2">
                    {{ selectedTarget.firmware }} · {{ selectedTarget.platform }} · minimum {{ selectedTarget.minVersion }}
                </div>
            </div>

            <div>
                <h3>Firmware file</h3>
                <SettingRow
                    label="Regulatory domain"
                    help="Matches the ExpressLRS web-flasher firmware/FCC and firmware/LBT artifact folders."
                    full-width
                >
                    <USelect
                        v-model="selectedRegion"
                        :items="regionItems"
                        :disabled="busy"
                        class="giglrs-select"
                    />
                </SettingRow>
                <SettingRow label="Online release" help="Loads a firmware .zip or .bin asset from timmyfpv/giglrs releases." full-width>
                    <USelect
                        v-model="selectedReleaseTag"
                        :items="releaseItems"
                        :loading="loadingReleases"
                        :disabled="busy || loadingReleases || releases.length === 0"
                        class="giglrs-select"
                    />
                </SettingRow>
                <div v-if="!loadingReleases && releases.length === 0" class="text-sm text-dimmed mt-2">
                    No GIGLRS firmware release artifacts found yet. Publish a firmware .zip or .bin asset.
                </div>
                <div v-if="firmwareFileName" class="text-sm text-dimmed mt-2">
                    Loaded: {{ firmwareFileName }} · {{ selectedRegion }} · {{ firmwareFiles.length }} file{{ firmwareFiles.length === 1 ? "" : "s" }}
                </div>
            </div>
        </div>
    </UiBox>

    <UiBox title="Receiver settings" type="neutral" class="mt-4">
        <div class="giglrs-settings-grid">
            <SettingRow
                label="Binding phrase"
                help="Stored as the official ELRS UID derived from -DMY_BINDING_PHRASE."
                full-width
            >
                <UInput v-model="settings.bindingPhrase" :disabled="busy" placeholder="Optional" />
            </SettingRow>
            <SettingRow label="Receiver baud" help="CRSF UART baud rate used by the receiver." full-width>
                <USelect v-model="settings.receiverBaud" :items="receiverBaudOptions" :disabled="busy" />
            </SettingRow>
            <SettingRow label="Lock on first connection" help="Matches the official ELRS receiver default." full-width>
                <UCheckbox v-model="settings.lockOnFirstConnection" :disabled="busy" />
            </SettingRow>
            <SettingRow label="Wi-Fi SSID" help="Optional home Wi-Fi network name." full-width>
                <UInput v-model="settings.wifiSsid" :disabled="busy" placeholder="Optional" maxlength="32" />
            </SettingRow>
            <SettingRow label="Wi-Fi password" help="Optional home Wi-Fi password." full-width>
                <UInput v-model="settings.wifiPassword" :disabled="busy || !settings.wifiSsid" type="password" maxlength="64" />
            </SettingRow>
            <SettingRow label="Auto Wi-Fi" help="Start Wi-Fi after this many seconds without a link." full-width>
                <div class="giglrs-inline">
                    <UCheckbox v-model="settings.autoWifiEnabled" :disabled="busy" />
                    <UInput
                        v-model="settings.autoWifiInterval"
                        :disabled="busy || !settings.autoWifiEnabled"
                        type="number"
                        min="10"
                        max="600"
                        class="giglrs-number"
                    />
                    <span class="text-sm text-dimmed">seconds</span>
                </div>
            </SettingRow>
        </div>
    </UiBox>

    <UiBox title="Flash" type="neutral" class="mt-4">
        <div class="giglrs-inline giglrs-status-line mb-3">
            <span v-if="passthroughActive" class="text-sm text-dimmed">RX serial passthrough active</span>
            <span v-else-if="firmwareFileName" class="text-sm text-dimmed">
                Firmware loaded. Use the bottom toolbar to flash the receiver.
            </span>
            <span v-else class="text-sm text-dimmed">
                Choose a release and use the bottom toolbar to load firmware.
            </span>
        </div>

        <UProgress v-if="busy || flashProgress > 0" class="mb-3" :model-value="flashProgress" />
        <div class="giglrs-log-toolbar">
            <UButton type="button" size="xs" variant="outline" :disabled="logLines.length === 0" @click="copyLog">
                Copy log
            </UButton>
        </div>
        <pre class="giglrs-log">{{ logLines.join("\n") }}</pre>
    </UiBox>

</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import CryptoES from "crypto-es";
import { unzip } from "unzipit";
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import { serial } from "@/js/serial.js";
import DeviceHandler from "@/js/device_handler.js";
import MSPConnectorImpl from "@/js/msp/MSPConnector.js";
import BuildApi from "@/js/BuildApi.js";
import { appendUnifiedConfiguration, isEsp32Platform, normalizeEspPlatform } from "@/js/elrs/unified_config.js";
import { OfficialElrsEspFlasher } from "@/js/elrs/official_web_flasher.js";

const buildApi = new BuildApi();
const mspConnector = new MSPConnectorImpl();
const activeTransport = shallowRef(null);
const passthroughActive = ref(false);
const GIGLRS_FLASHER_BUILD = "official-web-flasher-adapter";

const targets = ref([]);
const releases = ref([]);
const selectedTargetId = ref("");
const selectedReleaseTag = ref("");
const selectedRegion = ref("FCC");
const firmwareFileName = ref("");
const firmwareFiles = ref([]);
const firmwareSource = ref(null);
const busy = ref(false);
const activeOperation = ref("");
const loadingTargets = ref(false);
const loadingReleases = ref(false);
const error = ref("");
const flashProgress = ref(0);
const logLines = ref([]);
const fcConnected = ref(Boolean(serial.connected));
const connectionAttempted = ref(false);
const firmwareLayout = ref(null);

const settings = reactive({
    bindingPhrase: "",
    receiverBaud: "420000",
    lockOnFirstConnection: true,
    wifiSsid: "",
    wifiPassword: "",
    autoWifiEnabled: true,
    autoWifiInterval: "60",
});

const receiverBaudOptions = [
    { label: "420000", value: "420000" },
    { label: "400000", value: "400000" },
    { label: "115200", value: "115200" },
];

const selectedTarget = computed(() => targets.value.find((target) => target.id === selectedTargetId.value) || null);
const selectedRelease = computed(() => releases.value.find((release) => release.tag === selectedReleaseTag.value) || null);
const targetItems = computed(() => targets.value.map((target) => ({ label: target.productName, value: target.id })));
const releaseItems = computed(() =>
    releases.value.map((release) => ({
        label: `${release.name}${release.prerelease ? " (prerelease)" : ""} · ${release.assets[0]?.name || "firmware"}`,
        value: release.tag,
    })),
);
const regionItems = [
    { label: "FCC / ISM 2.4GHz", value: "FCC" },
    { label: "LBT / EU CE 2.4GHz", value: "LBT" },
];
const canFlash = computed(() => Boolean(selectedTarget.value && firmwareFiles.value.length > 0) && !busy.value);
const canLoadOnlineFirmware = computed(() => Boolean(selectedRelease.value) && !busy.value);
const showConnectionWarning = computed(() => connectionAttempted.value && !fcConnected.value && !busy.value);
function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logLines.value = [...logLines.value.slice(-100), `[${timestamp}] ${message}`];
}

async function copyLog() {
    const text = logLines.value.join("\n");
    try {
        await navigator.clipboard.writeText(text);
        addLog("Log copied to clipboard.");
    } catch {
        error.value = "Could not copy log automatically. The log text is selectable now; drag-select it and copy manually.";
        addLog(error.value);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isZipBytes(name, bytes) {
    return /\.zip$/i.test(name || "") || (bytes?.[0] === 0x50 && bytes?.[1] === 0x4b);
}

function defaultApplicationAddress(target) {
    return normalizeEspPlatform(target?.platform) === "esp8285" ? 0x0 : 0x10000;
}

function esp32BootloaderAddress(target) {
    return normalizeEspPlatform(target?.platform).startsWith("esp32-") ? 0x0 : 0x1000;
}

function basename(path) {
    return String(path || "").split("/").pop();
}

function calculateMd5Hash(image) {
    const latin1String = Array.from(image, (byte) => String.fromCharCode(byte)).join("");
    return CryptoES.MD5(CryptoES.enc.Latin1.parse(latin1String)).toString();
}

function targetFlashingBaud(target) {
    return Number.parseInt(target?.baud, 10) || 420000;
}

function pathMatchesTarget(entryPath, target) {
    const lowerPath = String(entryPath || "").toLowerCase();
    const firmware = String(target?.firmware || "").toLowerCase();
    return firmware && lowerPath.includes(`/${firmware.toLowerCase()}/`);
}

function pathMatchesRegion(entryPath, region) {
    return String(entryPath || "")
        .toLowerCase()
        .split("/")
        .includes(String(region || "").toLowerCase());
}

async function readZipEntry(entry) {
    return new Uint8Array(await entry.arrayBuffer());
}

async function extractFirmwareZip(bytes, target, region) {
    const { entries } = await unzip(new Blob([bytes]));
    const files = Object.entries(entries)
        .filter(([, entry]) => !entry.isDirectory)
        .map(([path, entry]) => ({ path, entry }));
    const targetFiles = files.filter((file) => pathMatchesTarget(file.path, target));
    const archiveHasRegionFolders = targetFiles.some(
        (file) => pathMatchesRegion(file.path, "FCC") || pathMatchesRegion(file.path, "LBT"),
    );
    const regionTargetFiles = targetFiles.filter((file) => pathMatchesRegion(file.path, region));

    if (archiveHasRegionFolders && regionTargetFiles.length === 0) {
        throw new Error(`No ${region} build found in the selected archive for ${target.productName}.`);
    }

    const findByName = (name) => {
        const lowerName = name.toLowerCase();
        return (
            files.find(
                (file) =>
                    basename(file.path).toLowerCase() === lowerName &&
                    pathMatchesTarget(file.path, target) &&
                    (!archiveHasRegionFolders || pathMatchesRegion(file.path, region)),
            ) ||
            files.find((file) => basename(file.path).toLowerCase() === lowerName && pathMatchesTarget(file.path, target)) ||
            files.find((file) => basename(file.path).toLowerCase() === lowerName)
        );
    };

    const firmwareEntry = findByName("firmware.bin");
    if (!firmwareEntry) {
        throw new Error(`No firmware.bin found in the selected archive for ${target.productName}.`);
    }
    const layoutEntry = target.layoutFile
        ? files.find((file) => file.path.toLowerCase().endsWith(`/hardware/rx/${target.layoutFile.toLowerCase()}`))
        : null;
    const layout = layoutEntry
        ? JSON.parse(new TextDecoder().decode(await readZipEntry(layoutEntry.entry)))
        : null;

    const flashFiles = [];
    if (isEsp32Platform(target.platform)) {
        const bootloaderEntry = findByName("bootloader.bin");
        const partitionsEntry = findByName("partitions.bin");
        const bootAppEntry = findByName("boot_app0.bin");

        if (bootloaderEntry) {
            flashFiles.push({
                name: bootloaderEntry.path,
                address: esp32BootloaderAddress(target),
                data: await readZipEntry(bootloaderEntry.entry),
                configure: false,
            });
        }
        if (partitionsEntry) {
            flashFiles.push({
                name: partitionsEntry.path,
                address: 0x8000,
                data: await readZipEntry(partitionsEntry.entry),
                configure: false,
            });
        }
        if (bootAppEntry) {
            flashFiles.push({
                name: bootAppEntry.path,
                address: 0xe000,
                data: await readZipEntry(bootAppEntry.entry),
                configure: false,
            });
        }
    }

    flashFiles.push({
        name: firmwareEntry.path,
        address: defaultApplicationAddress(target),
        data: await readZipEntry(firmwareEntry.entry),
        configure: true,
    });

    return { files: flashFiles, layout };
}

async function buildFirmwareFilesFromBytes(name, bytes) {
    if (!selectedTarget.value) {
        throw new Error("Select a GIGLRS receiver target first.");
    }

    if (isZipBytes(name, bytes)) {
        let { files, layout } = await extractFirmwareZip(bytes, selectedTarget.value, selectedRegion.value);
        const archiveFileCount = files.length;
        firmwareLayout.value = layout;
        if (isEsp32Platform(selectedTarget.value.platform)) {
            files = files.slice(-1);
            addLog("Using official ELRS Betaflight passthrough mode: flashing application image only.");
        }
        if (archiveFileCount === 1) {
            addLog("Archive contained only firmware.bin; flashing application image only.");
        }
        if (layout) {
            addLog("Using hardware layout from firmware archive.");
        }
        return files;
    }

    firmwareLayout.value = null;
    return [
        {
            name,
            address: defaultApplicationAddress(selectedTarget.value),
            data: bytes,
            configure: true,
        },
    ];
}

async function loadFirmwareBytes(name, bytes, displayName) {
    firmwareLayout.value = null;
    firmwareSource.value = { name, bytes, displayName };
    firmwareFiles.value = await buildFirmwareFilesFromBytes(name, bytes);
    firmwareFileName.value = displayName || name;
    addLog(
        `Selected ${selectedRegion.value} firmware (${firmwareFiles.value.length} flash file${firmwareFiles.value.length === 1 ? "" : "s"}).`,
    );
}

function updateFcConnected() {
    fcConnected.value = Boolean(serial.connected);
}

async function loadTargets() {
    loadingTargets.value = true;
    error.value = "";
    try {
        targets.value = await buildApi.loadGiglrsTargets();
        selectedTargetId.value = targets.value[0]?.id ?? "";
        addLog(`Loaded ${targets.value.length} GIGLRS target${targets.value.length === 1 ? "" : "s"}.`);
    } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : String(loadError);
        addLog(error.value);
    } finally {
        loadingTargets.value = false;
    }
}

async function loadReleases() {
    if (!selectedTarget.value) {
        releases.value = [];
        selectedReleaseTag.value = "";
        return;
    }

    loadingReleases.value = true;
    error.value = "";
    try {
        releases.value = await buildApi.loadGiglrsReleases(selectedTarget.value);
        selectedReleaseTag.value = releases.value[0]?.tag ?? "";
        addLog(`Loaded ${releases.value.length} GIGLRS firmware release${releases.value.length === 1 ? "" : "s"}.`);
    } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : String(loadError);
        addLog(error.value);
    } finally {
        loadingReleases.value = false;
    }
}

async function loadOnlineFirmware() {
    if (!selectedRelease.value) {
        return;
    }

    busy.value = true;
    activeOperation.value = "load-online";
    error.value = "";
    try {
        const asset = selectedRelease.value.assets[0];
        addLog(`Loading ${asset.name} from ${selectedRelease.value.tag}...`);
        const bytes = await buildApi.loadGithubReleaseAsset(asset.url);
        if (!bytes?.byteLength) {
            throw new Error("The selected GIGLRS firmware asset could not be loaded.");
        }
        await loadFirmwareBytes(asset.name, bytes, `${selectedRelease.value.tag}/${asset.name}`);
        addLog(`Loaded ${asset.name} (${bytes.byteLength} bytes, ${firmwareFiles.value.length} flash file${firmwareFiles.value.length === 1 ? "" : "s"}).`);
    } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : String(loadError);
        addLog(error.value);
    } finally {
        busy.value = false;
        activeOperation.value = "";
    }
}

async function ensureNativeWebSerialPort() {
    connectionAttempted.value = true;

    if (DeviceHandler.devicePicker.selectedDevice === "noselection") {
        DeviceHandler.selectActivePort();
    }

    if (DeviceHandler.devicePicker.selectedDevice === "noselection") {
        await DeviceHandler.requestDevicePermission("serial");
    }

    if (DeviceHandler.devicePicker.selectedDevice === "noselection") {
        throw new Error("No flight controller USB device selected.");
    }

    const serialProtocol = serial.selectProtocol(DeviceHandler.devicePicker.selectedDevice);
    const nativePort = serialProtocol?.getNativePort?.(DeviceHandler.devicePicker.selectedDevice);
    if (!nativePort) {
        throw new Error("GIGLRS Betaflight passthrough flashing currently requires a browser Web Serial port.");
    }

    if (serial.connected) {
        mspConnector.detach();
        await serial.disconnect();
        updateFcConnected();
        await sleep(100);
    }

    if (serialProtocol.connected) {
        await serialProtocol.disconnect();
    }

    fcConnected.value = true;
    return nativePort;
}

async function stopPassthrough() {
    error.value = "";
    try {
        await activeTransport.value?.close?.();
        activeTransport.value = null;
        passthroughActive.value = false;
        updateFcConnected();
        addLog("RX serial passthrough closed.");
    } catch (stopError) {
        error.value = stopError instanceof Error ? stopError.message : String(stopError);
        addLog(error.value);
    }
}

async function prepareFirmware() {
    let layout = null;
    try {
        layout = await buildApi.loadGiglrsTargetLayout(selectedTarget.value);
        addLog("Using latest hardware layout from giglrs-targets.");
    } catch (layoutError) {
        if (!firmwareLayout.value) {
            throw layoutError;
        }
        layout = firmwareLayout.value;
        addLog("Could not load latest hardware layout; using hardware layout from firmware archive.");
    }
    return firmwareFiles.value.map((file) => ({
        data: file.configure
            ? appendUnifiedConfiguration(file.data, {
                target: selectedTarget.value,
                layout,
                settings,
            })
            : file.data,
        address: file.address,
        name: file.name,
    }));
}

async function flashReceiver() {
    busy.value = true;
    activeOperation.value = "flash";
    error.value = "";
    flashProgress.value = 0;

    let flasher = null;
    try {
        if (!selectedTarget.value) {
            throw new Error("No GIGLRS receiver target selected.");
        }
        if (firmwareFiles.value.length === 0) {
            throw new Error("Load a GIGLRS firmware .zip or .bin before flashing.");
        }
        const baudrate = targetFlashingBaud(selectedTarget.value);

        const configuredFirmware = await prepareFirmware();
        addLog(`GIGLRS flasher build: ${GIGLRS_FLASHER_BUILD}.`);
        addLog(`Flashing baud: ${baudrate}; receiver UART baud setting: ${settings.receiverBaud}.`);
        addLog("Full chip erase: disabled for ESP32 Betaflight passthrough.");
        addLog(`Configured firmware for ${selectedTarget.value.productName} (${configuredFirmware.length} flash file${configuredFirmware.length === 1 ? "" : "s"}).`);
        configuredFirmware.forEach((file) => {
            addLog(`Flash file: ${basename(file.name)} @ 0x${file.address.toString(16)} (${file.data.byteLength} bytes).`);
        });

        const nativePort = await ensureNativeWebSerialPort();
        const terminal = {
            write: (message) => addLog(String(message).trim()),
            writeLine: (message) => addLog(String(message).trim()),
        };

        flasher = new OfficialElrsEspFlasher(nativePort, selectedTarget.value, {
            baudrate,
            terminal,
            calculateMd5Hash,
        });
        activeTransport.value = flasher;

        addLog(`Opening flight controller for GIGLRS passthrough at ${baudrate} baud...`);
        passthroughActive.value = true;
        const chip = await flasher.connect();
        passthroughActive.value = false;
        addLog(`Detected ${chip}. Flashing ${configuredFirmware.length} file${configuredFirmware.length === 1 ? "" : "s"}...`);

        addLog("Using official ELRS web-flasher ESP transport with 2048-byte compressed blocks.");
        await flasher.flash(configuredFirmware, false, (_fileIndex, written, total) => {
            if (total > 0) {
                flashProgress.value = Math.round((written / total) * 100);
            }
        });

        flashProgress.value = 100;
        addLog("GIGLRS receiver flash complete.");
    } catch (flashError) {
        error.value = flashError instanceof Error ? flashError.message : String(flashError);
        addLog(error.value);
        const recentText = flasher?.recentText?.();
        if (recentText) {
            addLog(`Recent receiver output: ${recentText.slice(-500)}`);
        }
    } finally {
        await flasher?.close?.().catch(() => {});
        activeTransport.value = null;
        passthroughActive.value = false;
        busy.value = false;
        activeOperation.value = "";
    }
}

onMounted(async () => {
    serial.addEventListener("connect", updateFcConnected);
    serial.addEventListener("disconnect", updateFcConnected);
    updateFcConnected();
    await loadTargets();
});

onBeforeUnmount(async () => {
    serial.removeEventListener("connect", updateFcConnected);
    serial.removeEventListener("disconnect", updateFcConnected);
    mspConnector.detach();
    if (passthroughActive.value || activeTransport.value) {
        await stopPassthrough();
    }
});

watch(selectedTargetId, () => {
    firmwareFiles.value = [];
    firmwareFileName.value = "";
    firmwareSource.value = null;
    firmwareLayout.value = null;
    void loadReleases();
});

watch(selectedRegion, async () => {
    if (!firmwareSource.value) {
        return;
    }

    error.value = "";
    try {
        firmwareFiles.value = await buildFirmwareFilesFromBytes(firmwareSource.value.name, firmwareSource.value.bytes);
        addLog(
            `Switched loaded firmware to ${selectedRegion.value} (${firmwareFiles.value.length} flash file${firmwareFiles.value.length === 1 ? "" : "s"}).`,
        );
    } catch (regionError) {
        firmwareFiles.value = [];
        firmwareLayout.value = null;
        error.value = regionError instanceof Error ? regionError.message : String(regionError);
        addLog(error.value);
    }
});

defineExpose({
    canFlash,
    canLoadOnlineFirmware,
    busy,
    activeOperation,
    passthroughActive,
    flashReceiver,
    loadOnlineFirmware,
    stopPassthrough,
});
</script>

<style scoped>
.giglrs-grid,
.giglrs-settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
}

.giglrs-inline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.giglrs-select {
    min-width: 220px;
}

.giglrs-number {
    width: 7rem;
}

.giglrs-log {
    max-height: 16rem;
    overflow: auto;
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;
    border-radius: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-200);
}

.giglrs-log-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
}
</style>
