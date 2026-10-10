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

import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAppInfoStore } from "../../src/stores/appInfo";

beforeEach(() => {
    setActivePinia(createPinia());
});

describe("displayVersion", () => {
    it("appends the git revision", () => {
        const appInfo = useAppInfoStore();
        appInfo.version = "2026.6.0";
        appInfo.gitRevision = "abc1234";

        expect(appInfo.displayVersion).toBe("2026.6.0 (abc1234)");
    });

    // Development builds carry the revision in the version already, e.g. "2026.6.0-debug-abc1234".
    it("does not repeat a revision the version already contains", () => {
        const appInfo = useAppInfoStore();
        appInfo.version = "2026.6.0-debug-abc1234";
        appInfo.gitRevision = "abc1234";

        expect(appInfo.displayVersion).toBe("2026.6.0-debug-abc1234");
    });
});
