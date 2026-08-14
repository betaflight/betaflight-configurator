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
// OnboardLoggingTab renders the row through Nuxt UI's USelect, which the Nuxt UI vite plugin
// resolves at compile time and so cannot be stubbed in a DOM mount. The behaviour the tab depends
// on lives in the composable, which is what these exercise.
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
const Features = (await import("../../src/js/Features")).default;

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

/** The row exactly as OnboardLoggingTab.vue mounts it. Props are reactive, as in a component. */
const blackboxRow = () =>
    useSerialFunctionRow(reactive({ serialFunction: "BLACKBOX", baudField: "blackbox_baudrate" }));

const labels = (items) => items.map((i) => i.label);

describe("OnboardLogging blackbox serial row", () => {
    let store;

    beforeEach(async () => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mspPromise.mockImplementation(() => Promise.resolve({}));
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.CONFIG.buildOptions = [];
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);

        store = useSerialPortsStore();
        FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0), fcPort(1), fcPort(2)];
        await store.loadConfig({ force: true });
    });

    describe("port options", () => {
        it("offers every real port plus an unassigned option, but never USB VCP", () => {
            // An OpenLager is wired to a UART; USB VCP carries the app's own link.
            const { portItems } = blackboxRow();

            expect(labels(portItems.value)).toEqual(["serialPortNone", "UART1", "UART2", "UART3"]);
        });

        it("still lists USB VCP when firmware already put blackbox there", async () => {
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP", "BLACKBOX"]), fcPort(0)];
            await store.loadConfig({ force: true });

            const { portItems, selectedValue } = blackboxRow();

            expect(portItems.value.some((i) => i.value === 20)).toBe(true);
            expect(selectedValue.value).toEqual(20);
        });

        it("reports the port blackbox is on as the selection", () => {
            store.assign("BLACKBOX", 2);

            expect(blackboxRow().selectedValue.value).toEqual(2);
        });

        it("reports no selection when blackbox has no port", () => {
            expect(blackboxRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("annotates a port with the peripheral already on it", () => {
            store.assign("TBS_SMARTAUDIO", 1);
            const { portItems } = blackboxRow();

            expect(portItems.value.find((i) => i.value === 1).label).toEqual(
                "serialPortOccupiedBy(port=UART2,serialFunction=portsFunction_TBS_SMARTAUDIO)",
            );
        });

        it("never offers an item with an empty value", () => {
            // Reka UI throws on a SelectItem whose value is the empty string.
            const r = blackboxRow();
            r.selectPort(1);

            for (const list of [r.portItems, r.baudItems, r.mspBaudItems]) {
                for (const item of list.value) {
                    expect(item.value, JSON.stringify(item)).not.toEqual("");
                }
            }
        });
    });

    // The tab's Save button is the only thing that may change shared state: an assignment made here
    // must not turn up on the Ports tab having never been saved.
    describe("edits are held locally until the tab saves", () => {
        it("leaves the store untouched when a port is picked", () => {
            const r = blackboxRow();

            r.selectPort(0);

            expect(store.portById(0).peripheral).toEqual("");
            expect(store.dirty).toBe(false);
            expect(r.hasPendingChange.value).toBe(true);
            expect(r.selectedValue.value).toEqual(0);
        });

        it("assigns blackbox to the peripherals slot only once applied", () => {
            const r = blackboxRow();
            r.selectPort(0);

            r.apply();

            expect(store.portById(0).peripheral).toEqual("BLACKBOX");
            expect(store.dirty).toBe(true);
            expect(r.hasPendingChange.value).toBe(false);
        });

        it("clears blackbox only once applied", () => {
            store.assign("BLACKBOX", 0);
            const r = blackboxRow();

            r.selectPort(NO_PORT);
            expect(store.portById(0).peripheral).toEqual("BLACKBOX");

            r.apply();
            expect(store.portById(0).peripheral).toEqual("");
        });

        it("drops the draft on reset, the way switching the device selector away unmounts it", () => {
            // The row is behind v-if on the serial device option, so leaving that option must not
            // leave a pending assignment behind for the next save to write.
            const r = blackboxRow();
            r.selectPort(0);

            r.reset();

            expect(r.hasPendingChange.value).toBe(false);
            expect(r.selectedValue.value).toEqual(NO_PORT);
            expect(store.portById(0).peripheral).toEqual("");
        });

        it("reports no pending change when the saved port is re-picked", () => {
            store.assign("BLACKBOX", 0);
            const r = blackboxRow();

            r.selectPort(0);

            expect(r.hasPendingChange.value).toBe(false);
        });
    });

    // The acceptance item for this tab: the row carries blackbox_baudrate, not some other list.
    describe("blackbox baudrate", () => {
        it("is present, and offers the blackbox list rather than the GPS one", () => {
            const { hasBaudField, baudItems } = blackboxRow();

            expect(hasBaudField.value).toBe(true);
            expect(labels(baudItems.value)).toContain("AUTO");
            expect(labels(baudItems.value)).toContain("2470000"); // blackbox-only rate
        });

        it("reads the chosen port's value", () => {
            const r = blackboxRow();
            r.selectPort(0);

            expect(r.baudrate.value).toEqual("115200");
        });

        it("holds a change until applied, then writes blackbox_baudrate", () => {
            const r = blackboxRow();
            r.selectPort(0);

            r.setBaudrate("2000000");

            expect(r.baudrate.value).toEqual("2000000");
            expect(store.portById(0).blackbox_baudrate).toEqual("115200");

            r.apply();
            expect(store.portById(0).blackbox_baudrate).toEqual("2000000");
            expect(store.portById(0).gps_baudrate).toEqual("57600"); // untouched
        });

        it("counts as a pending change on its own, so the Save button enables", () => {
            store.assign("BLACKBOX", 0);
            const r = blackboxRow();

            r.setBaudrate("2000000");

            expect(r.hasPendingChange.value).toBe(true);
        });

        it("is empty while blackbox has no port", () => {
            expect(blackboxRow().baudrate.value).toEqual("");
        });
    });

    // C1: blackbox shares the peripherals slot with the VTX protocols and the serial rangefinder,
    // which live on other tabs - so the eviction has to be previewed here, not discovered later.
    describe("eviction warnings", () => {
        it("previews displacing the rangefinder, without displacing it", () => {
            store.assign("LIDAR_TF", 1);
            const r = blackboxRow();

            r.selectPort(1);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "LIDAR_TF" }]);
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF"); // still there until saved

            r.apply();
            expect(store.portById(1).peripheral).toEqual("BLACKBOX");
        });

        it("previews displacing telemetry, which cannot share the port", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const r = blackboxRow();

            r.selectPort(1);

            expect(r.evictions.value).toContainEqual({
                portId: 1,
                portName: "UART2",
                serialFunction: "TELEMETRY_MAVLINK",
            });
        });

        it("does not warn about blackbox itself when it is moved to another port", () => {
            store.assign("BLACKBOX", 0);
            const r = blackboxRow();

            r.selectPort(1);

            expect(r.evictions.value).toEqual([]);
        });
    });

    // There is no separate "enable blackbox serial" switch on this tab: assigning the port is the
    // whole action, and the tab's save writes it through the store rather than on its own.
    describe("what the tab's save writes", () => {
        const portFunctions = (identifier) => FC.SERIAL_CONFIG.ports.find((p) => p.identifier === identifier).functions;

        it("puts blackbox on the chosen port, leaving the rest of the array intact", async () => {
            store.assign("MSP", 2);
            const r = blackboxRow();
            r.selectPort(1);
            r.apply();

            await store.writeConfig();

            expect(portFunctions(1)).toContain("BLACKBOX");
            expect(portFunctions(2)).toContain("MSP"); // C2: the write carries every port
            expect(store.dirty).toBe(false);
        });

        it("takes blackbox off the array when the port is cleared", async () => {
            store.assign("BLACKBOX", 1);
            const r = blackboxRow();

            r.selectPort(NO_PORT);
            r.apply();
            await store.writeConfig();

            expect(portFunctions(1)).not.toContain("BLACKBOX");
        });

        it("stays clean when nothing was edited, so no reboot is spent", () => {
            const r = blackboxRow();

            r.apply();

            expect(store.dirty).toBe(false);
        });
    });
});
