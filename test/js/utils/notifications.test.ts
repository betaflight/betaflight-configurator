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

import { afterEach, describe, expect, it, vi } from "vitest";
import NotificationManager from "../../../src/js/utils/notifications";

/** Stands in for the browser's Notification: a permission state, a prompt and a constructor. */
function stubNotification(permission: NotificationPermission, answer: NotificationPermission = permission) {
    const created: Array<{ title: string; options?: NotificationOptions }> = [];
    class FakeNotification {
        static permission = permission;
        static requestPermission = vi.fn(async () => answer);
        constructor(title: string, options?: NotificationOptions) {
            created.push({ title, options });
        }
    }
    vi.stubGlobal("Notification", FakeNotification);
    return { FakeNotification, created };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("NotificationManager.requestPermission", () => {
    it("asks the user only while the permission is undecided", async () => {
        const { FakeNotification } = stubNotification("default", "granted");
        await expect(NotificationManager.requestPermission()).resolves.toBe("granted");
        expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("returns a decided permission without asking again", async () => {
        const { FakeNotification } = stubNotification("denied");
        await expect(NotificationManager.requestPermission()).resolves.toBe("denied");
        expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    });
});

describe("NotificationManager.showNotification", () => {
    it("creates the notification once permission is granted", () => {
        const { created } = stubNotification("granted");
        NotificationManager.showNotification("Betaflight App", { body: "done" });
        expect(created).toEqual([{ title: "Betaflight App", options: { body: "done" } }]);
    });

    it("throws rather than creating a notification without permission", () => {
        const { created } = stubNotification("default");
        expect(() => NotificationManager.showNotification("Betaflight App")).toThrow("permission not granted");
        expect(created).toEqual([]);
    });
});

describe("NotificationManager.checkPermission", () => {
    it("reports the current permission", () => {
        stubNotification("denied");
        expect(NotificationManager.checkPermission()).toBe("denied");
    });
});
