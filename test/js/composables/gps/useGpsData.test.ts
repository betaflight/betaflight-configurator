import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import MSP, { type MspCallback } from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { useGpsData } from "../../../../src/composables/gps/useGpsData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({
    default: { interval_add: vi.fn(), interval_remove: vi.fn(), interval_pause: vi.fn(), interval_resume: vi.fn() },
}));

type GpsData = ReturnType<typeof useGpsData>;

const POLL_CHAIN = [
    MSPCodes.MSP_RAW_GPS,
    MSPCodes.MSP_COMP_GPS,
    MSPCodes.MSP_GPS_SV_INFO,
    MSPCodes.MSP_ATTITUDE,
    MSPCodes.MSP_RAW_IMU,
];

function mountData() {
    let data!: GpsData;
    const wrapper = mount(
        defineComponent({
            setup() {
                data = useGpsData();
                return () => null;
            },
        }),
    );
    return { wrapper, data };
}

/** Run one poll tick and return the codes it sent. */
function runTick() {
    const tick = vi.mocked(GUI.interval_add).mock.calls[0][1];
    vi.mocked(MSP.send_message).mockClear();
    tick();
    return vi.mocked(MSP.send_message).mock.calls.map(([code]) => code);
}

describe("useGpsData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        // Answer each request straight away, so a tick runs the whole chain.
        vi.mocked(MSP.send_message).mockImplementation((_code, _data, _callbackAfterSend, callbackOnReply) => {
            if (typeof callbackOnReply === "function") {
                callbackOnReply(null);
            }
            return true;
        });
    });

    it("loads the feature config, then the GPS config", async () => {
        await mountData().data.fetchGpsConfig();

        expect(vi.mocked(MSP.promise).mock.calls).toEqual([[MSPCodes.MSP_FEATURE_CONFIG], [MSPCodes.MSP_GPS_CONFIG]]);
    });

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.fetchGpsConfig()).rejects.toThrow("MSP timeout");
        expect(MSP.promise).toHaveBeenCalledOnce();
    });

    it("polls every 100 ms, starting immediately, and removes the poll on unmount", () => {
        const { wrapper, data } = mountData();

        data.startPolling(ref(false), () => {});

        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith("gps_pull", expect.any(Function), 100, true);
        wrapper.unmount();
        expect(GUI.interval_remove).toHaveBeenCalledWith("gps_pull");
    });

    it("chains the telemetry requests without a mag and hands over after the IMU reply", () => {
        const onData = vi.fn();
        mountData().data.startPolling(ref(false), onData);

        expect(runTick()).toEqual(POLL_CHAIN);
        expect(onData).toHaveBeenCalledOnce();
    });

    it("does not move to the next request before the previous reply lands", () => {
        vi.mocked(MSP.send_message).mockReturnValue(true);
        mountData().data.startPolling(ref(false), () => {});

        expect(runTick()).toEqual([MSPCodes.MSP_RAW_GPS]);
    });

    it("reads the mag flag on every tick and hands over only after the compass config reply", () => {
        const onData = vi.fn();
        let compassReply!: () => void;
        vi.mocked(MSP.send_message).mockImplementation((code, _data, _callbackAfterSend, callbackOnReply) => {
            if (code === MSPCodes.MSP_COMPASS_CONFIG) {
                compassReply = () => (callbackOnReply as MspCallback)(null);
            } else if (typeof callbackOnReply === "function") {
                callbackOnReply(null);
            }
            return true;
        });
        const hasMag = ref(false);
        mountData().data.startPolling(hasMag, onData);

        expect(runTick()).toEqual(POLL_CHAIN);
        onData.mockClear();
        hasMag.value = true;
        expect(runTick()).toEqual([...POLL_CHAIN, MSPCodes.MSP_COMPASS_CONFIG]);
        expect(onData).not.toHaveBeenCalled();

        compassReply();
        expect(onData).toHaveBeenCalledOnce();
    });

    it("pauses, resumes and stops the poll", () => {
        const { data } = mountData();
        data.startPolling(ref(false), () => {});

        data.pausePolling();
        data.resumePolling();
        data.stopPolling();

        expect(GUI.interval_pause).toHaveBeenCalledWith("gps_pull");
        expect(GUI.interval_resume).toHaveBeenCalledWith("gps_pull");
        expect(GUI.interval_remove).toHaveBeenCalledWith("gps_pull");
    });
});
