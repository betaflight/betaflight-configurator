import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UTabs from "@nuxt/ui/components/Tabs.vue";
import SubtabNav from "../../src/components/elements/SubtabNav.vue";

const items = [
    { label: "Rates", value: "rates" },
    { label: "Filters", value: "filters" },
];

describe("SubtabNav", () => {
    it("forwards its items and selection to UTabs", () => {
        const wrapper = mount(SubtabNav, {
            props: { items, modelValue: "filters" },
        });
        const tabs = wrapper.findComponent(UTabs);

        expect(tabs.props("items")).toEqual(items);
        expect(tabs.props("modelValue")).toBe("filters");
    });

    it("re-emits the tab selection so the parent owns the state", async () => {
        const wrapper = mount(SubtabNav, {
            props: { items, modelValue: "rates" },
        });

        await wrapper.findComponent(UTabs).vm.$emit("update:modelValue", "filters");

        expect(wrapper.emitted("update:modelValue")).toEqual([["filters"]]);
    });

    it("does not change the selection on its own", async () => {
        const wrapper = mount(SubtabNav, {
            props: { items, modelValue: "rates" },
        });

        await wrapper.findComponent(UTabs).vm.$emit("update:modelValue", "filters");

        expect(wrapper.findComponent(UTabs).props("modelValue")).toBe("rates");
    });
});
