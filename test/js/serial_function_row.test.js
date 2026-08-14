import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";

const mspPromise = vi.fn(() => Promise.resolve({}));

vi.mock("../../src/js/msp", () => ({ default: { promise: (...args) => mspPromise(...args) } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: () => [], serialPortUnknownFunctionMask: () => 0 },
    isMspRejected: () => false,
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot: vi.fn() }) }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/Analytics", () => ({
    tracking: { EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" }, sendSaveAndChangeEvents: vi.fn() },
}));
// The row renders through Nuxt UI's USelect, which the Nuxt UI vite plugin resolves at compile
// time and so cannot be stubbed in a DOM mount. The logic under test lives in the composable
// instead; only i18next-vue needs standing in for, and a plain interpolation keeps assertions
// readable.
vi.mock("i18next-vue", () => ({
    useTranslation: () => ({
        t: (key, params) =>
            params
                ? `${key}(${Object.entries(params)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(",")})`
                : key,
    }),
}));

const { useSerialFunctionRow, NO_PORT, NO_FUNCTION } = await import("../../src/composables/ports/useSerialFunctionRow");
const { useSerialPortsStore } = await import("../../src/stores/serialPorts");
const FC = (await import("../../src/js/fc")).default;

function fcPort(identifier, functions = []) {
    return {
        identifier,
        functionMask: 0,
        functions,
        msp_baudrate: "115200",
        gps_baudrate: "57600",
        telemetry_baudrate: "AUTO",
        blackbox_baudrate: "115200",
    };
}

/** Props are reactive so a row behaves the way it would inside a component. */
const row = (props) => useSerialFunctionRow(reactive({ baudField: null, ...props }));

const labels = (items) => items.map((i) => i.label);

