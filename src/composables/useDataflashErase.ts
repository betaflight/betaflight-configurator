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

import { onScopeDispose, ref, watch, type Ref } from "vue";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { useFlightControllerStore } from "@/stores/fc";
import { useConnectionStore } from "../stores/connection";

const ERASE_POLL_INTERVAL_MS = 500;
const NOR_ERASE_UNIT_BYTES = 16 * 1024 * 1024;
const NOR_ERASE_MAX_MS_PER_UNIT = 200000;
const LARGEST_NOR_BYTES = 64 * 1024 * 1024;
const ERASE_TIMEOUT_MARGIN_MS = 100000;

/**
 * Bound the erase window by the worst-case NOR chip erase, which older firmware spends entirely
 * silent on MSP. W25Q128 tCE max is 200 s per 16 MiB. Larger parts are NAND, erased block by block
 * in seconds, so the window stops scaling at the largest supported NOR part.
 *
 * @param totalSize dataflash size in bytes, or 0 when unknown
 * @returns erase window in milliseconds
 */
export function getDataflashEraseTimeoutMs(totalSize: number): number {
    const norBytes = Math.min(Math.max(totalSize, NOR_ERASE_UNIT_BYTES), LARGEST_NOR_BYTES);
    return Math.ceil(norBytes / NOR_ERASE_UNIT_BYTES) * NOR_ERASE_MAX_MS_PER_UNIT + ERASE_TIMEOUT_MARGIN_MS;
}

type EraseFinishReason = "complete" | "error" | "disconnected" | "cancelled" | "disposed";

interface DataflashEraseCallbacks {
    onComplete?: () => void;
    onError?: (error: unknown) => void;
    onFinish?: (reason: EraseFinishReason) => void;
}

interface DataflashEraseStartOptions {
    clearQueue?: boolean;
}

interface DataflashEraseApi {
    isErasing: Ref<boolean>;
    start: (options?: DataflashEraseStartOptions) => Promise<void>;
    cancel: () => void;
}

/**
 * Manage dataflash erase polling and connection liveness as one operation.
 *
 * Some flash implementations legitimately stop servicing MSP while erasing; others keep answering
 * with not-ready. Summary polls therefore suppress the global connection watchdog and keep polling
 * until the bounded erase window expires. After that window, one normal poll restores dead-link
 * detection before the operation exits.
 *
 * @param callbacks lifecycle callbacks
 * @returns reactive erase state and lifecycle actions
 */
