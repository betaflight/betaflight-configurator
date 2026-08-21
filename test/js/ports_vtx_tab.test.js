import { beforeEach, describe, expect, it } from "vitest";
import { fcPort, loadFcPorts, loadPortsEnv, makeRow, resetPortsEnv, values } from "./helpers/serialPorts";
import { describeSerialRowContract } from "./helpers/serialRowContract";

// VtxTab.vue itself is undrivable in a test: it renders through Nuxt UI's USelect/USwitch, which
// the Nuxt UI vite plugin resolves at compile time and so cannot be stubbed in a DOM mount. What
// the tab actually contributes - the allow-list it hands the row - is exercised here against the
// composable, the same way test/js/serial_function_row.test.js does.
const { FC, NO_PORT, NO_FUNCTION } = await loadPortsEnv();

/**
 * The exact list VtxTab passes to the row. Kept as a literal rather than imported from the tab,
 * so that widening it there - to blackbox or the serial rangefinder, which sit in the same slot
 * but belong to other tabs - fails these tests instead of silently passing them.
 */
const VTX_SERIAL_FUNCTIONS = ["TBS_SMARTAUDIO", "IRC_TRAMP", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"];

const vtxRow = (overrides = {}) => makeRow({ group: "peripherals", functions: VTX_SERIAL_FUNCTIONS, ...overrides });

const offered = (functionItems) => values(functionItems.value);

describe("VtxTab serial port row", () => {
    let store;

    beforeEach(async () => {
        store = await resetPortsEnv();
    });

    // The row is contracted on SmartAudio, the protocol a user is most likely to pick here; the
    // peripherals slot it lands in is shared with blackbox, which the logging tab owns.
    describeSerialRowContract({
        makeRow: vtxRow,
        getStore: () => store,
        serialFunction: "TBS_SMARTAUDIO",
        slot: "peripheral",
        occupant: "BLACKBOX",
    });

    // The acceptance item for this tab: the four VTX/camera protocols share the peripherals slot
    // with functions that belong to other tabs, and only these four may be offered here.
    describe("which functions the tab offers", () => {
        it("offers exactly the four VTX and camera protocols", () => {
            const { functionItems } = vtxRow();

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(offered(functionItems).slice(1).sort()).toEqual([...VTX_SERIAL_FUNCTIONS].sort());
        });

        it("never offers the rest of the peripherals slot", () => {
            const { functionItems } = vtxRow();

            // Each of these is a real peripherals-group rule at this API version, so their absence
            // is the allow-list working rather than the rule simply not existing.
            for (const name of ["BLACKBOX", "LIDAR_TF", "FRSKY_OSD", "GIMBAL"]) {
                expect(offered(functionItems)).not.toContain(name);
            }
        });

        it("offers a protocol picker rather than a bare port picker", () => {
            expect(vtxRow().hasGroup.value).toBe(true);
        });

        it("has no baudrate field - none of these protocols carry one", () => {
            const { hasBaudField, baudItems } = vtxRow();

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        it("drops VTX_MSP on firmware too old to have the rule", async () => {
            // The tab lists it unconditionally; below API 1.45 no such rule exists and the row
            // silently does not offer it, so the tab needs no API gate of its own.
            store = await resetPortsEnv({ apiVersion: "1.44.0" });

            expect(offered(vtxRow().functionItems)).not.toContain("VTX_MSP");
        });

        it("keeps VTX_MSP from API 1.45", () => {
            expect(offered(vtxRow().functionItems)).toContain("VTX_MSP");
        });

        it("disables rather than hides RunCam control on a build without USE_CAMERA_CONTROL", () => {
            // Hiding it would silently drop an assignment firmware already has.
            FC.CONFIG.buildOptions = ["USE_VTX"];
            const { functionItems } = vtxRow();

            const runcam = functionItems.value.find((i) => i.value === "RUNCAM_DEVICE_CONTROL");
            expect(runcam).toBeDefined();
            expect(runcam.disabled).toBe(true);
            expect(functionItems.value.find((i) => i.value === "TBS_SMARTAUDIO").disabled).toBe(false);
        });

        it("still reports a disabled protocol firmware already assigned", async () => {
            FC.CONFIG.buildOptions = ["USE_VTX"]; // no USE_CAMERA_CONTROL
            await loadFcPorts(store, [fcPort(20, ["MSP"]), fcPort(0, ["RUNCAM_DEVICE_CONTROL"])]);

            const { activeFunction, selectedValue } = vtxRow();

            expect(activeFunction.value).toEqual("RUNCAM_DEVICE_CONTROL");
            expect(selectedValue.value).toEqual(0);
        });
    });

    describe("reading what the FC has", () => {
        it("reports whichever VTX protocol is assigned", () => {
            store.assign("IRC_TRAMP", 1);

            const { activeFunction, selectedValue } = vtxRow();

            expect(activeFunction.value).toEqual("IRC_TRAMP");
            expect(selectedValue.value).toEqual(1);
        });

        it("reports none when the slot holds a function this tab does not own", () => {
            store.assign("BLACKBOX", 1);

            expect(vtxRow().activeFunction.value).toEqual("");
        });

        it("offers no ports until a protocol is chosen", () => {
            const row = vtxRow();

            expect(row.portItems.value.filter((i) => i.value !== NO_PORT)).toEqual([]);
        });
    });

    describe("choosing between the protocols", () => {
        it("frees the protocol it replaces, wherever that port was", () => {
            store.assign("IRC_TRAMP", 1);
            const row = vtxRow();

            row.selectFunction("TBS_SMARTAUDIO");
            row.selectPort(2);
            row.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(2).peripheral).toEqual("TBS_SMARTAUDIO");
        });

        it("turns VTX control off entirely when the disabled option is chosen", () => {
            store.assign("TBS_SMARTAUDIO", 1);
            const row = vtxRow();

            row.selectFunction(NO_FUNCTION);
            row.apply();

            expect(store.portById(1).peripheral).toEqual("");
        });
    });

    describe("VTX_MSP", () => {
        it("forces MSP on the chosen port when applied", () => {
            const row = vtxRow();
            row.selectFunction("VTX_MSP");
            row.selectPort(1);

            expect(store.portById(1).msp).toBe(false);

            row.apply();

            expect(store.portById(1).peripheral).toEqual("VTX_MSP");
            expect(store.portById(1).msp).toBe(true);
        });

        it("does not turn MSP on for a protocol that does not need it", () => {
            const row = vtxRow();
            row.selectFunction("TBS_SMARTAUDIO");
            row.selectPort(1);
            row.apply();

            expect(store.portById(1).msp).toBe(false);
        });
    });

    it("warns that taking a port would evict the telemetry protocol on it", () => {
        // Telemetry and peripherals are mutually exclusive on one port, and telemetry is edited on
        // the Ports tab rather than here.
        store.assign("TELEMETRY_MAVLINK", 1);
        const row = vtxRow();

        row.selectFunction("IRC_TRAMP");
        row.selectPort(1);

        expect(row.evictions.value).toContainEqual({
            portId: 1,
            portName: "UART2",
            serialFunction: "TELEMETRY_MAVLINK",
        });
    });
});
