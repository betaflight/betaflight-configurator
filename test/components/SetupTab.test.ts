import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SetupTab from "../../src/components/tabs/SetupTab.vue";
import * as timers from "../../src/js/timers";
import { tabSwitchCleanup } from "../../src/js/tab_adapters";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { MspCancelledError } from "../../src/js/msp/mspErrors";
import { gui_log } from "../../src/js/gui_log";
import { useFlightControllerStore } from "../../src/stores/fc";

vi.mock("i18next-vue", () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<number, string>) => (params ? `${key}:${params[1]}` : key),
    }),
}));
vi.mock("../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));
vi.mock("../../src/js/tab_adapters", () => ({ tabSwitchCleanup: vi.fn(), TABS: {} }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { REBOOT_TYPES: { BOOTLOADER: 101, BOOTLOADER_FLASH: 102 } },
}));
vi.mock("../../src/js/model", () => ({
    default: class {
        resize() {}
        rotateTo() {}
        dispose() {}
    },
}));
vi.mock("../../libraries/flightIndicators", () => ({
    flightIndicator: () => ({ setRoll: vi.fn(), setPitch: vi.fn(), setHeading: vi.fn() }),
}));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (key: string) => key, localizePage: vi.fn() },
}));

function mountTab() {
    return shallowMount(SetupTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

type Tick = () => void;
const tick = (name: string) => vi.mocked(timers.addInterval).mock.calls.find(([n]) => n === name)![1] as Tick;

describe("Setup MSP wiring", () => {
    let wrapper: ReturnType<typeof mountTab> | undefined;
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.47.0";
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        wrapper?.unmount();
        wrapper = undefined;
        vi.restoreAllMocks();
    });

    it("renders nothing and starts no polling when switching away cancels the load", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new MspCancelledError("cancelled", MSPCodes.MSP_ACC_TRIM));
        wrapper = mountTab();
        await flushPromises();

        expect(timers.addInterval).not.toHaveBeenCalled();
    });

    it("polls attitude on the fast tick and shows each reply", async () => {
        wrapper = mountTab();
        await flushPromises();
        expect(timers.addInterval).toHaveBeenCalledWith("setup_data_pull_fast", expect.any(Function), 33, true);

        tick("setup_data_pull_fast")();
        const [code, , , onData] = vi.mocked(MSP.send_message).mock.calls.at(-1)!;
        expect(code).toBe(MSPCodes.MSP_ATTITUDE);
        fcStore.sensorData.kinematics = [12.34, -5, 90];
        (onData as Tick)();

        expect((wrapper.vm as unknown as { state: { attitude: Record<string, string> } }).state.attitude).toEqual({
            roll: "initialSetupAttitude: 12.3",
            pitch: "initialSetupAttitude:-5.0",
            heading: "initialSetupAttitude: 90.0",
        });
        expect(MSP.send_message).toHaveBeenCalledOnce();
    });

    it("asks for sonar too when the board has one, and shows the reading", async () => {
        fcStore.config.activeSensors = 0xff;
        wrapper = mountTab();
        await flushPromises();

        tick("setup_data_pull_fast")();
        const sonarCall = vi.mocked(MSP.send_message).mock.calls.find(([code]) => code === MSPCodes.MSP_SONAR)!;
        fcStore.sensorData.sonar = 42;
        (sonarCall[3] as Tick)();

        expect((wrapper.vm as unknown as { state: { sonar: string } }).state.sonar).toBe("42.0 cm");
    });

    it("reboots to the bootloader from the button handler", async () => {
        wrapper = mountTab();
        await flushPromises();

        (wrapper.vm as unknown as { onRebootBootloader: () => void }).onRebootBootloader();

        expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, [101], false);
    });

    it("after a confirmed reset logs it and reloads the tab", async () => {
        wrapper = mountTab();
        await flushPromises();
        vi.mocked(MSP.promise).mockClear();

        (wrapper.vm as unknown as { confirmReset: () => void }).confirmReset();
        const [code, , , onReset] = vi.mocked(MSP.send_message).mock.calls.at(-1)!;
        expect(code).toBe(MSPCodes.MSP_RESET_CONF);
        expect(gui_log).not.toHaveBeenCalled();

        (onReset as Tick)();
        expect(gui_log).toHaveBeenCalledWith("initialSetupSettingsRestored");
        vi.mocked(tabSwitchCleanup).mock.calls[0][0]!();
        await flushPromises();

        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_ACC_TRIM, false);
    });
});
