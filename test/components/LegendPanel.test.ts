import { beforeEach, describe, expect, it } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ComponentPublicInstance } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import LegendPanel from "../../src/blackbox-viewer/components/LegendPanel.vue";
import { useAppStore } from "../../src/blackbox-viewer/stores/app";
import { useGraphStore } from "../../src/blackbox-viewer/stores/graph";
import { useLogStore } from "../../src/blackbox-viewer/stores/log";

function clickGraphSetup() {
    const wrapper = shallowMount(LegendPanel, { global: { renderStubDefaultSlot: true } });
    const button = wrapper
        .findAllComponents<ComponentPublicInstance>(UButton)
        .find((b) => b.attributes("label") === "Graph setup");
    expect(button).toBeDefined();
    button?.vm.$emit("click");
    wrapper.unmount();
}

describe("LegendPanel graph setup", () => {
    beforeEach(() => setActivePinia(createPinia()));

    it("does not open the graph dialog before a log is loaded", () => {
        clickGraphSetup();
        expect(useAppStore().graphConfigDialogOpen).toBe(false);
    });

    it("opens the graph dialog once a log and a graph config are loaded", () => {
        useLogStore().flightLog = {} as never;
        useGraphStore().activeGraphConfig = {} as never;
        clickGraphSetup();
        expect(useAppStore().graphConfigDialogOpen).toBe(true);
    });
});
