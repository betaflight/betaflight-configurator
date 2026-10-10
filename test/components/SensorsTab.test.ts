import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import SensorsTab from "../../src/components/tabs/SensorsTab.vue";
import * as timers from "../../src/js/timers";
import { useFlightControllerStore } from "../../src/stores/fc";
import { ipCoordinates } from "../../src/js/utils/ipGeolocation";

const data = vi.hoisted(() => ({
    loadSensorsConfig: vi.fn(),
    sendSensorsConfig: vi.fn(),
    loadGpsData: vi.fn(),
    startAccCalibration: vi.fn(),
    loadBoardInfo: vi.fn(),
    requestAttitude: vi.fn(),
    requestAltitude: vi.fn(),
    requestAttitudeQuaternion: vi.fn(),
}));
const gates = vi.hoisted(() => [] as { value: unknown }[][]);
const writeFeaturePort = vi.hoisted(() => vi.fn());
const saveAndReboot = vi.hoisted(() => vi.fn());

vi.mock("../../src/js/timers", () => ({
    addInterval: vi.fn(),
    removeInterval: vi.fn(),
    pauseInterval: vi.fn(),
    resumeInterval: vi.fn(),
    addTimeout: vi.fn(),
    removeTimeout: vi.fn(),
}));
vi.mock("../../src/composables/sensors/useSensorsData", () => ({
    useSensorsData: (...args: { value: unknown }[]) => {
        gates.push(args);
        return data;
    },
}));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/sensor_types", () => ({ sensorTypes: vi.fn(async () => null) }));
vi.mock("../../src/js/model", () => ({
    default: class {
        resize() {}
        rotateTo() {}
        dispose() {}
    },
}));
vi.mock("../../libraries/flightIndicators", () => ({
    flightIndicator: () => ({ setRoll() {}, setPitch() {}, setHeading() {}, setAltitude() {} }),
}));
vi.mock("../../src/composables/ports/useFeaturePort", () => ({
    useFeaturePort: () => ({
        available: ref(false),
        writable: ref(false),
        options: ref([]),
        selectedIdentifier: ref(null),
        conflict: ref(null),
        selection: ref(null),
        load: async () => {},
        write: writeFeaturePort,
    }),
}));
vi.mock("../../src/composables/useDronecanDevice", () => ({
    useDronecanDevice: () => ({
        supported: ref(false),
        enabled: ref(false),
        deviceOptions: ref([]),
        selectedDevice: ref(null),
        load: async () => {},
        write: async () => {},
    }),
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
vi.mock("../../src/js/utils/ipGeolocation", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/js/utils/ipGeolocation")>()),
    ipCoordinates: vi.fn(),
}));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

function mountTab() {
    return shallowMount(SensorsTab, { global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key } } });
}

type Wrapper = ReturnType<typeof mountTab>;

function clickButton(wrapper: Wrapper, label: string) {
    const button = wrapper.findAllComponents(UButton).find((b) => b.props("label") === label);
    if (!button) {
        throw new Error(`no ${label} button`);
    }
    button.vm.$emit("click", new MouseEvent("click"));
}

/** The registration of the named interval or timeout. */
function registered(spy: (...args: never[]) => unknown, name: string) {
    const call = vi.mocked(spy).mock.calls.find(([n]) => n === name) as unknown[] | undefined;
    if (!call) {
        throw new Error(`no ${name} registered`);
    }
    return call as [string, () => void, number, boolean?];
}

/** The callback the tab handed to a mocked request. */
function replyOf(request: ReturnType<typeof vi.fn>) {
    return request.mock.lastCall?.[0] as () => void;
}

