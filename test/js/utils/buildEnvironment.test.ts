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
import { isPreviewOrDevBuild } from "../../../src/js/utils/buildEnvironment";

describe("isPreviewOrDevBuild", () => {
    it.each([
        "https://pr5751.betaflight-configurator.pages.dev/",
        "https://PR5751.betaflight-configurator.pages.dev/",
        "https://master.betaflight-configurator.pages.dev/",
    ])("treats preview deployment %s as preview", (href) => {
        expect(isPreviewOrDevBuild(href, false)).toBe(true);
    });

    it.each([
        // Release native apps are served from localhost and must not count as development.
        "tauri://localhost/",
        "http://tauri.localhost/",
        "https://localhost/",
        "http://localhost:8080/",
        "http://127.0.0.1:8080/",
        "https://app.betaflight.com/",
        "https://betaflight-configurator.pages.dev/",
        "https://pr.betaflight-configurator.pages.dev/",
        "https://pr12abc.betaflight-configurator.pages.dev/",
        "https://master-fork.betaflight-configurator.pages.dev/",
        "https://notmaster.betaflight-configurator.pages.dev/",
        "https://example.com/pr123/",
        "file:///C:/betaflight/index.html",
        "not a url",
    ])("treats %s as release in a production build", (href) => {
        expect(isPreviewOrDevBuild(href, false)).toBe(false);
    });

    it.each(["https://app.betaflight.com/", "tauri://localhost/", "not a url"])(
        "treats %s as development in a dev build",
        (href) => {
            expect(isPreviewOrDevBuild(href, true)).toBe(true);
        },
    );

    describe("build markers", () => {
        afterEach(() => {
            vi.unstubAllEnvs();
        });

        it("treats a preview APK on https://localhost as preview when VITE_PREVIEW_BUILD is set", () => {
            vi.stubEnv("DEV", false);
            vi.stubEnv("VITE_PREVIEW_BUILD", "true");
            expect(isPreviewOrDevBuild("https://localhost/")).toBe(true);
        });

        it.each([undefined, "false", ""])(
            "treats a release build as release when VITE_PREVIEW_BUILD is %s",
            (value) => {
                vi.stubEnv("DEV", false);
                vi.stubEnv("VITE_PREVIEW_BUILD", value);
                expect(isPreviewOrDevBuild("https://localhost/")).toBe(false);
                expect(isPreviewOrDevBuild("tauri://localhost/")).toBe(false);
            },
        );

        it("treats the dev server as development without the preview marker", () => {
            vi.stubEnv("DEV", true);
            vi.stubEnv("VITE_PREVIEW_BUILD", undefined);
            expect(isPreviewOrDevBuild("http://localhost:8080/")).toBe(true);
        });
    });
});
