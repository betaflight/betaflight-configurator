import { reactive, ref, computed, toRaw } from "vue";
import djv from "djv";
import { i18n } from "../js/localization";
import { tracking } from "../js/Analytics";
import { mspHelper } from "../js/msp/MSPHelper";
import FC from "../js/fc";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { VtxDeviceTypes } from "../js/utils/VtxDeviceStatus/VtxDeviceStatus";
import { generateFilename } from "../js/utils/generate_filename";
import { gui_log } from "../js/gui_log";
import FileSystem from "../js/FileSystem";

const MAX_POWERLEVEL_VALUES = 8;
const MAX_BAND_VALUES = 8;
const MAX_BAND_CHANNELS_VALUES = 8;

function getVtxTypeString() {
    let result = i18n.getMessage(`vtxType_${FC.VTX_CONFIG.vtx_type}`);
    const isSmartAudio = VtxDeviceTypes.VTXDEV_SMARTAUDIO === FC.VTX_CONFIG.vtx_type;
    if (isSmartAudio && FC.VTX_DEVICE_STATUS !== null) {
        result += ` ${FC.VTX_DEVICE_STATUS.smartAudioVersion}`;
    }
    return result;
}

function createLuaTables(vtxJsonConfig) {
    let bandsString = 'bandTable = { [0]="U"';
    let frequenciesString = "frequencyTable = {\n";

    const bandsList = vtxJsonConfig.vtx_table.bands_list;
    for (const band of bandsList) {
        bandsString += `, "${band.letter}"`;
        frequenciesString += "        { ";
        for (const freq of band.frequencies) {
            frequenciesString += `${freq}, `;
        }
        frequenciesString += "},\n";
    }
    bandsString += " },\n";
    frequenciesString += "    },\n";

    const freqBandsString = `frequenciesPerBand = ${bandsList[1].frequencies.length},\n`;

    const powerList = vtxJsonConfig.vtx_table.powerlevels_list;
    let powersString = "powerTable = { ";
    for (let index = 0; index < powerList.length; index++) {
        powersString += `[${index + 1}]="${powerList[index].label}", `;
    }
    powersString += "},\n";

    return `return {\n    ${frequenciesString}    ${freqBandsString}    ${bandsString}    ${powersString}}`;
}

function getPowerValues(vtxType, vtxTableAvailable, vtxTablePowerlevels) {
    if (vtxTableAvailable) {
        return { min: 1, max: vtxTablePowerlevels };
    }
    switch (vtxType) {
        case VtxDeviceTypes.VTXDEV_UNSUPPORTED:
            return {};
        case VtxDeviceTypes.VTXDEV_RTC6705:
            return { min: 1, max: 3 };
        case VtxDeviceTypes.VTXDEV_SMARTAUDIO:
            return { min: 1, max: 4 };
        case VtxDeviceTypes.VTXDEV_TRAMP:
            return { min: 1, max: 5 };
        case VtxDeviceTypes.VTXDEV_MSP:
            return { min: 1, max: 5 };
        default:
            return { min: 0, max: 7 };
    }
}

function buildPowerOptionsFromTable(powerLevelList, count) {
    const options = [{ value: 0, label: i18n.getMessage("vtxPower_0") }];
    for (let i = 0; i < count; i++) {
        if (powerLevelList[i]) {
            let label = powerLevelList[i].vtxtable_powerlevel_label;
            if (label.trim() === "") {
                label = i18n.getMessage("vtxPower_X", { powerLevel: i + 1 });
            }
            options.push({ value: i + 1, label });
        }
    }
    return options;
}

function sendMspPromise(code, buffer = false) {
    return new Promise((resolve) => {
        MSP.send_message(code, buffer, false, resolve);
    });
}

function buildPowerOptionsFromRange(range) {
    const options = [];
    if (range.min === undefined) {
        return options;
    }
    for (let i = range.min; i <= range.max; i++) {
        if (i === 0) {
            options.push({ value: 0, label: i18n.getMessage("vtxPower_0") });
        } else {
            options.push({ value: i, label: i18n.getMessage("vtxPower_X", { powerLevel: i }) });
        }
    }
    return options;
}

