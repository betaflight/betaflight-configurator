import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { i18n } from "../js/localization";
import FC from "../js/fc";
import { escapeHtml } from "../js/utils/common";
import { useDialogStore } from "./dialog";
import { favoritePresets } from "../components/tabs/presets/FavoritePresets";
import PickedPreset from "../components/tabs/presets/PickedPreset";
import PresetsGithubRepo from "../components/tabs/presets/PresetsRepoIndexed/PresetsGithubRepo";
import PresetsWebsiteRepo from "../components/tabs/presets/PresetsRepoIndexed/PresetsWebsiteRepo";
import PresetSource from "../components/tabs/presets/SourcesDialog/PresetSource";
import {
    PRESETS_MAX_RESULTS,
    PRESETS_STORAGE_KEYS,
    applySelectedOptionIdsToOptions,
    attachOptionIds,
    clonePresetForDetails,
    collectUniqueValues,
    createSourceId,
    getCheckedOptionIds,
    getDefaultFirmwareSelections,
    getFitPresets,
    getOptionNamesByIds,
    getPresetEntryKey,
    normalizeStoredSources,
    sanitizeActiveSourceIds,
    sanitizeActiveSourceIndexes,
} from "./presets_helpers";

function createRepositoryFromSource(source) {
    if (PresetSource.isUrlGithubRepo(source.url)) {
        return new PresetsGithubRepo(source.url, source.gitHubBranch ?? "", source.official, source.name);
    }

    return new PresetsWebsiteRepo(source.url, source.official, source.name);
}

function getSourceIndexById(sourceId, availableSources) {
    return availableSources.findIndex((source) => source.id === sourceId);
}

