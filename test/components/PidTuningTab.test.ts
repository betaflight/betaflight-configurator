import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ComponentPublicInstance } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import USelect from "@nuxt/ui/components/Select.vue";
import PidTuningTab from "../../src/components/tabs/PidTuningTab.vue";
import SubtabNav from "../../src/components/elements/SubtabNav.vue";
import { useFlightControllerStore } from "../../src/stores/fc";
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

let fcStore: ReturnType<typeof useFlightControllerStore>;

describe("PID Tuning MSP wiring", () => {
    let wrapper: Wrapper;

    beforeEach(async () => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        fcStore.config.apiVersion = "1.47.0";
        fcStore.config.numProfiles = 3;
        fcStore.config.numberOfRateProfiles = 4;
        // Distinct active profiles, so a PID / rate mix-up in the wiring shows.
        fcStore.config.profile = 1;
        fcStore.config.rateProfile = 2;
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
        fcStore.pids[0][0] = 99;
        await flushPromises();

        button(wrapper, "pidTuningButtonSave").vm.$emit("click");
        await flushPromises();
        expect(msp.writePidTuningConfig).toHaveBeenCalledOnce();
        expect(saveToEeprom).not.toHaveBeenCalled();

        release();
        await flushPromises();
        expect(saveToEeprom).toHaveBeenCalledOnce();
    });

    it.each([
        ["PID", "pid", 0, msp.selectPidProfile, msp.selectRateProfile],
        ["rate", "rates", 3, msp.selectRateProfile, msp.selectPidProfile],
    ])(
        "selects the chosen %s profile, and reloads only once the FC has switched",
        async (_, subtab, value, chosen, other) => {
            await showSubtab(wrapper, subtab as string);
            const release = hold(chosen);

            select(wrapper).vm.$emit("update:modelValue", value);
            await flushPromises();
            expect(chosen).toHaveBeenCalledWith(value);
            expect(other).not.toHaveBeenCalled();
            expect(msp.loadPidTuningData).toHaveBeenCalledOnce();

            release();
            await flushPromises();
            expect(msp.loadPidTuningData).toHaveBeenCalledTimes(2);
        },
    );

    it.each([
        ["PID", "pid", "pidTuningCopyProfile", { profile: 0, rateProfile: null }, [CopyProfileType.PID, 1, 0]],
        ["rate", "rates", "pidTuningCopyRateProfile", { profile: null, rateProfile: 3 }, [CopyProfileType.RATE, 2, 3]],
    ])(
        "copies the current %s profile to the confirmed target and flags it unsaved",
        async (_, subtab, label, selection, args) => {
            await showSubtab(wrapper, subtab as string);
            expect(usePidTuningStore().hasChanges).toBe(false);
            button(wrapper, label as string).vm.$emit("click");

            await openCopyProfile.mock.calls[0][4](selection);

            expect(msp.copyProfile).toHaveBeenCalledWith(...(args as unknown[]));
            expect(usePidTuningStore().hasChanges).toBe(true);
        },
    );

    it("does not flag a failed profile copy unsaved", async () => {
        msp.copyProfile.mockRejectedValueOnce(new Error("MSP timeout"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        button(wrapper, "pidTuningCopyProfile").vm.$emit("click");

        await openCopyProfile.mock.calls[0][4]({ profile: 0, rateProfile: null });

        expect(usePidTuningStore().hasChanges).toBe(false);
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