describe("SensorsTab MSP wiring", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        gates.length = 0;
        setActivePinia(createPinia());
        localStorage.clear();
        data.loadSensorsConfig.mockResolvedValue(undefined);
        data.sendSensorsConfig.mockResolvedValue(undefined);
        data.loadGpsData.mockResolvedValue(undefined);
        saveAndReboot.mockResolvedValue(undefined);
        writeFeaturePort.mockResolvedValue(undefined);

        const fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.48.0";
        fcStore.config.activeSensors = 0b11; // acc + baro
    });

    it("holds the rest of the load back until the config has loaded", async () => {
        let release!: () => void;
        data.loadSensorsConfig.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        );
        mountTab();
        await flushPromises();
        expect(data.loadSensorsConfig).toHaveBeenCalledOnce();
        expect(timers.addInterval).not.toHaveBeenCalled();

        release();
        await flushPromises();
        expect(timers.addInterval).toHaveBeenCalled();
    });

    it("gates the config load and save on API 1.46 and 1.47, in that order", async () => {
        const fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.46.0";
        mountTab();
        await flushPromises();

        expect(gates).toHaveLength(1);
        expect(gates[0].map((gate) => Boolean(gate.value))).toEqual([true, false]);
    });

    it("looks for a GPS fix only once the GPS reply has landed", async () => {
        const fcStore = useFlightControllerStore();
        fcStore.config.activeSensors = 0b111; // acc + baro + mag, with no cached geo reference
        let reply!: () => void;
        data.loadGpsData.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    reply = () => {
                        Object.assign(fcStore.gpsData, { fix: 1, latitude: 520000000, longitude: 50000000 });
                        resolve();
                    };
                }),
        );
        mountTab();
        await flushPromises();
        expect(data.loadGpsData).toHaveBeenCalledOnce();

        reply();
        await flushPromises();
        // the fix was used, so the tab never fell back to IP geolocation
        expect(ipCoordinates).not.toHaveBeenCalled();
    });

    it("polls the attitude every 33 ms, the altitude after each reply, and the quaternion on API 1.48", async () => {
        mountTab();
        await flushPromises();

        const [, tick, period, first] = registered(timers.addInterval, "sensors_attitude");
        expect([period, first]).toEqual([33, true]);

        tick();
        expect(data.requestAttitude).toHaveBeenCalledOnce();
        expect(data.requestAttitudeQuaternion).toHaveBeenCalledOnce();
        expect(data.requestAltitude).not.toHaveBeenCalled();

        replyOf(data.requestAttitude)();
        expect(data.requestAltitude).toHaveBeenCalledOnce();
    });

    it("calibrates the accelerometer, then re-reads the board info when the timeout fires", async () => {
        const wrapper = mountTab();
        await flushPromises();

        clickButton(wrapper, "sensorConfigCalibrate");
        expect(data.startAccCalibration).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
        expect(timers.pauseInterval).toHaveBeenCalledWith("sensors_attitude");
        expect(data.loadBoardInfo).not.toHaveBeenCalled();

        const [, fire, timeout] = registered(timers.addTimeout, "acc_calib_reset");
        expect(timeout).toBe(2000);
        fire();
        expect(data.loadBoardInfo).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    });

    it("sends the config after writing it into the store, and waits for it before the port writes", async () => {
        const fcStore = useFlightControllerStore();
        const wrapper = mountTab();
        await flushPromises();
        let release!: () => void;
        let alignmentAtSend: unknown;
        data.sendSensorsConfig.mockImplementation(() => {
            alignmentAtSend = { ...fcStore.boardAlignment };
            return new Promise<void>((resolve) => {
                release = resolve;
            });
        });
        fcStore.boardAlignment.roll = 99; // overwritten from the tab's copy before the send

        clickButton(wrapper, "configurationButtonSave");
        await flushPromises();
        expect(data.sendSensorsConfig).toHaveBeenCalledOnce();
        expect(alignmentAtSend).toMatchObject({ roll: 0 });
        expect(writeFeaturePort).not.toHaveBeenCalled();

        release();
        await flushPromises();
        expect(writeFeaturePort).toHaveBeenCalled();
        expect(saveAndReboot).toHaveBeenCalledOnce();
    });
});
