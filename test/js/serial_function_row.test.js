import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
    expectNoEmptySelectValues,
    fcPort,
    labels,
    loadFcPorts,
    loadPortsEnv,
    makeRow,
    resetPortsEnv,
    values,
} from "./helpers/serialPorts";
import { describeSerialRowContract } from "./helpers/serialRowContract";

// The row renders through Nuxt UI's USelect, which the Nuxt UI vite plugin resolves at compile
// time and so cannot be stubbed in a DOM mount. The logic under test lives in the composable
// instead - see test/js/helpers/serialPorts.js for the environment that stands the rest up.
const { FC, NO_PORT, NO_FUNCTION } = await loadPortsEnv();

describe("useSerialFunctionRow", () => {
    let store;

    beforeEach(async () => {
        store = await resetPortsEnv();
    });

    // The contract every host keeps, driven here through the plainest shape there is: one function,
    // one port. The four feature tabs run the same suite against their own props.
    describeSerialRowContract({
        makeRow: () => makeRow({ serialFunction: "GPS" }),
        getStore: () => store,
        serialFunction: "GPS",
        slot: "sensor",
        occupant: "ESC_SENSOR",
    });

    describe("port options", () => {
        it("still lists USB VCP when firmware already put the function there", async () => {
            await loadFcPorts(store, [fcPort(20, ["MSP", "BLACKBOX"]), fcPort(0)]);

            const { portItems, selectedValue } = makeRow({ serialFunction: "BLACKBOX" });

            expect(portItems.value.some((i) => i.value === 20)).toBe(true);
            expect(selectedValue.value).toEqual(20);
        });

        it("disables every port for a function the build does not support", () => {
            FC.CONFIG.buildOptions = ["USE_VTX"]; // no USE_GPS
            const { portItems } = makeRow({ serialFunction: "GPS" });

            expect(portItems.value.slice(1).every((i) => i.disabled)).toBe(true);
        });

        it("is disabled until the store has loaded", () => {
            setActivePinia(createPinia());

            expect(makeRow({ serialFunction: "GPS" }).loaded.value).toBe(false);
        });
    });

    describe("MSP on the chosen port", () => {
        it("reflects the chosen port's MSP setting", () => {
            store.assign("MSP", 1);
            const row = makeRow({ serialFunction: "GPS" });

            row.selectPort(1);

            expect(row.msp.value).toBe(true);
        });

        it("turns MSP off on the chosen port when applied", () => {
            store.assign("MSP", 1);
            const row = makeRow({ serialFunction: "GPS" });
            row.selectPort(1);

            row.setMsp(false);
            row.apply();

            expect(store.portById(1).msp).toBe(false);
        });

        it("can turn MSP off for a USB VCP the function already sits on", async () => {
            await loadFcPorts(store, [fcPort(20, ["MSP", "BLACKBOX"]), fcPort(0)]);
            const row = makeRow({ serialFunction: "BLACKBOX" });

            expect(row.mspDisabled.value).toBe(false);

            row.setMsp(false);
            row.apply();

            expect(store.portById(20).msp).toBe(false);
        });

        it("follows the selection from one port to another", () => {
            store.assign("MSP", 1);
            const row = makeRow({ serialFunction: "GPS" });

            row.selectPort(1);
            expect(row.msp.value).toBe(true);

            row.selectPort(2);
            expect(row.msp.value).toBe(false);
        });

        it("discards a pending MSP edit when the port changes under it", () => {
            const row = makeRow({ serialFunction: "GPS" });
            row.selectPort(1);
            row.setMsp(true);

            row.selectPort(2);
            row.apply();

            expect(store.portById(1).msp).toBe(false);
            expect(store.portById(2).msp).toBe(false);
        });

        it("holds an MSP baudrate change until applied", () => {
            const row = makeRow({ serialFunction: "GPS" });
            row.selectPort(1);

            row.setMspBaudrate("9600");

            expect(row.mspBaudrate.value).toEqual("9600");
            expect(store.portById(1).msp_baudrate).toEqual("115200");

            row.apply();
            expect(store.portById(1).msp_baudrate).toEqual("9600");
        });

        // Reported on the PR: the switch used to write port.msp straight through, so it could
        // hand firmware a fourth MSP port - and firmware refuses the whole serial write for it,
        // taking every other port on the tab down with it. MAX_MSP_PORT_COUNT is 3, VCP included.
        describe("the three-port MSP cap", () => {
            const atTheLimit = () => {
                // USB VCP holds one, so two UARTs fill it.
                store.assign("MSP", 0);
                store.assign("MSP", 1);
            };

            it("disables the switch on a port that would be the fourth", () => {
                atTheLimit();
                const row = makeRow({ serialFunction: "GPS" });

                row.selectPort(2);

                expect(row.mspDisabled.value).toBe(true);
            });

            it("leaves it usable while a slot is free", () => {
                store.assign("MSP", 0);
                const row = makeRow({ serialFunction: "GPS" });

                row.selectPort(2);

                expect(row.mspDisabled.value).toBe(false);
            });

            it("still lets a port already carrying MSP turn it off", () => {
                atTheLimit();
                const row = makeRow({ serialFunction: "GPS" });

                row.selectPort(1);

                expect(row.mspDisabled.value).toBe(false);

                row.setMsp(false);
                row.apply();
                expect(store.portById(1).msp).toBe(false);
            });

            // Reported on the PR: two rows on one tab (ReceiverTab hosts two, both with an MSP
            // switch) can each queue an enable while one slot is left. Both switches were legal
            // when flipped - the store still said two - and the first apply() takes the slot.
            describe("two rows racing for the last slot", () => {
                const twoRowsBothEnabling = () => {
                    store.assign("MSP", 0); // VCP + UART1 = two of three, one left
                    const first = makeRow({ serialFunction: "GPS" });
                    const second = makeRow({ serialFunction: "BLACKBOX" });

                    first.selectPort(1);
                    second.selectPort(2);
                    expect(first.mspDisabled.value).toBe(false); // legal when flipped...
                    expect(second.mspDisabled.value).toBe(false); // ...for both

                    first.setMsp(true);
                    second.setMsp(true);
                    return { first, second };
                };

                it("gives the slot to whichever applies first", () => {
                    const { first, second } = twoRowsBothEnabling();

                    first.apply();
                    second.apply();

                    expect(store.portById(1).msp).toBe(true);
                    expect(store.portById(2).msp).toBe(false);
                });

                it("keeps the refused edit instead of dropping it, and says why", () => {
                    const { first, second } = twoRowsBothEnabling();

                    first.apply();
                    second.apply();

                    expect(second.mspBlocked.value).toBe(true);
                    expect(second.msp.value).toBe(true); // the switch still shows what was asked
                    expect(second.hasPendingChange.value).toBe(true); // so the tab stays dirty
                });

                it("takes it on the next save once a slot is freed", () => {
                    const { first, second } = twoRowsBothEnabling();
                    first.apply();
                    second.apply();

                    store.clear("MSP", 0); // the user frees one elsewhere
                    second.apply();

                    expect(store.portById(2).msp).toBe(true);
                    expect(second.mspBlocked.value).toBe(false);
                    expect(second.hasPendingChange.value).toBe(false);
                });

                it("lets the user take the refused edit back off", () => {
                    const { first, second } = twoRowsBothEnabling();
                    first.apply();
                    second.apply();

                    second.setMsp(false);

                    expect(second.mspBlocked.value).toBe(false);

                    second.apply();
                    expect(second.hasPendingChange.value).toBe(false);
                    expect(store.portById(2).msp).toBe(false);
                });

                it("drops the refused edit when the row is reset", () => {
                    const { first, second } = twoRowsBothEnabling();
                    first.apply();
                    second.apply();

                    second.reset();

                    expect(second.mspBlocked.value).toBe(false);
                    expect(second.hasPendingChange.value).toBe(false);
                });
            });

            it("refuses to write a fourth even if the switch is driven anyway", () => {
                atTheLimit();
                const row = makeRow({ serialFunction: "GPS" });
                row.selectPort(2);

                row.setMsp(true);
                row.apply();

                expect(store.portById(2).msp).toBe(false);
                expect(store.ports.filter((p) => p.msp)).toHaveLength(3);
            });
        });

        it("offers the MSP baudrate list", () => {
            expect(labels(makeRow({ serialFunction: "GPS" }).mspBaudItems.value)).toContain("115200");
        });
    });

    it("warns about MSP being turned off by a function that cannot share the port", () => {
        store.assign("MSP", 1);
        const { selectPort, evictions } = makeRow({ serialFunction: "TELEMETRY_SMARTPORT" });

        selectPort(1);

        expect(evictions.value).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "MSP" });
    });

    // Telemetry is one slot per port carrying one of six protocols, so the row offers the protocol
    // and the port together. VtxTab uses the same shape narrowed to an allow-list; the two are
    // exercised through their own tab files, and what is left here is the group machinery itself.
    describe("a row over a whole group", () => {
        const telemetryRow = () => makeRow({ group: "telemetry", baudField: "telemetry_baudrate" });

        it("offers every protocol in the group plus a disabled option", () => {
            const { functionItems } = telemetryRow();

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(values(functionItems.value)).toContain("TELEMETRY_MAVLINK");
            expect(values(functionItems.value)).toContain("TELEMETRY_SMARTPORT");
        });

        it("reports whichever protocol the FC has assigned", () => {
            store.assign("TELEMETRY_MAVLINK", 1);

            expect(telemetryRow().activeFunction.value).toEqual("TELEMETRY_MAVLINK");
        });

        it("reports none when no protocol is assigned", () => {
            expect(telemetryRow().activeFunction.value).toEqual("");
        });

        it("offers no ports until a protocol is chosen", () => {
            // The template hides the port row entirely in this state; the list is empty either way.
            const row = telemetryRow();

            expect(row.portItems.value.filter((i) => i.value !== NO_PORT)).toEqual([]);

            row.selectFunction("TELEMETRY_MAVLINK");
            expect(row.portItems.value.filter((i) => i.value !== NO_PORT).length).toBeGreaterThan(0);
        });

        it("keeps the port when only the protocol changes", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const row = telemetryRow();

            row.selectFunction("TELEMETRY_SMARTPORT");

            // The user picked that UART for their wiring, not for the protocol.
            expect(row.selectedValue.value).toEqual(1);
        });

        it("swaps protocol in place when the port is left alone", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const row = telemetryRow();

            row.selectFunction("TELEMETRY_SMARTPORT");
            row.apply();

            expect(store.portById(1).telemetry).toEqual("TELEMETRY_SMARTPORT");
        });

        it("frees the protocol it replaces, wherever that was", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const row = telemetryRow();

            row.selectFunction("TELEMETRY_SMARTPORT");
            row.selectPort(2);
            row.apply();

            expect(store.portById(1).telemetry).toEqual("");
            expect(store.portById(2).telemetry).toEqual("TELEMETRY_SMARTPORT");
        });

        it("turns telemetry off when the disabled option is chosen", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const row = telemetryRow();

            row.selectFunction(NO_FUNCTION);
            row.apply();

            expect(store.portById(1).telemetry).toEqual("");
        });

        it("drops a pending port when the protocol changes under it", () => {
            const row = telemetryRow();
            row.selectFunction("TELEMETRY_MAVLINK");
            row.selectPort(1);

            row.selectFunction("TELEMETRY_SMARTPORT");

            expect(row.selectedValue.value).toEqual(NO_PORT);
        });

        // C4: telemetry and peripherals are mutually exclusive on one port, and on a contextual
        // editor the cleared value is on a screen the user is not looking at.
        it("evicts the peripheral that cannot share the port, having warned first", () => {
            store.assign("BLACKBOX", 1);
            const row = telemetryRow();

            row.selectFunction("TELEMETRY_MAVLINK");
            row.selectPort(1);

            expect(row.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX"); // not yet displaced

            row.apply();
            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(1).telemetry).toEqual("TELEMETRY_MAVLINK");
        });

        it("carries the telemetry baudrate for the chosen port", () => {
            const row = telemetryRow();
            row.selectFunction("TELEMETRY_MAVLINK");
            row.selectPort(1);

            row.setBaudrate("115200");
            row.apply();

            expect(store.portById(1).telemetry_baudrate).toEqual("115200");
        });

        it("is a plain single-function row when no group is given", () => {
            const row = makeRow({ serialFunction: "GPS" });

            expect(row.hasGroup.value).toBe(false);
            expect(row.activeFunction.value).toEqual("GPS");
        });
    });

    describe("an allow-list instead of a whole group", () => {
        const VTX_FUNCTIONS = ["IRC_TRAMP", "TBS_SMARTAUDIO", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"];

        it("offers only the named functions", () => {
            const { functionItems } = makeRow({ functions: VTX_FUNCTIONS });

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(values(functionItems.value).slice(1).sort()).toEqual([...VTX_FUNCTIONS].sort());
        });

        it("narrows the group when both are given", () => {
            const { functionItems } = makeRow({ group: "peripherals", functions: ["IRC_TRAMP"] });

            expect(values(functionItems.value)).toEqual([NO_FUNCTION, "IRC_TRAMP"]);
        });

        it("behaves like a group row, with a protocol picker", () => {
            expect(makeRow({ functions: VTX_FUNCTIONS }).hasGroup.value).toBe(true);
        });

        it("ignores an assignment of a function outside the list", () => {
            store.assign("BLACKBOX", 2);

            expect(makeRow({ functions: VTX_FUNCTIONS }).activeFunction.value).toEqual("");
        });
    });

    // Reka UI reserves the empty string for clearing a select and showing its placeholder, and
    // throws "A <SelectItem /> must have a value prop that is not an empty string" if an item
    // carries it. The sentinels are what keep every list it feeds to a USelect legal.
    describe("select item sentinels", () => {
        it("never offers an item with an empty value, whatever shape the row is", () => {
            const rows = [
                makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" }),
                makeRow({ group: "telemetry", baudField: "telemetry_baudrate" }),
                makeRow({ portOnly: true, toggleFunction: "LIDAR_TF" }),
            ];

            for (const row of rows) {
                expectNoEmptySelectValues(row);
            }
        });

        it("offers the no-protocol option under a non-empty sentinel", () => {
            const { functionItems } = makeRow({ group: "telemetry" });

            expect(functionItems.value[0].value).toEqual(NO_FUNCTION);
            expect(NO_FUNCTION).not.toEqual("");
        });

        it("shows the sentinel as the selection when no protocol is assigned", () => {
            const row = makeRow({ group: "telemetry" });

            expect(row.activeFunction.value).toEqual("");
            expect(row.selectedFunction.value).toEqual(NO_FUNCTION);
        });

        it("shows the protocol name as the selection when one is assigned", () => {
            store.assign("TELEMETRY_MAVLINK", 1);

            expect(makeRow({ group: "telemetry" }).selectedFunction.value).toEqual("TELEMETRY_MAVLINK");
        });

        it("reads the sentinel back as no protocol", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const row = makeRow({ group: "telemetry" });

            row.selectFunction(NO_FUNCTION);

            expect(row.activeFunction.value).toEqual("");
            row.apply();
            expect(store.portById(1).telemetry).toEqual("");
        });
    });

    // Regression: a picker can only show one assignment, but firmware can legally hold two of its
    // functions on two ports - a SmartAudio VTX on one UART and a RunCam split camera on another.
    // The row used to show one, silently clear the other on save, and warn about nothing.
    describe("more than one of the row's functions assigned", () => {
        const vtxRow = () =>
            makeRow({ functions: ["IRC_TRAMP", "TBS_SMARTAUDIO", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"] });

        beforeEach(async () => {
            await loadFcPorts(store, [
                fcPort(20, ["MSP"]),
                fcPort(2, ["TBS_SMARTAUDIO"]),
                fcPort(4, ["RUNCAM_DEVICE_CONTROL"]),
            ]);
        });

        it("names the assignment it cannot show", () => {
            const row = vtxRow();
            const shown = row.activeFunction.value;

            expect(row.hiddenAssignments.value).toHaveLength(1);
            expect(row.hiddenAssignments.value[0].serialFunction).not.toEqual(shown);
            expect(row.hiddenAssignments.value[0].portName).toBeTruthy();
        });

        it("warns before deleting the protocol it replaces, and still deletes it on apply", () => {
            const row = vtxRow();
            const replaced = row.activeFunction.value;

            row.selectFunction("IRC_TRAMP");
            expect(row.evictions.value).toContainEqual(expect.objectContaining({ serialFunction: replaced }));

            row.apply();
            expect(store.ports.some((p) => store.portUses(p, replaced))).toBe(false);
        });

        it("reports nothing hidden when only one is assigned", async () => {
            await loadFcPorts(store, [fcPort(20, ["MSP"]), fcPort(2, ["TBS_SMARTAUDIO"])]);

            expect(vtxRow().hiddenAssignments.value).toEqual([]);
        });

        it("reports nothing hidden for a single-function row", () => {
            expect(makeRow({ serialFunction: "GPS" }).hiddenAssignments.value).toEqual([]);
        });
    });

    // Port-only: pick a UART and turn MSP on, assigning no serial function. An MT-family
    // rangefinder speaks MSP (MSP2_SENSOR_RANGEFINDER_LIDARMT), so it has no function bit of its
    // own - all it needs is MSP on the UART it is wired to.
    describe("port-only mode", () => {
        const portRow = () => makeRow({ portOnly: true });

        it("offers every port except USB VCP, and no unassigned option", () => {
            const items = portRow().portItems.value;

            expect(values(items)).toEqual([0, 1, 2]);
        });

        it("annotates each port with what it already carries", () => {
            store.assign("GPS", 1);
            const items = portRow().portItems.value;

            expect(items.find((i) => i.value === 1).label).toContain("portsFunction_GPS");
            expect(items.find((i) => i.value === 2).label).toEqual("UART3");
        });

        // Reported from a board running BLE on UART5: the row used to preselect the first non-VCP
        // port carrying MSP, which announced the sensor was on UART5 because that is where the BLE
        // link is. Picking a port is navigation rather than an edit, and MSP was already on there,
        // so the row then had nothing to save and the tab's Save button never lit up.
        it("does not preselect a port just because something else enabled MSP on it", () => {
            store.assign("MSP", 1);

            expect(portRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("does not preselect USB VCP, which always has MSP", () => {
            expect(portRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("says so when the chosen port already has what the sensor needs", () => {
            store.assign("MSP", 1); // BLE, or a second MSP link
            const r = portRow();

            r.selectPort(1);

            // Nothing to save is the truth here - but it has to be said, or the control reads as
            // broken. MSP on the module's UART is the whole requirement for an MT sensor.
            expect(r.hasPendingChange.value).toBe(false);
            expect(r.mspSatisfied.value).toBe(true);
        });

        it("stays quiet on a port that still needs MSP turned on", () => {
            const r = portRow();

            r.selectPort(1);

            expect(r.mspSatisfied.value).toBe(false);

            r.setMsp(true);
            expect(r.hasPendingChange.value).toBe(true);
            expect(r.mspSatisfied.value).toBe(false); // there is something to save now
        });

        it("stays quiet until a port is chosen", () => {
            store.assign("MSP", 1);

            expect(portRow().mspSatisfied.value).toBe(false);
        });

        it("treats picking a port as navigation, not a change", () => {
            const row = portRow();

            row.selectPort(1);

            expect(row.hasPendingChange.value).toBe(false);
            expect(store.dirty).toBe(false);
        });

        it("assigns no serial function on apply", () => {
            const row = portRow();
            row.selectPort(1);
            row.setMsp(true);

            row.apply();

            expect(store.portById(1).msp).toBe(true);
            expect(store.portById(1).sensor).toEqual("");
            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(1).telemetry).toEqual("");
        });

        it("enables MSP on the chosen port, deferred until apply", () => {
            const row = portRow();
            row.selectPort(2);

            row.setMsp(true);
            expect(row.hasPendingChange.value).toBe(true);
            expect(store.portById(2).msp).toBe(false);

            row.apply();
            expect(store.portById(2).msp).toBe(true);
        });

        it("turns MSP back off", () => {
            store.assign("MSP", 1);
            const row = portRow();
            row.selectPort(1);

            expect(row.msp.value).toBe(true);
            row.setMsp(false);
            row.apply();

            expect(store.portById(1).msp).toBe(false);
        });

        it("carries the MSP baudrate for the chosen port", () => {
            const row = portRow();
            row.selectPort(1);

            row.setMspBaudrate("9600");
            expect(store.portById(1).msp_baudrate).toEqual("115200");

            row.apply();
            expect(store.portById(1).msp_baudrate).toEqual("9600");
        });

        it("keeps the MSP switch unusable until a port is chosen", () => {
            expect(portRow().mspDisabled.value).toBe(true);
        });

        it("warns about nothing, since it displaces nothing", () => {
            store.assign("GPS", 1);
            const row = portRow();

            row.selectPort(1);
            row.setMsp(true);

            expect(row.evictions.value).toEqual([]);
        });
    });

    // Port and function are separate decisions for a sensor: every module needs a UART, only some
    // need a function bit on it. TF/Nooploop/UPT1 open FUNCTION_LIDAR; an MT module reports over MSP
    // and wants no function at all.
    describe("port-only with an optional function switch", () => {
        const lidarRow = () => makeRow({ portOnly: true, toggleFunction: "LIDAR_TF" });

        it("offers the switch only when a function is named", () => {
            expect(makeRow({ portOnly: true }).hasFunctionToggle.value).toBe(false);
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
            const row = lidarRow();

            expect(row.selectedValue.value).toEqual(1);
            expect(row.functionEnabled.value).toBe(true);
        });

        it("holds the assignment until applied", () => {
            const row = lidarRow();
            row.selectPort(1);

            row.setFunctionEnabled(true);
            expect(row.hasPendingChange.value).toBe(true);
            expect(store.portById(1).peripheral).toEqual("");

            row.apply();
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });

        it("clears the function from that port when switched off", () => {
            store.assign("LIDAR_TF", 1);
            const row = lidarRow();

            row.setFunctionEnabled(false);
            row.apply();

            expect(store.portById(1).peripheral).toEqual("");
        });

        it("previews what enabling it would displace", () => {
            store.assign("BLACKBOX", 1);
            const row = lidarRow();
            row.selectPort(1);

            row.setFunctionEnabled(true);

            expect(row.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX");
        });

        it("warns about nothing while the switch is off", () => {
            store.assign("BLACKBOX", 1);
            const row = lidarRow();
            row.selectPort(1);

            expect(row.evictions.value).toEqual([]);
        });

        it("still carries MSP independently of the function", () => {
            const row = lidarRow();
            row.selectPort(1);

            row.setMsp(true);
            row.setFunctionEnabled(true);
            row.apply();

            expect(store.portById(1).msp).toBe(true);
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });

        it("drops a pending function toggle when the port changes under it", () => {
            const row = lidarRow();
            row.selectPort(1);
            row.setFunctionEnabled(true);

            row.selectPort(2);
            row.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(2).peripheral).toEqual("");
        });
    });

    describe("baudrate", () => {
        it("is absent for a function with no baudrate", () => {
            const { hasBaudField, baudItems } = makeRow({ serialFunction: "ESC_SENSOR" });

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        it("reads the chosen port's value", () => {
            const row = makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" });
            row.selectPort(0);

            expect(row.hasBaudField.value).toBe(true);
            expect(row.baudrate.value).toEqual("57600");
        });

        it("holds a change until applied", () => {
            const row = makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" });
            row.selectPort(0);

            row.setBaudrate("115200");

            expect(row.baudrate.value).toEqual("115200");
            expect(store.portById(0).gps_baudrate).toEqual("57600");

            row.apply();
            expect(store.portById(0).gps_baudrate).toEqual("115200");
        });

        it("counts as a pending change on its own", () => {
            store.assign("GPS", 0);
            const row = makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" });

            row.setBaudrate("115200");

            expect(row.hasPendingChange.value).toBe(true);
        });

        it("is empty while the function is unassigned", () => {
            expect(makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" }).baudrate.value).toEqual("");
        });

        it("offers the list matching the field", () => {
            const { baudItems } = makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" });

            expect(labels(baudItems.value)).toContain("AUTO");
            expect(labels(baudItems.value)).toContain("115200");
        });
    });
});
