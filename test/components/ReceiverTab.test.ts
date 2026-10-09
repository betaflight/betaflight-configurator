import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import ReceiverTab from "../../src/components/tabs/ReceiverTab.vue";
import * as timers from "../../src/js/timers";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { mspHelper } from "../../src/js/msp/MSPHelper";
import { useConnectionStore } from "../../src/stores/connection";
import { useFlightControllerStore } from "../../src/stores/fc";
import { useNavigationStore } from "../../src/stores/navigation";

const saveToEeprom = vi.fn();
const saveAndReboot = vi.fn();

vi.mock("../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn(), setRawRx: vi.fn() } }));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom, saveAndReboot }) }));
vi.mock("../../src/js/model", () => ({ default: vi.fn() }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

type ReceiverVm = {
    refreshRate: number;
    saveConfig: (withReboot?: boolean) => Promise<void>;
    sendBind: () => void;
    openSticksWindow: () => void;
};

function mountTab() {
    return shallowMount(ReceiverTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

const plotPull = () =>
    vi
        .mocked(timers.addInterval)
        .mock.calls.filter(([name]) => name === "receiver_pull")
        .at(-1)!;

describe("Receiver MSP wiring", () => {
    let wrapper: ReturnType<typeof mountTab>;
    let vm: ReceiverVm;

    const mountLoaded = async () => {
        wrapper = mountTab();
        vm = wrapper.vm as unknown as ReceiverVm;
        await flushPromises();
    };

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        useNavigationStore().activeTab = "receiver";
        localStorage.clear();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(mspHelper.crunch).mockReturnValue([]);
        saveToEeprom.mockResolvedValue(undefined);
        saveAndReboot.mockResolvedValue(undefined);
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it("loads the configuration and starts both RC polls on mount", async () => {
        await mountLoaded();

        expect(vi.mocked(MSP.promise).mock.calls[0]).toEqual([MSPCodes.MSP_FEATURE_CONFIG]);
        expect(timers.addInterval).toHaveBeenCalledWith(
            "receiver_pull_for_model_preview",
            expect.any(Function),
            33,
            false,
        );
        expect(timers.addInterval).toHaveBeenCalledWith("receiver_pull", expect.any(Function), 50, true);
    });

    it("starts the plot poll at the stored refresh rate", async () => {
        localStorage.setItem("rx_refresh_rate", JSON.stringify({ rx_refresh_rate: 120 }));
        await mountLoaded();

        expect(plotPull()[2]).toBe(120);
    });

    it("draws each plot RC reply and restarts the poll at a new refresh rate", async () => {
        await mountLoaded();
        Object.assign(useFlightControllerStore().rc, { active_channels: 4, channels: [1500, 1500, 1000, 1500] });
        plotPull()[1]();
        const [code, , , onRcData] = vi.mocked(MSP.send_message).mock.calls.at(-1)!;
        expect(code).toBe(MSPCodes.MSP_RC);

        (onRcData as () => void)();
        expect(wrapper.findAll("g.data path").length).toBeGreaterThan(0);

        vm.refreshRate = 100;
        await nextTick();
        expect(timers.removeInterval).toHaveBeenCalledWith("receiver_pull");
        expect(plotPull()[2]).toBe(100);
        plotPull()[1]();
        expect(vi.mocked(MSP.send_message).mock.calls.at(-1)![3]).toBe(onRcData);
    });

    it.each([
        [false, saveToEeprom],
        [true, saveAndReboot],
    ])("saves the settings, then the feature mask, then persists (reboot: %s)", async (withReboot, persist) => {
        await mountLoaded();
        const steps: Array<number | string> = [];
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            steps.push(code ?? "no code");
        });
        persist.mockImplementation(async () => {
            steps.push("persist");
        });

        await vm.saveConfig(withReboot);

        expect(steps).toEqual([
            MSPCodes.MSP_SET_RX_MAP,
            MSPCodes.MSP_SET_RSSI_CONFIG,
            MSPCodes.MSP_SET_RC_DEADBAND,
            MSPCodes.MSP_SET_RX_CONFIG,
            MSPCodes.MSP_SET_FEATURE_CONFIG,
            "persist",
        ]);
    });

    it("persists only once the feature mask write is acknowledged", async () => {
        await mountLoaded();
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementation((code) =>
            code === MSPCodes.MSP_SET_FEATURE_CONFIG
                ? new Promise((resolve) => (release = () => resolve(undefined)))
                : Promise.resolve(undefined),
        );

        const saving = vm.saveConfig(false);
        await flushPromises();
        expect(saveToEeprom).not.toHaveBeenCalled();

        release();
        await saving;
        expect(saveToEeprom).toHaveBeenCalledOnce();
    });

    it("sends the bind command", async () => {
        await mountLoaded();
        vm.sendBind();

        expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP2_BETAFLIGHT_BIND);
    });

    it("forwards stick window channels while the connection is valid", async () => {
        await mountLoaded();
        const popup: { setRawRx?: (channels: number[]) => boolean } = {};
        vi.spyOn(globalThis, "open").mockReturnValue(popup as unknown as Window);
        useConnectionStore().connectionValid = true;
        vm.openSticksWindow();

        expect(popup.setRawRx!([1500, 1600])).toBe(true);
        expect(mspHelper.setRawRx).toHaveBeenCalledExactlyOnceWith([1500, 1600]);
    });
});
