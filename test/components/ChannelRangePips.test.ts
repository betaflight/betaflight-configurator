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
import ChannelRangePips from "../../src/components/elements/ChannelRangePips.vue";
import { CHANNEL_MAX, CHANNEL_MIN } from "../../src/js/utils/rcChannel";

describe("ChannelRangePips", () => {
    it("positions each pip at its channel value's percentage of the range", () => {
        const wrapper = mount(ChannelRangePips, {
            props: { pips: [CHANNEL_MIN, 1500, CHANNEL_MAX] },
        });

        const positions = wrapper.findAll<HTMLElement>(".pip").map((pip) => pip.element.style.insetInlineStart);

        expect(positions).toEqual(["0%", "50%", "100%"]);
    });

    it("clamps pips outside the channel range to the ends", () => {
        const wrapper = mount(ChannelRangePips, {
            props: { pips: [CHANNEL_MIN - 500, CHANNEL_MAX + 500] },
        });

        const positions = wrapper.findAll<HTMLElement>(".pip").map((pip) => pip.element.style.insetInlineStart);

        expect(positions).toEqual(["0%", "100%"]);
    });

    it("renders the marker only for the aux variant", () => {
        const aux = mount(ChannelRangePips, {
            props: { pips: [1500], markerPercent: 25, variant: "aux" },
        });
        const adjustments = mount(ChannelRangePips, {
            props: { pips: [1500], markerPercent: 25, variant: "adjustments" },
        });

        expect(aux.find(".pip-marker").exists()).toBe(true);
        expect(aux.find<HTMLElement>(".pip-marker").element.style.insetInlineStart).toBe("25%");
        expect(adjustments.find(".pip-marker").exists()).toBe(false);
    });

    it("omits the marker when no position is given", () => {
        const wrapper = mount(ChannelRangePips, {
            props: { pips: [1500], variant: "aux" },
        });

        expect(wrapper.find(".pip-marker").exists()).toBe(false);
    });
});
