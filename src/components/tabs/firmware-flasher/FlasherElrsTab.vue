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
import { elrsBootloaderInitSequence } from "@/js/elrs/passthrough_transport.js";
import ElrsWebFlasherTransport from "@/js/elrs/web_flasher_transport.js";

const buildApi = new BuildApi();
const mspConnector = new MSPConnectorImpl();
const activeTransport = shallowRef(null);
const passthroughActive = ref(false);
const BETAFLIGHT_PASSTHROUGH_FLASH_BLOCK_SIZE = 0x0800;

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

function isCompressedFlashFinishStatusError(flashError) {
    return /Failed to leave compressed flash mode failed with status 1,195/i.test(String(flashError?.message ?? flashError));
}

function platformForDetectedChip(chip) {
    const normalizedChip = String(chip || "").toUpperCase();
    if (normalizedChip.includes("ESP32-C2")) {
        return "esp32-c2";
    }
    if (normalizedChip.includes("ESP32-C3")) {
        return "esp32-c3";
    }
    if (normalizedChip.includes("ESP32-C6")) {
        return "esp32-c6";
    }
    if (normalizedChip.includes("ESP32-H2")) {
        return "esp32-h2";
    }
    if (normalizedChip.includes("ESP32-S2")) {
        return "esp32-s2";
    }
    if (normalizedChip.includes("ESP32-S3")) {
        return "esp32-s3";
    }
    if (normalizedChip.includes("ESP32")) {
        return "esp32";
    }
    if (normalizedChip.includes("ESP8266") || normalizedChip.includes("ESP8285")) {
        return "esp8285";
    }
    return "";
}

