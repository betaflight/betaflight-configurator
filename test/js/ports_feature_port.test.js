import { describe, expect, it } from "vitest";
import {
    buildBaudOptions,
    buildPortOptions,
    findFeaturePortIdentifier,
} from "../../src/composables/ports/useFeaturePort";
import { GPS_BAUD_RATES } from "../../src/composables/ports/featureBaudRates";
import { PORT_NONE } from "../../src/composables/ports/portNames";

const ports = [
    { identifier: 20, functions: ["MSP"] },
    { identifier: 51, functions: [] },
    { identifier: 53, functions: ["RX_SERIAL"] },
];

describe("findFeaturePortIdentifier", () => {
    it("finds the port the feature is assigned to", () => {
        expect(findFeaturePortIdentifier(ports, "RX_SERIAL")).toBe(53);
        expect(findFeaturePortIdentifier(ports, "MSP")).toBe(20);
    });

    it("reports no port when the feature is unassigned", () => {
        expect(findFeaturePortIdentifier(ports, "GPS")).toBe(PORT_NONE);
    });

    it("survives a port list the FC has not filled in", () => {
        expect(findFeaturePortIdentifier([], "RX_SERIAL")).toBe(PORT_NONE);
        expect(findFeaturePortIdentifier(undefined, "RX_SERIAL")).toBe(PORT_NONE);
        expect(findFeaturePortIdentifier([{ identifier: 51 }], "RX_SERIAL")).toBe(PORT_NONE);
    });

    it("takes the first claimant when two ports carry the function", () => {
        const duplicated = [
            { identifier: 51, functions: ["RX_SERIAL"] },
            { identifier: 53, functions: ["RX_SERIAL"] },
        ];

        expect(findFeaturePortIdentifier(duplicated, "RX_SERIAL")).toBe(51);
    });
});

describe("buildPortOptions", () => {
    const options = () => buildPortOptions(ports, { functionName: "RX_SERIAL", noneLabel: "None" });

    it("offers None first, then the FC's ports in order", () => {
        expect(options().map((option) => option.value)).toEqual([PORT_NONE, 20, 51, 53]);
        expect(options()[0].label).toBe("None");
    });

    it("annotates a port another feature has claimed", () => {
        expect(options().find((option) => option.value === 20).label).toBe("USB VCP (MSP)");
    });

    it("leaves the feature's own claim out of the annotation", () => {
        expect(options().find((option) => option.value === 53).label).toBe("UART3");
        expect(options().find((option) => option.value === 51).label).toBe("UART1");
    });

    it("runs the annotation through the caller's translator", () => {
        const translated = buildPortOptions(ports, {
            functionName: "RX_SERIAL",
            describeFunction: (name) => name.toLowerCase(),
        });

        expect(translated.find((option) => option.value === 20).label).toBe("USB VCP (msp)");
    });

    it("keeps a current assignment the FC did not report, so the select never blanks", () => {
        const withMissing = buildPortOptions(ports, { functionName: "RX_SERIAL", currentIdentifier: 57 });

        expect(withMissing.map((option) => option.value)).toContain(57);
        expect(withMissing.find((option) => option.value === 57).label).toBe("UART7");
    });

    it("does not duplicate a current assignment that is already listed", () => {
        const values = buildPortOptions(ports, { functionName: "RX_SERIAL", currentIdentifier: 53 }).map(
            (option) => option.value,
        );

        expect(values.filter((value) => value === 53)).toHaveLength(1);
        expect(values.filter((value) => value === PORT_NONE)).toHaveLength(1);
    });

    it("copes with no ports at all", () => {
        expect(buildPortOptions(undefined, { functionName: "RX_SERIAL" })).toHaveLength(1);
    });
});

describe("buildBaudOptions", () => {
    it("offers the feature's rates, labelled as they are sent", () => {
        expect(buildBaudOptions(GPS_BAUD_RATES)).toEqual(GPS_BAUD_RATES.map((rate) => ({ value: rate, label: rate })));
    });

    it("does not offer AUTO for GPS, which the firmware silently reads as 230400", () => {
        expect(GPS_BAUD_RATES).not.toContain("AUTO");
    });

    it("keeps a stored rate the feature no longer offers", () => {
        const values = buildBaudOptions(GPS_BAUD_RATES, "AUTO").map((option) => option.value);

        expect(values).toContain("AUTO");
        expect(values).toHaveLength(GPS_BAUD_RATES.length + 1);
    });

    it("does not duplicate a stored rate that is already offered", () => {
        expect(buildBaudOptions(GPS_BAUD_RATES, "57600")).toHaveLength(GPS_BAUD_RATES.length);
    });

    it("copes with a feature that has no baud of its own", () => {
        expect(buildBaudOptions(undefined)).toEqual([]);
    });
});
