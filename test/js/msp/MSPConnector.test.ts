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

import { beforeEach, describe, expect, it, vi } from "vitest";

const { serialMock } = vi.hoisted(() => ({
    serialMock: {
        addEventListener: vi.fn<(type: string, listener: EventListener, options?: AddEventListenerOptions) => void>(),
        removeEventListener: vi.fn(),
        connect: vi.fn().mockResolvedValue(true),
        disconnect: vi.fn(),
    },
}));
vi.mock("../../../src/js/serial", () => ({ serial: serialMock }));
// Listener bookkeeping only; stubbing these also keeps the flasher import cycle out of the test.
vi.mock("../../../src/js/msp/MSPHelper", () => ({ default: vi.fn() }));
vi.mock("../../../src/js/timers", () => ({ addTimeout: vi.fn(), removeTimeout: vi.fn() }));
vi.mock("../../../src/js/gui_log", () => ({ gui_log: vi.fn() }));

import MSPConnectorImpl from "../../../src/js/msp/MSPConnector";

/** The listener registered for an event in the most recent connect(). */
function added(type: string) {
    return [...serialMock.addEventListener.mock.calls].reverse().find(([t]) => t === type)![1];
}

describe("MSPConnector listeners", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("removes the very connect/disconnect handlers it added, so a stale one cannot pile up", () => {
        const connector = new MSPConnectorImpl();
        connector.connect("/dev/ttyACM0", 115200, vi.fn(), vi.fn(), vi.fn());
        const onConnect = added("connect");
        const onDisconnect = added("disconnect");

        // A second attempt (the first never fired `connect`) must clear the first's handlers.
        connector.connect("/dev/ttyACM0", 115200, vi.fn(), vi.fn(), vi.fn());

        expect(serialMock.removeEventListener).toHaveBeenCalledWith("connect", onConnect);
        expect(serialMock.removeEventListener).toHaveBeenCalledWith("disconnect", onDisconnect);
        expect(added("connect")).toBe(onConnect);
    });
});
