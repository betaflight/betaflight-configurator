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
import { pinia } from "../../../src/js/pinia_instance";
import { useDialogStore } from "../../../src/stores/dialog";
import { showErrorDialog } from "../../../src/js/utils/showErrorDialog";

vi.mock("../../../src/js/localization", () => ({
    i18n: { getMessage: (key: string) => `t:${key}` },
}));

describe("showErrorDialog", () => {
    const store = useDialogStore(pinia);

    beforeEach(() => {
        store.close();
    });

    it("opens an information dialog with the message on the app's Pinia", () => {
        showErrorDialog("Storage device not ready");

        expect(store.activeDialog?.type).toBe("InformationDialog");
        expect(store.activeDialog?.props).toEqual({
            title: "t:errorTitle",
            text: "Storage device not ready",
            confirmText: "t:close",
        });
    });

    it("closes the dialog when it is confirmed", () => {
        showErrorDialog("Storage device not ready");
        const confirm = store.activeDialog?.listeners.confirm as () => void;

        confirm();

        expect(store.activeDialog).toBeNull();
    });
});