export function useDataflashErase({ onComplete, onError, onFinish }: DataflashEraseCallbacks = {}): DataflashEraseApi {
    const connectionStore = useConnectionStore();
    const fcStore = useFlightControllerStore();
    const isErasing = ref(false);

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineExpired = false;
    let pollInFlight = false;
    let operationSequence = 0;

    /** Clear every timer owned by the current erase operation. */
    function clearTimers(): void {
        if (pollTimer !== null) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
        if (deadlineTimer !== null) {
            clearTimeout(deadlineTimer);
            deadlineTimer = null;
        }
    }

    /** Return whether an asynchronous continuation still belongs to the active erase. */
    function isCurrentOperation(sequence: number): boolean {
        return isErasing.value && sequence === operationSequence;
    }

    /** Complete one operation and restore shared connection/UI state exactly once. */
    function finish(sequence: number, reason: EraseFinishReason, error?: unknown): void {
        if (!isCurrentOperation(sequence)) {
            return;
        }

        clearTimers();
        operationSequence++;
        isErasing.value = false;
        pollInFlight = false;
        connectionStore.resumeLiveData();
        onFinish?.(reason);

        if (reason === "complete") {
            onComplete?.();
        } else if (reason === "error") {
            onError?.(error);
        }
    }

    /** Schedule a sequence-scoped completion poll. */
    function schedulePoll(sequence: number, delay = ERASE_POLL_INTERVAL_MS): void {
        if (!isCurrentOperation(sequence) || pollTimer !== null) {
            return;
        }
        pollTimer = setTimeout(() => {
            pollTimer = null;
            if (isCurrentOperation(sequence)) {
                void pollForCompletion(sequence);
            }
        }, delay);
    }

    /** Handle a failed summary request without letting stale operations mutate new ones. */
    function handlePollFailure(sequence: number, notifyTimeout: boolean, error: unknown): void {
        if (!isCurrentOperation(sequence)) {
            return;
        }
        pollInFlight = false;

        if (!connectionStore.connectionValid) {
            finish(sequence, "disconnected");
            return;
        }
        if (notifyTimeout) {
            finish(sequence, "error", error);
            return;
        }

        // If the deadline expired while this suppressed poll was in flight, immediately issue
        // the final watchdog-enabled probe. Otherwise continue normal erase polling.
        schedulePoll(sequence, deadlineExpired ? 0 : ERASE_POLL_INTERVAL_MS);
    }

    /** Handle a successful summary response and choose the next terminal or polling state. */
    function handlePollResponse(sequence: number, notifyTimeout: boolean): void {
        if (!isCurrentOperation(sequence)) {
            return;
        }
        pollInFlight = false;

        if (!connectionStore.connectionValid) {
            finish(sequence, "disconnected");
        } else if (fcStore.dataflash?.ready) {
            finish(sequence, "complete");
        } else if (deadlineExpired && notifyTimeout) {
            finish(sequence, "error", new Error("Dataflash erase did not complete within the allowed time"));
        } else {
            // A deadline that expired during a suppressed request requires the promised normal
            // liveness probe; before the deadline, continue at the regular polling cadence.
            schedulePoll(sequence, deadlineExpired ? 0 : ERASE_POLL_INTERVAL_MS);
        }
    }

    /** Request the current dataflash summary for one operation sequence. */
    async function pollForCompletion(sequence: number): Promise<void> {
        if (!isCurrentOperation(sequence)) {
            return;
        }
        if (!connectionStore.connectionValid) {
            finish(sequence, "disconnected");
            return;
        }

        // Expected erase-time silence must not trip the global watchdog. Once the operation's
        // own deadline expires, the next request becomes a normal liveness probe so a genuinely
        // dead FC still follows the standard disconnect-and-warning path.
        const notifyTimeout = deadlineExpired;
        pollInFlight = true;
        try {
            await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY, false, { notifyTimeout });
        } catch (error: unknown) {
            handlePollFailure(sequence, notifyTimeout, error);
            return;
        }

        handlePollResponse(sequence, notifyTimeout);
    }

    /** Mark the bounded erase window expired and start its final liveness probe when idle. */
    function expireDeadline(sequence: number): void {
        if (!isCurrentOperation(sequence)) {
            return;
        }
        deadlineTimer = null;
        deadlineExpired = true;
        if (!pollInFlight) {
            schedulePoll(sequence, 0);
        }
    }

    /**
     * Start erasing dataflash.
     * @param options operation startup options
     */
    async function start({ clearQueue = true }: DataflashEraseStartOptions = {}): Promise<void> {
        if (isErasing.value) {
            return;
        }

        isErasing.value = true;
        deadlineExpired = false;
        pollInFlight = false;
        const sequence = ++operationSequence;
        connectionStore.pauseLiveData();

        try {
            if (clearQueue) {
                // Await the dynamic queue drain before registering the erase callback, or its
                // asynchronous cleanup can remove that callback and strand the operation.
                await connectionStore.clearMspQueue();
            }
            if (!isCurrentOperation(sequence)) {
                return;
            }
            if (!connectionStore.connectionValid) {
                finish(sequence, "disconnected");
                return;
            }

            deadlineTimer = setTimeout(
                () => expireDeadline(sequence),
                getDataflashEraseTimeoutMs(fcStore.dataflash?.totalSize ?? 0),
            );
            MSP.send_message(MSPCodes.MSP_DATAFLASH_ERASE, false, false, () => {
                if (isCurrentOperation(sequence)) {
                    void pollForCompletion(sequence);
                }
            });
        } catch (error: unknown) {
            finish(sequence, "error", error);
        }
    }

    /** Cancel the active erase operation, if any. */
    function cancel(): void {
        finish(operationSequence, "cancelled");
    }

    watch(
        () => connectionStore.connectionValid,
        (connectionValid) => {
            if (!connectionValid) {
                finish(operationSequence, "disconnected");
            }
        },
    );

    onScopeDispose(() => finish(operationSequence, "disposed"));

    return { isErasing, start, cancel };
}
