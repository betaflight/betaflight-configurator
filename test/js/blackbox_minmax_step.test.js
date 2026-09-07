import { describe, expect, it } from "vitest";
import { createApp, h, nextTick, ref } from "vue";
import { NumberFieldInput, NumberFieldRoot } from "reka-ui";

// The blackbox graph config dialog sets a coarse step of 10 on the curve min/max inputs so the
// spinner moves in useful jumps. reka-ui snaps typed values onto that step unless snapping is
// turned off, which silently rewrote anything finer: typing 5 landed on 10, and 3 landed on 0.
// UInputNumber only forwards stepSnapping when it is passed explicitly, because the prop has no
// default of its own, so leaving it off means reka's default of true applies. Pinned here because
// a dependency bump could quietly bring the snapping back.
async function commitTypedValue(rootProps, typed) {
    const model = ref(rootProps.modelValue);
    const app = createApp({
        render: () =>
            h(
                NumberFieldRoot,
                {
                    ...rootProps,
                    modelValue: model.value,
                    "onUpdate:modelValue": (value) => {
                        model.value = value;
                    },
                },
                () => h(NumberFieldInput),
            ),
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();

    const input = host.querySelector("input");
    input.value = String(typed);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();

    const committed = model.value;
    app.unmount();
    host.remove();
    return committed;
}

const COARSE_STEP = 10;
const FINE_STEP = 0.1;

describe("blackbox curve min/max inputs", () => {
    it("keeps a typed value finer than the coarse step", async () => {
        expect(await commitTypedValue({ modelValue: -50, step: COARSE_STEP, stepSnapping: false }, 5)).toBe(5);
        expect(await commitTypedValue({ modelValue: -50, step: COARSE_STEP, stepSnapping: false }, 3)).toBe(3);
        expect(await commitTypedValue({ modelValue: -50, step: COARSE_STEP, stepSnapping: false }, 2.5)).toBe(2.5);
        expect(await commitTypedValue({ modelValue: 50, step: COARSE_STEP, stepSnapping: false }, -5)).toBe(-5);
    });

    it("would round the same values away with snapping left on", async () => {
        expect(await commitTypedValue({ modelValue: -50, step: COARSE_STEP }, 5)).toBe(10);
        expect(await commitTypedValue({ modelValue: -50, step: COARSE_STEP }, 3)).toBe(0);
    });

    it("leaves the fine step alone either way", async () => {
        expect(await commitTypedValue({ modelValue: -50, step: FINE_STEP, stepSnapping: false }, 2.5)).toBe(2.5);
        expect(await commitTypedValue({ modelValue: -50, step: FINE_STEP }, 2.5)).toBe(2.5);
    });
});
