import { createApp, defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sortableCreate = vi.hoisted(() => vi.fn(() => ({ destroy: vi.fn() })));

vi.mock("sortablejs", () => ({
    default: { create: sortableCreate },
}));

import HeaderDialog from "../../src/blackbox-viewer/components/HeaderDialog.vue";
import { FIRMWARE_TYPE_BETAFLIGHT } from "../../src/blackbox-viewer/flightlog_fielddefs.js";
import { loadHeaderLayout, saveHeaderLayout } from "../../src/blackbox-viewer/header_layout";

const ElementStub = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
        return () => h("div", attrs, slots.default?.());
    },
});

const ButtonStub = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
        return () => h("button", attrs, slots.default?.());
    },
});

describe("Blackbox header layout interactions", () => {
    let app;
    let host;

    beforeEach(() => {
        localStorage.clear();
        sortableCreate.mockClear();
        host = document.createElement("div");
        document.body.appendChild(host);
        app = createApp({
            render: () =>
                h(HeaderDialog, {
                    open: true,
                    sysConfig: {
                        firmwareType: FIRMWARE_TYPE_BETAFLIGHT,
                        firmwareVersion: "4.5.0",
                        rates_type: 0,
                        rates: [1, 1, 1],
                        rc_rates: [1, 1, 1],
                        rc_expo: [0, 0, 0],
                        debug_mode: 0,
                    },
                }),
        });
        app.component("UButton", ButtonStub);
        app.component("UIcon", ElementStub);
        app.component("UInput", ElementStub);
        app.component("UTable", ElementStub);
        app.mount(host);
    });

    afterEach(() => {
        app?.unmount();
        host?.remove();
        app = null;
        host = null;
    });

    it("keeps mouse visibility changes and an imported layout in sync", async () => {
        await nextTick();
        const findButton = (title) => [...host.querySelectorAll("button")].find((button) => button.title === title);

        const hideRates = findButton("Hide Rates");
        expect(hideRates).toBeTruthy();
        hideRates.click();
        await nextTick();

        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(findButton("Show Rates")).toBeTruthy();

        saveHeaderLayout({
            hiddenGroups: [],
            hiddenFields: [],
            paneOrder: ["Rates"],
        });
        await nextTick();

        expect(findButton("Hide Rates")).toBeTruthy();
    });

    it("persists the pane order produced by a drag", async () => {
        await nextTick();
        const ratesPane = host.querySelector('[data-group="Rates"]');
        const parametersPane = host.querySelector('[data-group="Parameters"]');
        const grid = ratesPane.parentElement;
        expect(parametersPane).toBeTruthy();

        grid.insertBefore(parametersPane, ratesPane);
        sortableCreate.mock.calls[0][1].onEnd();

        expect(loadHeaderLayout().paneOrder.slice(0, 2)).toEqual(["Parameters", "Rates"]);
    });
});