export const usePresetsStore = defineStore("presets", () => {
    const majorVersion = 1;
    const repositories = ref([]);
    const failedRepositoryNames = ref([]);
    const sources = ref([]);
    const activeSourceIds = ref([]);
    const pickedPresetList = ref([]);
    const favoritePresetDates = ref({});

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
        selectedOptionIds: [],
    });

    const applyState = reactive({
        progress: 0,
        progressDialogOpen: false,
        cliErrorsDialogOpen: false,
        cliErrorsSavePressed: false,
    });

    const selectedPresetEntry = ref(null);
    let detailsRequestToken = 0;

    const activeSourceIndexes = computed(() =>
        activeSourceIds.value
            .map((sourceId) => getSourceIndexById(sourceId, sources.value))
            .filter((index) => index >= 0),
    );

    const activeSources = computed(() =>
        activeSourceIds.value
            .map((sourceId) => sources.value.find((source) => source.id === sourceId))
            .filter((source) => source !== undefined),
    );

    const pickedPresetKeys = computed(
        () => new Set(pickedPresetList.value.map((pickedPreset) => pickedPreset.presetKey).filter(Boolean)),
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

    const filteredPresetEntries = computed(() =>
        getFitPresets(repositories.value, searchParams.value, (preset, repository, presetKey) => ({
            favoriteDate: favoritePresetDates.value[presetKey],
            isPicked: pickedPresetKeys.value.has(getPresetEntryKey(preset, repository)),
        })),
    );
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
    const selectedPresetOptionLabels = computed(() =>
        getOptionNamesByIds(selectedPreset.value?.options ?? [], detailsState.selectedOptionIds),
    );

    const selectedPresetCliStrings = computed(() => {
        if (!selectedPreset.value || !selectedPresetRepository.value) {
            return [];
        }

        return selectedPresetRepository.value.removeUncheckedOptions(
            selectedPreset.value.originalPresetCliStrings ?? [],
            selectedPresetOptionLabels.value,
        );
    });

    const selectedPresetShowRepoName = computed(() => isThirdPartyActive.value);
    const isSelectedPresetFavorite = computed(() => {
        if (!selectedPresetEntry.value?.key) {
            return false;
        }

        return Boolean(favoritePresetDates.value[selectedPresetEntry.value.key]);
    });
    const isSelectedPresetPicked = computed(() => {
        if (!selectedPresetEntry.value?.key) {
            return false;
        }

        return pickedPresetKeys.value.has(selectedPresetEntry.value.key);
    });

    function syncFavoritePresetDates(nextRepositories = repositories.value) {
        const nextFavoritePresetDates = {};

        nextRepositories.forEach((repository) => {
            repository.index.presets.forEach((preset) => {
                const presetKey = getPresetEntryKey(preset, repository);
                const lastPickDate = favoritePresets.getLastPickDate(preset, repository);

                if (lastPickDate) {
                    nextFavoritePresetDates[presetKey] = lastPickDate;
                }
            });
        });

        favoritePresetDates.value = nextFavoritePresetDates;
    }

    function loadSourceConfiguration() {
        const storedSources = getConfig(PRESETS_STORAGE_KEYS.sources)[PRESETS_STORAGE_KEYS.sources];
        const normalizedSources = normalizeStoredSources(storedSources);
        const storedActiveIndexes = getConfig(PRESETS_STORAGE_KEYS.activeSourceIndexes)[
            PRESETS_STORAGE_KEYS.activeSourceIndexes
        ];

        sources.value = normalizedSources;
        activeSourceIds.value = sanitizeActiveSourceIds(
            sanitizeActiveSourceIndexes(storedActiveIndexes, normalizedSources.length).map(
                (index) => normalizedSources[index]?.id,
            ),
            normalizedSources,
        );
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
        detailsRequestToken += 1;
        detailsState.open = false;
        detailsState.loading = false;
        detailsState.error = "";
        detailsState.showCli = false;
        detailsState.optionsExpanded = false;
        detailsState.optionsReviewed = false;
        detailsState.selectedOptionIds = [];
        selectedPresetEntry.value = null;
    }

    function resetApplyState() {
        applyState.progress = 0;
        applyState.progressDialogOpen = false;
        applyState.cliErrorsDialogOpen = false;
        applyState.cliErrorsSavePressed = false;
    }

    function resetTransientState() {
        closeSourcesManager();
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
        sources.value = [
            ...sources.value,
            {
                id: createSourceId(),
                name: i18n.getMessage("presetsSourcesDialogDefaultSourceName"),
                url: "",
                gitHubBranch: "",
                official: false,
            },
        ];
        saveSourceConfiguration();
    }

    function updateSource(sourceId, source) {
        const sourceIndex = getSourceIndexById(sourceId, sources.value);

        if (sourceIndex < 0 || sources.value[sourceIndex]?.official) {
            return;
        }

        sources.value = sources.value.map((existingSource) =>
            existingSource.id === sourceId
                ? {
                    ...existingSource,
                    ...source,
                    gitHubBranch: source.gitHubBranch ?? "",
                    official: false,
                }
                : existingSource,
        );
        saveSourceConfiguration();
    }

    function deleteSource(sourceId) {
        const source = sources.value.find((item) => item.id === sourceId);

        if (!source || source.official) {
            return;
        }

        sources.value = sources.value.filter((item) => item.id !== sourceId);
        activeSourceIds.value = sanitizeActiveSourceIds(
            activeSourceIds.value.filter((activeSourceId) => activeSourceId !== sourceId),
            sources.value,
        );
        saveSourceConfiguration();
    }

    function setSourceActive(sourceId, isActive) {
        const currentSourceIds = new Set(activeSourceIds.value);

        if (isActive) {
            currentSourceIds.add(sourceId);
        } else {
            currentSourceIds.delete(sourceId);
        }

        activeSourceIds.value = sanitizeActiveSourceIds(
            sources.value.map((source) => source.id).filter((sourceIdInOrder) => currentSourceIds.has(sourceIdInOrder)),
            sources.value,
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
        const versionSource = escapeHtml(
            `${differentMajorVersionRepositories[0].index.majorVersion}.${differentMajorVersionRepositories[0].index.minorVersion}`,
        );

        const dialogStore = useDialogStore();
        await new Promise((resolve, reject) => {
            dialogStore.open(
                "YesNoDialog",
                {
                    title: i18n.getMessage("presetsWarningDialogTitle"),
                    text: i18n.getMessage("presetsVersionMismatch", {
                        versionRequired,
                        versionSource,
                    }),
                    yesText: i18n.getMessage("yes"),
                    noText: i18n.getMessage("no"),
                },
                {
                    yes: () => {
                        dialogStore.close();
                        resolve();
                    },
                    no: () => {
                        dialogStore.close();
                        reject(new Error("Preset source version mismatch"));
                    },
                },
            );
        });
    }

    async function reloadRepositories() {
        clearLoadState();
        resetTransientState();
        clearPickedPresets();
        repositories.value = [];
        isLoading.value = true;

        try {
            const failedNames = new Set();
            const nextRepositories = [];

            activeSources.value.forEach((source) => {
                try {
                    nextRepositories.push(createRepositoryFromSource(source));
                } catch (error) {
                    failedNames.add(source.name);
                    console.error(error);
                }
            });

            await Promise.all(
                nextRepositories.map((repository) =>
                    repository.loadIndex().catch((error) => {
                        failedNames.add(repository.name);
                        console.error(error);
                        return null;
                    }),
                ),
            );

            repositories.value = nextRepositories.filter((repository) => repository.index !== null);
            failedRepositoryNames.value = [...failedNames];

            await confirmSourceVersions();
            syncFavoritePresetDates(repositories.value);
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
        const presetKey = getPresetEntryKey(preset, repository);

        if (favoritePresetDates.value[presetKey]) {
            favoritePresets.delete(preset, repository);
        } else {
            favoritePresets.add(preset, repository);
        }

        favoritePresets.saveToStorage();
        syncFavoritePresetDates();
    }

    async function openPresetDetails(preset, repository) {
        const requestToken = detailsRequestToken + 1;
        const presetKey = getPresetEntryKey(preset, repository);

        const existingPickedIndex = pickedPresetList.value.findIndex((p) => p.presetKey === presetKey);

        const presetForDetails = clonePresetForDetails(
            existingPickedIndex !== -1 ? pickedPresetList.value[existingPickedIndex].preset : preset,
        );

        detailsRequestToken = requestToken;
        selectedPresetEntry.value = {
            key: presetKey,
            preset: presetForDetails,
            repository,
        };
        detailsState.open = true;
        detailsState.loading = true;
        detailsState.error = "";
        detailsState.showCli = false;
        detailsState.optionsExpanded = false;
        detailsState.optionsReviewed = false;
        detailsState.selectedOptionIds = [];

        try {
            if (!presetForDetails.originalPresetCliStrings) {
                await repository.loadPreset(presetForDetails);
            }

            if (detailsRequestToken !== requestToken || selectedPresetEntry.value?.key !== presetKey) {
                return;
            }

            presetForDetails.options = attachOptionIds(presetForDetails.options ?? []);
            detailsState.selectedOptionIds = getCheckedOptionIds(presetForDetails.options);
        } catch (error) {
            if (detailsRequestToken !== requestToken || selectedPresetEntry.value?.key !== presetKey) {
                return;
            }

            console.error(error);
            detailsState.error = i18n.getMessage("presetsLoadError");
        } finally {
            if (detailsRequestToken === requestToken && selectedPresetEntry.value?.key === presetKey) {
                detailsState.loading = false;
            }
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

    function setOptionChecked(optionId, isChecked) {
        if (isChecked) {
            if (!detailsState.selectedOptionIds.includes(optionId)) {
                detailsState.selectedOptionIds = [...detailsState.selectedOptionIds, optionId];
            }
        } else {
            detailsState.selectedOptionIds = detailsState.selectedOptionIds.filter(
                (selectedOptionId) => selectedOptionId !== optionId,
            );
        }
    }

    function setExclusiveOption(groupOptionIds, selectedOptionId) {
        const nextSelectedOptions = detailsState.selectedOptionIds.filter(
            (currentOptionId) => !groupOptionIds.includes(currentOptionId),
        );

        if (selectedOptionId) {
            nextSelectedOptions.push(selectedOptionId);
        }

        detailsState.selectedOptionIds = nextSelectedOptions;
    }

    function pickSelectedPreset() {
        if (!selectedPreset.value) {
            return;
        }

        if (selectedPreset.value.options) {
            selectedPreset.value.options = applySelectedOptionIdsToOptions(
                selectedPreset.value.options,
                detailsState.selectedOptionIds,
            );
        }

        appendPickedPreset(
            selectedPreset.value,
            [...selectedPresetCliStrings.value],
            selectedPresetRepository.value ?? undefined,
        );
        closePresetDetails();
    }

    function appendPickedPreset(preset, cliStrings, presetRepository) {
        const presetKey = presetRepository ? getPresetEntryKey(preset, presetRepository) : undefined;
        const pickedPreset = new PickedPreset(preset, cliStrings, presetRepository, presetKey);

        if (presetKey) {
            const existingIndex = pickedPresetList.value.findIndex(
                (p) => p.presetRepo && getPresetEntryKey(p.preset, p.presetRepo) === presetKey,
            );
            if (existingIndex !== -1) {
                const newList = [...pickedPresetList.value];
                newList[existingIndex] = pickedPreset;
                pickedPresetList.value = newList;
                return;
            }
        }

        pickedPresetList.value = [...pickedPresetList.value, pickedPreset];
    }

    function clearPickedPresets() {
        pickedPresetList.value = [];
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
        syncFavoritePresetDates();
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

    function isPresetFavorite(preset, repository) {
        return Boolean(favoritePresetDates.value[getPresetEntryKey(preset, repository)]);
    }

    function isPresetPicked(preset, repository) {
        return pickedPresetKeys.value.has(getPresetEntryKey(preset, repository));
    }

    return {
        repositories,
        failedRepositoryNames,
        failedRepositoriesMessage,
        sources,
        activeSourceIds,
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
        selectedPresetOptionLabels,
        selectedPresetCliStrings,
        selectedPresetShowRepoName,
        isSelectedPresetFavorite,
        isSelectedPresetPicked,
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
        isPresetFavorite,
        isPresetPicked,
    };
});
