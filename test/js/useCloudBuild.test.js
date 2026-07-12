import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

import { useCloudBuild } from "../../src/composables/useCloudBuild";

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
});
