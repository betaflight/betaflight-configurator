import { beforeEach, describe, expect, it } from "vitest";
import AutoBackup, { isPlausibleCliDump } from "../../../src/js/utils/AutoBackup.js";

const CRLF = "\r\n";

// Helper to build the event shape readSerialAdapter expects.
function receiveEvent(text) {
    return { detail: { data: Array.from(text, (ch) => ch.charCodeAt(0)) } };
}

describe("AutoBackup", () => {
    beforeEach(() => {
        AutoBackup.resetBuffer();
    });

    describe("garbage detection", () => {
        it("does not flag a clean ASCII CLI stream as garbage", () => {
            AutoBackup.readSerialAdapter(receiveEvent(`# Betaflight / STM32F405${CRLF}set foo = 1${CRLF}`));

            expect(AutoBackup.invalidCharCount).toEqual(0);
            expect(AutoBackup.isReceivingGarbage()).toEqual(false);
        });

        it("flags the stream as garbage on the very first non-printable byte", () => {
            // A single NUL byte amongst otherwise printable data is enough.
            AutoBackup.readSerialAdapter({ detail: { data: [0x23, 0x00, 0x41] } });

            expect(AutoBackup.invalidCharCount).toEqual(1);
            expect(AutoBackup.isReceivingGarbage()).toEqual(true);
        });

        it("counts high/control bytes (binary MSP traffic) as non-printable", () => {
            AutoBackup.readSerialAdapter({ detail: { data: [0x90, 0x80, 0x01, 0x02] } });

            expect(AutoBackup.invalidCharCount).toEqual(4);
            expect(AutoBackup.isReceivingGarbage()).toEqual(true);
        });

        it("treats tab, CR and LF as printable", () => {
            AutoBackup.readSerialAdapter({ detail: { data: [0x09, 0x0d, 0x0a, 0x20] } });

            expect(AutoBackup.invalidCharCount).toEqual(0);
            expect(AutoBackup.isReceivingGarbage()).toEqual(false);
        });

        it("resetBuffer clears the buffer and the invalid-char counter", () => {
            AutoBackup.readSerialAdapter({ detail: { data: [0x00, 0x01] } });
            expect(AutoBackup.isReceivingGarbage()).toEqual(true);

            AutoBackup.resetBuffer();

            expect(AutoBackup.outputHistory).toEqual("");
            expect(AutoBackup.invalidCharCount).toEqual(0);
            expect(AutoBackup.isReceivingGarbage()).toEqual(false);
        });
    });

    describe("isPlausibleCliDump", () => {
        it("accepts a real diff dump", () => {
            const dump = `# version${CRLF}# Betaflight / STM32F405 (S405) 4.5.0${CRLF}set foo = 1${CRLF}`;
            expect(isPlausibleCliDump(dump)).toEqual(true);
        });

        it("rejects empty data", () => {
            expect(isPlausibleCliDump("")).toEqual(false);
        });

        it("rejects data containing any non-printable byte", () => {
            const withNul = `# version${CRLF}set foo = ${String.fromCharCode(0)}${CRLF}`;
            expect(isPlausibleCliDump(withNul)).toEqual(false);
        });

        it("rejects printable data with no CLI comment line", () => {
            expect(isPlausibleCliDump(`set foo = 1${CRLF}set bar = 2${CRLF}`)).toEqual(false);
        });
    });
});
