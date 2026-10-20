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

import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/components/eventBus";

describe("EventBus", () => {
    it("delivers an event's arguments to every listener until it is removed", () => {
        const first = vi.fn();
        const second = vi.fn();
        EventBus.$on("expert-mode-change", first);
        EventBus.$on("expert-mode-change", second);

        EventBus.$emit("expert-mode-change", true);
        EventBus.$off("expert-mode-change", first);
        EventBus.$emit("expert-mode-change", false);

        expect(first.mock.calls).toEqual([[true]]);
        expect(second.mock.calls).toEqual([[true], [false]]);
        EventBus.$off("expert-mode-change");
    });

    it("calls a once listener for the first emit only", () => {
        const listener = vi.fn();
        EventBus.$once("device-handler:device-removed", listener);

        EventBus.$emit("device-handler:device-removed", "/dev/ttyACM0");
        EventBus.$emit("device-handler:device-removed", "/dev/ttyACM1");

        expect(listener.mock.calls).toEqual([["/dev/ttyACM0"]]);
    });

    it("removes every listener of an event when none is named", () => {
        const listener = vi.fn();
        EventBus.$on("autocomplete:build:start", listener);

        EventBus.$off("autocomplete:build:start");
        EventBus.$emit("autocomplete:build:start");

        expect(listener).not.toHaveBeenCalled();
    });

    it("keeps events apart", () => {
        const listener = vi.fn();
        EventBus.$on("autocomplete:build:stop", listener);

        EventBus.$emit("autocomplete:build:start");

        expect(listener).not.toHaveBeenCalled();
        EventBus.$off("autocomplete:build:stop");
    });
});
