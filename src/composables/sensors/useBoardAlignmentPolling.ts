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

import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";

interface PollLoop {
    /** Start polling; a no-op while already polling. */
    start: () => void;
    /** Stop polling and cancel the pending re-request. A reply already in flight is ignored. */
    stop: () => void;
}

/**
 * Request `code`, and `periodMs` after each reply request it again, until stopped. Unlike a
 * fixed interval, a slow reply delays the next request instead of queueing more behind it.
 */
function createPollLoop(code: number, periodMs: number, onReply: () => void): PollLoop {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;

    const loop = () => {
        if (!polling) return;
        MSP.send_message(code, false, false, () => {
            if (!polling) return;
            onReply();
            timer = setTimeout(loop, periodMs);
        });
    };

    return {
        start() {
            if (polling) return;
            polling = true;
            loop();
        },
        stop() {
            polling = false;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        },
    };
}

/**
 * MSP traffic for the board alignment wizard: the raw IMU stream it detects poses from, and
 * the attitude stream its test phase renders. Replies land in the flightController store.
 * Nothing stops on its own; the wizard stops both loops in its cleanup.
 * @param periodMs delay between a reply and the next request, for both streams
 * @param onImuSample called after each MSP_RAW_IMU reply while IMU polling is running
 */
export function useBoardAlignmentPolling(periodMs: number, onImuSample: () => void) {
    const imu = createPollLoop(MSPCodes.MSP_RAW_IMU, periodMs, onImuSample);
    const attitude = createPollLoop(MSPCodes.MSP_ATTITUDE, periodMs, () => {});

    return {
        startImuPolling: imu.start,
        stopImuPolling: imu.stop,
        startAttitudePolling: attitude.start,
        stopAttitudePolling: attitude.stop,
    };
}
