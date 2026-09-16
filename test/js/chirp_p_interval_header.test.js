import { describe, expect, it } from "vitest";
import { parsePIntervalHeader, parsePRatioHeader } from "../../src/js/blackbox/chirp_bbl_parser";

function newSysConfig() {
    return { frameIntervalPNum: 1, frameIntervalPDenom: 1, frameIntervalPExplicit: false };
}

describe("chirp log P interval header", () => {
    it("reads a bare integer as the divider", () => {
        const sysConfig = newSysConfig();

        parsePIntervalHeader("2", sysConfig);

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(2);
    });

    it("reads a fraction as numerator and denominator", () => {
        const sysConfig = newSysConfig();

        parsePIntervalHeader("1/4", sysConfig);

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(4);
    });

    it("keeps an explicit 1/1 P interval when a P ratio header follows", () => {
        const sysConfig = newSysConfig();

        parsePIntervalHeader("1/1", sysConfig);
        parsePRatioHeader("8", sysConfig);

        expect(sysConfig.frameIntervalPDenom).toBe(1);
    });

    it("keeps an explicit bare 1 P interval when a P ratio header follows", () => {
        const sysConfig = newSysConfig();

        parsePIntervalHeader("1", sysConfig);
        parsePRatioHeader("8", sysConfig);

        expect(sysConfig.frameIntervalPDenom).toBe(1);
    });

    it("falls back to the P ratio header when P interval is absent", () => {
        const sysConfig = newSysConfig();

        parsePRatioHeader("8", sysConfig);

        expect(sysConfig.frameIntervalPNum).toBe(1);
        expect(sysConfig.frameIntervalPDenom).toBe(8);
    });

    it("ignores a non-positive P ratio", () => {
        const sysConfig = newSysConfig();

        parsePRatioHeader("0", sysConfig);

        expect(sysConfig.frameIntervalPDenom).toBe(1);
    });
});
