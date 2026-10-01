import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia } from "pinia";
import { useDataflashPull, type DataflashPull } from "../../src/composables/useDataflashPull";
import { useConnectionStore } from "../../src/stores/connection";
import CONFIGURATOR from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import GUI from "../../src/js/gui";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { pinia } from "../../src/js/pinia_instance";
import { mspHelper, type DataflashReadCallback } from "../../src/js/msp/MSPHelper";
import { MspTimeoutError } from "../../src/js/msp/mspErrors";

type ChunkReply = (address: number, blockSize: number, callback: DataflashReadCallback) => void;

/** A flash holding `bytes`, answering each read with up to `blockSize` bytes from the address. */
function flashOf(bytes: Uint8Array): ChunkReply {
    return (address, blockSize, callback) => {
        const slice = bytes.slice(address, address + blockSize);
        callback(address, new DataView(slice.buffer));
    };
}

function sequentialBytes(length: number): Uint8Array {
    return Uint8Array.from({ length }, (_, i) => i % 251);
}

describe("useDataflashPull", () => {
    let connectionStore: ReturnType<typeof useConnectionStore>;
    let dataflash: DataflashPull;
    let reportedUsedSize: number;
    let readReply: ChunkReply;
    let reads: number[];

    beforeEach(() => {
        // GUI.connected_to reads the app's Pinia instance (and makes it the active one), so the
        // composable and the test must share that instance to see the same connection store.
        setActivePinia(pinia);
        FC.resetState();
        CONFIGURATOR.connectionValid = true;
        connectionStore = useConnectionStore();
        connectionStore.resumeLiveData();
        GUI.connected_to = "/dev/ttyACM0";

        reportedUsedSize = 0;
        reads = [];
        readReply = flashOf(new Uint8Array());

        vi.spyOn(connectionStore, "clearMspQueue").mockResolvedValue();
        // The summary is what refreshes the occupied size before the pull reads.
        vi.spyOn(MSP, "promise").mockImplementation(async (code) => {
            if (code === MSPCodes.MSP_DATAFLASH_SUMMARY) {
                FC.DATAFLASH.usedSize = reportedUsedSize;
            }
            return undefined;
        });
        vi.spyOn(mspHelper, "dataflashRead").mockImplementation((address, blockSize, callback) => {
            reads.push(address);
            readReply(address, blockSize, callback);
        });

        dataflash = useDataflashPull();
    });

    afterEach(() => {
        CONFIGURATOR.connectionValid = false;
        GUI.connected_to = false;
        vi.restoreAllMocks();
    });

    it("refuses to pull when not connected, without touching live data or MSP", async () => {
        GUI.connected_to = false;

        await expect(dataflash.pull()).rejects.toThrow("Not connected");

        expect(connectionStore.liveDataPaused).toBe(false);
        expect(MSP.promise).not.toHaveBeenCalled();
        expect(dataflash.pulling.value).toBe(false);
    });

    it("reads the whole log block by block into one buffer", async () => {
        const log = sequentialBytes(4096 * 2 + 100);
        reportedUsedSize = log.length;
        readReply = flashOf(log);

        const result = await dataflash.pull();

        expect(result).toEqual(log);
        expect(reads).toEqual([0, 4096, 8192]);
        expect(dataflash.progress.value).toBe(100);
    });

    it("sizes the read from the fresh summary, not the size known before the pull", async () => {
        FC.DATAFLASH.usedSize = 10;
        const log = sequentialBytes(300);
        reportedUsedSize = log.length;
        readReply = flashOf(log);

        const result = await dataflash.pull();

        expect(result).toHaveLength(300);
    });

    it("drains the MSP queue before asking for the summary", async () => {
        const order: string[] = [];
        // Recorded when the drain finishes, a macrotask later, so a missing await shows up.
        vi.mocked(connectionStore.clearMspQueue).mockImplementation(
            () =>
                new Promise((resolve) =>
                    setTimeout(() => {
                        order.push("drained");
                        resolve();
                    }),
                ),
        );
        vi.mocked(MSP.promise).mockImplementation(async () => {
            order.push("summary");
            FC.DATAFLASH.usedSize = 0;
            return undefined;
        });

        await expect(dataflash.pull()).rejects.toThrow();

        expect(order).toEqual(["drained", "summary"]);
    });

    it("drops whatever the FC returns past the occupied size", async () => {
        const flash = sequentialBytes(4096);
        reportedUsedSize = 1000;
        readReply = flashOf(flash);

        const result = await dataflash.pull();

        expect(result).toEqual(flash.subarray(0, 1000));
    });

    it("stops at a zero-byte block, returning only what was read", async () => {
        const log = sequentialBytes(4096);
        reportedUsedSize = 4096 * 3;
        readReply = (address, blockSize, callback) => {
            if (address === 0) {
                flashOf(log)(address, blockSize, callback);
            } else {
                callback(address, new DataView(new ArrayBuffer(0)));
            }
        };

        const result = await dataflash.pull();

        expect(result).toEqual(log);
        expect(reads).toEqual([0, 4096]);
    });

    it("retries the same address after a transient read failure", async () => {
        const log = sequentialBytes(5000);
        reportedUsedSize = log.length;
        let failedOnce = false;
        readReply = (address, blockSize, callback) => {
            if (address === 4096 && !failedOnce) {
                failedOnce = true;
                callback(address, null);
                return;
            }
            flashOf(log)(address, blockSize, callback);
        };

        const result = await dataflash.pull();

        expect(result).toEqual(log);
        expect(reads).toEqual([0, 4096, 4096]);
    });

    it("copies from the chunk's own window when the DataView is offset into a larger buffer", async () => {
        reportedUsedSize = 4;
        readReply = (address, _blockSize, callback) => {
            const backing = new Uint8Array([0xee, 0xee, 1, 2, 3, 4, 0xee]);
            callback(address, new DataView(backing.buffer, 2, 4));
        };

        const result = await dataflash.pull();

        expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });

    it("rejects with the read error and restores state", async () => {
        reportedUsedSize = 8192;
        const error = new MspTimeoutError("read timed out");
        readReply = (address, _blockSize, callback) => callback(address, null, null, error);

        await expect(dataflash.pull()).rejects.toBe(error);

        expect(dataflash.pulling.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
    });

    it("rejects when the first read throws synchronously", async () => {
        reportedUsedSize = 8192;
        const error = new Error("port closed");
        readReply = () => {
            throw error;
        };

        await expect(dataflash.pull()).rejects.toBe(error);
        expect(dataflash.pulling.value).toBe(false);
    });

    it("rejects when the summary reports an empty flash", async () => {
        reportedUsedSize = 0;

        await expect(dataflash.pull()).rejects.toThrow("No log data");

        expect(mspHelper.dataflashRead).not.toHaveBeenCalled();
        expect(connectionStore.liveDataPaused).toBe(false);
    });

    it("holds pulling and paused live data only while the pull runs", async () => {
        const log = sequentialBytes(10);
        reportedUsedSize = log.length;
        let duringRead: { pulling: boolean; paused: boolean } | undefined;
        readReply = (address, blockSize, callback) => {
            duringRead = { pulling: dataflash.pulling.value, paused: connectionStore.liveDataPaused };
            flashOf(log)(address, blockSize, callback);
        };

        await dataflash.pull();

        expect(duringRead).toEqual({ pulling: true, paused: true });
        expect(dataflash.pulling.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
    });

    describe("available", () => {
        it("is true only when connected, the link is valid and the flash holds data", () => {
            FC.DATAFLASH.usedSize = 100;
            expect(dataflash.available.value).toBe(true);

            FC.DATAFLASH.usedSize = 0;
            expect(dataflash.available.value).toBe(false);

            FC.DATAFLASH.usedSize = 100;
            CONFIGURATOR.connectionValid = false;
            expect(dataflash.available.value).toBe(false);

            CONFIGURATOR.connectionValid = true;
            GUI.connected_to = false;
            expect(dataflash.available.value).toBe(false);
        });
    });
});
