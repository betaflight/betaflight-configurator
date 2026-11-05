/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";

const makeWaypoint = (uid: string, latitude: number, longitude: number, order: number) => ({
    uid,
    latitude,
    longitude,
    altitude: 400,
    speed: 10,
    type: "waypoint",
    order,
});

const route = () => [makeWaypoint("a", 46.194136, 10.468133, 0), makeWaypoint("b", 46.195, 10.47, 1)];

const waypoints = ref(route());

vi.mock("../../src/composables/useFlightPlan", () => ({
    useFlightPlan: () => ({
        positionalWaypoints: waypoints,
        selectedWaypointUid: ref(null),
        selectWaypoint: vi.fn(),
    }),
}));

import ElevationProfile from "../../src/components/tabs/FlightPlan/ElevationProfile.vue";

const NOT_AVAILABLE = "flightPlanTerrainNotAvailable";

// Every mounted profile watches the shared waypoints ref, so they all get unmounted after each test
const mountedWrappers: VueWrapper[] = [];

function mountProfile() {
    const wrapper = shallowMount(ElevationProfile, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
}

// Returns the value text of one stat, e.g. "N/A" or "3937ft", looked up by its label key
function statValue(wrapper: VueWrapper, labelKey: string) {
    const stat = wrapper.findAll(".profile-stats .stat").find((el) => el.find("strong").text() === `${labelKey}:`);
    expect(stat, `stat ${labelKey}`).toBeDefined();
    return stat!.text().replace(`${labelKey}:`, "").trim();
}

const groundElev = (wrapper: VueWrapper) => statValue(wrapper, "flightPlanGroundElev");
const maxGroundElev = (wrapper: VueWrapper) => statValue(wrapper, "flightPlanMaxGroundElev");

function stubElevationService(elevationMeters: number) {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
            const { locations } = JSON.parse(init.body);
            return {
                ok: true,
                json: async () => ({ results: locations.map(() => ({ elevation: elevationMeters })) }),
            };
        }),
    );
}

describe("ElevationProfile terrain lookup", () => {
    beforeEach(() => {
        waypoints.value = route();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        // Unmount first so no watcher can call the real fetch once the stub is gone
        mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("shows N/A for both ground stats and a warning when the elevation service fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

        const wrapper = mountProfile();
        await flushPromises();

        expect(groundElev(wrapper)).toBe(NOT_AVAILABLE);
        expect(maxGroundElev(wrapper)).toBe(NOT_AVAILABLE);
        expect(wrapper.find(".terrain-unavailable").exists()).toBe(true);
    });

    it("treats a partial response as a failure rather than filling with 0", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ elevation: 1200 }] }) }),
        );

        const wrapper = mountProfile();
        await flushPromises();

        expect(groundElev(wrapper)).toBe(NOT_AVAILABLE);
        expect(maxGroundElev(wrapper)).toBe(NOT_AVAILABLE);
        expect(wrapper.find(".terrain-unavailable").exists()).toBe(true);
    });

    it("shows real values for both ground stats and no warning when terrain data comes back", async () => {
        stubElevationService(1200);

        const wrapper = mountProfile();
        await flushPromises();

        // 1200 m from the API, shown in the default imperial units
        expect(groundElev(wrapper)).toMatch(/^3937\s*ft$/);
        expect(maxGroundElev(wrapper)).toMatch(/^3937\s*ft$/);
        expect(wrapper.find(".terrain-unavailable").exists()).toBe(false);
    });

    it("shows N/A without a failure warning for a single waypoint", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        waypoints.value = [route()[0]];

        const wrapper = mountProfile();
        await flushPromises();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(groundElev(wrapper)).toBe(NOT_AVAILABLE);
        expect(maxGroundElev(wrapper)).toBe(NOT_AVAILABLE);
        expect(wrapper.find(".terrain-unavailable").exists()).toBe(false);
    });

    it("drops the old ground reference lines when the route shrinks to one waypoint", async () => {
        stubElevationService(1200);

        const wrapper = mountProfile();
        await flushPromises();
        const chartText = () => wrapper.find("svg").text();
        expect(chartText()).toContain("flightPlanAvgGround");
        expect(chartText()).toContain("flightPlanMaxGround");

        waypoints.value = [route()[0]];
        await flushPromises();

        expect(chartText()).not.toContain("flightPlanAvgGround");
        expect(chartText()).not.toContain("flightPlanMaxGround");
        expect(groundElev(wrapper)).toBe(NOT_AVAILABLE);
    });
});
