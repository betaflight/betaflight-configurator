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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { serial } = vi.hoisted(() => ({
    serial: { _protocol: null as { bitrate?: number; bytesReceived?: number; bytesSent?: number } | null },
}));

vi.mock("../../src/js/serial", () => ({ serial }));

import PortUsage from "../../src/js/port_usage";

describe("PortUsage", () => {
    beforeEach(() => {
        PortUsage.reset();
        serial._protocol = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reports each direction's load since the last update as a percentage of the bit rate", () => {
        serial._protocol = { bitrate: 115200, bytesReceived: 5760, bytesSent: 1152 };
        PortUsage.update();

        // 5760 bytes * 10 bits / 115200 = 50 %; 1152 bytes = 10 %.
        expect(PortUsage.port_usage_down).toBe(50);
        expect(PortUsage.port_usage_up).toBe(10);

        serial._protocol.bytesReceived = 5760 + 1153;
        serial._protocol.bytesSent = 1152 + 11519;
        PortUsage.update();

        // Fractions are cut off, not rounded: 10.008... and 99.99... %.
        expect(PortUsage.port_usage_down).toBe(10);
        expect(PortUsage.port_usage_up).toBe(99);
    });

    it("reports 0 when there is no protocol or it has no bit rate", () => {
        PortUsage.port_usage_down = 7;
        PortUsage.port_usage_up = 7;
        PortUsage.update();
        expect([PortUsage.port_usage_down, PortUsage.port_usage_up]).toEqual([0, 0]);

        serial._protocol = { bitrate: 0, bytesReceived: 5760, bytesSent: 1152 };
        PortUsage.port_usage_down = 7;
        PortUsage.port_usage_up = 7;
        PortUsage.update();
        expect([PortUsage.port_usage_down, PortUsage.port_usage_up]).toEqual([0, 0]);
    });

    it("measures from zero again after a reset", () => {
        serial._protocol = { bitrate: 115200, bytesReceived: 5760, bytesSent: 1152 };
        PortUsage.update();
        PortUsage.reset();

        expect(PortUsage).toMatchObject({ port_usage_down: 0, port_usage_up: 0 });

        PortUsage.update();
        expect(PortUsage.port_usage_down).toBe(50);
        expect(PortUsage.port_usage_up).toBe(10);
    });

    it("updates once a second after initialize", () => {
        vi.useFakeTimers();
        const update = vi.spyOn(PortUsage, "update");

        PortUsage.initialize();
        vi.advanceTimersByTime(999);
        expect(update).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(update).toHaveBeenCalledTimes(1);

        clearInterval(PortUsage.main_timer_reference);
        update.mockRestore();
    });
});
