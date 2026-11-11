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
import { createPinia, setActivePinia } from "pinia";
import { useDialogStore } from "../../src/stores/dialog";

describe("dialog store", () => {
    let store: ReturnType<typeof useDialogStore>;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useDialogStore();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts with no dialog open", () => {
        expect(store.activeDialog).toBeNull();
    });

    describe("open", () => {
        it("records the type, props and listeners it was given", () => {
            const yes = vi.fn();
            const no = vi.fn();

            store.open("YesNoDialog", { title: "Title", text: "Body" }, { yes, no });

            expect(store.activeDialog).toMatchObject({
                type: "YesNoDialog",
                props: { title: "Title", text: "Body" },
            });
            expect(store.activeDialog?.listeners.yes).toBe(yes);
            expect(store.activeDialog?.listeners.no).toBe(no);
        });

        it("stamps the dialog with the time it opened", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));

            store.open("WaitDialog");

            expect(store.activeDialog?.id).toBe(Date.parse("2026-01-02T03:04:05Z"));
        });

        it("defaults to empty props and listeners", () => {
            store.open("RebootDialog");

            expect(store.activeDialog?.props).toEqual({});
            expect(store.activeDialog?.listeners).toEqual({});
        });

        it("does not share default props between dialogs", () => {
            store.open("RebootDialog");
            const first = store.activeDialog?.props;
            store.open("RebootDialog");

            expect(store.activeDialog?.props).not.toBe(first);
        });

        it("replaces the open dialog outright rather than merging into it", () => {
            store.open("YesNoDialog", { title: "First", yesText: "Go" }, { yes: vi.fn() });

            store.open("InformationDialog", { title: "Second" });

            expect(store.activeDialog?.type).toBe("InformationDialog");
            expect(store.activeDialog?.props).toEqual({ title: "Second" });
            expect(store.activeDialog?.listeners).toEqual({});
        });
    });

    describe("close", () => {
        it("clears the open dialog", () => {
            store.open("InformationDialog", { title: "Title" });

            store.close();

            expect(store.activeDialog).toBeNull();
        });

        it("is harmless when nothing is open", () => {
            store.close();

            expect(store.activeDialog).toBeNull();
        });
    });

    describe("updateProps", () => {
        it("merges into the open dialog's props, new values winning", () => {
            store.open("WaitDialog", { title: "Waiting", cancelText: "Cancel" });

            store.updateProps({ title: "Still waiting", showCancel: true });

            expect(store.activeDialog?.props).toEqual({
                title: "Still waiting",
                cancelText: "Cancel",
                showCancel: true,
            });
        });

        it("leaves the caller's original props object untouched", () => {
            const props = { title: "Waiting" };
            store.open("WaitDialog", props);

            store.updateProps({ title: "Done" });

            expect(props).toEqual({ title: "Waiting" });
        });

        it("keeps the type, id and listeners", () => {
            const cancel = vi.fn();
            store.open("WaitDialog", { title: "Waiting" }, { cancel });
            const { id } = store.activeDialog ?? {};

            store.updateProps({ title: "Done" });

            expect(store.activeDialog?.type).toBe("WaitDialog");
            expect(store.activeDialog?.id).toBe(id);
            expect(store.activeDialog?.listeners.cancel).toBe(cancel);
        });

        it("does not open a dialog when none is open", () => {
            store.updateProps({ title: "Orphan" });

            expect(store.activeDialog).toBeNull();
        });
    });
});
