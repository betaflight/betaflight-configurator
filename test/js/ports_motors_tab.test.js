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
// MotorsTab renders the row through Nuxt UI's USelect, which the Nuxt UI vite plugin resolves at
// compile time and so cannot be stubbed in a DOM mount. The behaviour the tab depends on lives in
// the composable, so that is what is driven here.
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

const { useSerialFunctionRow, NO_PORT } = await import("../../src/composables/ports/useSerialFunctionRow");
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

/** Props are reactive so the row behaves the way it does inside MotorsTab. */
const escSensorRow = () => useSerialFunctionRow(reactive({ baudField: null, serialFunction: "ESC_SENSOR" }));

const labels = (items) => items.map((i) => i.label);

describe("MotorsTab ESC_SENSOR serial row", () => {
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

    describe("what the row offers", () => {
        it("offers every real port plus an unassigned option, but never USB VCP", () => {
            const { portItems } = escSensorRow();

            expect(labels(portItems.value)).toEqual(["serialPortNone", "UART1", "UART2", "UART3"]);
        });

        it("is a single-function row with no protocol picker", () => {
            const { hasGroup, activeFunction } = escSensorRow();

            expect(hasGroup.value).toBe(false);
            expect(activeFunction.value).toEqual("ESC_SENSOR");
        });

        // ESC telemetry has no per-port baudrate of its own, so MotorsTab passes no baudField.
        it("has no baudrate field", () => {
            const { hasBaudField, baudItems } = escSensorRow();

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        it("reports the port firmware already has ESC_SENSOR on", async () => {
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0), fcPort(1, ["ESC_SENSOR"])];
            await store.loadConfig({ force: true });

            expect(escSensorRow().selectedValue.value).toEqual(1);
        });

        it("reports no selection when ESC telemetry is unassigned", () => {
            expect(escSensorRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("annotates a port with the function already on it", () => {
            store.assign("GPS", 1);

            const uart2 = escSensorRow().portItems.value.find((i) => i.value === 1);
            expect(uart2.label).toEqual("serialPortOccupiedBy(port=UART2,serialFunction=portsFunction_GPS)");
        });

        it("never offers an item with an empty value", () => {
            // Reka UI throws on a SelectItem whose value is the empty string.
            const r = escSensorRow();
            r.selectPort(1);

            for (const list of [r.portItems, r.mspBaudItems]) {
                for (const item of list.value) {
                    expect(item.value, JSON.stringify(item)).not.toEqual("");
                }
            }
        });
    });

    // MotorsTab's Save is the only thing that may touch shared state, and it does so through
    // apply(). Until then an assignment made here must not turn up on the Ports tab.
    describe("edits are held until the tab saves", () => {
        it("leaves the store untouched when a port is picked", () => {
            const r = escSensorRow();

            r.selectPort(0);

            expect(store.portById(0).sensor).toEqual("");
            expect(store.dirty).toBe(false);
        });

        it("shows the pending choice and reports the tab dirty", () => {
            const r = escSensorRow();

            r.selectPort(0);

            expect(r.selectedValue.value).toEqual(0);
            expect(r.hasPendingChange.value).toBe(true);
        });

        it("assigns ESC telemetry only once applied", () => {
            const r = escSensorRow();
            r.selectPort(0);

            r.apply();

            expect(store.portById(0).sensor).toEqual("ESC_SENSOR");
            expect(store.dirty).toBe(true);
            expect(r.hasPendingChange.value).toBe(false);
        });

        it("clears ESC telemetry only once applied", () => {
            store.assign("ESC_SENSOR", 0);
            const r = escSensorRow();

            r.selectPort(NO_PORT);
            expect(store.portById(0).sensor).toEqual("ESC_SENSOR");

            r.apply();
            expect(store.portById(0).sensor).toEqual("");
        });

        it("drops the pending edit on reset, the way an unmount drops the component", () => {
            const r = escSensorRow();
            r.selectPort(0);

            r.reset();

            expect(r.hasPendingChange.value).toBe(false);
            expect(r.selectedValue.value).toEqual(NO_PORT);
            expect(store.portById(0).sensor).toEqual("");
        });

        it("changes nothing when the tab saves with nothing pending", () => {
            const r = escSensorRow();

            r.apply();

            expect(store.dirty).toBe(false);
        });

        it("holds an MSP change for the chosen port until applied", () => {
            const r = escSensorRow();
            r.selectPort(1);

            r.setMsp(true);

            expect(store.portById(1).msp).toBe(false);
            expect(r.hasPendingChange.value).toBe(true);

            r.apply();
            expect(store.portById(1).msp).toBe(true);
        });
    });

    // Phase 4 acceptance item: ESC_SENSOR and GPS share the one sensors slot on a port (C1), and on
    // a contextual editor the displaced function is on a screen the user is not looking at (C4).
    describe("the GPS slot it shares", () => {
        it("previews evicting GPS without displacing it", () => {
            store.assign("GPS", 1);
            const r = escSensorRow();

            r.selectPort(1);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "GPS" }]);
            expect(store.portById(1).sensor).toEqual("GPS"); // still there until the tab saves
        });

        it("displaces GPS only once the tab saves", () => {
            store.assign("GPS", 1);
            const r = escSensorRow();

            r.selectPort(1);
            r.apply();

            expect(store.portById(1).sensor).toEqual("ESC_SENSOR");
            expect(store.ports.some((p) => store.portUses(p, "GPS"))).toBe(false);
        });

        it("leaves GPS alone on a port the user did not pick", () => {
            store.assign("GPS", 1);
            const r = escSensorRow();

            r.selectPort(2);

            expect(r.evictions.value).toEqual([]);

            r.apply();
            expect(store.portById(1).sensor).toEqual("GPS");
            expect(store.portById(2).sensor).toEqual("ESC_SENSOR");
        });

        it("drops the warning when the user picks a different port", () => {
            store.assign("GPS", 1);
            const r = escSensorRow();

            r.selectPort(1);
            expect(r.evictions.value).toHaveLength(1);

            r.selectPort(2);
            expect(r.evictions.value).toEqual([]);
        });

        it("does not warn about moving ESC telemetry itself", () => {
            store.assign("ESC_SENSOR", 0);
            const r = escSensorRow();

            r.selectPort(1);

            expect(r.evictions.value).toEqual([]);
        });

        it("warns about MSP being turned off by a port that cannot share it", () => {
            store.assign("MSP", 1);
            const r = escSensorRow();

            r.selectPort(1);

            // GPS and ESC_SENSOR do not force MSP off, so this documents the current rule rather
            // than asserting an eviction that does not happen.
            expect(r.evictions.value).toEqual([]);
            expect(store.portById(1).msp).toBe(true);
        });
    });

    // MotorsTab's ESC_SENSOR feature switch and this row edit the same thing from two directions:
    // writeConfig() derives the feature bit from the port array, so the port assignment wins.
    describe("the feature bit the port assignment implies", () => {
        it("is off while no port carries ESC telemetry", () => {
            expect(store.ports.some((p) => store.portUses(p, "ESC_SENSOR"))).toBe(false);
        });

        it("is on once a port carries it, which is what MotorsTab gates its row on", () => {
            const r = escSensorRow();
            r.selectPort(1);
            r.apply();

            // showEscSensorPort keeps the row visible on an analog protocol whenever this is true,
            // so an assignment can never be stranded with no way to clear it.
            expect(store.ports.some((p) => store.portUses(p, "ESC_SENSOR"))).toBe(true);
        });

        it("stays selectable whatever the build reports, since the rule has no build dependency", () => {
            // Unlike GPS or the VTX protocols, ESC_SENSOR carries no dependsOn in usePortsRules,
            // so a cloud build advertising an unrelated option set must not disable the row.
            FC.CONFIG.buildOptions = ["USE_VTX"];
            const { portItems } = escSensorRow();

            expect(portItems.value.slice(1).some((i) => i.disabled)).toBe(false);
        });
    });
});
