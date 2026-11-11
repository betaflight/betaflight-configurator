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

const { model, expert } = vi.hoisted(() => ({
    model: { expertMode: false } as { expertMode?: boolean },
    expert: { enabled: true },
}));

vi.mock("../../../src/components/init", () => ({ betaflightModel: model }));
vi.mock("../../../src/js/utils/isExpertModeEnabled", () => ({ isExpertModeEnabled: () => expert.enabled }));

import { updateTabList } from "../../../src/js/utils/updateTabList";

describe("updateTabList", () => {
    beforeEach(() => {
        model.expertMode = false;
        expert.enabled = true;
    });

    it("syncs the expert mode setting to the Vue model", () => {
        updateTabList();
        expect(model.expertMode).toBe(true);

        expert.enabled = false;
        updateTabList();
        expect(model.expertMode).toBe(false);
    });

    it("leaves a model without the field alone", () => {
        delete model.expertMode;
        updateTabList();
        expect("expertMode" in model).toBe(false);
    });
});
