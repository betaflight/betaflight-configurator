/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { reactive, onScopeDispose } from "vue";
import type { TargetDetail } from "@/components/tabs/firmware-flasher/flasherState";
import type { FlashMessageTypes } from "./useFirmwareFlashing";

/** The build server's answer to a build request. */
export interface BuildResponse {
    key: string;
    url: string;
    file: string;
}

/** The build server's status for a requested build. */
export interface BuildStatusResponse {
    status: string;
    timeOut?: number;
    configuration?: string[];
}

export interface CloudBuildRequest {
    target: string;
    release: string;
    /** Build option names; an option object with a null value contributes null, as it always has. */
    options: (string | null)[];
    commit?: string;
}

/** The part of BuildApi this composable calls. */
export interface CloudBuildApi {
    loadTargetFirmware(url: string): Promise<Uint8Array | null>;
    requestBuild(request: CloudBuildRequest): Promise<BuildResponse | null>;
    requestBuildStatus(key: string): Promise<BuildStatusResponse | null>;
}

/** A protocol selection: the option value, or (for older callers) the option itself. */
type SelectedValue = string | { value: string | null } | null | undefined;

export interface CloudBuildParams {
    buildApi: CloudBuildApi;
    $t: (key: string, params?: Record<string, unknown>) => string;
    setBoardConfig: (config: string[], filename?: string) => void;
    processFile: (data: Uint8Array, key: string) => unknown;
    flashingMessage: (message: string | null, type: string) => unknown;
    enableLoadRemoteFileButton: (enabled: boolean) => void;
    FLASH_MESSAGE_TYPES: FlashMessageTypes;
}

export interface CloudBuildSelection {
    coreBuildMode?: boolean;
    selectedRadioProtocol?: SelectedValue;
    selectedTelemetryProtocol?: SelectedValue;
    selectedOptions?: SelectedValue[];
    selectedOsdProtocol?: SelectedValue;
    selectedMotorProtocol?: SelectedValue;
    expertMode?: boolean;
    selectedCommit?: string;
    customDefinesTags?: string[];
    isConfigLocal?: boolean;
}

/** The option value a selection names, as the build request wants it. */
function selectionValue(selection: NonNullable<SelectedValue>) {
    return typeof selection === "object" ? selection.value : selection;
}

/**
 * A composable for handling cloud build requests and polling.
 * Manages cloud build state, polling intervals, and status updates.
 */
