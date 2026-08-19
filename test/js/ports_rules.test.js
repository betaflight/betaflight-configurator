import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (key) => key },
}));

const { usePortsRules } = await import("../../src/composables/ports/usePortsRules");
const FC = (await import("../../src/js/fc")).default;
const messages = (await import("../../locales/en/messages.json")).default;

function rulesAt(apiVersion) {
    FC.CONFIG.apiVersion = apiVersion;
    return usePortsRules();
}

describe("usePortsRules", () => {
    beforeEach(() => {
        // usePortsRules reads the build options through useBuildOptions, which reaches FC.CONFIG
        // via the fc store - so the rules need a Pinia, even though nothing here touches a store
        // directly.
        setActivePinia(createPinia());
        FC.resetState();
        FC.CONFIG.buildOptions = [];
    });

    describe("GIMBAL (bit 18)", () => {
        it("is offered from API 1.47, where firmware introduced it", () => {
            const { functionRules } = rulesAt("1.47.0");
            const gimbal = functionRules.find((r) => r.name === "GIMBAL");

            expect(gimbal).toBeDefined();
            expect(gimbal.groups).toEqual(["peripherals"]);
        });

        it("is still offered on API 1.48, where the bit has not moved", () => {
            const { functionRules } = rulesAt("1.48.0");
            expect(functionRules.some((r) => r.name === "GIMBAL")).toBe(true);
        });

        it("is not offered on API 1.46, where the bit does not exist", () => {
            const { functionRules } = rulesAt("1.46.0");
            expect(functionRules.some((r) => r.name === "GIMBAL")).toBe(false);
        });

        it("carries no dependsOn, so a cloud build cannot hide it by accident", () => {
            // USE_GIMBAL is absent from the build-option key map in fc.js, so a dependsOn
            // would never match and would disable the option on every cloud build.
            const { functionRules, isRuleDisabled } = rulesAt("1.48.0");
            const gimbal = functionRules.find((r) => r.name === "GIMBAL");

            expect(gimbal.dependsOn).toBeUndefined();

            FC.CONFIG.buildOptions = ["USE_VTX"];
            expect(isRuleDisabled(gimbal)).toBeFalsy();
        });
    });

    describe("bits 19 and 20", () => {
        it("are not offered while their meaning is ambiguous", () => {
            // 2026.6.1 puts LIDAR_NL on 19; master from c18421eb puts OSD_CUSTOM_TEXT there.
            // Both report 1.48, so neither can be named until the firmware bump separates them.
            for (const apiVersion of ["1.46.0", "1.47.0", "1.48.0"]) {
                const names = rulesAt(apiVersion).functionRules.map((r) => r.name);

                expect(names).not.toContain("LIDAR_NL");
                expect(names).not.toContain("OSD_CUSTOM_TEXT");
            }
        });

        it("offers OSD_CUSTOM_TEXT from 1.49, where bit 19 is settled", () => {
            const { functionRules } = rulesAt("1.49.0");
            const rule = functionRules.find((r) => r.name === "OSD_CUSTOM_TEXT");

            expect(rule).toBeDefined();
            expect(rule.groups).toEqual(["peripherals"]);
        });

        it("never offers LIDAR_NL, which 1.49 folded into the bit 15 rangefinder", () => {
            const names = rulesAt("1.49.0").functionRules.map((r) => r.name);

            expect(names).not.toContain("LIDAR_NL");
        });
    });

    describe("maxPorts", () => {
        it("matches the firmware's MAX_MSP_PORT_COUNT of 3", () => {
            const { functionRules } = rulesAt("1.48.0");
            expect(functionRules.find((r) => r.name === "MSP").maxPorts).toEqual(3);
        });

        it("is set on every rule, so the UI can enforce it", () => {
            const { functionRules } = rulesAt("1.48.0");
            for (const rule of functionRules) {
                expect(rule.maxPorts, `${rule.name} has no maxPorts`).toBeGreaterThan(0);
            }
        });
    });

    describe("English labels", () => {
        it("labels bit 15 neutrally rather than naming one rangefinder brand", () => {
            // Master unified LIDAR_TF and LIDAR_NL into this bit and picks the driver from
            // rangefinder_hardware, so a brand name here is wrong on newer firmware.
            expect(messages.portsFunction_LIDAR_TF.message).toEqual("Serial rangefinder");
        });

        it("has a label for every function rule offered on the newest supported API", () => {
            const { functionRules } = rulesAt("1.49.0");
            for (const rule of functionRules) {
                expect(messages[`portsFunction_${rule.name}`], `missing portsFunction_${rule.name}`).toBeDefined();
            }
        });

        it("has the strings the Ports tab needs for preserved and rejected states", () => {
            expect(messages.serialPortReserved).toBeDefined();
            expect(messages.serialPortReservedHelp).toBeDefined();
            expect(messages.portsSaveRejected).toBeDefined();
        });

        it("uses the key that exists for the saved-to-EEPROM message", () => {
            // usePortsConfiguration used to ask for "portsEepromSave", which is not defined.
            expect(messages.portsEepromSave).toBeUndefined();
            expect(messages.portsEepromSaved).toBeDefined();
        });
    });
});
