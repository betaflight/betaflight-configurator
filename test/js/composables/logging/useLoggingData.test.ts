import { beforeEach, describe, expect, it, vi } from "vitest";
import MSP, { type MspCallback } from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useLoggingData, type MspCodeName } from "../../../../src/composables/logging/useLoggingData";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));

describe("useLoggingData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.send_message).mockReturnValue(true);
    });

    describe("requestInitialData", () => {
        it("asks for RC, then motors only once the RC reply lands, then reports ready", () => {
            const replies: MspCallback[] = [];
            vi.mocked(MSP.send_message).mockImplementation((_code, _data, _callbackAfterSend, callbackOnReply) => {
                replies.push(callbackOnReply as MspCallback);
                return true;
            });
            const onReady = vi.fn();

            useLoggingData().requestInitialData(onReady);
            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(
                MSPCodes.MSP_RC,
                false,
                false,
                expect.any(Function),
            );

            replies[0](null);
            expect(MSP.send_message).toHaveBeenLastCalledWith(MSPCodes.MSP_MOTOR, false, false, expect.any(Function));
            expect(MSP.send_message).toHaveBeenCalledTimes(2);
            expect(onReady).not.toHaveBeenCalled();

            replies[1](null);
            expect(onReady).toHaveBeenCalledOnce();
        });
    });

    describe("requestProperties", () => {
        it("sends one bare request per property, in order", () => {
            useLoggingData().requestProperties(["MSP_ATTITUDE", "MSP_RAW_IMU", "MSP_DEBUG"]);

            expect(vi.mocked(MSP.send_message).mock.calls).toEqual([
                [MSPCodes.MSP_ATTITUDE],
                [MSPCodes.MSP_RAW_IMU],
                [MSPCodes.MSP_DEBUG],
            ]);
        });

        it("skips a property with no MSP code", () => {
            useLoggingData().requestProperties(["MSP_RC", "NOT_A_CODE" as MspCodeName]);

            expect(vi.mocked(MSP.send_message).mock.calls).toEqual([[MSPCodes.MSP_RC]]);
        });

        it("sends nothing for no properties", () => {
            useLoggingData().requestProperties([]);

            expect(MSP.send_message).not.toHaveBeenCalled();
        });
    });
});
