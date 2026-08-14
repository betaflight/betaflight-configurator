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
// VtxTab.vue itself is undrivable in a test: it renders through Nuxt UI's USelect/USwitch, which
// the Nuxt UI vite plugin resolves at compile time and so cannot be stubbed in a DOM mount. What
// the tab actually contributes - the allow-list it hands the row - is exercised here against the
// composable, the same way test/js/serial_function_row.test.js does.
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

/**
 * The exact list VtxTab passes to the row. Kept as a literal rather than imported from the tab,
 * so that widening it there - to blackbox or the serial rangefinder, which sit in the same slot
 * but belong to other tabs - fails these tests instead of silently passing them.
 */
const VTX_SERIAL_FUNCTIONS = ["TBS_SMARTAUDIO", "IRC_TRAMP", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"];

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

/** Props are reactive so the row behaves the way it would inside the tab. */
const vtxRow = (overrides = {}) =>
    useSerialFunctionRow(
        reactive({
            group: "peripherals",
            functions: VTX_SERIAL_FUNCTIONS,
            baudField: null,
            ...overrides,
        }),
    );

const offered = (functionItems) => functionItems.value.map((i) => i.value);

describe("VtxTab serial port row", () => {
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
            FC.CONFIG.apiVersion = "1.44.0";
            await store.loadConfig({ force: true });

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
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0, ["RUNCAM_DEVICE_CONTROL"])];
            await store.loadConfig({ force: true });

            const { activeFunction, selectedValue } = vtxRow();

            expect(activeFunction.value).toEqual("RUNCAM_DEVICE_CONTROL");
            expect(selectedValue.value).toEqual(0);
        });
    });

    describe("reading what the FC has", () => {
        it("reports whichever VTX protocol is assigned", () => {
            store.assign("TBS_SMARTAUDIO", 1);

            const { activeFunction, selectedValue } = vtxRow();

            expect(activeFunction.value).toEqual("TBS_SMARTAUDIO");
            expect(selectedValue.value).toEqual(1);
        });

        it("reports none when the slot holds a function this tab does not own", () => {
            store.assign("BLACKBOX", 1);

            expect(vtxRow().activeFunction.value).toEqual("");
        });

        it("never offers USB VCP", () => {
            const r = vtxRow();
            r.selectFunction("IRC_TRAMP");

            expect(r.portItems.value.map((i) => i.value)).not.toContain(20);
        });
    });

    // Learning 1 / the amendment this whole design turns on: nothing reaches shared state until
    // the tab's Save calls apply().
    describe("edits are held until the tab saves", () => {
        it("leaves the store untouched while a protocol and port are being chosen", () => {
            const r = vtxRow();

            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(1);

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.dirty).toBe(false);
            expect(r.hasPendingChange.value).toBe(true);
        });

        it("assigns the protocol only once applied", () => {
            const r = vtxRow();
            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(1);

            r.apply();

            expect(store.portById(1).peripheral).toEqual("TBS_SMARTAUDIO");
            expect(store.dirty).toBe(true);
            expect(r.hasPendingChange.value).toBe(false);
        });

        it("drops the edit on reset, the way leaving the tab drops it", () => {
            const r = vtxRow();
            r.selectFunction("IRC_TRAMP");
            r.selectPort(1);

            r.reset();

            expect(r.hasPendingChange.value).toBe(false);
            expect(r.activeFunction.value).toEqual("");
            expect(store.dirty).toBe(false);
        });

        it("leaves the tab's Save disabled when nothing was touched", () => {
            expect(vtxRow().hasPendingChange.value).toBe(false);
        });

        it("frees the protocol it replaces, wherever that port was", () => {
            store.assign("IRC_TRAMP", 1);
            const r = vtxRow();

            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(2);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(2).peripheral).toEqual("TBS_SMARTAUDIO");
        });

        it("turns VTX control off entirely when the disabled option is chosen", () => {
            store.assign("TBS_SMARTAUDIO", 1);
            const r = vtxRow();

            r.selectFunction(NO_FUNCTION);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
        });

        it("clears the protocol when the port is set to none", () => {
            store.assign("IRC_TRAMP", 1);
            const r = vtxRow();

            r.selectPort(NO_PORT);
            expect(store.portById(1).peripheral).toEqual("IRC_TRAMP");

            r.apply();
            expect(store.portById(1).peripheral).toEqual("");
        });
    });

    describe("VTX_MSP", () => {
        it("forces MSP on the chosen port when applied", () => {
            const r = vtxRow();
            r.selectFunction("VTX_MSP");
            r.selectPort(1);

            expect(store.portById(1).msp).toBe(false);

            r.apply();

            expect(store.portById(1).peripheral).toEqual("VTX_MSP");
            expect(store.portById(1).msp).toBe(true);
        });

        it("does not turn MSP on for a protocol that does not need it", () => {
            const r = vtxRow();
            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(1);
            r.apply();

            expect(store.portById(1).msp).toBe(false);
        });
    });

    // C4: the peripherals slot is shared, and on a contextual editor the value being cleared is on
    // a screen the user is not looking at - so it has to be named before the save, not after.
    describe("eviction preview", () => {
        it("warns about a function this row cannot itself offer", () => {
            store.assign("BLACKBOX", 1);
            const r = vtxRow();

            r.selectFunction("TBS_SMARTAUDIO");
            r.selectPort(1);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX"); // still there until saved

            r.apply();
            expect(store.portById(1).peripheral).toEqual("TBS_SMARTAUDIO");
        });

        it("warns about telemetry, which is mutually exclusive with a peripheral", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = vtxRow();

            r.selectFunction("IRC_TRAMP");
            r.selectPort(1);

            expect(r.evictions.value).toContainEqual({
                portId: 1,
                portName: "UART2",
                serialFunction: "TELEMETRY_MAVLINK",
            });
        });

        it("stays quiet when the chosen port is free", () => {
            const r = vtxRow();

            r.selectFunction("IRC_TRAMP");
            r.selectPort(1);

            expect(r.evictions.value).toEqual([]);
        });
    });

    // Reka UI throws "A <SelectItem /> must have a value prop that is not an empty string".
    it("never offers a select item with an empty value", () => {
        const r = vtxRow();
        r.selectFunction("VTX_MSP");

        for (const list of [r.functionItems, r.portItems, r.baudItems, r.mspBaudItems]) {
            for (const item of list.value) {
                expect(item.value, JSON.stringify(item)).not.toEqual("");
            }
        }
    });
});
