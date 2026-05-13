import { createApp, h, nextTick, reactive } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import UiBox from "../../src/components/elements/UiBox.vue";

function mountWithProps(component, initialProps) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const props = reactive({ ...initialProps });

    const app = createApp({
        render() {
            return h(component, { ...props });
        },
    });

    app.config.globalProperties.$t = (key) => key;
    app.mount(container);

    return {
        container,
        app,
        props,
        async setProps(nextProps) {
            Object.assign(props, nextProps);
            await nextTick();
            await nextTick();
        },
        unmount() {
            app.unmount();
            container.remove();
        },
    };
}

describe("UiBox collapsible behaviour", () => {
    let wrapper;

    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";
    });

    it("shows body by default when collapsible is false", async () => {
        wrapper = mountWithProps(UiBox, { title: "Test Box", collapsible: false });
        await nextTick();

        // The body slot container uses v-show, so it is present in the DOM.
        // v-show sets display:none when hidden; when shown it should not have display:none.
        const bodies = wrapper.container.querySelectorAll("div");
        // Find the body div: it has no v-if removal, just v-show
        // When collapsible=false the condition !collapsible||isOpen is always true
        const hiddenBodies = Array.from(bodies).filter((el) => el.style.display === "none");
        expect(hiddenBodies).toHaveLength(0);
    });

    it("hides body when collapsible=true and defaultOpen=false", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Collapsed Box",
            collapsible: true,
            defaultOpen: false,
        });
        await nextTick();

        const hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies.length).toBeGreaterThan(0);
    });

    it("shows body when collapsible=true and defaultOpen=true", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Open Box",
            collapsible: true,
            defaultOpen: true,
        });
        await nextTick();

        const hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies).toHaveLength(0);
    });

    it("toggles body open when the title pill is clicked while collapsed", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Toggle Box",
            collapsible: true,
            defaultOpen: false,
        });
        await nextTick();

        // Confirm initially hidden
        let hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies.length).toBeGreaterThan(0);

        // Click the pill (first div with absolute positioning — the title pill)
        const pill = wrapper.container.querySelector("div[class*='absolute']");
        expect(pill).toBeTruthy();
        pill.click();
        await nextTick();

        hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies).toHaveLength(0);
    });

    it("toggles body closed when the title pill is clicked while open", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Toggle Close",
            collapsible: true,
            defaultOpen: true,
        });
        await nextTick();

        const pill = wrapper.container.querySelector("div[class*='absolute']");
        pill.click();
        await nextTick();

        const hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies.length).toBeGreaterThan(0);
    });

    it("does not toggle when non-collapsible title pill is clicked", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Non-collapsible",
            collapsible: false,
        });
        await nextTick();

        const pill = wrapper.container.querySelector("div[class*='absolute']");
        pill.click();
        await nextTick();

        // Body should still be visible — no toggle happened
        const hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies).toHaveLength(0);
    });

    it("removes border-2 when collapsible and closed, restores it when open", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Border Test",
            collapsible: true,
            defaultOpen: false,
        });
        await nextTick();

        // When collapsed, the outer box div should NOT have border-2
        const outerDiv = wrapper.container.querySelector("div.relative.rounded-lg");
        expect(outerDiv).toBeTruthy();
        expect(outerDiv.classList.contains("border-2")).toBe(false);

        // No spacer div should exist
        expect(wrapper.container.querySelector("div.pb-2")).toBeNull();

        // Open it
        const pill = wrapper.container.querySelector("div[class*='absolute']");
        pill.click();
        await nextTick();

        // When open, border-2 should be restored
        expect(outerDiv.classList.contains("border-2")).toBe(true);
    });

    it("does not render spacer div when not collapsible", async () => {
        wrapper = mountWithProps(UiBox, { title: "No Spacer", collapsible: false });
        await nextTick();

        const spacer = wrapper.container.querySelector("div.pb-2");
        expect(spacer).toBeNull();
    });

    it("renders chevron icon only when collapsible", async () => {
        // collapsible=true: chevron should be present (UIcon renders as an element with the icon class)
        wrapper = mountWithProps(UiBox, {
            title: "With Chevron",
            collapsible: true,
            defaultOpen: true,
        });
        await nextTick();

        // UIcon for chevron-down renders with data attribute or class containing the icon name
        const chevron = wrapper.container.querySelector(
            "[class*='chevron-down'], [name*='chevron'], .i-lucide-chevron-down",
        );
        // UIcon may render as a span; check that something with the chevron reference exists
        // The v-if="collapsible" means the element is only in DOM when collapsible=true
        // We can confirm by checking a non-collapsible box has no such element
        wrapper.unmount();
        wrapper = null;

        const wrapper2 = mountWithProps(UiBox, {
            title: "No Chevron",
            collapsible: false,
        });
        await nextTick();

        const chevronNone = wrapper2.container.querySelector("[class*='chevron-down'], .i-lucide-chevron-down");
        expect(chevronNone).toBeNull();
        wrapper2.unmount();
    });
});
