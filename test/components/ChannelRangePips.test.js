import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChannelRangePips from "../../src/components/elements/ChannelRangePips.vue";
import { CHANNEL_MAX, CHANNEL_MIN } from "../../src/js/utils/rcChannel.js";

describe("ChannelRangePips", () => {
    it("positions each pip at its channel value's percentage of the range", () => {
        const wrapper = mount(ChannelRangePips, {
            props: { pips: [CHANNEL_MIN, 1500, CHANNEL_MAX] },
        });

        const positions = wrapper.findAll(".pip").map((pip) => pip.element.style.left);

        expect(positions).toEqual(["0%", "50%", "100%"]);
    });

    it("clamps pips outside the channel range to the ends", () => {
        const wrapper = mount(ChannelRangePips, {
            props: { pips: [CHANNEL_MIN - 500, CHANNEL_MAX + 500] },
        });

        const positions = wrapper.findAll(".pip").map((pip) => pip.element.style.left);

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
        expect(aux.find(".pip-marker").element.style.left).toBe("25%");
        expect(adjustments.find(".pip-marker").exists()).toBe(false);
    });

    it("omits the marker when no position is given", () => {
        const wrapper = mount(ChannelRangePips, {
            props: { pips: [1500], variant: "aux" },
        });

        expect(wrapper.find(".pip-marker").exists()).toBe(false);
    });
});
