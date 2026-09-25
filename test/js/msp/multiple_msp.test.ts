import { afterEach, describe, expect, it, vi } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import MSP from "../../../src/js/msp";
import { MspDataView } from "../../../src/js/msp/mspBytes";
import type { MspFrame, MspRequest } from "../../../src/js/msp";

// A reply to MSP_MULTIPLE_MSP is one length-prefixed payload per requested command; a zero
// length is a command the FC answered with nothing, which keeps these tests off the decoders.
function multipleReply(answered: number): MspDataView {
    return new MspDataView(new Uint8Array(answered).buffer);
}

function request(code: number): MspRequest & { calls: number } {
    const entry = { code, errorAware: false, notifyTimeout: true, timer: null, calls: 0 } as unknown as MspRequest & {
        calls: number;
    };
    entry.callback = () => {
        entry.calls++;
    };
    return entry;
}

function frame(dataView: MspDataView, callbacks: MspRequest[]): MspFrame {
    return { code: MSPCodes.MSP_MULTIPLE_MSP, dataView, crcError: false, unsupported: 0, callbacks };
}

describe("MSP_MULTIPLE_MSP partial replies", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("re-requests only the unanswered commands and leaves every pending request queued", () => {
        const send = vi.spyOn(MSP, "send_message").mockReturnValue(true);
        const arm = vi.spyOn(MSP, "_arm_timer").mockImplementation(() => {});
        const helper = new MspHelper();
        helper.mspMultipleCache = [MSPCodes.MSP_STATUS, MSPCodes.MSP_ANALOG, MSPCodes.MSP_RC];
        const multiple = request(MSPCodes.MSP_MULTIPLE_MSP);
        const unrelated = request(MSPCodes.MSP_STATUS);
        const queue = [multiple, unrelated];

        helper.process_data(frame(multipleReply(1), queue));

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]).toHaveLength(3);
        expect(send.mock.calls[0][0]).toBe(MSPCodes.MSP_MULTIPLE_MSP);
        expect([...(send.mock.calls[0][1] as number[])]).toEqual([MSPCodes.MSP_ANALOG, MSPCodes.MSP_RC]);
        expect(queue).toEqual([multiple, unrelated]);
        expect(multiple.calls).toBe(0);
        expect(arm).toHaveBeenCalledTimes(1);
        expect(arm).toHaveBeenCalledWith(multiple);
    });

    it("answers the original request once the remainder arrives", () => {
        vi.spyOn(MSP, "send_message").mockReturnValue(true);
        vi.spyOn(MSP, "_arm_timer").mockImplementation(() => {});
        const helper = new MspHelper();
        helper.mspMultipleCache = [MSPCodes.MSP_STATUS, MSPCodes.MSP_ANALOG, MSPCodes.MSP_RC];
        const multiple = request(MSPCodes.MSP_MULTIPLE_MSP);
        const unrelated = request(MSPCodes.MSP_STATUS);
        const queue = [multiple, unrelated];

        helper.process_data(frame(multipleReply(1), queue));
        helper.process_data(frame(multipleReply(2), queue));

        expect(multiple.calls).toBe(1);
        expect(unrelated.calls).toBe(0);
        expect(queue).toEqual([unrelated]);
        expect(helper.mspMultipleCache).toEqual([]);
    });

    it("answers straight away when everything fits in one reply", () => {
        const send = vi.spyOn(MSP, "send_message").mockReturnValue(true);
        const helper = new MspHelper();
        helper.mspMultipleCache = [MSPCodes.MSP_STATUS, MSPCodes.MSP_ANALOG];
        const multiple = request(MSPCodes.MSP_MULTIPLE_MSP);
        const queue = [multiple];

        helper.process_data(frame(multipleReply(2), queue));

        expect(send).not.toHaveBeenCalled();
        expect(multiple.calls).toBe(1);
        expect(queue).toEqual([]);
    });
});
