import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { ref } from "vue";

const waypoints = ref([
    { uid: "a", latitude: 46.194136, longitude: 10.468133, altitude: 400, speed: 10, type: "waypoint", order: 0 },
    { uid: "b", latitude: 46.195, longitude: 10.47, altitude: 400, speed: 10, type: "waypoint", order: 1 },
]);

vi.mock("../../src/composables/useFlightPlan", () => ({
    useFlightPlan: () => ({
        positionalWaypoints: waypoints,
        selectedWaypointUid: ref(null),
        selectWaypoint: vi.fn(),
    }),
}));

import ElevationProfile from "../../src/components/tabs/FlightPlan/ElevationProfile.vue";

function mountProfile() {
    return shallowMount(ElevationProfile, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

describe("ElevationProfile terrain lookup", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("shows N/A and a warning instead of 0 when the elevation service fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

        const wrapper = mountProfile();
        await flushPromises();

        expect(wrapper.find(".terrain-unavailable").exists()).toBe(true);
        const stats = wrapper.find(".profile-stats").text();
        expect(stats).toContain("flightPlanTerrainNotAvailable");
        expect(stats).not.toMatch(/Ground Elev[^:]*:\s*0\b/);
    });

    it("treats a partial response as unavailable rather than filling with 0", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ elevation: 1200 }] }) }),
        );

        const wrapper = mountProfile();
        await flushPromises();

        expect(wrapper.find(".terrain-unavailable").exists()).toBe(true);
    });

    it("shows real values and no warning when terrain data comes back", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
                const { locations } = JSON.parse(init.body);
                return {
                    ok: true,
                    json: async () => ({ results: locations.map(() => ({ elevation: 1200 })) }),
                };
            }),
        );

        const wrapper = mountProfile();
        await flushPromises();

        expect(wrapper.find(".terrain-unavailable").exists()).toBe(false);
        expect(wrapper.find(".profile-stats").text()).not.toContain("flightPlanTerrainNotAvailable");
    });
});
