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

import { describe, expect, it } from "vitest";
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
});
