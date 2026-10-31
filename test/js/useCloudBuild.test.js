import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

import { formatCommitDate, useCloudBuild } from "../../src/composables/useCloudBuild";

function makeParams(buildApiOverrides = {}) {
    return {
        buildApi: {
            requestBuild: vi
                .fn()
                .mockResolvedValue({ key: "build-key", url: "http://example.test/fw.hex", file: "fw.hex" }),
            requestBuildStatus: vi.fn().mockResolvedValue({ status: "queued" }),
            loadTargetFirmware: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
            ...buildApiOverrides,
        },
        $t: (key) => key,
        setBoardConfig: vi.fn(),
        processFile: vi.fn(),
        flashingMessage: vi.fn(),
        enableLoadRemoteFileButton: vi.fn(),
        FLASH_MESSAGE_TYPES: { NEUTRAL: "neutral", INVALID: "invalid" },
    };
}

const targetDetail = { target: "TEST_TARGET", release: "1.0.0", cloudBuild: true };
const additionalParams = { isConfigLocal: false };

describe("useCloudBuild", () => {
    let scope;
    let cloudBuild;
    let params;

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
        params.buildApi.requestBuildStatus.mockResolvedValue({
            status: "success",
            commitHash: "79d8b4aba",
            commitDate: "2026-10-10T19:29:22Z",
        });

        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("79d8b4aba");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe(formatCommitDate("2026-10-10T19:29:22Z"));

        cloudBuild.resetCloudBuildState();

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
    });

    it("leaves the commit empty when the build server does not report one", async () => {
        params.buildApi.requestBuildStatus.mockResolvedValue({ status: "success" });

        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(cloudBuild.state.cloudBuildCommitHash).toBe("");
        expect(cloudBuild.state.cloudBuildCommitDate).toBe("");
    });
});

describe("formatCommitDate", () => {
    it("formats in the release date style", () => {
        const date = new Date("2026-10-10T19:29:22Z");
        const pad = (n) => String(n).padStart(2, "0");
        expect(formatCommitDate("2026-10-10T19:29:22Z")).toBe(
            `${pad(date.getDate())}-Oct-2026 ${pad(date.getHours())}:${pad(date.getMinutes())}`,
        );
    });

    it("returns empty for a missing or invalid date", () => {
        expect(formatCommitDate(undefined)).toBe("");
        expect(formatCommitDate("not-a-date")).toBe("");
    });
});