describe("useSerialFunctionRow", () => {
    let store;

    beforeEach(async () => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mspPromise.mockImplementation(() => Promise.resolve({}));
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.CONFIG.buildOptions = [];

        store = useSerialPortsStore();
        FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0), fcPort(1), fcPort(2)];
        await store.loadConfig({ force: true });
    });

    describe("port options", () => {
        it("offers every real port plus an unassigned option, but never USB VCP", () => {
            // USB VCP is the app's own link, not a place a feature's serial link goes.
            const { portItems } = row({ serialFunction: "GPS" });

            expect(labels(portItems.value)).toEqual(["serialPortNone", "UART1", "UART2", "UART3"]);
        });

        it("still lists USB VCP when firmware already put the function there", async () => {
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP", "BLACKBOX"]), fcPort(0)];
            await store.loadConfig({ force: true });

            const { portItems, selectedValue } = row({ serialFunction: "BLACKBOX" });

            expect(portItems.value.some((i) => i.value === 20)).toBe(true);
            expect(selectedValue.value).toEqual(20);
        });

        it("annotates a port with the function already on it", () => {
            store.assign("ESC_SENSOR", 1);
            const { portItems } = row({ serialFunction: "GPS" });

            const uart2 = portItems.value.find((i) => i.value === 1);
            expect(uart2.label).toEqual("serialPortOccupiedBy(port=UART2,serialFunction=portsFunction_ESC_SENSOR)");
        });

        it("leaves a free port unannotated", () => {
            const { portItems } = row({ serialFunction: "GPS" });

            expect(portItems.value.find((i) => i.value === 1).label).toEqual("UART2");
        });

        it("reports the port the function is on as the selection", () => {
            store.assign("GPS", 2);
            const { selectedValue } = row({ serialFunction: "GPS" });

            expect(selectedValue.value).toEqual(2);
        });

        it("reports no selection when the function is unassigned", () => {
            const { selectedValue } = row({ serialFunction: "GPS" });

            expect(selectedValue.value).toEqual(NO_PORT);
        });

        it("disables every port for a function the build does not support", () => {
            FC.CONFIG.buildOptions = ["USE_VTX"]; // no USE_GPS
            const { portItems } = row({ serialFunction: "GPS" });

            expect(portItems.value.slice(1).every((i) => i.disabled)).toBe(true);
        });

        it("is disabled until the store has loaded", () => {
            setActivePinia(createPinia());
            const { loaded } = row({ serialFunction: "GPS" });

            expect(loaded.value).toBe(false);
        });
    });

    // The point of the whole design: a control on a feature tab must not change shared state until
    // the user saves, or an assignment made here turns up on the Ports tab having never been saved.
    describe("edits are held locally until apply", () => {
        it("leaves the shared store untouched when a port is picked", () => {
            const r = row({ serialFunction: "GPS" });

            r.selectPort(0);

            expect(store.portById(0).sensor).toEqual("");
            expect(store.dirty).toBe(false);
        });

        it("shows the pending choice as the selection", () => {
            const r = row({ serialFunction: "GPS" });

            r.selectPort(0);

            expect(r.selectedValue.value).toEqual(0);
            expect(r.hasPendingChange.value).toBe(true);
        });

        it("assigns the function only once applied", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(0);

            r.apply();

            expect(store.portById(0).sensor).toEqual("GPS");
            expect(store.dirty).toBe(true);
            expect(r.hasPendingChange.value).toBe(false);
        });

        it("clears the function only once applied", () => {
            store.assign("GPS", 0);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(NO_PORT);
            expect(store.portById(0).sensor).toEqual("GPS");

            r.apply();
            expect(store.portById(0).sensor).toEqual("");
        });

        it("drops the pending edit on reset, the way an unmount drops the component", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(0);

            r.reset();

            expect(r.hasPendingChange.value).toBe(false);
            expect(r.selectedValue.value).toEqual(NO_PORT);
            expect(store.portById(0).sensor).toEqual("");
        });

        it("reports no pending change when the saved port is re-picked", () => {
            store.assign("GPS", 0);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(0);

            expect(r.hasPendingChange.value).toBe(false);
        });

        it("changes nothing when applied with nothing pending", () => {
            const r = row({ serialFunction: "GPS" });

            r.apply();

            expect(store.dirty).toBe(false);
        });

        it("follows the store for an untouched field", async () => {
            const r = row({ serialFunction: "GPS" });
            expect(r.selectedValue.value).toEqual(NO_PORT);

            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0, ["GPS"])];
            await store.loadConfig({ force: true });

            expect(r.selectedValue.value).toEqual(0);
        });
    });

    describe("eviction warnings", () => {
        it("previews what saving would displace, without displacing it", () => {
            store.assign("ESC_SENSOR", 1);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(1);

            expect(evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "ESC_SENSOR" }]);
            expect(store.portById(1).sensor).toEqual("ESC_SENSOR"); // still there until saved
        });

        it("does not warn about the function the user is moving", () => {
            store.assign("GPS", 0);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(1);

            expect(evictions.value).toEqual([]);
        });

        it("does not warn when clearing the function", () => {
            store.assign("GPS", 0);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(NO_PORT);

            expect(evictions.value).toEqual([]);
        });

        it("does not warn when nothing would be displaced", () => {
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(0);

            expect(evictions.value).toEqual([]);
        });

        it("warns about MSP being turned off by a function that cannot share the port", () => {
            store.assign("MSP", 1);
            const { selectPort, evictions } = row({ serialFunction: "TELEMETRY_SMARTPORT" });

            selectPort(1);

            expect(evictions.value).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "MSP" });
        });

        it("replaces the previous warning rather than accumulating", () => {
            store.assign("ESC_SENSOR", 1);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(1);
            expect(r.evictions.value).toHaveLength(1);

            r.selectPort(2);
            expect(r.evictions.value).toEqual([]);
        });
    });

    describe("MSP on the chosen port", () => {
        it("reflects the chosen port's MSP setting", () => {
            store.assign("MSP", 1);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(1);

            expect(r.msp.value).toBe(true);
        });

        it("holds an MSP change until applied", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);

            r.setMsp(true);

            expect(r.msp.value).toBe(true);
            expect(store.portById(1).msp).toBe(false);
            expect(r.hasPendingChange.value).toBe(true);

            r.apply();
            expect(store.portById(1).msp).toBe(true);
        });

        it("turns MSP off on the chosen port when applied", () => {
            store.assign("MSP", 1);
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);

            r.setMsp(false);
            r.apply();

            expect(store.portById(1).msp).toBe(false);
        });

        it("can turn MSP off for a USB VCP the function already sits on", async () => {
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP", "BLACKBOX"]), fcPort(0)];
            await store.loadConfig({ force: true });
            const r = row({ serialFunction: "BLACKBOX" });

            expect(r.mspDisabled.value).toBe(false);

            r.setMsp(false);
            r.apply();

            expect(store.portById(20).msp).toBe(false);
        });

        it("follows the selection from one port to another", () => {
            store.assign("MSP", 1);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(1);
            expect(r.msp.value).toBe(true);

            r.selectPort(2);
            expect(r.msp.value).toBe(false);
        });

        it("discards a pending MSP edit when the port changes under it", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);
            r.setMsp(true);

            r.selectPort(2);
            r.apply();

            expect(store.portById(1).msp).toBe(false);
            expect(store.portById(2).msp).toBe(false);
        });

        it("is unavailable until a port is chosen", () => {
            const r = row({ serialFunction: "GPS" });

            expect(r.mspDisabled.value).toBe(true);
        });

        it("holds an MSP baudrate change until applied", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);

            r.setMspBaudrate("9600");

            expect(r.mspBaudrate.value).toEqual("9600");
            expect(store.portById(1).msp_baudrate).toEqual("115200");

            r.apply();
            expect(store.portById(1).msp_baudrate).toEqual("9600");
        });

        it("offers the MSP baudrate list", () => {
            const r = row({ serialFunction: "GPS" });

            expect(labels(r.mspBaudItems.value)).toContain("115200");
        });
    });

    // Telemetry is one slot per port carrying one of six protocols, so the row offers the protocol
    // and the port together.
    describe("a row over a whole group", () => {
        const telemetryRow = () => row({ group: "telemetry", baudField: "telemetry_baudrate" });

        it("offers every protocol in the group plus a disabled option", () => {
            const { functionItems } = telemetryRow();

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(functionItems.value.map((i) => i.value)).toContain("TELEMETRY_MAVLINK");
            expect(functionItems.value.map((i) => i.value)).toContain("TELEMETRY_SMARTPORT");
        });

        it("reports whichever protocol the FC has assigned", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const { activeFunction } = telemetryRow();

            expect(activeFunction.value).toEqual("TELEMETRY_MAVLINK");
        });

        it("reports none when no protocol is assigned", () => {
            expect(telemetryRow().activeFunction.value).toEqual("");
        });

        it("offers no ports until a protocol is chosen", () => {
            // The template hides the port row entirely in this state; the list is empty either way.
            const r = telemetryRow();

            expect(r.portItems.value.filter((i) => i.value !== NO_PORT)).toEqual([]);

            r.selectFunction("TELEMETRY_MAVLINK");
            expect(r.portItems.value.filter((i) => i.value !== NO_PORT).length).toBeGreaterThan(0);
        });

        it("keeps the port when only the protocol changes", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = telemetryRow();

            r.selectFunction("TELEMETRY_SMARTPORT");

            // The user picked that UART for their wiring, not for the protocol.
            expect(r.selectedValue.value).toEqual(1);
        });

        it("holds the protocol choice until applied", () => {
            const r = telemetryRow();

            r.selectFunction("TELEMETRY_MAVLINK");
            r.selectPort(1);

            expect(store.portById(1).telemetry).toEqual("");
            expect(r.hasPendingChange.value).toBe(true);

            r.apply();
            expect(store.portById(1).telemetry).toEqual("TELEMETRY_MAVLINK");
        });

        it("frees the protocol it replaces, wherever that was", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = telemetryRow();

            r.selectFunction("TELEMETRY_SMARTPORT");
            r.selectPort(2);
            r.apply();

            expect(store.portById(1).telemetry).toEqual("");
            expect(store.portById(2).telemetry).toEqual("TELEMETRY_SMARTPORT");
        });

        it("swaps protocol in place when the port is left alone", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = telemetryRow();

            r.selectFunction("TELEMETRY_SMARTPORT");
            r.apply();

            expect(store.portById(1).telemetry).toEqual("TELEMETRY_SMARTPORT");
        });

        it("turns telemetry off when the disabled option is chosen", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = telemetryRow();

            r.selectFunction(NO_FUNCTION);
            r.apply();

            expect(store.portById(1).telemetry).toEqual("");
        });

        it("drops a pending port when the protocol changes under it", () => {
            const r = telemetryRow();
            r.selectFunction("TELEMETRY_MAVLINK");
            r.selectPort(1);

            r.selectFunction("TELEMETRY_SMARTPORT");

            expect(r.selectedValue.value).toEqual(NO_PORT);
        });

        // C4: telemetry and peripherals are mutually exclusive on one port, and on a contextual
        // editor the cleared value is on a screen the user is not looking at.
        it("warns that taking a port would evict the peripheral on it", () => {
            store.assign("BLACKBOX", 1);
            const r = telemetryRow();

            r.selectFunction("TELEMETRY_MAVLINK");
            r.selectPort(1);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX"); // not yet displaced
        });

        it("actually evicts the peripheral once applied", () => {
            store.assign("BLACKBOX", 1);
            const r = telemetryRow();

            r.selectFunction("TELEMETRY_MAVLINK");
            r.selectPort(1);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(1).telemetry).toEqual("TELEMETRY_MAVLINK");
        });

        it("carries the telemetry baudrate for the chosen port", () => {
            const r = telemetryRow();
            r.selectFunction("TELEMETRY_MAVLINK");
            r.selectPort(1);

            r.setBaudrate("115200");
            r.apply();

            expect(store.portById(1).telemetry_baudrate).toEqual("115200");
        });

        it("is a plain single-function row when no group is given", () => {
            const r = row({ serialFunction: "GPS" });

            expect(r.hasGroup.value).toBe(false);
            expect(r.activeFunction.value).toEqual("GPS");
        });
    });

    // VtxTab wants four of the peripherals group and must not offer blackbox or the serial
    // rangefinder, which sit in the same slot but belong to other tabs.
    describe("a row over an allow-list of functions", () => {
        const VTX_FUNCTIONS = ["IRC_TRAMP", "TBS_SMARTAUDIO", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"];
        const vtxRow = () => row({ functions: VTX_FUNCTIONS });

        it("offers only the named functions", () => {
            const { functionItems } = vtxRow();

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(
                functionItems.value
                    .slice(1)
                    .map((i) => i.value)
                    .sort(),
            ).toEqual([...VTX_FUNCTIONS].sort());
        });

        it("omits a function that is in the group but not on the list", () => {
            const { functionItems } = vtxRow();

            const offered = functionItems.value.map((i) => i.value);
            expect(offered).not.toContain("BLACKBOX");
            expect(offered).not.toContain("LIDAR_TF");
            expect(offered).not.toContain("FRSKY_OSD");
        });

        it("behaves like a group row, with a protocol picker", () => {
            const { hasGroup } = vtxRow();

            expect(hasGroup.value).toBe(true);
        });

        it("narrows the group when both are given", () => {
            const { functionItems } = row({ group: "peripherals", functions: ["IRC_TRAMP"] });

            expect(functionItems.value.map((i) => i.value)).toEqual([NO_FUNCTION, "IRC_TRAMP"]);
        });

        it("assigns the chosen function once applied", () => {
            const r = vtxRow();

            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(1);

            expect(store.portById(1).peripheral).toEqual("");
            expect(r.hasPendingChange.value).toBe(true);

            r.apply();
            expect(store.portById(1).peripheral).toEqual("TBS_SMARTAUDIO");
        });

        it("reports whichever of the named functions the FC has assigned", () => {
            store.assign("IRC_TRAMP", 2);

            expect(vtxRow().activeFunction.value).toEqual("IRC_TRAMP");
        });

        it("ignores an assignment of a function outside the list", () => {
            store.assign("BLACKBOX", 2);

            expect(vtxRow().activeFunction.value).toEqual("");
        });

        it("frees the function it replaces, wherever that was", () => {
            store.assign("IRC_TRAMP", 1);
            const r = vtxRow();

            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(2);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(2).peripheral).toEqual("TBS_SMARTAUDIO");
        });

        it("previews evicting a function it does not itself offer", () => {
            // The slot is shared with blackbox even though this row cannot select it (C1/C4).
            store.assign("BLACKBOX", 1);
            const r = vtxRow();

            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(1);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX"); // not yet displaced

            r.apply();
            expect(store.portById(1).peripheral).toEqual("TBS_SMARTAUDIO");
        });

        it("never offers an item with an empty value", () => {
            const r = vtxRow();
            r.selectFunction("VTX_MSP");

            for (const list of [r.functionItems, r.portItems, r.mspBaudItems]) {
                for (const item of list.value) {
                    expect(item.value, JSON.stringify(item)).not.toEqual("");
                }
            }
        });
    });

    // Reka UI reserves the empty string for clearing a select and showing its placeholder, and
    // throws "A <SelectItem /> must have a value prop that is not an empty string" if an item
    // carries it. Every list this row feeds to a USelect has to respect that.
    describe("select item values", () => {
        it("never offers an item with an empty value", () => {
            const rows = [
                row({ serialFunction: "GPS", baudField: "gps_baudrate" }),
                row({ group: "telemetry", baudField: "telemetry_baudrate" }),
            ];

            for (const r of rows) {
                for (const list of [r.portItems, r.baudItems, r.mspBaudItems, r.functionItems]) {
                    for (const item of list.value) {
                        expect(item.value, JSON.stringify(item)).not.toEqual("");
                    }
                }
            }
        });

        it("offers the no-protocol option under a non-empty sentinel", () => {
            const { functionItems } = row({ group: "telemetry" });

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(NO_FUNCTION).not.toEqual("");
        });

        it("shows the sentinel as the selection when no protocol is assigned", () => {
            const r = row({ group: "telemetry" });

            expect(r.activeFunction.value).toEqual("");
            expect(r.selectedFunction.value).toEqual(NO_FUNCTION);
        });

        it("shows the protocol name as the selection when one is assigned", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = row({ group: "telemetry" });

            expect(r.selectedFunction.value).toEqual("TELEMETRY_MAVLINK");
        });

        it("reads the sentinel back as no protocol", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = row({ group: "telemetry" });

            r.selectFunction(NO_FUNCTION);

            expect(r.activeFunction.value).toEqual("");
            r.apply();
            expect(store.portById(1).telemetry).toEqual("");
        });
    });

    // Regression: a picker can only show one assignment, but firmware can legally hold two of its
    // functions on two ports - a SmartAudio VTX on one UART and a RunCam split camera on another.
    // The row used to show one, silently clear the other on save, and warn about nothing.
    describe("more than one of the row's functions assigned", () => {
        const vtxRow = () => row({ functions: ["IRC_TRAMP", "TBS_SMARTAUDIO", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"] });

        beforeEach(async () => {
            FC.SERIAL_CONFIG.ports = [
                fcPort(20, ["MSP"]),
                fcPort(2, ["TBS_SMARTAUDIO"]),
                fcPort(4, ["RUNCAM_DEVICE_CONTROL"]),
            ];
            await store.loadConfig({ force: true });
        });

        it("names the assignment it cannot show", () => {
            const r = vtxRow();
            const shown = r.activeFunction.value;

            expect(r.hiddenAssignments.value).toHaveLength(1);
            expect(r.hiddenAssignments.value[0].serialFunction).not.toEqual(shown);
            expect(r.hiddenAssignments.value[0].portName).toBeTruthy();
        });

        it("warns before deleting the protocol it replaces", () => {
            const r = vtxRow();
            const replaced = r.activeFunction.value;

            r.selectFunction("IRC_TRAMP");

            expect(r.evictions.value).toContainEqual(expect.objectContaining({ serialFunction: replaced }));
        });

        it("still deletes it on apply, but only after having said so", () => {
            const r = vtxRow();
            const replaced = r.activeFunction.value;
            r.selectFunction("IRC_TRAMP");
            const warned = r.evictions.value.map((e) => e.serialFunction);

            r.apply();

            const stillAssigned = store.ports.some((p) => store.portUses(p, replaced));
            expect(stillAssigned).toBe(false);
            expect(warned).toContain(replaced);
        });

        it("reports nothing hidden when only one is assigned", async () => {
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(2, ["TBS_SMARTAUDIO"])];
            await store.loadConfig({ force: true });

            expect(vtxRow().hiddenAssignments.value).toEqual([]);
        });

        it("reports nothing hidden for a single-function row", () => {
            expect(row({ serialFunction: "GPS" }).hiddenAssignments.value).toEqual([]);
        });
    });

    // Port-only: pick a UART and turn MSP on, assigning no serial function. An MT-family
    // rangefinder speaks MSP (MSP2_SENSOR_RANGEFINDER_LIDARMT), so it has no function bit of its
    // own - all it needs is MSP on the UART it is wired to.
    describe("port-only mode", () => {
        const portRow = () => row({ portOnly: true });

        it("offers every port except USB VCP, and no unassigned option", () => {
            const items = portRow().portItems.value;

            expect(items.map((i) => i.value)).toEqual([0, 1, 2]);
            expect(items.map((i) => i.value)).not.toContain(NO_PORT);
            expect(items.map((i) => i.value)).not.toContain(20);
        });

        it("annotates each port with what it already carries", () => {
            store.assign("GPS", 1);
            const items = portRow().portItems.value;

            expect(items.find((i) => i.value === 1).label).toContain("portsFunction_GPS");
            expect(items.find((i) => i.value === 2).label).toEqual("UART3");
        });

        it("preselects the UART already carrying MSP", () => {
            store.assign("MSP", 1);

            expect(portRow().selectedValue.value).toEqual(1);
        });

        it("does not preselect USB VCP, which always has MSP", () => {
            expect(portRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("treats picking a port as navigation, not a change", () => {
            const r = portRow();

            r.selectPort(1);

            expect(r.hasPendingChange.value).toBe(false);
            expect(store.dirty).toBe(false);
        });

        it("assigns no serial function on apply", () => {
            const r = portRow();
            r.selectPort(1);

            r.apply();

            expect(store.portById(1).sensor).toEqual("");
            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(1).telemetry).toEqual("");
        });

        it("enables MSP on the chosen port, deferred until apply", () => {
            const r = portRow();
            r.selectPort(2);

            r.setMsp(true);
            expect(r.hasPendingChange.value).toBe(true);
            expect(store.portById(2).msp).toBe(false);

            r.apply();
            expect(store.portById(2).msp).toBe(true);
        });

        it("turns MSP back off", () => {
            store.assign("MSP", 1);
            const r = portRow();

            expect(r.msp.value).toBe(true);
            r.setMsp(false);
            r.apply();

            expect(store.portById(1).msp).toBe(false);
        });

        it("carries the MSP baudrate for the chosen port", () => {
            const r = portRow();
            r.selectPort(1);

            r.setMspBaudrate("9600");
            expect(store.portById(1).msp_baudrate).toEqual("115200");

            r.apply();
            expect(store.portById(1).msp_baudrate).toEqual("9600");
        });

        it("keeps the MSP switch unusable until a port is chosen", () => {
            expect(portRow().mspDisabled.value).toBe(true);
        });

        it("warns about nothing, since it displaces nothing", () => {
            store.assign("GPS", 1);
            const r = portRow();

            r.selectPort(1);
            r.setMsp(true);

            expect(r.evictions.value).toEqual([]);
        });
    });

    // Port and function are separate decisions for a sensor: every module needs a UART, only some
    // need a function bit on it. TF/Nooploop/UPT1 open FUNCTION_LIDAR; an MT module reports over MSP
    // and wants no function at all.
    describe("port-only with an optional function switch", () => {
        const lidarRow = () => row({ portOnly: true, toggleFunction: "LIDAR_TF" });

        it("offers the switch only when a function is named", () => {
            expect(row({ portOnly: true }).hasFunctionToggle.value).toBe(false);
            expect(lidarRow().hasFunctionToggle.value).toBe(true);
        });

        it("labels the switch with the function's display name", () => {
            expect(lidarRow().functionToggleLabel.value).toEqual("portsFunction_LIDAR_TF");
        });

        it("is unusable until a port is chosen", () => {
            expect(lidarRow().functionToggleDisabled.value).toBe(true);
        });

        it("reports the function already on the chosen port", () => {
            store.assign("LIDAR_TF", 1);
            const r = lidarRow();

            expect(r.selectedValue.value).toEqual(1);
            expect(r.functionEnabled.value).toBe(true);
        });

        it("holds the assignment until applied", () => {
            const r = lidarRow();
            r.selectPort(1);

            r.setFunctionEnabled(true);
            expect(r.hasPendingChange.value).toBe(true);
            expect(store.portById(1).peripheral).toEqual("");

            r.apply();
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });

        it("clears the function from that port when switched off", () => {
            store.assign("LIDAR_TF", 1);
            const r = lidarRow();

            r.setFunctionEnabled(false);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
        });

        it("previews what enabling it would displace", () => {
            store.assign("BLACKBOX", 1);
            const r = lidarRow();
            r.selectPort(1);

            r.setFunctionEnabled(true);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX");
        });

        it("warns about nothing while the switch is off", () => {
            store.assign("BLACKBOX", 1);
            const r = lidarRow();
            r.selectPort(1);

            expect(r.evictions.value).toEqual([]);
        });

        it("still carries MSP independently of the function", () => {
            const r = lidarRow();
            r.selectPort(1);

            r.setMsp(true);
            r.setFunctionEnabled(true);
            r.apply();

            expect(store.portById(1).msp).toBe(true);
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });

        it("drops a pending function toggle when the port changes under it", () => {
            const r = lidarRow();
            r.selectPort(1);
            r.setFunctionEnabled(true);

            r.selectPort(2);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(2).peripheral).toEqual("");
        });

        it("assigns no function at all when none is named - the MT case", () => {
            const r = row({ portOnly: true });
            r.selectPort(1);
            r.setMsp(true);

            r.apply();

            expect(store.portById(1).msp).toBe(true);
            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(1).sensor).toEqual("");
        });
    });

    describe("baudrate", () => {
        it("is absent for a function with no baudrate", () => {
            const { hasBaudField, baudItems } = row({ serialFunction: "ESC_SENSOR" });

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        it("reads the chosen port's value", () => {
            const r = row({ serialFunction: "GPS", baudField: "gps_baudrate" });
            r.selectPort(0);

            expect(r.hasBaudField.value).toBe(true);
            expect(r.baudrate.value).toEqual("57600");
        });

        it("holds a change until applied", () => {
            const r = row({ serialFunction: "GPS", baudField: "gps_baudrate" });
            r.selectPort(0);

            r.setBaudrate("115200");

            expect(r.baudrate.value).toEqual("115200");
            expect(store.portById(0).gps_baudrate).toEqual("57600");

            r.apply();
            expect(store.portById(0).gps_baudrate).toEqual("115200");
        });

        it("counts as a pending change on its own", () => {
            store.assign("GPS", 0);
            const r = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            r.setBaudrate("115200");

            expect(r.hasPendingChange.value).toBe(true);
        });

        it("is empty while the function is unassigned", () => {
            const r = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            expect(r.baudrate.value).toEqual("");
        });

        it("offers the list matching the field", () => {
            const { baudItems } = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            expect(labels(baudItems.value)).toContain("AUTO");
            expect(labels(baudItems.value)).toContain("115200");
        });
    });
});
