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
import { createApp, h, nextTick, type App, type Component } from "vue";
import { TooltipProvider } from "reka-ui";
import HelpIcon from "../../src/components/elements/HelpIcon.vue";
import UiBox from "../../src/components/elements/UiBox.vue";

const helpText = "Enable expert mode to show advanced settings.";
let app: App | undefined;
let host: HTMLDivElement | undefined;

function mountHelp(component: Component = HelpIcon, props: Record<string, unknown> = { text: helpText }) {
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp({
        render: () => h(TooltipProvider, null, () => h(component, props, () => h("input"))),
    });
    app.config.globalProperties.$t = (key: string) => (key === "helpIconLabel" ? "Show help" : key);
    app.mount(host);
    return host;
}

function getHelpButton(container: HTMLElement): HTMLButtonElement {
    const button = container.querySelector("button");
    expect(button, "Help must be reachable as a named native button").not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Show help");
    return button!;
}

afterEach(() => {
    app?.unmount();
    host?.remove();
    app = undefined;
    host = undefined;
    vi.unstubAllGlobals();
});

describe("HelpIcon keyboard access", () => {
    it("reveals its help on focus and lets Escape dismiss it", async () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
        const button = getHelpButton(mountHelp());
        expect(button.type).toBe("button");
        button.focus();
        await nextTick();

        expect(document.activeElement).toBe(button);
        await vi.waitFor(() => {
            const descriptionId = button.getAttribute("aria-describedby");
            expect(descriptionId).toBeTruthy();
            expect(document.getElementById(descriptionId!)?.textContent).toContain(helpText);
        });

        button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await vi.waitFor(() => {
            expect(button.hasAttribute("aria-describedby")).toBe(false);
        });
        expect(document.activeElement).toBe(button);
    });

    it.each(["Enter", " "])("does not collapse its enclosing settings box on %j", async (key) => {
        const container = mountHelp(UiBox, {
            title: "Settings",
            help: helpText,
            collapsible: true,
        });
        const button = getHelpButton(container);
        const heading = container.querySelector('[role="button"]')!;
        button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        await nextTick();
        expect(heading.getAttribute("aria-expanded")).toBe("true");

        button.click();
        await nextTick();

        expect(heading.getAttribute("aria-expanded")).toBe("true");
        heading.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await nextTick();
        expect(heading.getAttribute("aria-expanded")).toBe("false");
    });
});
