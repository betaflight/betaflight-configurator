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

const { setConfig, handler } = vi.hoisted(() => ({
    setConfig: vi.fn(),
    handler: {
        setShowVirtualMode: vi.fn(),
        setShowManualMode: vi.fn(),
        setShowAllSerialDevices: vi.fn(),
    },
}));

vi.mock("../../../src/js/ConfigStorage", () => ({ set: setConfig }));
vi.mock("../../../src/js/device_handler", () => ({ default: handler }));

import {
    DEFAULT_DEVELOPMENT_OPTIONS,
    ENABLED_DEVELOPMENT_OPTIONS,
    applyDevelopmentOptions,
    enableDevelopmentOptions,
    resetDevelopmentOptions,
} from "../../../src/js/utils/developmentOptions";

describe("developmentOptions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("saves the options and passes each one to the device handler", () => {
        applyDevelopmentOptions({
            showVirtualMode: true,
            showManualMode: false,
            showAllSerialDevices: false,
            backupOnFlash: 2,
        });

        expect(setConfig).toHaveBeenCalledWith({
            showVirtualMode: true,
            showManualMode: false,
            showAllSerialDevices: false,
            backupOnFlash: 2,
        });
        expect(handler.setShowVirtualMode).toHaveBeenCalledWith(true);
        expect(handler.setShowManualMode).toHaveBeenCalledWith(false);
        expect(handler.setShowAllSerialDevices).toHaveBeenCalledWith(false);
    });

    it("leaves the device handler alone for options that are not given", () => {
        applyDevelopmentOptions({ showManualMode: true, backupOnFlash: 0 });

        expect(setConfig).toHaveBeenCalledWith({ showManualMode: true, backupOnFlash: 0 });
        expect(handler.setShowManualMode).toHaveBeenCalledWith(true);
        expect(handler.setShowVirtualMode).not.toHaveBeenCalled();
        expect(handler.setShowAllSerialDevices).not.toHaveBeenCalled();
    });

    it("resets to the defaults and enables the development set", () => {
        resetDevelopmentOptions();
        expect(setConfig).toHaveBeenLastCalledWith(DEFAULT_DEVELOPMENT_OPTIONS);

        enableDevelopmentOptions();
        expect(setConfig).toHaveBeenLastCalledWith(ENABLED_DEVELOPMENT_OPTIONS);
    });
});
