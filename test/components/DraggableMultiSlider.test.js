import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import { ConfigProvider } from "reka-ui";
import DraggableMultiSlider from "../../src/components/elements/DraggableMultiSlider.vue";

// Reka's slider measures its thumbs on mount; jsdom has no ResizeObserver and never lays out.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const TRACK_WIDTH = 1200;

// The slider spans 900..2100 over a 1200px track, so one pixel of pointer travel is worth exactly
// one channel unit and the expected values read straight off the drag distance. `ConfigProvider` is
// what `UApp` uses to hand Reka the text direction, so it is also what flips the slider in RTL.
function mountSlider(dir) {
    const emitted = [];

    const wrapper = mount(
        {
            render() {
                return h(ConfigProvider, { dir }, () =>
                    h(DraggableMultiSlider, {
                        modelValue: [1300, 1700],
                        "onUpdate:modelValue": (range) => emitted.push(range),
                    }),
                );
            },
        },
        { attachTo: document.body },
    );

    const track = wrapper.element.querySelector('[data-slot="track"]');
    const range = wrapper.element.querySelector('[data-slot="range"]');

    track.getBoundingClientRect = () => ({
        width: TRACK_WIDTH,
        height: 10,
        top: 0,
        left: 0,
        right: TRACK_WIDTH,
        bottom: 10,
    });
    range.setPointerCapture = () => {};
    range.hasPointerCapture = () => false;
    range.releasePointerCapture = () => {};

    const drag = (fromX, toX) => {
        range.dispatchEvent(
            new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: fromX, bubbles: true }),
        );
        range.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: toX, bubbles: true }));
        range.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: toX, bubbles: true }));
        return emitted[emitted.length - 1];
    };

    return { wrapper, drag };
}

describe("DraggableMultiSlider", () => {
    it("follows the pointer to the right in LTR", () => {
        const { drag } = mountSlider("ltr");

        expect(drag(100, 200)).toEqual([1400, 1800]);
    });

    it("follows the pointer to the left in RTL, where the slider is mirrored", () => {
        const { drag } = mountSlider("rtl");

        expect(drag(200, 100)).toEqual([1400, 1800]);
    });

    it("lowers the range when the pointer moves towards the low end in RTL", () => {
        const { drag } = mountSlider("rtl");

        expect(drag(100, 200)).toEqual([1200, 1600]);
    });

    it("keeps the dragged range inside the channel limits", () => {
        const { drag } = mountSlider("ltr");

        expect(drag(0, 5000)).toEqual([1700, 2100]);
    });
});
