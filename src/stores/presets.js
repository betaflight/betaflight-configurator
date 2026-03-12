import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { i18n } from "../js/localization";
import FC from "../js/fc";
import GUI from "../js/gui";
import { favoritePresets } from "../tabs/presets/FavoritePresets";
import PickedPreset from "../tabs/presets/PickedPreset";
import PresetsGithubRepo from "../tabs/presets/PresetsRepoIndexed/PresetsGithubRepo";
import PresetsWebsiteRepo from "../tabs/presets/PresetsRepoIndexed/PresetsWebsiteRepo";
import PresetSource from "../tabs/presets/SourcesDialog/PresetSource";
import {
    PRESETS_MAX_RESULTS,
    PRESETS_STORAGE_KEYS,
    collectUniqueValues,
    getCheckedOptionNames,
    getDefaultFirmwareSelections,
    getFitPresets,
    normalizeStoredSources,
    sanitizeActiveSourceIndexes,
} from "./presets_helpers";

function createRepositoryFromSource(source) {
    if (PresetSource.isUrlGithubRepo(source.url)) {
        return new PresetsGithubRepo(source.url, source.gitHubBranch, source.official, source.name);
    }

    return new PresetsWebsiteRepo(source.url, source.official, source.name);
}

export const usePresetsStore = defineStore("presets", () => {
    const majorVersion = 1;
    const repositories = ref([]);
    const failedRepositoryNames = ref([]);
    const sources = ref([]);
    const activeSourceIndexes = ref([0]);
    const pickedPresetList = ref([]);

    const isLoading = ref(false);
    const hasLoadError = ref(false);
    const backupWarningVisible = ref(true);
    const showSourcesDialog = ref(false);

    const filters = reactive({
        categories: [],
        keywords: [],
        authors: [],
        firmwareVersions: [],
        status: [],
        searchString: "",
    });

    const filterOptions = reactive({
        categories: [],
        keywords: [],
        authors: [],
        firmwareVersions: [],
        status: [],
    });

    const detailsState = reactive({
        open: false,
        loading: false,
        error: "",
        showCli: false,
        optionsExpanded: false,
        optionsReviewed: false,
        selectedOptionNames: [],
    });

    const applyState = reactive({
        progress: 0,
        progressDialogOpen: false,
        cliErrorsDialogOpen: false,
        cliErrorsSavePressed: false,
    });

    const selectedPresetEntry = ref(null);

    const activeSources = computed(() =>
        activeSourceIndexes.value.map((index) => sources.value[index]).filter((source) => source !== undefined),
    );

    const isThirdPartyActive = computed(() => activeSources.value.some((source) => !source.official));

    const failedRepositoriesMessage = computed(() =>
        failedRepositoryNames.value.length
            ? i18n.getMessage("presetsFailedToLoadRepositories", {
                repos: failedRepositoryNames.value.join("; "),
            })
            : "",
    );

    const searchParams = computed(() => ({
        categories: [...filters.categories],
        keywords: [...filters.keywords],
        authors: filters.authors.map((author) => author.toLowerCase()),
        firmwareVersions: [...filters.firmwareVersions],
        status: [...filters.status],
        searchString: filters.searchString.trim(),
    }));

    const filteredPresetEntries = computed(() => getFitPresets(repositories.value, searchParams.value));
    const visiblePresetEntries = computed(() => filteredPresetEntries.value.slice(0, PRESETS_MAX_RESULTS));
    const hasTooManyResults = computed(() => filteredPresetEntries.value.length > PRESETS_MAX_RESULTS);
    const hasNoResults = computed(
        () =>
            !isLoading.value &&
            !hasLoadError.value &&
            repositories.value.length > 0 &&
            visiblePresetEntries.value.length === 0,
    );
    const canApply = computed(() => pickedPresetList.value.length > 0);

    const selectedPreset = computed(() => selectedPresetEntry.value?.preset ?? null);
    const selectedPresetRepository = computed(() => selectedPresetEntry.value?.repository ?? null);

    const selectedPresetCliStrings = computed(() => {
        if (!selectedPreset.value || !selectedPresetRepository.value) {
            return [];
        }

        return selectedPresetRepository.value.removeUncheckedOptions(
            selectedPreset.value.originalPresetCliStrings ?? [],
            detailsState.selectedOptionNames,
        );
    });

    const selectedPresetShowRepoName = computed(() => isThirdPartyActive.value);

    function touchRepositories() {
        repositories.value = [...repositories.value];
    }

    function loadSourceConfiguration() {
        const storedSources = getConfig(PRESETS_STORAGE_KEYS.sources)[PRESETS_STORAGE_KEYS.sources];
        const normalizedSources = normalizeStoredSources(storedSources);
        const storedActiveIndexes = getConfig(PRESETS_STORAGE_KEYS.activeSourceIndexes)[
            PRESETS_STORAGE_KEYS.activeSourceIndexes
        ];

        sources.value = normalizedSources;
        activeSourceIndexes.value = sanitizeActiveSourceIndexes(storedActiveIndexes, normalizedSources.length);
    }

    function saveSourceConfiguration() {
        setConfig({ [PRESETS_STORAGE_KEYS.sources]: sources.value });
        setConfig({ [PRESETS_STORAGE_KEYS.activeSourceIndexes]: activeSourceIndexes.value });
    }

    function loadBackupWarningPreference() {
        const result = getConfig(PRESETS_STORAGE_KEYS.showBackupWarning);
        const storedValue = result[PRESETS_STORAGE_KEYS.showBackupWarning];
        backupWarningVisible.value = storedValue === undefined ? true : Boolean(storedValue);
    }

    function setBackupWarningVisible(value) {
        backupWarningVisible.value = value;
        setConfig({ [PRESETS_STORAGE_KEYS.showBackupWarning]: value });
    }

    function initialize() {
        favoritePresets.loadFromStorage();
        loadSourceConfiguration();
        loadBackupWarningPreference();
    }

    function buildFilterOptions() {
        filterOptions.categories = collectUniqueValues(repositories.value, (repo) => repo.index.uniqueValues.category);
        filterOptions.keywords = collectUniqueValues(repositories.value, (repo) => repo.index.uniqueValues.keywords);
        filterOptions.authors = collectUniqueValues(repositories.value, (repo) => repo.index.uniqueValues.author);
        filterOptions.firmwareVersions = collectUniqueValues(
            repositories.value,
            (repo) => repo.index.uniqueValues.firmware_version,
        );
        filterOptions.status = collectUniqueValues(repositories.value, (repo) => repo.index.settings.PresetStatusEnum);
    }

    function resetFilters() {
        filters.categories = [];
        filters.keywords = [];
        filters.authors = [];
        filters.status = [];
        filters.searchString = "";
        filters.firmwareVersions = getDefaultFirmwareSelections(repositories.value, FC.CONFIG.flightControllerVersion);
    }

    function clearLoadState() {
        failedRepositoryNames.value = [];
        hasLoadError.value = false;
    }

    function resetDetailsState() {
        detailsState.open = false;
        detailsState.loading = false;
        detailsState.error = "";
        detailsState.showCli = false;
        detailsState.optionsExpanded = false;
        detailsState.optionsReviewed = false;
        detailsState.selectedOptionNames = [];
        selectedPresetEntry.value = null;
    }

    function resetApplyState() {
        applyState.progress = 0;
        applyState.progressDialogOpen = false;
        applyState.cliErrorsDialogOpen = false;
        applyState.cliErrorsSavePressed = false;
    }

    function resetTransientState() {
        resetDetailsState();
        resetApplyState();
    }

    function updateApplyProgress(value) {
        applyState.progress = value;
    }

    function openSourcesManager() {
        showSourcesDialog.value = true;
    }

    function closeSourcesManager() {
        showSourcesDialog.value = false;
    }

    function addSource() {
        sources.value.push({
            name: i18n.getMessage("presetsSourcesDialogDefaultSourceName"),
            url: "",
            gitHubBranch: "",
            official: false,
        });
        saveSourceConfiguration();
    }

    function updateSource(index, source) {
        if (sources.value[index]?.official) {
            return;
        }

        sources.value.splice(index, 1, {
            ...sources.value[index],
            ...source,
            official: false,
        });
        saveSourceConfiguration();
    }

    function deleteSource(index) {
        if (index <= 0 || sources.value[index]?.official) {
            return;
        }

        sources.value.splice(index, 1);

        activeSourceIndexes.value = activeSourceIndexes.value
            .filter((activeIndex) => activeIndex !== index)
            .map((activeIndex) => (activeIndex > index ? activeIndex - 1 : activeIndex));

        activeSourceIndexes.value = sanitizeActiveSourceIndexes(activeSourceIndexes.value, sources.value.length);
        saveSourceConfiguration();
    }

    function setSourceActive(index, isActive) {
        const currentIndexes = new Set(activeSourceIndexes.value);

        if (isActive) {
            currentIndexes.add(index);
        } else {
            currentIndexes.delete(index);
        }

        activeSourceIndexes.value = sanitizeActiveSourceIndexes(
            [...currentIndexes].sort((a, b) => a - b),
            sources.value.length,
        );
        saveSourceConfiguration();
    }

    async function confirmSourceVersions() {
        const differentMajorVersionRepositories = repositories.value.filter(
            (repository) => repository.index.majorVersion !== majorVersion,
        );

        if (differentMajorVersionRepositories.length === 0) {
            return;
        }

        const versionRequired = `${majorVersion}.X`;
        const versionSource = `${differentMajorVersionRepositories[0].index.majorVersion}.${differentMajorVersionRepositories[0].index.minorVersion}`;

        await new Promise((resolve, reject) => {
            GUI.showYesNoDialog({
                title: i18n.getMessage("presetsWarningDialogTitle"),
                text: i18n.getMessage("presetsVersionMismatch", {
                    versionRequired,
                    versionSource,
                }),
                buttonYesText: i18n.getMessage("yes"),
                buttonNoText: i18n.getMessage("no"),
                buttonYesCallback: resolve,
                buttonNoCallback: () => reject(new Error("Preset source version mismatch")),
            });
        });
    }

    async function reloadRepositories() {
        clearLoadState();
        resetTransientState();
        clearPickedPresets();
        repositories.value = [];
        isLoading.value = true;

        const failedSet = new Set();
        const nextRepositories = activeSources.value.map((source) => createRepositoryFromSource(source));

        await Promise.all(
            nextRepositories.map((repository) =>
                repository.loadIndex().catch(() => {
                    failedSet.add(repository);
                    return null;
                }),
            ),
        );

        failedRepositoryNames.value = Array.from(failedSet).map((repository) => repository.name);
        repositories.value = nextRepositories.filter((repository) => !failedSet.has(repository));

        try {
            await confirmSourceVersions();
            repositories.value.forEach((repository) =>
                favoritePresets.addLastPickDate(repository.index.presets, repository),
            );
            buildFilterOptions();
            resetFilters();
        } catch (error) {
            hasLoadError.value = true;
            console.error(error);
        } finally {
            isLoading.value = false;
        }
    }

    function setSearchString(searchString) {
        filters.searchString = searchString;
    }

    function toggleFavorite(preset, repository) {
        if (preset.lastPickDate) {
            favoritePresets.delete(preset, repository);
        } else {
            favoritePresets.add(preset, repository);
        }

        favoritePresets.saveToStorage();
        touchRepositories();
    }

    async function openPresetDetails(preset, repository) {
        selectedPresetEntry.value = { preset, repository };
        detailsState.open = true;
        detailsState.loading = true;
        detailsState.error = "";
        detailsState.showCli = false;
        detailsState.optionsExpanded = false;
        detailsState.optionsReviewed = false;
        detailsState.selectedOptionNames = [];

        try {
            await repository.loadPreset(preset);
            detailsState.selectedOptionNames = getCheckedOptionNames(preset.options);
        } catch (error) {
            console.error(error);
            detailsState.error = i18n.getMessage("presetsLoadError");
        } finally {
            detailsState.loading = false;
        }
    }

    function closePresetDetails() {
        resetDetailsState();
    }

    function setDetailsCliVisible(isVisible) {
        detailsState.showCli = isVisible;
    }

    function setOptionsExpanded(isExpanded) {
        detailsState.optionsExpanded = isExpanded;
        if (isExpanded) {
            detailsState.optionsReviewed = true;
        }
    }

    function setOptionChecked(optionName, isChecked) {
        if (isChecked) {
            if (!detailsState.selectedOptionNames.includes(optionName)) {
                detailsState.selectedOptionNames = [...detailsState.selectedOptionNames, optionName];
            }
        } else {
            detailsState.selectedOptionNames = detailsState.selectedOptionNames.filter(
                (selectedOptionName) => selectedOptionName !== optionName,
            );
        }
    }

    function setExclusiveOption(groupOptions, selectedOptionName) {
        const nextSelectedOptions = detailsState.selectedOptionNames.filter(
            (selectedOptionName) => !groupOptions.includes(selectedOptionName),
        );

        if (selectedOptionName) {
            nextSelectedOptions.push(selectedOptionName);
        }

        detailsState.selectedOptionNames = nextSelectedOptions;
    }

    function pickSelectedPreset() {
        if (!selectedPreset.value) {
            return;
        }

        appendPickedPreset(
            selectedPreset.value,
            [...selectedPresetCliStrings.value],
            selectedPresetRepository.value ?? undefined,
        );
        selectedPreset.value.isPicked = true;
        touchRepositories();
        closePresetDetails();
    }

    function appendPickedPreset(preset, cliStrings, presetRepository) {
        const pickedPreset = new PickedPreset(preset, cliStrings, presetRepository);

        pickedPresetList.value.push(pickedPreset);
    }

    function clearPickedPresets() {
        pickedPresetList.value.forEach((pickedPreset) => {
            pickedPreset.preset.isPicked = false;
        });
        pickedPresetList.value = [];
        touchRepositories();
    }

    function getPickedPresetsCli() {
        return pickedPresetList.value
            .flatMap((pickedPreset) => pickedPreset.presetCli)
            .filter((command) => command.trim() !== "");
    }

    function markPickedPresetsAsFavorites() {
        pickedPresetList.value.forEach((pickedPreset) => {
            if (pickedPreset.presetRepo !== undefined) {
                favoritePresets.add(pickedPreset.preset, pickedPreset.presetRepo);
            }
        });

        favoritePresets.saveToStorage();
        touchRepositories();
    }

    function openProgressDialog() {
        applyState.progress = 0;
        applyState.progressDialogOpen = true;
    }

    function closeProgressDialog() {
        applyState.progressDialogOpen = false;
    }

    function openCliErrorsDialog() {
        applyState.cliErrorsSavePressed = false;
        applyState.cliErrorsDialogOpen = true;
    }

    function closeCliErrorsDialog(savePressed = false) {
        applyState.cliErrorsSavePressed = savePressed;
        applyState.cliErrorsDialogOpen = false;
    }

    return {
        repositories,
        failedRepositoryNames,
        failedRepositoriesMessage,
        sources,
        activeSourceIndexes,
        activeSources,
        pickedPresetList,
        isLoading,
        hasLoadError,
        backupWarningVisible,
        showSourcesDialog,
        filters,
        filterOptions,
        detailsState,
        applyState,
        selectedPresetEntry,
        selectedPreset,
        selectedPresetRepository,
        selectedPresetCliStrings,
        selectedPresetShowRepoName,
        isThirdPartyActive,
        visiblePresetEntries,
        filteredPresetEntries,
        hasTooManyResults,
        hasNoResults,
        canApply,
        initialize,
        reloadRepositories,
        setSearchString,
        setBackupWarningVisible,
        openSourcesManager,
        closeSourcesManager,
        addSource,
        updateSource,
        deleteSource,
        setSourceActive,
        toggleFavorite,
        openPresetDetails,
        closePresetDetails,
        setDetailsCliVisible,
        setOptionsExpanded,
        setOptionChecked,
        setExclusiveOption,
        pickSelectedPreset,
        appendPickedPreset,
        clearPickedPresets,
        getPickedPresetsCli,
        markPickedPresetsAsFavorites,
        updateApplyProgress,
        openProgressDialog,
        closeProgressDialog,
        openCliErrorsDialog,
        closeCliErrorsDialog,
        resetTransientState,
    };
});
