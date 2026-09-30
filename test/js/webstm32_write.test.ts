import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/js/gui", () => {
    const flasher = {
        FLASH_MESSAGE_TYPES: { NEUTRAL: 0, VALID: 1, INVALID: 2, ACTION: 3, FLASHING: 4, VERIFYING: 5 },
        flashingMessage: () => flasher,
        flashProgress: () => flasher,
    };
    return { default: { connect_lock: false }, TABS: { firmware_flasher: flasher } };
});
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (k: string) => k } }));

import STM32 from "../../src/js/protocols/webstm32";

interface Block {
    address: number;
    bytes: number;
    data: number[];
}

const ACK = 0x79;
const WRITE_MEMORY = 0x31;

// Drives the real write step (upload_procedure(5)) against a bootloader stub that ACKs
// everything, and returns the data packets it was sent.
function writeImage(blocks: Block[]) {
    const sent: number[][] = [];
    const steps: number[] = [];
    const stm32 = STM32 as unknown as Record<string, unknown>;
    const upload = (stm32.upload_procedure as (step: number) => void).bind(STM32);

    stm32.send = (bytes: number[], _n: number, callback: (reply: number[]) => void) => {
        sent.push([...bytes]);
        callback([ACK]);
    };
    stm32.upload_procedure = (step: number) => (step === 5 ? upload(step) : steps.push(step));
    stm32.hex = { data: blocks, bytes_total: blocks.reduce((total, b) => total + b.bytes, 0) };

    upload(5);

    // Each page is: command, address + checksum, then the data packet.
    const packets = sent.filter((_bytes, i) => i % 3 === 2);
    expect(sent.filter((_bytes, i) => i % 3 === 0)).toEqual(packets.map(() => [WRITE_MEMORY, 0xce]));
    return { packets, steps };
}

const block = (address: number, bytes: number, seed: number): Block => ({
    address,
    bytes,
    data: Array.from({ length: bytes }, (_, i) => (i * 37 + seed) & 0xff),
});

describe("webstm32 WRITE MEMORY packets", () => {
    it("send N, every data byte, then the checksum after the last byte", () => {
        const image = [block(0x08000000, 600, 1), block(0x08004000, 1, 2)];
        const { packets, steps } = writeImage(image);

        const expectedSizes = [256, 256, 88, 1];
        expect(packets.map((p) => p.length)).toEqual(expectedSizes.map((n) => n + 2));

        const written: number[] = [];
        for (const packet of packets) {
            const n = packet[0] + 1;
            const data = packet.slice(1, 1 + n);
            const checksum = data.reduce((x, byte) => x ^ byte, packet[0]);
            expect(packet.at(-1)).toBe(checksum);
            written.push(...data);
        }
        expect(written).toEqual(image.flatMap((b) => b.data));
        expect(steps).toEqual([6]);
    });

    it("keeps the last data byte of a full page", () => {
        const image = [block(0x08000000, 256, 3)];
        const [packet] = writeImage(image).packets;

        expect(packet).toHaveLength(258);
        expect(packet[256]).toBe(image[0].data[255]);
    });
});
