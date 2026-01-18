import { ref, reactive } from "vue";

/**
 * A composable for handling cloud build requests and polling.
 * Manages cloud build state, polling intervals, and status updates.
 *
 * @param {Object} params - Configuration object
 * @param {Object} params.buildApi - BuildApi instance for making API calls
 * @param {Function} params.$t - Translation function
 * @param {Function} params.setBoardConfig - Callback to set board configuration
 * @param {Function} params.processFile - Callback to process firmware file
 * @param {Function} params.flashingMessage - Callback to display flashing messages
 * @param {Function} params.enableLoadRemoteFileButton - Callback to enable/disable load remote button
 * @param {Object} params.FLASH_MESSAGE_TYPES - Flash message types enum
 */
export function useCloudBuild(params) {
    const {
        buildApi,
        $t,
        setBoardConfig,
        processFile,
        flashingMessage,
        enableLoadRemoteFileButton,
        FLASH_MESSAGE_TYPES,
    } = params;

    // Reactive state for cloud build
    const state = reactive({
        cloudBuildKey: null,
        cloudTargetStatusText: "pending",
        cloudTargetLogText: "",
        cloudTargetLogUrl: "",
        cancelBuild: false,
        cancelBuildButtonDisabled: true,
    });

    // Ref for progress bar element
    const buildProgressBar = ref(null);

    // Polling timer reference
    let pollingTimer = null;

    /**
     * Update cloud build status text and progress bar
     */
    const updateCloudBuildStatus = (statusText, progressValue) => {
        state.cloudTargetStatusText = statusText;
        if (progressValue !== undefined && buildProgressBar.value) {
            buildProgressBar.value.value = progressValue;
        }
    };

    /**
     * Set cloud build log link
     */
    const setCloudBuildLogLink = (label, url) => {
        state.cloudTargetLogText = label;
        state.cloudTargetLogUrl = url;
    };

    /**
     * Enable or disable cancel build button
     */
    const enableCancelBuildButton = (enabled) => {
        state.cancelBuildButtonDisabled = !enabled;
        state.cancelBuild = false;
    };

    /**
     * Handle cancel build button click
     */
    const handleCancelBuild = () => {
        if (!state.cancelBuildButtonDisabled) {
            state.cancelBuildButtonDisabled = true;
            state.cancelBuild = true;
        }
    };

    /**
     * Stop polling timer if active
     */
    const stopPolling = () => {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
    };

    /**
     * Retry firmware download once after 4 seconds if the first attempt fails
     */
    const loadFirmwareWithRetry = async (url, fileLabel) => {
        const attemptDownload = async () => await buildApi.loadTargetFirmware(url);

        let firmware = await attemptDownload();
        if (firmware) {
            return firmware;
        }

        console.warn(`[CLOUD_BUILD] Firmware download failed for ${fileLabel}, retrying in 4s`);
        await new Promise((resolve) => setTimeout(resolve, 4000));

        firmware = await attemptDownload();
        if (!firmware) {
            console.error(`[CLOUD_BUILD] Firmware download failed after retry for ${fileLabel}`);
        }

        return firmware;
    };

    /**
     * Process successful build response
     */
    const processBuildSuccess = async (response, statusResponse, suffix, isConfigLocal) => {
        if (statusResponse.status !== "success") {
            return;
        }

        const logUrl = `https://build.betaflight.com/api/builds/${response.key}/log`;
        state.cloudTargetLogText = $t(`firmwareFlasherCloudBuildLogUrl`);
        state.cloudTargetLogUrl = logUrl;
        state.cloudTargetStatusText = $t(`firmwareFlasherCloudBuildSuccess${suffix}`);
        if (buildProgressBar.value) {
            buildProgressBar.value.value = 100;
        }

        if (statusResponse.configuration !== undefined && !isConfigLocal) {
            setBoardConfig(statusResponse.configuration);
        }

        try {
            const firmware = await loadFirmwareWithRetry(response.url, response.file);
            if (firmware) {
                processFile(firmware, response.file);
            }
        } catch (error) {
            console.error("[CLOUD_BUILD] Failed to load firmware:", error);
        }
    };

    /**
     * Request a cloud build and poll for status
     */
    const requestCloudBuild = async (targetDetail, additionalParams) => {
        const {
            coreBuildMode,
            selectedRadioProtocol,
            selectedTelemetryProtocol,
            selectedOptions,
            selectedOsdProtocol,
            selectedMotorProtocol,
            expertMode,
            selectedCommit,
            customDefinesInput,
            isConfigLocal,
        } = additionalParams;

        let request = {
            target: targetDetail.target,
            release: targetDetail.release,
            options: [],
        };

        const coreBuild = targetDetail.cloudBuild !== true || coreBuildMode;
        if (coreBuild === true) {
            request.options.push("CORE_BUILD");
        } else {
            request.options.push("CLOUD_BUILD");

            // Add selected protocol options from state
            if (selectedRadioProtocol) {
                request.options.push(selectedRadioProtocol.value);
            }
            if (selectedTelemetryProtocol) {
                request.options.push(selectedTelemetryProtocol.value);
            }
            if (Array.isArray(selectedOptions)) {
                selectedOptions.forEach((option) => {
                    request.options.push(option.value);
                });
            }
            if (selectedOsdProtocol) {
                request.options.push(selectedOsdProtocol.value);
            }
            if (selectedMotorProtocol) {
                request.options.push(selectedMotorProtocol.value);
            }

            if (expertMode) {
                if (targetDetail.releaseType === "Unstable") {
                    request.commit = selectedCommit;
                }

                // Parse custom defines from input
                if (customDefinesInput?.value) {
                    const customDefinesText = customDefinesInput.value.value || "";
                    customDefinesText
                        .split(" ")
                        .map((element) => element.trim())
                        .forEach((v) => {
                            if (v) {
                                request.options.push(v);
                            }
                        });
                }
            }
        }

        console.info("[CLOUD_BUILD] Build request:", request);
        let response = await buildApi.requestBuild(request);
        if (!response) {
            flashingMessage("Build request failed", FLASH_MESSAGE_TYPES.INVALID);
            enableLoadRemoteFileButton(true);
            return null;
        }

        console.info("[CLOUD_BUILD] Build response:", response);

        // If not a cloud build, download directly
        if (!targetDetail.cloudBuild) {
            try {
                const firmware = await loadFirmwareWithRetry(response.url, response.file);
                if (firmware) {
                    processFile(firmware, response.file);
                }
            } catch (error) {
                console.error("[CLOUD_BUILD] Failed to load firmware:", error);
            }
            return response;
        }

        // Handle cloud build with polling
        state.cancelBuild = false;
        let statusResponse = await buildApi.requestBuildStatus(response.key);

        // Check if build is already cached (instant success)
        if (statusResponse?.status === "success") {
            await processBuildSuccess(response, statusResponse, "Cached", isConfigLocal);
            return response;
        }

        // Start polling for build status
        enableCancelBuildButton(true);
        const retrySeconds = 5;
        let retries = 1;
        let processing = false;
        let timeout = 120;
        const nominalBuildTime = 30; // 30 seconds nominal build time
        const progressIncrement = 100 / (nominalBuildTime / retrySeconds); // Progress per 5-second interval

        // Show initial queued status
        updateCloudBuildStatus($t("firmwareFlasherCloudBuildQueued"), 0);

        pollingTimer = setInterval(async () => {
            retries++;
            let statusResponse = await buildApi.requestBuildStatus(response.key);

            if (!statusResponse) {
                console.warn("[CLOUD_BUILD] No status response received");
                return;
            }

            if (statusResponse.timeOut !== undefined) {
                if (!processing) {
                    processing = true;
                    retries = 1;
                }
                timeout = statusResponse.timeOut;
            }
            const retryTotal = timeout / retrySeconds;

            if (statusResponse.status !== "queued" || retries > retryTotal || state.cancelBuild) {
                enableCancelBuildButton(false);
                stopPolling();

                if (statusResponse.status === "success") {
                    await processBuildSuccess(response, statusResponse, "", isConfigLocal);
                    return;
                }

                let suffix = "";
                if (retries > retryTotal) {
                    suffix = "TimeOut";
                }
                if (state.cancelBuild) {
                    suffix = "Cancel";
                }

                const logUrl = `https://build.betaflight.com/api/builds/${response.key}/log`;
                setCloudBuildLogLink($t(`firmwareFlasherCloudBuildLogUrl`), logUrl);
                updateCloudBuildStatus($t(`firmwareFlasherCloudBuildFail${suffix}`), 0);
                enableLoadRemoteFileButton(true);
                return;
            }

            // Update progress bar with pseudo-progress
            const pseudoProgress = Math.min(retries * progressIncrement, 90);
            if (processing) {
                updateCloudBuildStatus($t("firmwareFlasherCloudBuildProcessing"), pseudoProgress);
            } else {
                // While queued, show steady progress towards full
                updateCloudBuildStatus($t("firmwareFlasherCloudBuildQueued"), Math.min(retries * 5, 20));
            }
        }, retrySeconds * 1000);

        return response;
    };

    /**
     * Reset cloud build state
     */
    const resetCloudBuildState = () => {
        state.cloudBuildKey = null;
        state.cloudTargetStatusText = "pending";
        state.cloudTargetLogText = "";
        state.cloudTargetLogUrl = "";
        state.cancelBuild = false;
        state.cancelBuildButtonDisabled = true;
        stopPolling();
        if (buildProgressBar.value) {
            buildProgressBar.value.value = 0;
        }
    };

    /**
     * Cleanup function to stop polling when component unmounts
     */
    const cleanup = () => {
        stopPolling();
    };

    return {
        // State
        state,
        buildProgressBar,

        // Methods
        requestCloudBuild,
        updateCloudBuildStatus,
        setCloudBuildLogLink,
        enableCancelBuildButton,
        handleCancelBuild,
        resetCloudBuildState,
        cleanup,
    };
}
