import { beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useReceiverCommands } from "../../../../src/composables/receiver/useReceiverCommands";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { setRawRx: vi.fn() } }));

describe("useReceiverCommands", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("sends the bind command with no payload", () => {
        useReceiverCommands().bindReceiver();

        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP2_BETAFLIGHT_BIND);
    });

    it("hands the stick window's channels to setRawRx unchanged", () => {
        const channels = [1500, 1500, 1000, 1500, 2000];

        useReceiverCommands().sendRawRx(channels);

        expect(mspHelper.setRawRx).toHaveBeenCalledExactlyOnceWith(channels);
    });
});
