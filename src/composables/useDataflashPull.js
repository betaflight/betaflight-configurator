import { ref, computed } from "vue";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { mspHelper } from "../js/msp/MSPHelper";
import GUI from "../js/gui";
import FC from "../js/fc";
import { useConnectionStore } from "../stores/connection";

const BLOCK_SIZE = 4096;

/**
 * Pull the onboard dataflash log off a connected flight controller into an in-memory
 * Uint8Array (rather than streaming it to disk like OnboardLoggingTab). Intended to feed the
 * embedded blackbox viewer directly. Mirrors the MSP read loop in OnboardLoggingTab.
 */
export function useDataflashPull() {
    const connectionStore = useConnectionStore();
    const pulling = ref(false);
    const progress = ref(0);

    const available = computed(
        () => !!GUI.connected_to && connectionStore.connectionValid && (FC.DATAFLASH?.usedSize || 0) > 0,
    );

    async function pull() {
        if (!GUI.connected_to) {
            throw new Error("Not connected to a flight controller");
        }

        pulling.value = true;
        progress.value = 0;
        connectionStore.pauseLiveData();
        connectionStore.clearMspQueue();

        const cleanup = () => {
            pulling.value = false;
            connectionStore.resumeLiveData();
        };

        try {
            // Refresh the occupied size before reading.
            await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY);
            const maxBytes = FC.DATAFLASH?.usedSize || 0;
            if (maxBytes <= 0) {
                throw new Error("No log data on the flight controller");
            }

            const buffer = new Uint8Array(maxBytes);

            const result = await new Promise((resolve, reject) => {
                let nextAddress = 0;

                function onChunkRead(chunkAddress, chunkDataView) {
                    if (chunkDataView === null) {
                        // Transient error — retry the same address.
                        mspHelper.dataflashRead(nextAddress, BLOCK_SIZE, onChunkRead);
                        return;
                    }
                    if (chunkDataView.byteLength === 0) {
                        // Zero-byte block marks end of log.
                        resolve(buffer.subarray(0, nextAddress));
                        return;
                    }

                    const chunk = new Uint8Array(
                        chunkDataView.buffer,
                        chunkDataView.byteOffset,
                        chunkDataView.byteLength,
                    );
                    const toCopy = Math.min(maxBytes - nextAddress, chunk.length);
                    buffer.set(chunk.subarray(0, toCopy), nextAddress);
                    nextAddress += toCopy;
                    progress.value = (nextAddress / maxBytes) * 100;

                    if (nextAddress >= maxBytes) {
                        resolve(buffer);
                        return;
                    }
                    mspHelper.dataflashRead(nextAddress, BLOCK_SIZE, onChunkRead);
                }

                try {
                    mspHelper.dataflashRead(0, BLOCK_SIZE, onChunkRead);
                } catch (e) {
                    reject(e);
                }
            });

            return result;
        } finally {
            cleanup();
        }
    }

    return { pulling, progress, available, pull };
}
