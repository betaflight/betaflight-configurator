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

import MSP, { type MspPayload } from "../../../js/msp";

/** A queued MSP send, or a `[null, null]` slot that only spends one tick (see `pushPause`). */
type QueueEntry = [command: number, buffer: MspPayload] | [command: null, buffer: null];

/**
 * Paces MSP sends for the ESC DShot direction dialog: one queued entry is sent per interval tick.
 */
class EscDshotCommandQueue {
    private _intervalId: ReturnType<typeof setInterval> | null;
    private readonly _interval: number;
    private _queue: QueueEntry[];
    private _purging: boolean;

    constructor(intervalMs: number) {
        this._intervalId = null;
        this._interval = intervalMs;
        this._queue = [];
        this._purging = false;
    }

    pushCommand(command: number, buffer: MspPayload): void {
        this._queue.push([command, buffer]);
    }

    pushPause(milliseconds: number): void {
        const counter = Math.ceil(milliseconds / this._interval);

        for (let i = 0; i < counter; i++) {
            this._queue.push([null, null]);
        }
    }

    start(): void {
        if (null === this._intervalId) {
            this._intervalId = setInterval(() => {
                this._checkQueue();
            }, this._interval);
        }
    }

    stop(): void {
        if (null !== this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    stopWhenEmpty(): void {
        this._purging = true;
    }

    clear(): void {
        this._queue = [];
    }

    private _checkQueue(): void {
        // Entries are always tuples, so `undefined` here means the queue was empty.
        const command = this._queue.shift();

        if (command) {
            if (null !== command[0]) {
                MSP.send_message(command[0], command[1]);
            }
        } else if (this._purging) {
            this._purging = false;
            this.stop();
        }
    }
}

export default EscDshotCommandQueue;
