import { describe, expect, it } from "vitest";
import {
    DEFAULT_PORT_LABELS,
    expectNoEmptySelectValues,
    fcPort,
    labels,
    loadFcPorts,
    loadPortsEnv,
    savedFunctions,
} from "./serialPorts";

const { NO_PORT } = await loadPortsEnv();

/**
 * The contract every serial row keeps, whichever tab hosts it and whichever function it edits.
 *
 * Each host passes different props - one function or a protocol picker, a sensors slot or a
 * peripherals one - but the promise to the user is the same everywhere: the row offers the same
 * ports, names what saving would displace, and changes nothing shared until the tab's Save calls
 * apply(). Asserting that once per host is the point; hand-copying it per host is what this
 * replaces.
 *
 * @param {object} contract
 * @param {() => object} contract.makeRow          the row as its tab mounts it
 * @param {() => object} contract.getStore         the store the tab shares with the Ports tab
 * @param {string} contract.serialFunction         the function this row assigns
 * @param {"sensor"|"peripheral"|"telemetry"} contract.slot  where that function lands on a port
 * @param {string} contract.occupant               a function of the same slot, owned by another tab
 */
export function describeSerialRowContract({ makeRow, getStore, serialFunction, slot, occupant }) {
    /** The row ready to edit `serialFunction`, whether or not it has a protocol picker. */
    function openRow() {
        const row = makeRow();
        if (row.hasGroup.value && !row.activeFunction.value) {
            row.selectFunction(serialFunction);
        }
        return row;
    }

    const assigned = (portId) => getStore().portById(portId)[slot];

    describe("the ports it offers", () => {
        it("offers every real port plus an unassigned option, but never USB VCP", () => {
            // USB VCP is the app's own link, not a place a feature's serial link goes.
            expect(labels(openRow().portItems.value)).toEqual(DEFAULT_PORT_LABELS);
        });

        it("annotates a port with the function already on it", () => {
            getStore().assign(occupant, 1);

            const uart2 = openRow().portItems.value.find((i) => i.value === 1);
            expect(uart2.label).toEqual(`serialPortOccupiedBy(port=UART2,serialFunction=portsFunction_${occupant})`);
        });

        it("leaves a free port unannotated", () => {
            expect(openRow().portItems.value.find((i) => i.value === 1).label).toEqual("UART2");
        });

        it("reports the port the function is on as the selection", () => {
            getStore().assign(serialFunction, 2);

            expect(makeRow().selectedValue.value).toEqual(2);
        });

        it("reports no selection when the function is unassigned", () => {
            expect(makeRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("never offers a select item with an empty value", () => {
            const row = openRow();
            row.selectPort(1);

            expectNoEmptySelectValues(row);
        });
    });

    // The point of the whole design: a control on a feature tab must not change shared state until
    // the user saves, or an assignment made here turns up on the Ports tab having never been saved.
    describe("edits are held until the tab saves", () => {
        it("leaves the shared store untouched when a port is picked", () => {
            const row = openRow();

            row.selectPort(1);

            expect(assigned(1)).toEqual("");
            expect(getStore().dirty).toBe(false);
        });

        it("shows the pending choice, so the tab's Save button can light up", () => {
            const row = openRow();

            row.selectPort(1);

            expect(row.selectedValue.value).toEqual(1);
            expect(row.hasPendingChange.value).toBe(true);
        });

        it("assigns the function only once applied", () => {
            const row = openRow();
            row.selectPort(1);

            row.apply();

            expect(assigned(1)).toEqual(serialFunction);
            expect(getStore().dirty).toBe(true);
            expect(row.hasPendingChange.value).toBe(false);
        });

        it("clears the function only once applied", () => {
            getStore().assign(serialFunction, 1);
            const row = makeRow();

            row.selectPort(NO_PORT);
            expect(assigned(1)).toEqual(serialFunction);

            row.apply();
            expect(assigned(1)).toEqual("");
        });

        it("moves the assignment rather than duplicating it", () => {
            getStore().assign(serialFunction, 1);
            const row = makeRow();

            row.selectPort(2);
            row.apply();

            expect(assigned(1)).toEqual("");
            expect(assigned(2)).toEqual(serialFunction);
        });

        it("reports no pending change when the saved port is re-picked", () => {
            getStore().assign(serialFunction, 1);
            const row = makeRow();

            row.selectPort(1);

            expect(row.hasPendingChange.value).toBe(false);
        });

        it("changes nothing when the tab saves with nothing pending", () => {
            makeRow().apply();

            expect(getStore().dirty).toBe(false);
        });

        it("drops the pending edit on reset, the way an unmount drops the component", () => {
            const row = openRow();
            row.selectPort(1);

            row.reset();

            expect(row.hasPendingChange.value).toBe(false);
            expect(row.selectedValue.value).toEqual(NO_PORT);
            expect(assigned(1)).toEqual("");
        });

        it("follows the store when the tab reloads under it", async () => {
            const row = makeRow();
            expect(row.selectedValue.value).toEqual(NO_PORT);

            await loadFcPorts(getStore(), [fcPort(20, ["MSP"]), fcPort(0, [serialFunction])]);

            expect(row.selectedValue.value).toEqual(0);
        });
    });

    // C1/C4: the slot is shared with functions edited on tabs the user is not looking at, so what
    // saving would clear has to be named here rather than discovered afterwards.
    describe("eviction preview", () => {
        it("previews what saving would displace, without displacing it", () => {
            getStore().assign(occupant, 1);
            const row = openRow();

            row.selectPort(1);

            expect(row.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: occupant }]);
            expect(assigned(1)).toEqual(occupant); // still there until the tab saves
        });

        it("displaces it only once the tab saves", () => {
            getStore().assign(occupant, 1);
            const row = openRow();

            row.selectPort(1);
            row.apply();

            expect(assigned(1)).toEqual(serialFunction);
        });

        it("stays quiet when the chosen port is free", () => {
            const row = openRow();

            row.selectPort(1);

            expect(row.evictions.value).toEqual([]);
        });

        it("does not warn about the function the user is moving", () => {
            getStore().assign(serialFunction, 1);
            const row = makeRow();

            row.selectPort(2);

            expect(row.evictions.value).toEqual([]);
        });

        it("replaces the previous warning rather than accumulating", () => {
            getStore().assign(occupant, 1);
            const row = openRow();

            row.selectPort(1);
            expect(row.evictions.value).toHaveLength(1);

            row.selectPort(2);
            expect(row.evictions.value).toEqual([]);
        });

        it("leaves an untouched port alone", () => {
            getStore().assign(occupant, 1);
            const row = openRow();

            row.selectPort(2);
            row.apply();

            expect(assigned(1)).toEqual(occupant);
            expect(assigned(2)).toEqual(serialFunction);
        });
    });

    describe("MSP on the chosen port", () => {
        it("is unavailable until a port is chosen", () => {
            expect(makeRow().mspDisabled.value).toBe(true);
        });

        it("holds an MSP change until applied", () => {
            const row = openRow();
            row.selectPort(1);

            row.setMsp(true);

            expect(getStore().portById(1).msp).toBe(false);
            expect(row.hasPendingChange.value).toBe(true);

            row.apply();
            expect(getStore().portById(1).msp).toBe(true);
        });
    });

    // The tab's Save hands the whole array to the FC through the store, rather than writing the
    // one port it edited - see C2 in the plan.
    describe("what the tab's save writes", () => {
        it("puts the function on the chosen port, leaving the rest of the array intact", async () => {
            getStore().assign("MSP", 2);
            const row = openRow();
            row.selectPort(1);
            row.apply();

            await getStore().writeConfig();

            expect(savedFunctions(1)).toContain(serialFunction);
            expect(savedFunctions(2)).toContain("MSP");
            expect(getStore().dirty).toBe(false);
        });

        it("takes the function off the array when the port is cleared", async () => {
            getStore().assign(serialFunction, 1);
            const row = makeRow();

            row.selectPort(NO_PORT);
            row.apply();
            await getStore().writeConfig();

            expect(savedFunctions(1)).not.toContain(serialFunction);
        });
    });
}
