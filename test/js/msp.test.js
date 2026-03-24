import { describe, expect, it } from "vitest";
import MSP from "../../src/js/msp";

describe("MSP", () => {
    describe("encode_message_v1", () => {
        it("handles correctly any code and no data", () => {
            for (let code = 0; code < 256; code++) {
                let encodedMessage = MSP.encode_message_v1(code, false);
                expect(new Uint8Array(encodedMessage)).toEqual(new Uint8Array([36, 77, 60, 0, code, code]));
            }
        });
        it("handles non-empty messages correctly", () => {
            let [operationCode, inputDataLengthPadding] = crypto.getRandomValues(new Uint8Array(2));

            let inputData = crypto.getRandomValues(new Uint8Array(100 + (inputDataLengthPadding % 100)));

            let encodedMessage = new Uint8Array(MSP.encode_message_v1(operationCode, inputData));

            // check that header is in place
            expect(encodedMessage.slice(0, 3)).toEqual(new Uint8Array([36, 77, 60]));

            // check that length got encoded as expected
            expect(encodedMessage[3]).toEqual(inputData.length);

            // check that operation code is there
            expect(encodedMessage[4]).toEqual(operationCode);

            // check that data got encoded as expected
            expect(encodedMessage.slice(5, -1)).toEqual(inputData);

            // and that the checksum is valid
            let checksum = encodedMessage.slice(3, -1).reduce((acc, curr) => acc ^ curr);
            expect(encodedMessage[encodedMessage.length - 1]).toEqual(checksum);
        });
    });

    describe("encode_message_v2", () => {
        it("handles correctly any code and no data", () => {
            // Test boundary values and representative samples instead of
            // brute-forcing all 65536 combinations (which exceeds the 5s timeout)
            const testCodes = [
                0x0000, 0x0001, 0x00ff, 0x0100, 0x0101, 0x01ff, 0x7f00, 0x7fff, 0x8000, 0x8001, 0xff00, 0xfffe, 0xffff,
            ];

            // Add a spread of values across the full range
            for (let i = 0; i < 256; i += 17) {
                for (let j = 0; j < 256; j += 17) {
                    testCodes.push(i + j * 256);
                }
            }

            for (const code of testCodes) {
                const codeLowByte = code & 0xff;
                const codeHighByte = (code >> 8) & 0xff;
                let encodedMessage = MSP.encode_message_v2(code, false).slice(0, -1);
                expect(new Uint8Array(encodedMessage)).toEqual(
                    new Uint8Array([36, 88, 60, 0, codeLowByte, codeHighByte, 0, 0]),
                );
            }
        });
        it("handles non-empty messages correctly", () => {
            let [lengthLowByte, lengthHighByte] = crypto.getRandomValues(new Uint8Array(2));

            let inputData = crypto.getRandomValues(new Uint8Array(lengthLowByte + lengthHighByte * 256));
            let [operationCodeLowByte, operationCodeHighByte] = crypto.getRandomValues(new Uint8Array(2));

            let encodedMessage = new Uint8Array(
                MSP.encode_message_v2(operationCodeLowByte + 256 * operationCodeHighByte, inputData),
            );

            // check that header is in place
            expect(encodedMessage.slice(0, 3)).toEqual(new Uint8Array([36, 88, 60]));

            expect(encodedMessage[3]).toEqual(0);

            // check that operation code is there
            expect(encodedMessage[4]).toEqual(operationCodeLowByte);
            expect(encodedMessage[5]).toEqual(operationCodeHighByte);

            // check that length got encoded as expected
            expect(encodedMessage[6]).toEqual(lengthLowByte);
            expect(encodedMessage[7]).toEqual(lengthHighByte);

            // check that data got encoded as expected
            expect(encodedMessage.slice(8, -1)).toEqual(inputData);
        });
    });
});
