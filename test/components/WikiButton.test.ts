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
import { mount } from "@vue/test-utils";
import WikiButton from "../../src/components/elements/WikiButton.vue";

function hrefFor(docUrl: string) {
    const wrapper = mount(WikiButton, {
        props: { docUrl },
        global: {
            mocks: { $t: (key: string) => key },
            stubs: { UButton: { props: ["href"], template: '<a :href="href"><slot /></a>' } },
        },
    });
    return wrapper.find("a").attributes("href");
}

describe("WikiButton", () => {
    // These are the URLs the tabs opened before the link moved into WikiButton: content_ready()
    // used to overwrite the button's href with the active tab's key under this rule.
    it.each([
        ["setup", "setup-tab"],
        ["pid_tuning", "pid-tuning-tab"],
        ["led_strip", "led-strip-tab"],
        ["onboard_logging", "onboard-logging-tab"],
        ["firmware_flasher", "firmware-flasher-tab"],
        ["auxiliary", "auxiliary-tab"],
    ])("links the %s tab to its wiki page", (tabKey, page) => {
        expect(hrefFor(tabKey)).toBe(`https://betaflight.com/docs/wiki/app/${page}`);
    });

    it("passes a full https URL through unchanged", () => {
        const url = "https://betaflight.com/docs/wiki/guides/current/some-guide";

        expect(hrefFor(url)).toBe(url);
    });
});
