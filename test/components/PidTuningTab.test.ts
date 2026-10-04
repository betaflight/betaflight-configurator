import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ComponentPublicInstance } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import USelect from "@nuxt/ui/components/Select.vue";
import PidTuningTab from "../../src/components/tabs/PidTuningTab.vue";
import SubtabNav from "../../src/components/elements/SubtabNav.vue";
import FC from "../../src/js/fc";
import { usePidTuningStore } from "../../src/stores/pidTuning";
import { CopyProfileType } from "../../src/composables/pidTuning/usePidTuningMsp";

const msp = vi.hoisted(() => ({
    loadPidTuningData: vi.fn(),
    writePidTuningConfig: vi.fn(),
    selectPidProfile: vi.fn(),
    selectRateProfile: vi.fn(),
    copyProfile: vi.fn(),
    resetPidProfile: vi.fn(),
}));
const saveToEeprom = vi.hoisted(() => vi.fn());
const openCopyProfile = vi.hoisted(() => vi.fn());

// Not importOriginal: the real module pulls in the whole MSP stack.
vi.mock("../../src/composables/pidTuning/usePidTuningMsp", () => ({
    CopyProfileType: { PID: 0, RATE: 1 },
    usePidTuningMsp: () => msp,
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));
vi.mock("../../src/composables/useDialog", () => ({ useDialog: () => ({ openCopyProfile }) }));
vi.mock("../../src/composables/useTuningSliders", () => ({ validateTuningSliders: vi.fn() }));
vi.mock("../../src/js/gui", () => ({ default: { content_ready: vi.fn() } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/utils/isExpertModeEnabled", () => ({ isExpertModeEnabled: () => false }));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function mountTab() {
    return shallowMount(PidTuningTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

type Wrapper = ReturnType<typeof mountTab>;

const button = (wrapper: Wrapper, label: string) =>
    wrapper
        .findAllComponents<ComponentPublicInstance>(UButton)
        .find((b) => (b.props() as { label?: string }).label === label)!;

const select = (wrapper: Wrapper) => wrapper.findComponent<ComponentPublicInstance>(USelect);

async function showSubtab(wrapper: Wrapper, value: string) {
    wrapper.findComponent<ComponentPublicInstance>(SubtabNav).vm.$emit("update:modelValue", value);
    await flushPromises();
}

/** Make `fn` hang until the returned release is called. */
function hold(fn: ReturnType<typeof vi.fn>) {
    let release!: () => void;
    fn.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                release = resolve;
            }),
    );
    return () => release();
}

describe("PID Tuning MSP wiring", () => {
    let wrapper: Wrapper;

    beforeEach(async () => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        FC.resetState();
        FC.CONFIG.apiVersion = "1.47.0";
        FC.CONFIG.numProfiles = 3;
        FC.CONFIG.numberOfRateProfiles = 4;
        // Distinct active profiles, so a PID / rate mix-up in the wiring shows.
        FC.CONFIG.profile = 1;
        FC.CONFIG.rateProfile = 2;
        Object.values(msp).forEach((fn) => fn.mockResolvedValue(undefined));
        saveToEeprom.mockResolvedValue(undefined);
        wrapper = mountTab();
        await flushPromises();
    });

    afterEach(() => {
        wrapper.unmount();
        vi.restoreAllMocks();
    });

    it("loads through the composable on mount", () => {
        expect(msp.loadPidTuningData).toHaveBeenCalledOnce();
    });

    it("persists to EEPROM only once the config write has landed", async () => {
        const release = hold(msp.writePidTuningConfig);
        FC.PIDS[0][0] = 99;
        await flushPromises();

        button(wrapper, "pidTuningButtonSave").vm.$emit("click");
        await flushPromises();
        expect(msp.writePidTuningConfig).toHaveBeenCalledOnce();
        expect(saveToEeprom).not.toHaveBeenCalled();

        release();
        await flushPromises();
        expect(saveToEeprom).toHaveBeenCalledOnce();
    });

    it("selects the chosen PID profile, and reloads only once the FC has switched", async () => {
        const release = hold(msp.selectPidProfile);

        select(wrapper).vm.$emit("update:modelValue", 0);
        await flushPromises();
        expect(msp.selectPidProfile).toHaveBeenCalledWith(0);
        expect(msp.selectRateProfile).not.toHaveBeenCalled();
        expect(msp.loadPidTuningData).toHaveBeenCalledOnce();

        release();
        await flushPromises();
        expect(msp.loadPidTuningData).toHaveBeenCalledTimes(2);
    });

    it("selects the chosen rate profile, and reloads only once the FC has switched", async () => {
        await showSubtab(wrapper, "rates");
        const release = hold(msp.selectRateProfile);

        select(wrapper).vm.$emit("update:modelValue", 3);
        await flushPromises();
        expect(msp.selectRateProfile).toHaveBeenCalledWith(3);
        expect(msp.selectPidProfile).not.toHaveBeenCalled();
        expect(msp.loadPidTuningData).toHaveBeenCalledOnce();

        release();
        await flushPromises();
        expect(msp.loadPidTuningData).toHaveBeenCalledTimes(2);
    });

    it("copies the current PID profile to the confirmed target", async () => {
        button(wrapper, "pidTuningCopyProfile").vm.$emit("click");
        const onConfirm = openCopyProfile.mock.calls[0][4];

        await onConfirm({ profile: 0, rateProfile: null });

        expect(msp.copyProfile).toHaveBeenCalledWith(CopyProfileType.PID, 1, 0);
    });

    it.each([
        ["PID", "pid", "pidTuningCopyProfile", { profile: 0, rateProfile: null }, true],
        ["PID", "pid", "pidTuningCopyProfile", { profile: 0, rateProfile: null }, false],
        ["rate", "rates", "pidTuningCopyRateProfile", { profile: null, rateProfile: 3 }, true],
        ["rate", "rates", "pidTuningCopyRateProfile", { profile: null, rateProfile: 3 }, false],
    ])(
        "flags a %s profile copy (%s subtab, %s, %o) unsaved only once it lands: %s",
        async (_, subtab, label, selection, succeeds) => {
            if (!succeeds) {
                msp.copyProfile.mockRejectedValueOnce(new Error("MSP timeout"));
                vi.spyOn(console, "error").mockImplementation(() => {});
            }
            await showSubtab(wrapper, subtab as string);
            expect(usePidTuningStore().hasChanges).toBe(false);
            button(wrapper, label as string).vm.$emit("click");
            const onConfirm = openCopyProfile.mock.calls[0][4];

            await onConfirm(selection);

            expect(usePidTuningStore().hasChanges).toBe(succeeds);
        },
    );

    it("copies the current rate profile to the confirmed target", async () => {
        await showSubtab(wrapper, "rates");
        button(wrapper, "pidTuningCopyRateProfile").vm.$emit("click");
        const onConfirm = openCopyProfile.mock.calls[0][4];

        await onConfirm({ profile: null, rateProfile: 3 });

        expect(msp.copyProfile).toHaveBeenCalledWith(CopyProfileType.RATE, 2, 3);
    });

    it("resets the PID profile, and reloads only once the FC has reset it", async () => {
        const release = hold(msp.resetPidProfile);

        button(wrapper, "pidTuningResetPidProfile").vm.$emit("click");
        await flushPromises();
        expect(msp.resetPidProfile).toHaveBeenCalledOnce();
        expect(msp.loadPidTuningData).toHaveBeenCalledOnce();

        release();
        await flushPromises();
        expect(msp.loadPidTuningData).toHaveBeenCalledTimes(2);
    });
});