export function useVtx() {
    const env = new djv();

    // Reactive state
    const updating = ref(true);
    const savePending = ref(false);
    const factoryBandsSupported = ref(false);
    const frequencyMode = ref(false);
    const analyticsChanges = reactive({});

    // VTX config mirrors FC.VTX_CONFIG
    const vtxConfig = reactive({
        vtx_type: 0,
        vtx_band: 0,
        vtx_channel: 0,
        vtx_frequency: 0,
        vtx_power: 0,
        vtx_pit_mode: false,
        vtx_pit_mode_frequency: 0,
        vtx_low_power_disarm: 0,
        vtx_device_ready: false,
        vtx_table_available: false,
        vtx_table_bands: 0,
        vtx_table_channels: 0,
        vtx_table_powerlevels: 0,
    });

    // VTX table data
    const bandList = reactive([]);
    const powerLevelList = reactive([]);

    // Device status
    const deviceReady = ref(false);
    const vtxTypeString = ref("");

    // Save button state
    const saveButtonText = ref("");
    const saveButtonDisabled = ref(false);

    // Computed properties
    const vtxSupported = computed(
        () =>
            vtxConfig.vtx_type !== VtxDeviceTypes.VTXDEV_UNSUPPORTED &&
            vtxConfig.vtx_type !== VtxDeviceTypes.VTXDEV_UNKNOWN,
    );

    const vtxTableNotConfigured = computed(
        () =>
            vtxSupported.value &&
            vtxConfig.vtx_table_available &&
            (vtxConfig.vtx_table_bands === 0 ||
                vtxConfig.vtx_table_channels === 0 ||
                vtxConfig.vtx_table_powerlevels === 0),
    );

    const hasFactoryBands = computed(() => bandList.some((band) => band.vtxtable_band_is_factory_band));

    const factoryBandsNotSupported = computed(() => !factoryBandsSupported.value && hasFactoryBands.value);

    // Band select options
    const bandOptions = computed(() => {
        const options = [{ value: 0, label: i18n.getMessage("vtxBand_0") }];
        if (vtxConfig.vtx_table_available) {
            for (let i = 0; i < vtxConfig.vtx_table_bands; i++) {
                if (bandList[i]) {
                    let name = bandList[i].vtxtable_band_name;
                    if (name.trim() === "") {
                        name = i18n.getMessage("vtxBand_X", { bandName: i + 1 });
                    }
                    options.push({ value: i + 1, label: name });
                }
            }
        } else {
            for (let i = 1; i <= MAX_BAND_VALUES; i++) {
                options.push({ value: i, label: i18n.getMessage("vtxBand_X", { bandName: i }) });
            }
        }
        // Sort: keep "no band" (value 0) first, sort rest alphabetically
        const noBand = options[0];
        const rest = options.slice(1).sort((a, b) => a.label.localeCompare(b.label));
        return [noBand, ...rest];
    });

    // Channel select options (depend on selected band)
    const channelOptions = computed(() => {
        const options = [{ value: 0, label: i18n.getMessage("vtxChannel_0") }];
        if (vtxConfig.vtx_table_available) {
            const selectedBand = vtxConfig.vtx_band;
            if (bandList[selectedBand - 1]) {
                const freqs = bandList[selectedBand - 1].vtxtable_band_frequencies;
                for (let i = 0; i < freqs.length; i++) {
                    if (freqs[i] > 0) {
                        options.push({ value: i + 1, label: i18n.getMessage("vtxChannel_X", { channelName: i + 1 }) });
                    }
                }
            }
        } else {
            for (let i = 1; i <= MAX_BAND_CHANNELS_VALUES; i++) {
                options.push({ value: i, label: i18n.getMessage("vtxChannel_X", { channelName: i }) });
            }
        }
        return options;
    });

    // Power select options
    const powerOptions = computed(() => {
        if (vtxConfig.vtx_table_available) {
            return buildPowerOptionsFromTable(powerLevelList, vtxConfig.vtx_table_powerlevels);
        }
        const range = getPowerValues(
            vtxConfig.vtx_type,
            vtxConfig.vtx_table_available,
            vtxConfig.vtx_table_powerlevels,
        );
        return buildPowerOptionsFromRange(range);
    });

    // Description values for the info panel
    const bandDescription = computed(() => {
        if (vtxConfig.vtx_band === 0) {
            return i18n.getMessage("vtxBand_0");
        }
        if (vtxConfig.vtx_table_available && bandList[vtxConfig.vtx_band - 1]) {
            const name = bandList[vtxConfig.vtx_band - 1].vtxtable_band_name;
            return name.trim() === "" ? String(vtxConfig.vtx_band) : name;
        }
        return String(vtxConfig.vtx_band);
    });

    const powerDescription = computed(() => {
        if (vtxConfig.vtx_power === 0) {
            return i18n.getMessage("vtxPower_0");
        }
        if (vtxConfig.vtx_table_available && powerLevelList[vtxConfig.vtx_power - 1]) {
            const label = powerLevelList[vtxConfig.vtx_power - 1].vtxtable_powerlevel_label;
            return label.trim() === "" ? String(vtxConfig.vtx_power) : label;
        }
        return i18n.getMessage("vtxPower_X", { powerLevel: vtxConfig.vtx_power });
    });

    const pitModeDescription = computed(() =>
        vtxConfig.vtx_pit_mode ? i18n.getMessage("yes") : i18n.getMessage("no"),
    );

    const lowPowerDisarmDescription = computed(() =>
        i18n.getMessage(`vtxLowPowerDisarmOption_${vtxConfig.vtx_low_power_disarm}`),
    );

    const deviceReadyText = computed(() =>
        deviceReady.value ? i18n.getMessage("vtxReadyTrue") : i18n.getMessage("vtxReadyFalse"),
    );

    // --- State sync helpers ---

    function populateStateFromFC() {
        const cfg = FC.VTX_CONFIG;
        vtxConfig.vtx_type = cfg.vtx_type;
        vtxConfig.vtx_band = cfg.vtx_band;
        vtxConfig.vtx_channel = cfg.vtx_channel;
        vtxConfig.vtx_frequency = cfg.vtx_frequency;
        vtxConfig.vtx_power = cfg.vtx_power;
        vtxConfig.vtx_pit_mode = cfg.vtx_pit_mode;
        vtxConfig.vtx_pit_mode_frequency = cfg.vtx_pit_mode_frequency;
        vtxConfig.vtx_low_power_disarm = cfg.vtx_low_power_disarm;
        vtxConfig.vtx_device_ready = cfg.vtx_device_ready;
        vtxConfig.vtx_table_available = cfg.vtx_table_available;
        vtxConfig.vtx_table_bands = cfg.vtx_table_bands;
        vtxConfig.vtx_table_channels = cfg.vtx_table_channels;
        vtxConfig.vtx_table_powerlevels = cfg.vtx_table_powerlevels;

        factoryBandsSupported.value = cfg.vtx_type === VtxDeviceTypes.VTXDEV_SMARTAUDIO;
        frequencyMode.value = cfg.vtx_band === 0 && cfg.vtx_frequency > 0;
        deviceReady.value = cfg.vtx_device_ready;
        vtxTypeString.value = getVtxTypeString();
    }

    function syncStateToFC() {
        if (frequencyMode.value) {
            FC.VTX_CONFIG.vtx_frequency = Number.parseInt(vtxConfig.vtx_frequency);
            FC.VTX_CONFIG.vtx_band = 0;
            FC.VTX_CONFIG.vtx_channel = 0;
        } else {
            FC.VTX_CONFIG.vtx_band = Number.parseInt(vtxConfig.vtx_band);
            FC.VTX_CONFIG.vtx_channel = Number.parseInt(vtxConfig.vtx_channel);
            FC.VTX_CONFIG.vtx_frequency = 0;
        }
        FC.VTX_CONFIG.vtx_power = Number.parseInt(vtxConfig.vtx_power);
        FC.VTX_CONFIG.vtx_pit_mode = vtxConfig.vtx_pit_mode;
        FC.VTX_CONFIG.vtx_pit_mode_frequency = Number.parseInt(vtxConfig.vtx_pit_mode_frequency);
        FC.VTX_CONFIG.vtx_low_power_disarm = Number.parseInt(vtxConfig.vtx_low_power_disarm);
        FC.VTX_CONFIG.vtx_table_clear = true;

        FC.VTX_CONFIG.vtx_table_powerlevels = Number.parseInt(vtxConfig.vtx_table_powerlevels);
        FC.VTX_CONFIG.vtx_table_bands = Number.parseInt(vtxConfig.vtx_table_bands);
        FC.VTX_CONFIG.vtx_table_channels = Number.parseInt(vtxConfig.vtx_table_channels);
    }

    // --- MSP Communication ---

    async function loadVtxTableBands() {
        bandList.length = 0;
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_bands; i++) {
            const buffer = [];
            buffer.push8(i);
            await sendMspPromise(MSPCodes.MSP_VTXTABLE_BAND, buffer);
            bandList.push({ ...FC.VTXTABLE_BAND });
        }
    }

    async function loadVtxTablePowerLevels() {
        powerLevelList.length = 0;
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_powerlevels; i++) {
            const buffer = [];
            buffer.push8(i);
            await sendMspPromise(MSPCodes.MSP_VTXTABLE_POWERLEVEL, buffer);
            powerLevelList.push({ ...FC.VTXTABLE_POWERLEVEL });
        }
    }

    async function loadVtxConfig() {
        await sendMspPromise(MSPCodes.MSP_VTX_CONFIG);
        await loadVtxTableBands();
        await loadVtxTablePowerLevels();
        populateStateFromFC();
        updating.value = false;
    }

    function updateDeviceStatus() {
        MSP.send_message(MSPCodes.MSP2_GET_VTX_DEVICE_STATUS, false, false, () => {
            vtxTypeString.value = getVtxTypeString();
            const isReady = FC.VTX_DEVICE_STATUS !== null && FC.VTX_DEVICE_STATUS.deviceIsReady;
            deviceReady.value = !!isReady;
        });
    }

    // --- Save ---

    function saveVtx() {
        if (updating.value) {
            return;
        }
        updating.value = true;

        syncStateToFC();

        tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, toRaw(analyticsChanges), "vtx");

        saveVtxConfig();
    }

    function saveVtxConfig() {
        MSP.send_message(MSPCodes.MSP_SET_VTX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_VTX_CONFIG), false, () =>
            saveVtxPowerLevels(0),
        );
    }

    function saveVtxPowerLevels(index) {
        if (index >= FC.VTX_CONFIG.vtx_table_powerlevels) {
            saveVtxBands(0);
            return;
        }
        FC.VTXTABLE_POWERLEVEL = { ...powerLevelList[index] };
        MSP.send_message(
            MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL,
            mspHelper.crunch(MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL),
            false,
            () => saveVtxPowerLevels(index + 1),
        );
    }

    function saveVtxBands(index) {
        if (index >= FC.VTX_CONFIG.vtx_table_bands) {
            saveToEeprom();
            return;
        }
        FC.VTXTABLE_BAND = { ...bandList[index] };
        MSP.send_message(MSPCodes.MSP_SET_VTXTABLE_BAND, mspHelper.crunch(MSPCodes.MSP_SET_VTXTABLE_BAND), false, () =>
            saveVtxBands(index + 1),
        );
    }

    function saveToEeprom() {
        mspHelper.writeConfiguration(false, onSaveComplete);
    }

    function onSaveComplete() {
        savePending.value = false;

        saveButtonText.value = i18n.getMessage("buttonSaving");
        saveButtonDisabled.value = true;

        const buttonDelay = 1500;

        setTimeout(() => {
            saveButtonText.value = i18n.getMessage("buttonSaved");

            setTimeout(() => {
                saveButtonText.value = "";
                saveButtonDisabled.value = false;
                updating.value = false;
                // Reload after save
                loadVtxConfig();
            }, buttonDelay);
        }, buttonDelay);
    }

    // --- JSON Schema Validation ---

    async function validateVtxJson(vtxJsonConfig) {
        if (!vtxJsonConfig.version) {
            console.error("Validation against schema failed, version missing");
            throw new Error("VTX config version missing");
        }

        const vtxJsonSchemaUrl = `../../resources/jsonschema/vtxconfig_schema-${vtxJsonConfig.version}.json`;

        let schemaJson;
        try {
            const response = await fetch(vtxJsonSchemaUrl);
            schemaJson = await response.json();
        } catch (error) {
            console.error("Error fetching VTX Schema:", error);
            throw new Error("Failed to fetch VTX schema");
        }

        const valid = env.validate(schemaJson, vtxJsonConfig) === undefined;
        console.log("Validation against schema result:", valid);
        if (!valid) {
            throw new Error("VTX config validation failed");
        }
    }

    // --- JSON Import from config object ---

    function readVtxConfigJson(vtxJsonConfig) {
        FC.VTX_CONFIG.vtx_table_bands = vtxJsonConfig.vtx_table.bands_list.length;

        let maxChannels = 0;
        bandList.length = 0;
        for (let i = 0; i < FC.VTX_CONFIG.vtx_table_bands; i++) {
            const src = vtxJsonConfig.vtx_table.bands_list[i];
            bandList.push({
                vtxtable_band_number: i + 1,
                vtxtable_band_name: src.name,
                vtxtable_band_letter: src.letter,
                vtxtable_band_is_factory_band: src.is_factory_band,
                vtxtable_band_frequencies: src.frequencies,
            });
            maxChannels = Math.max(maxChannels, src.frequencies.length);
        }

        FC.VTX_CONFIG.vtx_table_channels = maxChannels;

        FC.VTX_CONFIG.vtx_table_powerlevels = vtxJsonConfig.vtx_table.powerlevels_list.length;

        powerLevelList.length = 0;
        for (let i = 0; i < FC.VTX_CONFIG.vtx_table_powerlevels; i++) {
            const src = vtxJsonConfig.vtx_table.powerlevels_list[i];
            powerLevelList.push({
                vtxtable_powerlevel_number: i + 1,
                vtxtable_powerlevel_value: src.value,
                vtxtable_powerlevel_label: src.label,
            });
        }

        if (FC.VTX_CONFIG.vtx_power > powerLevelList.length) {
            FC.VTX_CONFIG.vtx_power = powerLevelList.length;
        }

        populateStateFromFC();
    }

    // --- Create VTX Config Info object (for export) ---

    function createVtxConfigInfo() {
        syncStateToFC();

        const vtxJsonConfig = {
            description: "Betaflight VTX Config file",
            version: "1.0",
            vtx_table: {
                bands_list: [],
                powerlevels_list: [],
            },
        };

        for (let i = 0; i < vtxConfig.vtx_table_bands; i++) {
            vtxJsonConfig.vtx_table.bands_list.push({
                name: bandList[i].vtxtable_band_name,
                letter: bandList[i].vtxtable_band_letter,
                is_factory_band: bandList[i].vtxtable_band_is_factory_band,
                frequencies: bandList[i].vtxtable_band_frequencies,
            });
        }

        for (let i = 0; i < vtxConfig.vtx_table_powerlevels; i++) {
            vtxJsonConfig.vtx_table.powerlevels_list.push({
                value: powerLevelList[i].vtxtable_powerlevel_value,
                label: powerLevelList[i].vtxtable_powerlevel_label,
            });
        }

        return vtxJsonConfig;
    }

    // --- File I/O ---

    function saveJsonFile() {
        const suggestedName = "vtxtable";
        const suffix = "json";
        const filename = generateFilename(suggestedName, suffix);

        FileSystem.pickSaveFile(
            filename,
            i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
            `.${suffix}`,
        )
            .then((file) => {
                const vtxJsonConfig = createVtxConfigInfo();
                const text = JSON.stringify(vtxJsonConfig, null, 4);
                console.log("Saving VTX to:", file.name);
                FileSystem.writeFile(file, text);
            })
            .catch((error) => {
                console.error("Failed to write VTX file:", error);
                gui_log(i18n.getMessage("vtxSavedFileKo"));
            });
    }

    function saveLuaFile() {
        const suffix = "lua";

        const uid0 = FC.CONFIG.uid[0].toString(16).padStart(8, "0");
        const uid1 = FC.CONFIG.uid[1].toString(16).padStart(8, "0");
        const uid2 = FC.CONFIG.uid[2].toString(16).padStart(8, "0");

        const filename = `${uid0}${uid1}${uid2}.${suffix}`;

        FileSystem.pickSaveFile(
            filename,
            i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
            `.${suffix}`,
        )
            .then((file) => {
                const vtxJsonConfig = createVtxConfigInfo();
                const text = createLuaTables(vtxJsonConfig);
                console.log("Saving lua to:", file.name);
                FileSystem.writeFile(file, text);
            })
            .catch((error) => {
                console.error("Failed to write lua file:", error);
                gui_log(i18n.getMessage("vtxSavedLuaFileKo"));
            });
    }

    async function loadJsonFile() {
        const suffix = "json";

        try {
            const file = await FileSystem.pickOpenFile(
                i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
                `.${suffix}`,
            );
            console.log("Reading VTX config from:", file.name);
            const text = await FileSystem.readFile(file);
            const vtxJsonConfig = JSON.parse(text);

            await validateVtxJson(vtxJsonConfig);
            readVtxConfigJson(vtxJsonConfig);
            savePending.value = true;

            analyticsChanges["VtxTableLoadFromClipboard"] = undefined;
            analyticsChanges["VtxTableLoadFromFile"] = file.name;

            console.log("Load VTX file end");
            gui_log(i18n.getMessage("vtxLoadFileOk"));
        } catch (error) {
            console.error("Failed loading VTX file config", error);
            gui_log(i18n.getMessage("vtxLoadFileKo"));
        }
    }

    async function loadClipboardJson() {
        try {
            const text = await navigator.clipboard.readText();
            console.log("Pasted content: ", text);

            const vtxJsonConfig = JSON.parse(text);

            await validateVtxJson(vtxJsonConfig);
            readVtxConfigJson(vtxJsonConfig);
            savePending.value = true;

            analyticsChanges["VtxTableLoadFromFile"] = undefined;
            analyticsChanges["VtxTableLoadFromClipboard"] = text.length;

            console.log("Load VTX clipboard end");
            gui_log(i18n.getMessage("vtxLoadClipboardOk"));
        } catch (err) {
            console.error("Failed loading VTX clipboard config:", err);
            gui_log(i18n.getMessage("vtxLoadClipboardKo"));
        }
    }

    function onVtxTableChange() {
        let fromScratch = true;
        if (
            analyticsChanges["VtxTableLoadFromClipboard"] !== undefined ||
            analyticsChanges["VtxTableLoadFromFile"] !== undefined
        ) {
            fromScratch = false;
        }
        analyticsChanges["VtxTableEdit"] = fromScratch ? "modificationOnly" : "fromTemplate";
    }

    return {
        // Constants
        MAX_POWERLEVEL_VALUES,
        MAX_BAND_VALUES,
        MAX_BAND_CHANNELS_VALUES,

        // State
        updating,
        savePending,
        factoryBandsSupported,
        frequencyMode,
        vtxConfig,
        bandList,
        powerLevelList,
        deviceReady,
        vtxTypeString,
        saveButtonText,
        saveButtonDisabled,

        // Computed
        vtxSupported,
        vtxTableNotConfigured,
        hasFactoryBands,
        factoryBandsNotSupported,
        bandOptions,
        channelOptions,
        powerOptions,
        bandDescription,
        powerDescription,
        pitModeDescription,
        lowPowerDisarmDescription,
        deviceReadyText,

        // Actions
        loadVtxConfig,
        updateDeviceStatus,
        saveVtx,
        saveJsonFile,
        saveLuaFile,
        loadJsonFile,
        loadClipboardJson,
        onVtxTableChange,
    };
}
