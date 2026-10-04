import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import BoardAlignmentWizardDialog from "../../src/components/dialogs/BoardAlignmentWizardDialog.vue";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { useFlightControllerStore } from "../../src/stores/fc";

vi.mock("../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));
vi.mock("../../src/js/model", () => ({
    default: class {
        resize() {}
        rotateTo() {}
        dispose() {}
    },
}));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

const ButtonStub = {
    props: ["label", "disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click', $event)">{{ label }}</button>`,
};

function mountDialog() {
    return mount(BoardAlignmentWizardDialog, {
        props: { currentAlignment: { roll: 0, pitch: 0, yaw: 0 } },
        global: { stubs: { UButton: ButtonStub }, mocks: { $t: (key: string) => key } },
    });
}

function button(wrapper: ReturnType<typeof mountDialog>, label: string) {
    const found = wrapper.findAll("button").find((b) => b.text() === label);
    if (!found) {
        throw new Error(`no ${label} button`);
    }
    return found;
}

/** The MSP reply callback of the most recent send_message call. */
function lastReply() {
    const call = vi.mocked(MSP.send_message).mock.lastCall;
    return call?.[3] as () => void;
}

describe("BoardAlignmentWizardDialog IMU polling", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        setActivePinia(createPinia());
        const fcStore = useFlightControllerStore();
        fcStore.config.activeSensors = 1; // accelerometer present
        fcStore.config.configurationProblems = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts polling the raw IMU on start and re-requests 50 ms after each reply", async () => {
        const wrapper = mountDialog();

        await button(wrapper, "boardAlignmentWizard-Start").trigger("click");
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(
            MSPCodes.MSP_RAW_IMU,
            false,
            false,
            expect.any(Function),
        );

        lastReply()();
        vi.advanceTimersByTime(49);
        expect(MSP.send_message).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(MSP.send_message).toHaveBeenCalledTimes(2);
        expect(vi.mocked(MSP.send_message).mock.lastCall?.[0]).toBe(MSPCodes.MSP_RAW_IMU);

        wrapper.unmount();
    });

    it("feeds each IMU reply to the pose detector", async () => {
        const wrapper = mountDialog();
        await button(wrapper, "boardAlignmentWizard-Start").trigger("click");

        // The detector needs a full buffer of six samples; with the store's zeroed accel it then
        // reports the missing signal.
        for (let i = 0; i < 6; i++) {
            lastReply()();
            vi.advanceTimersByTime(50);
        }
        await wrapper.vm.$nextTick();

        expect(wrapper.find(".wizard-detail").text()).toContain("No accel signal");
        wrapper.unmount();
    });

    it("stops polling when the wizard is cancelled", async () => {
        const wrapper = mountDialog();
        await button(wrapper, "boardAlignmentWizard-Start").trigger("click");

        await button(wrapper, "boardAlignmentWizard-Cancel").trigger("click");
        lastReply()();
        vi.advanceTimersByTime(1000);

        expect(MSP.send_message).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it("stops polling on unmount", async () => {
        const wrapper = mountDialog();
        await button(wrapper, "boardAlignmentWizard-Start").trigger("click");
        lastReply()();

        wrapper.unmount();
        vi.advanceTimersByTime(1000);

        expect(MSP.send_message).toHaveBeenCalledTimes(1);
    });
});
