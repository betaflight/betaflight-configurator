import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useMotorDataPolling } from "../../../../src/composables/motors/useMotorDataPolling";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({
    default: { interval_add: vi.fn(() => ({ name: "motor_and_status_pull" })), interval_remove: vi.fn() },
}));

type Polling = ReturnType<typeof useMotorDataPolling>;

function mountPolling() {
    let polling!: Polling;
    const wrapper = mount(
        defineComponent({
            setup() {
                polling = useMotorDataPolling(ref(false));
                return () => null;
            },
        }),
    );
    return { wrapper, polling };
}

// Runs the tick registered with GUI.interval_add, then each MSP callback in turn.
function runOnePoll() {
    const tick = vi.mocked(GUI.interval_add).mock.calls.at(-1)![1] as () => void;
    tick();
    for (let i = 0; i < vi.mocked(MSP.send_message).mock.calls.length; i++) {
        const callback = vi.mocked(MSP.send_message).mock.calls[i][3];
        if (callback) {
            (callback as () => void)();
        }
    }
}

describe("useMotorDataPolling", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
    });

    it("starts the 50 ms poll on mount and removes it on unmount", () => {
        const { wrapper } = mountPolling();

        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith(
            "motor_and_status_pull",
            expect.any(Function),
            50,
            true,
        );

        wrapper.unmount();
        expect(GUI.interval_remove).toHaveBeenCalledExactlyOnceWith("motor_and_status_pull");
    });

    it("restarting replaces the running interval rather than stacking a second one", () => {
        const { polling } = mountPolling();

        polling.startPolling();

        expect(GUI.interval_remove).toHaveBeenCalledOnce();
        expect(GUI.interval_add).toHaveBeenCalledTimes(2);
    });

    it("stopPolling is a no-op when nothing is running", () => {
        const { polling } = mountPolling();
        polling.stopPolling();
        vi.mocked(GUI.interval_remove).mockClear();

        polling.stopPolling();

        expect(GUI.interval_remove).not.toHaveBeenCalled();
    });

    it("polls MSP_MOTOR only when neither DShot telemetry nor the ESC sensor is in use", () => {
        fcStore.motorConfig.use_dshot_telemetry = false;
        fcStore.motorConfig.use_esc_sensor = false;
        mountPolling();

        runOnePoll();

        const codes = vi.mocked(MSP.send_message).mock.calls.map((call) => call[0]);
        expect(codes).toEqual([MSPCodes.MSP_MOTOR]);
    });

    it.each([
        ["DShot telemetry", { use_dshot_telemetry: true, use_esc_sensor: false }],
        ["the ESC sensor", { use_dshot_telemetry: false, use_esc_sensor: true }],
    ])("also polls MSP_MOTOR_TELEMETRY with %s", (_label, config) => {
        Object.assign(fcStore.motorConfig, config);
        mountPolling();

        runOnePoll();

        const codes = vi.mocked(MSP.send_message).mock.calls.map((call) => call[0]);
        expect(codes).toEqual([MSPCodes.MSP_MOTOR, MSPCodes.MSP_MOTOR_TELEMETRY]);
    });

    it("exposes the store's telemetry after a poll", () => {
        const { polling } = mountPolling();
        expect(polling.motorTelemetry.value).toEqual([]);

        runOnePoll();

        expect(polling.motorTelemetry.value).toEqual(fcStore.motorTelemetryData);
    });
});
