import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/msp", () => ({ default: { send_cli_command: vi.fn() } }));

// The waypoint list is module-scope shared state, so every test gets a fresh module.
async function loadFlightPlan() {
    vi.resetModules();
    const module = await import("../../src/composables/useFlightPlan");
    const { default: MSP } = await import("../../src/js/msp");
    return { ...module, MSP: vi.mocked(MSP) };
}

describe("useFlightPlan", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("fills the slots a positional waypoint leaves out with defaults", async () => {
        const { useFlightPlan } = await loadFlightPlan();
        const plan = useFlightPlan();

        expect(plan.addWaypoint({ type: "flyover" })).toBe(true);

        expect(plan.waypoints.value[0]).toMatchObject({
            latitude: 0,
            longitude: 0,
            altitude: 400,
            speed: 10,
            type: "flyover",
            order: 0,
        });
    });

    it("rejects out-of-range coordinates and negative altitude", async () => {
        const { useFlightPlan } = await loadFlightPlan();
        const plan = useFlightPlan();

        expect(plan.addWaypoint({ latitude: 91, longitude: 0 })).toBe(false);
        expect(plan.addWaypoint({ latitude: 0, longitude: -181 })).toBe(false);
        expect(plan.addWaypoint({ latitude: 0, longitude: 0, altitude: -1 })).toBe(false);
        expect(plan.waypoints.value).toHaveLength(0);
    });

    it("requires the one slot a modifier waypoint uses", async () => {
        const { useFlightPlan } = await loadFlightPlan();
        const plan = useFlightPlan();

        expect(plan.addWaypoint({ type: "alt_change" })).toBe(false);
        expect(plan.addWaypoint({ type: "delay" })).toBe(false);
        expect(plan.addWaypoint({ type: "yaw_rate" })).toBe(false);
        // Coordinates are not checked for modifiers: they carry no horizontal position.
        expect(plan.addWaypoint({ type: "alt_change", altitude: 500, latitude: 1000 })).toBe(true);
    });

    it("treats a missing type as positional", async () => {
        const { isModifierWaypointType } = await loadFlightPlan();

        expect(isModifierWaypointType(undefined)).toBe(false);
        expect(isModifierWaypointType("delay")).toBe(true);
        expect(isModifierWaypointType("flyover")).toBe(false);
    });

    it("round-trips waypoints through the CLI in firmware units", async () => {
        const { useFlightPlan, MSP } = await loadFlightPlan();
        const sent: string[] = [];
        MSP.send_cli_command.mockImplementation((command, callback) => {
            sent.push(command);
            callback?.(command === "waypoint list" ? replayed : ["ok"]);
        });
        let replayed: string[] = [];

        const plan = useFlightPlan();
        plan.addWaypoint({ latitude: 47.1234567, longitude: 8.7654321, altitude: 100, speed: 20, type: "hold" });
        plan.addWaypoint({ type: "yaw_rate", speed: 30 });
        await plan.saveToFC();

        const inserts = sent.filter((command) => command.startsWith("waypoint insert "));
        expect(inserts).toEqual([
            "waypoint insert 0 47.1234567 8.7654321 3048 1029 HOLD 0 ORBIT",
            "waypoint insert 1 0.0000000 0.0000000 12192 30 YAW_RATE 0 ORBIT",
        ]);

        replayed = inserts;
        await plan.loadFromFC();

        expect(plan.waypoints.value.map(({ uid: _uid, ...wp }) => wp)).toEqual([
            {
                latitude: 47.1234567,
                longitude: 8.7654321,
                altitude: 100,
                speed: 20,
                type: "hold",
                duration: 0,
                pattern: "orbit",
                order: 0,
            },
            {
                latitude: 0,
                longitude: 0,
                altitude: 400,
                speed: 30,
                type: "yaw_rate",
                duration: 0,
                pattern: "orbit",
                order: 1,
            },
        ]);
    });
});
