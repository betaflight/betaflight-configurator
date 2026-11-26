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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { TooltipProvider } from "reka-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppToolbar from "../../src/blackbox-viewer/components/AppToolbar.vue";
import { useLogStore } from "../../src/blackbox-viewer/stores/log";
import { probeVideoExport } from "../../src/blackbox-viewer/video_export";
import type { FlightLog } from "../../src/blackbox-viewer/flightlog";

vi.mock("../../src/blackbox-viewer/video_export", () => ({ probeVideoExport: vi.fn() }));

describe("Blackbox Viewer compact actions", () => {
    let app: App | null = null;
    let host: HTMLDivElement | null = null;

    afterEach(() => {
        app?.unmount();
        host?.remove();
        app = null;
        host = null;
        vi.resetAllMocks();
    });

    async function mountToolbar(options: { hasLog: boolean; videoAvailable: boolean }) {
        vi.mocked(probeVideoExport).mockResolvedValue(
            options.videoAvailable
                ? { canEncode: true, codec: "avc", container: "mp4", extension: "mp4", description: "MP4 video", saveMode: "stream", androidBridge: false }
                : { canEncode: false, reason: "No supported video encoder" },
        );
        const pinia = createPinia();
        setActivePinia(pinia);
        if (options.hasLog) useLogStore().setFlightLog({} as FlightLog);
        host = document.createElement("div");
        document.body.appendChild(host);
        const callbacks = {
            onExportCsv: vi.fn(),
            onExportGpx: vi.fn(),
            onExportWorkspaces: vi.fn(),
            onExportVideo: vi.fn(),
            onOpenSettings: vi.fn(),
        };
        app = createApp({ render: () => h(TooltipProvider, null, () => h(AppToolbar, callbacks)) });
        app.use(pinia);
        app.mount(host);
        await Promise.resolve();
        await nextTick();
        await Promise.resolve();
        await nextTick();
        return callbacks;
    }

    async function openCompactActions() {
        const trigger = host!.querySelector<HTMLButtonElement>('[data-testid="blackbox-compact-actions"]');
        expect(trigger).toBeTruthy();
        trigger!.click();
        await nextTick();
    }

    it("shows settings but no exports before a log is loaded", async () => {
        await mountToolbar({ hasLog: false, videoAvailable: false });
        await openCompactActions();
        expect(document.body.textContent).toContain("User Settings");
        expect(document.body.textContent).not.toContain("Export CSV");
    });

    it("forwards export selections and keeps unsupported video disabled", async () => {
        const callbacks = await mountToolbar({ hasLog: true, videoAvailable: false });
        await openCompactActions();
        const csv = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes("Export CSV"));
        expect(csv).toBeTruthy();
        csv!.click();
        await nextTick();
        expect(callbacks.onExportCsv).toHaveBeenCalledOnce();
        await openCompactActions();
        const video = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
            el.textContent?.includes("Export Video"),
        );
        expect(video).toBeTruthy();
        expect(video!.getAttribute("aria-disabled")).toBe("true");
        video!.click();
        await nextTick();
        expect(callbacks.onExportVideo).not.toHaveBeenCalled();
    });

    it("makes video export selectable when the capability probe succeeds", async () => {
        const callbacks = await mountToolbar({ hasLog: true, videoAvailable: true });
        await openCompactActions();
        const video = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes("Export Video"));
        expect(video).toBeTruthy();
        expect(video!.getAttribute("aria-disabled")).not.toBe("true");
        video!.click();
        await nextTick();
        expect(callbacks.onExportVideo).toHaveBeenCalledOnce();
    });
});
