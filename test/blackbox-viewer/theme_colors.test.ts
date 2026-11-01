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
import { ThemeColors } from "../../src/blackbox-viewer/theme_colors";
import { useAppStore } from "../../src/blackbox-viewer/stores/app";

describe("ThemeColors", () => {
    let styles: Map<Element, Record<string, string>>;

    beforeEach(() => {
        setActivePinia(createPinia());
        ThemeColors.clearCache();
        document.body.innerHTML = "";
        styles = new Map();
        vi.spyOn(window, "getComputedStyle").mockImplementation(
            (element: Element) =>
                ({ getPropertyValue: (name: string) => styles.get(element)?.[name] ?? "" }) as CSSStyleDeclaration,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("reads a variable from the viewer root, trimmed, and caches it", () => {
        const root = document.createElement("div");
        root.className = "blackbox-viewer-root";
        document.body.appendChild(root);
        styles.set(root, { "--graph-text": "  #eee " });

        expect(ThemeColors.getGraphText()).toBe("#eee");

        styles.set(root, { "--graph-text": "#000" });
        expect(ThemeColors.getGraphText()).toBe("#eee");

        ThemeColors.clearCache();
        expect(ThemeColors.getGraphText()).toBe("#000");
    });

    it("falls back to the document element outside the viewer", () => {
        styles.set(document.documentElement, { "--graph-background": "#111" });

        expect(ThemeColors.getGraphBackground()).toBe("#111");
    });

    it("names each graph colour after its variable", () => {
        styles.set(document.documentElement, {
            "--graph-grid": "grid",
            "--graph-text-secondary": "secondary",
            "--graph-axis": "axis",
        });

        expect([ThemeColors.getGraphGrid(), ThemeColors.getGraphTextSecondary(), ThemeColors.getGraphAxis()]).toEqual([
            "grid",
            "secondary",
            "axis",
        ]);
    });

    it("reports the app store's dark theme", () => {
        useAppStore().darkThemeEnabled = true;

        expect(ThemeColors.isDarkTheme()).toBe(true);
    });
});
