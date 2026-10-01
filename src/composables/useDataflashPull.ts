/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { ref, computed, type ComputedRef, type Ref } from "vue";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { mspHelper, type DataflashReadCallback } from "../js/msp/MSPHelper";
import GUI from "../js/gui";
import FC from "../js/fc";
import { useConnectionStore } from "../stores/connection";

const BLOCK_SIZE = 4096;

export interface DataflashPull {
    pulling: Ref<boolean>;
    /** Percentage of the occupied flash read so far, 0–100. */
    progress: Ref<number>;
    available: ComputedRef<boolean>;
    pull: () => Promise<Uint8Array>;
}

/**
 * Pull the onboard dataflash log off a connected flight controller into an in-memory
 * Uint8Array (rather than streaming it to disk like OnboardLoggingTab). Intended to feed the
 * embedded blackbox viewer directly. Mirrors the MSP read loop in OnboardLoggingTab.
 */
export function useDataflashPull(): DataflashPull {
    const connectionStore = useConnectionStore();
    const pulling = ref(false);
    const progress = ref(0);

    const available = computed(
        () => !!GUI.connected_to && connectionStore.connectionValid && (FC.DATAFLASH?.usedSize || 0) > 0,
    );

    /**
     * Pull the onboard dataflash log into memory.
     *
     * @returns Resolves with the downloaded log bytes.
     * @throws {Error} If not connected or the flight controller holds no log data.
     * @throws {MspTimeoutError|MspCancelledError|MspCrcError} If the underlying MSP
     *   summary/read flow fails (e.g. timeout, disconnect or queue drain).
     */
    async function pull(): Promise<Uint8Array> {
        if (!GUI.connected_to) {
            throw new Error("Not connected to a flight controller");
        }

        pulling.value = true;
        progress.value = 0;

        const cleanup = () => {
            pulling.value = false;
            connectionStore.resumeLiveData();
        };

        try {
            connectionStore.pauseLiveData();
            // Await the drain before the first MSP request: clearMspQueue() runs callbacks_cleanup()
            // asynchronously, which would otherwise reject the MSP_DATAFLASH_SUMMARY promise we await
            // just below (it settles errorAware entries with MspCancelledError) and abort the pull.
            await connectionStore.clearMspQueue();

            // Refresh the occupied size before reading.
            await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY);
            const maxBytes = FC.DATAFLASH?.usedSize || 0;
            if (maxBytes <= 0) {
                throw new Error("No log data on the flight controller");
            }

            const buffer = new Uint8Array(maxBytes);

            const result = await new Promise<Uint8Array>((resolve, reject) => {
                let nextAddress = 0;

                const onChunkRead: DataflashReadCallback = (_chunkAddress, chunkDataView, _bytesCompressed, error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
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
                };

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
