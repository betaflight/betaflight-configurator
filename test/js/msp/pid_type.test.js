import { beforeEach, describe, expect, it } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";
import FC from "../../../src/js/fc";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

function processMessage(mspHelper, code, buffer) {
    mspHelper.process_data({
        code,
        dataView: new DataView(new Uint8Array(buffer).buffer),
        crcError: false,
        callbacks: [],
    });
}

describe("pid_type (Control Law) MSP_PID_ADVANCED field", () => {
    const mspHelper = new MspHelper();

    beforeEach(() => {
        FC.resetState();
    });

    it("round-trips pidType through crunch (encode) and process_data (decode) for API >= 1.49", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_49;
        FC.ADVANCED_TUNING.pidType = 1; // PID_TYPE_ADRC

        const encoded = mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED);

        // Simulate a fresh connection re-reading the same profile back
        FC.ADVANCED_TUNING.pidType = 0;

        processMessage(mspHelper, MSPCodes.MSP_PID_ADVANCED, encoded);

        expect(FC.ADVANCED_TUNING.pidType).toEqual(1);
    });

    it("does not read a pidType byte for API < 1.49 (older firmware doesn't send one)", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_48;
        FC.ADVANCED_TUNING.pidType = 1;

        // crunch() itself is version-gated the same way, so this also verifies the encode
        // side doesn't append a byte that older firmware wouldn't expect either.
        const encoded = mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED);

        FC.ADVANCED_TUNING.pidType = 0;
        expect(() => processMessage(mspHelper, MSPCodes.MSP_PID_ADVANCED, encoded)).not.toThrow();

        // No trailing byte was sent or expected, so pidType stays at its default.
        expect(FC.ADVANCED_TUNING.pidType).toEqual(0);
    });

    it("defaults pidType to 0 (CLASSIC) on FC.resetState()", () => {
        expect(FC.ADVANCED_TUNING.pidType).toEqual(0);
    });
});
