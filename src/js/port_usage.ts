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

import { serial } from "./serial";

const PortUsage = {
    previous_received: 0,
    previous_sent: 0,
    port_usage_down: 0,
    port_usage_up: 0,
    main_timer_reference: undefined as ReturnType<typeof setInterval> | undefined,

    initialize() {
        this.main_timer_reference = setInterval(() => {
            this.update();
        }, 1000);
    },
    // Port load over the last second, in percent of the link's bit rate (10 bits per byte on the wire).
    update() {
        const protocol = serial?._protocol;
        if (protocol?.bitrate) {
            const port_usage_down = Math.trunc(
                ((((protocol.bytesReceived ?? 0) - this.previous_received) * 10) / protocol.bitrate) * 100,
            );
            const port_usage_up = Math.trunc(
                ((((protocol.bytesSent ?? 0) - this.previous_sent) * 10) / protocol.bitrate) * 100,
            );

            this.previous_received = protocol.bytesReceived ?? 0;
            this.previous_sent = protocol.bytesSent ?? 0;
            this.port_usage_down = port_usage_down;
            this.port_usage_up = port_usage_up;
        } else {
            this.port_usage_down = 0;
            this.port_usage_up = 0;
        }
    },
    reset() {
        this.previous_received = 0;
        this.previous_sent = 0;

        this.port_usage_down = 0;
        this.port_usage_up = 0;
    },
};

export default PortUsage;
