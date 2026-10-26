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
import { createPinia, setActivePinia } from "pinia";

// Every test starts from a fresh module registry and imports both modules after it, keeping the test
// and gui_log on the same store module instance.
beforeEach(() => {
    vi.resetModules();
    setActivePinia(undefined);
});

async function loadModules() {
    const { useLogStore } = await import("../../src/stores/log");
    const { gui_log } = await import("../../src/js/gui_log");
    return { useLogStore, gui_log };
}

const messages = (useLogStore: () => { entries: { message: string }[] }) =>
    useLogStore().entries.map((entry) => entry.message);

describe("gui_log", () => {
    it("appends the message to the log store", async () => {
        setActivePinia(createPinia());
        const { useLogStore, gui_log } = await loadModules();

        gui_log("connected");

        expect(messages(useLogStore)).toEqual(["connected"]);
    });

    it("keeps messages in the order they were logged", async () => {
        setActivePinia(createPinia());
        const { useLogStore, gui_log } = await loadModules();

        gui_log("first");
        gui_log("second");

        expect(messages(useLogStore)).toEqual(["first", "second"]);
    });

    it("swallows the error when Pinia is not active yet", async () => {
        const { gui_log } = await loadModules();

        expect(() => gui_log("logged during early boot")).not.toThrow();
    });

    it("starts logging once Pinia becomes active after an early call", async () => {
        const { useLogStore, gui_log } = await loadModules();
        gui_log("dropped during early boot");

        setActivePinia(createPinia());
        gui_log("logged after boot");

        expect(messages(useLogStore)).toEqual(["logged after boot"]);
    });

    it("logs into the active Pinia, not the first one it saw", async () => {
        const { useLogStore, gui_log } = await loadModules();
        const first = createPinia();
        const second = createPinia();

        setActivePinia(first);
        gui_log("into the first");
        setActivePinia(second);
        gui_log("into the second");

        expect(useLogStore(first).entries.map((entry) => entry.message)).toEqual(["into the first"]);
        expect(useLogStore(second).entries.map((entry) => entry.message)).toEqual(["into the second"]);
    });
});