function assertDetectedChipMatchesTarget(chip, target) {
    const detectedPlatform = platformForDetectedChip(chip);
    const targetPlatform = normalizeEspPlatform(target?.platform);
    if (!detectedPlatform || !targetPlatform) {
        return;
    }
    if (detectedPlatform !== targetPlatform) {
        throw new Error(`Wrong GIGLRS target selected: detected ${chip}, but ${target.productName} is ${target.platform}.`);
    }
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
        const { files, layout } = await extractFirmwareZip(bytes, selectedTarget.value, selectedRegion.value);
        firmwareLayout.value = layout;
        if (files.length === 1) {
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

async function validateSerialRxSetting(transport, settingName, expectedValues) {
    await transport.writeString(`get ${settingName}\r\n`);
    const line = await transport.readLine(100);
    return expectedValues.some((expected) => line.trim().includes(` = ${expected}`));
}

async function openBetaflightPassthrough(transport, baudrate) {
    addLog("Initializing Betaflight RX serial passthrough...");
    await transport.writeString("#");
    transport.setDelimiters(["# ", "CCC"]);
    const prompt = await transport.readLine(200);

    if (prompt.includes("CCC")) {
        passthroughActive.value = true;
        addLog("Passthrough already active and receiver bootloader is responding.");
        return;
    }

    if (!prompt.trim().endsWith("#")) {
        passthroughActive.value = true;
        addLog("Betaflight CLI prompt not detected; assuming passthrough is already active.");
        return;
    }

    transport.setDelimiters(["# "]);
    const serialCheck = [];
    if (!(await validateSerialRxSetting(transport, "serialrx_provider", ["CRSF", "ELRS"]))) {
        serialCheck.push("Serial Receiver Protocol must be CRSF/ELRS.");
    }
    if (!(await validateSerialRxSetting(transport, "serialrx_inverted", ["OFF"]))) {
        serialCheck.push("Serial RX must not be inverted.");
    }
    if (!(await validateSerialRxSetting(transport, "serialrx_halfduplex", ["OFF", "AUTO"]))) {
        serialCheck.push("Serial RX half-duplex must be OFF or AUTO.");
    }
    if (serialCheck.length > 0) {
        throw new Error(`Invalid Betaflight RX serial configuration: ${serialCheck.join(" ")}`);
    }

    addLog("Detecting Betaflight Serial RX UART...");
    await transport.writeString("serial\r\n");
    transport.setDelimiters(["\n"]);
    let serialRxPort = "";
    while (true) {
        const line = await transport.readLine(200);
        if (line === "") {
            break;
        }
        const match = line.match(/serial\s+(?<port>(UART)?[0-9]+)\s+(?<portConfig>[0-9]+)\s+/i);
        if (match?.groups && (Number.parseInt(match.groups.portConfig, 10) & 64) === 64) {
            serialRxPort = match.groups.port;
            break;
        }
    }

    if (!serialRxPort) {
        throw new Error("Could not detect the Betaflight Serial RX UART for passthrough.");
    }

    await transport.writeString(`serialpassthrough ${serialRxPort} ${baudrate}\r\n`);
    await sleep(200);
    for (let i = 0; i < 10; i++) {
        await transport.readLine(200);
    }

    passthroughActive.value = true;
    addLog(`RX serial passthrough opened through ${serialRxPort} at ${baudrate} baud.`);
}

async function stopPassthrough() {
    error.value = "";
    try {
        await activeTransport.value?.disconnect?.();
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
    const layout = firmwareLayout.value ?? await buildApi.loadGiglrsTargetLayout(selectedTarget.value);
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

async function enterReceiverBootloader(transport) {
    addLog("Resetting receiver to ELRS bootloader...");
    transport.setDelimiters(["\n"]);
    while ((await transport.readLine(100)) !== "") {}
    const training = new Uint8Array(32);
    training.fill(0x55);
    await transport.writeArray(new Uint8Array([0x07, 0x07, 0x12, 0x20]));
    await transport.writeArray(training);
    await sleep(200);
    await transport.writeArray(elrsBootloaderInitSequence());
    await sleep(200);

    const rxTarget = (await transport.readLine(200)).trim();
    if (rxTarget) {
        addLog(`Receiver bootloader target: ${rxTarget}`);
        if (selectedTarget.value?.firmware && rxTarget.toUpperCase() !== selectedTarget.value.firmware.toUpperCase()) {
            throw new Error(`Wrong GIGLRS target selected: receiver reports '${rxTarget}', selected '${selectedTarget.value.firmware}'.`);
        }
    } else {
        addLog("Receiver bootloader target not detected; continuing with ESP sync.");
    }

    addLog("Receiver bootloader enabled.");
    await sleep(500);
}

async function flashReceiver() {
    busy.value = true;
    activeOperation.value = "flash";
    error.value = "";
    flashProgress.value = 0;

    let transport = null;
    try {
        if (!selectedTarget.value) {
            throw new Error("No GIGLRS receiver target selected.");
        }
        if (firmwareFiles.value.length === 0) {
            throw new Error("Load a GIGLRS firmware .zip or .bin before flashing.");
        }
        const baudrate = Number.parseInt(settings.receiverBaud, 10) || 420000;

        const configuredFirmware = await prepareFirmware();
        addLog(`Configured firmware for ${selectedTarget.value.productName} (${configuredFirmware.length} flash file${configuredFirmware.length === 1 ? "" : "s"}).`);
        configuredFirmware.forEach((file) => {
            addLog(`Flash file: ${basename(file.name)} @ 0x${file.address.toString(16)} (${file.data.byteLength} bytes).`);
        });

        const nativePort = await ensureNativeWebSerialPort();
        transport = new ElrsWebFlasherTransport(nativePort, false);
        activeTransport.value = transport;

        addLog(`Opening flight controller for GIGLRS passthrough at ${baudrate} baud...`);
        await transport.connect(baudrate);
        await openBetaflightPassthrough(transport, baudrate);
        await enterReceiverBootloader(transport);
        await transport.disconnect();
        passthroughActive.value = false;

        const { ESPLoader } = await import("esptool-js");
        const terminal = {
            clean: () => {},
            write: (message) => addLog(String(message).trim()),
            writeLine: (message) => addLog(String(message).trim()),
        };
        const loader = new ESPLoader({
            transport,
            baudrate,
            romBaudrate: baudrate,
            terminal,
        });
        // esptool-js has historically ignored romBaudrate in some releases; keep this explicit.
        loader.romBaudrate = baudrate;
        loader.baudrate = baudrate;
        // Match the official ELRS web flasher: Betaflight passthrough uses 2048-byte chunks.
        loader.ESP_RAM_BLOCK = 0x0800;
        loader.FLASH_WRITE_SIZE = BETAFLIGHT_PASSTHROUGH_FLASH_BLOCK_SIZE;
        const originalFlashDeflFinish = loader.flashDeflFinish.bind(loader);
        loader.flashDeflFinish = async (...args) => {
            try {
                await originalFlashDeflFinish(...args);
            } catch (finishError) {
                if (!isCompressedFlashFinishStatusError(finishError)) {
                    throw finishError;
                }
                addLog("Compressed flash finish returned status 1,195; verifying flash contents before continuing.");
            }
        };

        addLog("Reopening passthrough serial port and connecting to ESP bootloader...");
        const chip = await loader.main("no_reset");
        assertDetectedChipMatchesTarget(chip, selectedTarget.value);
        addLog(`Detected ${chip}. Flashing ${configuredFirmware.length} file${configuredFirmware.length === 1 ? "" : "s"}...`);

        loader.IS_STUB = true;
        addLog(`Using ${loader.FLASH_WRITE_SIZE}-byte compressed flash blocks through Betaflight passthrough.`);
        await loader.writeFlash({
            fileArray: configuredFirmware.map((file) => ({
                data: file.data,
                address: file.address,
            })),
            flashSize: "keep",
            flashMode: "keep",
            flashFreq: "keep",
            eraseAll: false,
            compress: true,
            calculateMD5Hash: calculateMd5Hash,
            reportProgress: (_fileIndex, written, total) => {
                if (total > 0) {
                    flashProgress.value = Math.round((written / total) * 100);
                }
            },
        });

        addLog("Rebooting receiver...");
        if (isEsp32Platform(selectedTarget.value.platform)) {
            await loader.after("hard_reset").catch(() => {});
        } else {
            await loader.after("soft_reset").catch(() => {});
        }
        flashProgress.value = 100;
        addLog("GIGLRS receiver flash complete.");
    } catch (flashError) {
        error.value = flashError instanceof Error ? flashError.message : String(flashError);
        addLog(error.value);
        const recentText = transport?.recentText?.();
        if (recentText) {
            addLog(`Recent receiver output: ${recentText.slice(-500)}`);
        }
    } finally {
        await transport?.disconnect?.().catch(() => {});
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
    border-radius: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-200);
}
</style>
