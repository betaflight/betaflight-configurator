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

        // Click the title pill. When collapsed it is rendered in normal flow
        // (relative, not absolute) so it stays visible, hence select by role.
        const pill = wrapper.container.querySelector("[role='button']");
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

        // Collapsible pill is a button regardless of open/closed state.
        const pill = wrapper.container.querySelector("[role='button']");
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

        // Non-collapsible pills carry no role="button", so select by the
        // (always-absolute) positioning class here.
        const pill = wrapper.container.querySelector("div[class*='absolute']");
        pill.click();
        await nextTick();

        // Body should still be visible — no toggle happened
        const hiddenBodies = Array.from(wrapper.container.querySelectorAll("div")).filter(
            (el) => el.style.display === "none",
        );
        expect(hiddenBodies).toHaveLength(0);
    });

    it("keeps border-2 transparent while collapsed (stable geometry) and colours it when open", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Border Test",
            collapsible: true,
            defaultOpen: false,
        });
        await nextTick();

        // border-2 is always present so the box geometry — and the absolutely
        // positioned title pill — does not shift on toggle; collapsed = transparent.
        const outerDiv = wrapper.container.querySelector("div.relative.rounded-lg");
        expect(outerDiv).toBeTruthy();
        expect(outerDiv.classList.contains("border-2")).toBe(true);
        expect(outerDiv.classList.contains("border-transparent")).toBe(true);
        // Collapsed box reserves height so the pill's lower half does not overlap siblings.
        expect(outerDiv.classList.contains("min-h-6")).toBe(true);

        // Open it
        const pill = wrapper.container.querySelector("[role='button']");
        pill.click();
        await nextTick();

        // When open, the transparent border is replaced by the coloured border
        // and the reserved min-height is dropped.
        expect(outerDiv.classList.contains("border-2")).toBe(true);
        expect(outerDiv.classList.contains("border-transparent")).toBe(false);
        expect(outerDiv.classList.contains("min-h-6")).toBe(false);
    });

    it("keeps the title pill absolutely positioned in both collapsed and open states", async () => {
        wrapper = mountWithProps(UiBox, {
            title: "Pill Position",
            collapsible: true,
            defaultOpen: false,
        });
        await nextTick();

        // Collapsed: pill stays anchored to the top border (no relative-flow reflow)
        let pill = wrapper.container.querySelector("[role='button']");
        expect(pill.classList.contains("absolute")).toBe(true);
        expect(pill.classList.contains("relative")).toBe(false);

        pill.click();
        await nextTick();

        // Open: still absolute in the same spot
        pill = wrapper.container.querySelector("[role='button']");
        expect(pill.classList.contains("absolute")).toBe(true);
        expect(pill.classList.contains("relative")).toBe(false);
    });

    it("does not render spacer div when not collapsible", async () => {
        wrapper = mountWithProps(UiBox, { title: "No Spacer", collapsible: false });
        await nextTick();

        const spacer = wrapper.container.querySelector("div.pb-2");
        expect(spacer).toBeNull();
    });

    it("renders collapsible pill (role=button) only when collapsible", async () => {
        // collapsible=true: the pill div gets role="button" and aria-expanded
        wrapper = mountWithProps(UiBox, {
            title: "With Chevron",
            collapsible: true,
            defaultOpen: true,
        });
        await nextTick();

        const collapsiblePill = wrapper.container.querySelector("[role='button']");
        expect(collapsiblePill).toBeTruthy();
        expect(collapsiblePill.getAttribute("aria-expanded")).toBe("true");
        wrapper.unmount();
        wrapper = null;

        // collapsible=false: no role="button" on the pill
        const wrapper2 = mountWithProps(UiBox, {
            title: "No Chevron",
            collapsible: false,
        });
        await nextTick();

        const nonCollapsiblePill = wrapper2.container.querySelector("[role='button']");
        expect(nonCollapsiblePill).toBeNull();
        wrapper2.unmount();
    });
});
