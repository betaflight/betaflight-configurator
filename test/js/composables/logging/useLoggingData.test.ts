import { beforeEach, describe, expect, it, vi } from "vitest";
import MSP, { type MspCallback } from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useLoggingData, type MspCodeName } from "../../../../src/composables/logging/useLoggingData";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));

describe("useLoggingData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("asks for RC, then motors once the RC reply lands, then reports ready", () => {
        const replies: MspCallback[] = [];
        vi.mocked(MSP.send_message).mockImplementation((_code, _data, _callbackAfterSend, callbackOnReply) => {
            replies.push(callbackOnReply as MspCallback);
            return true;
        });
        const onReady = vi.fn();

        useLoggingData().requestInitialData(onReady);
        replies[0](null);
        expect(vi.mocked(MSP.send_message).mock.calls.map(([code]) => code)).toEqual([
            MSPCodes.MSP_RC,
            MSPCodes.MSP_MOTOR,
        ]);
        expect(onReady).not.toHaveBeenCalled();

        replies[1](null);
        expect(onReady).toHaveBeenCalledOnce();
    });

    it("requests each property in order and skips one with no MSP code", () => {
        useLoggingData().requestProperties(["MSP_ATTITUDE", "NOT_A_CODE" as MspCodeName, "MSP_DEBUG"]);

        expect(vi.mocked(MSP.send_message).mock.calls).toEqual([[MSPCodes.MSP_ATTITUDE], [MSPCodes.MSP_DEBUG]]);
    });
});
