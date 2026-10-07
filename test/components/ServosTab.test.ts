import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ServosTab from "../../src/components/tabs/ServosTab.vue";
import { useFlightControllerStore } from "../../src/stores/fc";
import GUI from "../../src/js/gui";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { mspHelper } from "../../src/js/msp/MSPHelper";

vi.mock("../../src/js/gui", () => ({
    default: {
        content_ready: vi.fn(),
        interval_add: vi.fn(),
        interval_remove: vi.fn(),
        timeout_add: vi.fn(),
        timeout_remove: vi.fn(),
    },
}));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { sendServoConfigurations: vi.fn() } }));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom: vi.fn() }) }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const SERVO = { min: 1000, middle: 1500, max: 2000, rate: 100, indexOfChannelToForward: 255, reversedInputSources: 0 };

/** The `<script setup>` bindings the tests drive; script setup exposes nothing to the type of `vm`. */
interface ServosVm {
    servoData: number[];
    servoConfigs: { min: number; middle: number; max: number; rate: number; indexOfChannelToForward: number }[];
    configHasChanged: boolean;
    liveMode: boolean;
    saveServoConfig: () => Promise<void>;
    onServoChange: () => void;
}

function mountTab() {
    return shallowMount(ServosTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

let fcStore: ReturnType<typeof useFlightControllerStore>;

describe("Servos MSP wiring", () => {
    let wrapper: ReturnType<typeof mountTab>;
    const vm = () => wrapper.vm as unknown as ServosVm;

    beforeEach(async () => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        fcStore.config.apiVersion = "1.47.0";
        fcStore.servoConfig = [{ ...SERVO }, { ...SERVO }];
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(mspHelper.sendServoConfigurations).mockResolvedValue(undefined);
        wrapper = mountTab();
        await flushPromises();
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it("starts servo polling after the load and copies each reply into the bars", async () => {
        const servoTick = vi.mocked(GUI.interval_add).mock.calls.find(([name]) => name === "servo_data_pull")![1];

        servoTick();
        const [code, , , onServoData] = vi.mocked(MSP.send_message).mock.calls.at(-1)!;
        expect(code).toBe(MSPCodes.MSP_SERVO);
        fcStore.servoData = [1100, 1900];
        (onServoData as () => void)();
        await flushPromises();

        expect(vm().servoData).toEqual([1100, 1900]);
    });

    it("sends the clamped edits and clears the dirty flag after a save", async () => {
        vm().servoConfigs[0].min = 100;
        expect(vm().configHasChanged).toBe(true);

        await vm().saveServoConfig();

        expect(mspHelper.sendServoConfigurations).toHaveBeenCalledOnce();
        expect(fcStore.servoConfig[0].min).toBe(500);
        expect(vm().configHasChanged).toBe(false);
    });

    it("previews an edit in live mode without persisting it", async () => {
        vm().liveMode = true;
        vm().servoConfigs[1].max = 1800;
        vm().onServoChange();
        const preview = vi.mocked(GUI.timeout_add).mock.calls.find(([name]) => name === "servos_update")![1];

        preview();
        await flushPromises();

        expect(mspHelper.sendServoConfigurations).toHaveBeenCalledOnce();
        expect(fcStore.servoConfig[1].max).toBe(1800);
        expect(vm().configHasChanged).toBe(true);
    });
});
