import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";

import type { TargetDetail } from "../../src/components/tabs/firmware-flasher/flasherState";
import {
    formatCommitDate,
    useCloudBuild,
    type BuildStatusResponse,
    type CloudBuildParams,
} from "../../src/composables/useCloudBuild";

function makeParams() {
    const buildApi = {
        requestBuild: vi
            .fn()
            .mockResolvedValue({ key: "build-key", url: "http://example.test/fw.hex", file: "fw.hex" }),
        requestBuildStatus: vi.fn<(key: string) => Promise<BuildStatusResponse | null>>(),
        loadTargetFirmware: vi.fn<(url: string) => Promise<Uint8Array | null>>().mockResolvedValue(new Uint8Array(0)),
    };
    buildApi.requestBuildStatus.mockResolvedValue({ status: "queued" } as BuildStatusResponse);

    return {
        buildApi,
        $t: (key: string) => key,
        setBoardConfig: vi.fn(),
        processFile: vi.fn(),
        flashingMessage: vi.fn(),
        enableLoadRemoteFileButton: vi.fn(),
        FLASH_MESSAGE_TYPES: {
            NEUTRAL: "neutral",
            VALID: "valid",
            INVALID: "invalid",
            ACTION: "action",
            ERASING: "erasing",
            FLASHING: "flashing",
            VERIFYING: "verifying",
        },
    } satisfies CloudBuildParams;
}

const targetDetail: TargetDetail = { target: "TEST_TARGET", release: "1.0.0", cloudBuild: true };
const additionalParams = { isConfigLocal: false };

const successWithCommit = {
    status: "success",
    commitHash: "79d8b4aba",
    commitDate: "2026-10-10T19:29:22Z",
} as BuildStatusResponse;

describe("useCloudBuild", () => {
    let scope: EffectScope;
    let cloudBuild: ReturnType<typeof useCloudBuild>;
    let params: ReturnType<typeof makeParams>;

    beforeEach(() => {
        vi.useFakeTimers();
        params = makeParams();

        scope = effectScope();
        scope.run(() => {
            cloudBuild = useCloudBuild(params);
        });
    });

    afterEach(() => {
        scope.stop();
        vi.runAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("polls build status on the 5s interval, and stops polling on scope dispose", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        // First call happened synchronously inside requestCloudBuild to check for cached success.
        const callsBeforePoll = params.buildApi.requestBuildStatus.mock.calls.length;

        await vi.advanceTimersByTimeAsync(5000);
        expect(params.buildApi.requestBuildStatus.mock.calls).toHaveLength(callsBeforePoll + 1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(params.buildApi.requestBuildStatus.mock.calls).toHaveLength(callsBeforePoll + 2);

        scope.stop();

        const callsAtDispose = params.buildApi.requestBuildStatus.mock.calls.length;
        await vi.advanceTimersByTimeAsync(20000);

        // No further polling after the effect scope is disposed.
        expect(params.buildApi.requestBuildStatus.mock.calls).toHaveLength(callsAtDispose);
    });

    it("cleanup() followed by scope.stop() does not throw (idempotent double dispose)", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(() => {
            cloudBuild.cleanup();
            scope.stop();
        }).not.toThrow();
    });

    it("records the built commit from a successful status and clears it on reset", async () => {
        params.buildApi.requestBuildStatus.mockResolvedValue(successWithCommit);

        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("79d8b4aba");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe(formatCommitDate("2026-10-10T19:29:22Z"));

        cloudBuild.resetCloudBuildState();

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
    });

    it("leaves the commit empty when the build server does not report one", async () => {
        params.buildApi.requestBuildStatus.mockResolvedValue({ status: "success" } as BuildStatusResponse);

        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
    });

    it("does not record the commit when the firmware fails to load", async () => {
        params.buildApi.requestBuildStatus.mockResolvedValue(successWithCommit);
        params.buildApi.loadTargetFirmware.mockResolvedValue(null);

        const request = cloudBuild.requestCloudBuild(targetDetail, additionalParams);
        await vi.runAllTimersAsync();
        await request;

        expect(params.processFile).not.toHaveBeenCalled();
        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
    });

    it("clears the previous commit when another build is requested", async () => {
        params.buildApi.requestBuildStatus.mockResolvedValue(successWithCommit);
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        params.buildApi.requestBuildStatus.mockResolvedValue({ status: "queued" } as BuildStatusResponse);
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
    });

    it("clearCommitInfo() drops the commit without touching the rest of the build state", async () => {
        params.buildApi.requestBuildStatus.mockResolvedValue(successWithCommit);
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        cloudBuild.clearCommitInfo();

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
        expect(cloudBuild.state.cloudBuildProgress).toBe(100);
    });
});

describe("formatCommitDate", () => {
    it("formats in the release date style", () => {
        const date = new Date("2026-10-10T19:29:22Z");
        const pad = (n: number) => String(n).padStart(2, "0");
        expect(formatCommitDate("2026-10-10T19:29:22Z")).toBe(
            `${pad(date.getDate())}-Oct-2026 ${pad(date.getHours())}:${pad(date.getMinutes())}`,
        );
    });

    it("returns empty for a missing or invalid date", () => {
        expect(formatCommitDate(undefined)).toBe("");
        expect(formatCommitDate("not-a-date")).toBe("");
    });
});