export function useCloudBuild(params: CloudBuildParams) {
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
        cloudBuildKey: null as string | null,
        cloudTargetStatusText: "pending",
        cloudTargetLogText: "",
        cloudTargetLogUrl: "",
        cancelBuild: false,
        cancelBuildButtonDisabled: true,
        cloudBuildProgress: 0,
    });

    // Polling timer reference
    let pollingTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Update cloud build status text and progress bar
     */
    const updateCloudBuildStatus = (statusText: string, progressValue?: number) => {
        state.cloudTargetStatusText = statusText;
        if (progressValue !== undefined) {
            state.cloudBuildProgress = progressValue;
        }
    };

    /**
     * Set cloud build log link
     */
    const setCloudBuildLogLink = (label: string, url: string) => {
        state.cloudTargetLogText = label;
        state.cloudTargetLogUrl = url;
    };

    /**
     * Enable or disable cancel build button
     */
    const enableCancelBuildButton = (enabled: boolean) => {
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
    const loadFirmwareWithRetry = async (url: string, fileLabel: string) => {
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
    const processBuildSuccess = async (
        response: BuildResponse,
        statusResponse: BuildStatusResponse,
        suffix: string,
        isConfigLocal: boolean | undefined,
    ) => {
        if (statusResponse.status !== "success") {
            return;
        }

        const logUrl = `https://build.betaflight.com/api/builds/${response.key}/log`;
        state.cloudTargetLogText = $t(`firmwareFlasherCloudBuildLogUrl`);
        state.cloudTargetLogUrl = logUrl;
        state.cloudTargetStatusText = $t(`firmwareFlasherCloudBuildSuccess${suffix}`);
        state.cloudBuildProgress = 100;

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
     * Build request configuration with selected options
     */
    const buildRequestConfig = (targetDetail: TargetDetail, additionalParams: CloudBuildSelection) => {
        const {
            coreBuildMode,
            selectedRadioProtocol,
            selectedTelemetryProtocol,
            selectedOptions,
            selectedOsdProtocol,
            selectedMotorProtocol,
            expertMode,
            selectedCommit,
            customDefinesTags,
        } = additionalParams;

        const request: CloudBuildRequest = {
            target: targetDetail.target,
            release: targetDetail.release,
            options: [],
        };

        const coreBuild = targetDetail.cloudBuild !== true || coreBuildMode;
        if (coreBuild === true) {
            request.options.push("CORE_BUILD");
            return request;
        }

        request.options.push("CLOUD_BUILD");

        // Add selected protocol options
        for (const selection of [
            selectedRadioProtocol,
            selectedTelemetryProtocol,
            selectedOsdProtocol,
            selectedMotorProtocol,
        ]) {
            if (selection) {
                request.options.push(selectionValue(selection));
            }
        }

        if (Array.isArray(selectedOptions)) {
            selectedOptions.forEach((option) => {
                const v = option !== null && option !== undefined ? selectionValue(option) : option;
                if (v != null && v !== "") {
                    request.options.push(v);
                }
            });
        }

        if (expertMode) {
            if (targetDetail.releaseType === "Unstable") {
                request.commit = selectedCommit;
            }

            if (Array.isArray(customDefinesTags) && customDefinesTags.length > 0) {
                customDefinesTags.forEach((tag) => {
                    const t = String(tag).trim();
                    if (t) {
                        request.options.push(t);
                    }
                });
            }
        }

        return request;
    };

    /**
     * Download firmware for non-cloud builds
     */
    const downloadDirectFirmware = async (response: BuildResponse) => {
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
     * Handle polling failure (timeout or cancellation)
     */
    const handlePollingFailure = (response: BuildResponse, retries: number, retryTotal: number) => {
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
    };

    /**
     * Poll for cloud build status
     */
    const pollCloudBuildStatus = async (response: BuildResponse, isConfigLocal: boolean | undefined) => {
        const retrySeconds = 5;
        let retries = 1;
        let processing = false;
        let timeout = 120;
        const nominalBuildTime = 30;
        const progressIncrement = 100 / (nominalBuildTime / retrySeconds);

        updateCloudBuildStatus($t("firmwareFlasherCloudBuildQueued"), 0);

        pollingTimer = setInterval(async () => {
            retries++;
            const statusResponse = await buildApi.requestBuildStatus(response.key);

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

            const shouldStopPolling = statusResponse.status !== "queued" || retries > retryTotal || state.cancelBuild;
            if (shouldStopPolling) {
                enableCancelBuildButton(false);
                stopPolling();

                if (statusResponse.status === "success") {
                    await processBuildSuccess(response, statusResponse, "", isConfigLocal);
                    return;
                }

                handlePollingFailure(response, retries, retryTotal);
                return;
            }

            // Update progress bar with pseudo-progress
            const pseudoProgress = Math.min(retries * progressIncrement, 90);
            if (processing) {
                updateCloudBuildStatus($t("firmwareFlasherCloudBuildProcessing"), pseudoProgress);
            } else {
                updateCloudBuildStatus($t("firmwareFlasherCloudBuildQueued"), Math.min(retries * 5, 20));
            }
        }, retrySeconds * 1000);
    };

    /**
     * Request a cloud build and poll for status
     */
    const requestCloudBuild = async (targetDetail: TargetDetail, additionalParams: CloudBuildSelection) => {
        const { isConfigLocal } = additionalParams;
        const request = buildRequestConfig(targetDetail, additionalParams);

        console.info("[CLOUD_BUILD] Build request:", request);
        const response = await buildApi.requestBuild(request);
        if (!response) {
            flashingMessage("Build request failed", FLASH_MESSAGE_TYPES.INVALID);
            enableLoadRemoteFileButton(true);
            return null;
        }

        console.info("[CLOUD_BUILD] Build response:", response);

        // If not a cloud build, download directly
        if (!targetDetail.cloudBuild) {
            await downloadDirectFirmware(response);
            return response;
        }

        // Handle cloud build with polling
        state.cancelBuild = false;
        const statusResponse = await buildApi.requestBuildStatus(response.key);

        // Check if build is already cached (instant success)
        if (statusResponse?.status === "success") {
            await processBuildSuccess(response, statusResponse, "Cached", isConfigLocal);
            return response;
        }

        // Start polling for build status
        enableCancelBuildButton(true);
        await pollCloudBuildStatus(response, isConfigLocal);

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
        state.cloudBuildProgress = 0;
        stopPolling();
    };

    /**
     * Cleanup function to stop polling when component unmounts
     */
    const cleanup = () => {
        stopPolling();
    };

    onScopeDispose(cleanup);

    return {
        // State
        state,

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
