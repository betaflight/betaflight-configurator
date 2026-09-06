import { describe, expect, it } from "vitest";
import VirtualFC from "../../src/js/VirtualFC";
import { FIRMWARE_BUILD_OPTIONS } from "../../src/js/build_options.js";
import CONFIGURATOR, {
    API_VERSION_1_44,
    API_VERSION_1_45,
    API_VERSION_1_46,
    API_VERSION_1_47,
    API_VERSION_1_48,
} from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import Features from "../../src/js/Features";

const VIRTUAL_API_VERSIONS = [API_VERSION_1_44, API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48];

describe("Virtual FC build options", () => {
    it("only reports option names that firmware can emit", () => {
        VirtualFC.setVirtualConfig();

        const unreportable = FC.CONFIG.buildOptions.filter((option) => !Object.hasOwn(FIRMWARE_BUILD_OPTIONS, option));

        expect(unreportable).toEqual([]);
    });

    it("only gates features on reportable option fragments", () => {
        const definitions = new Features({ apiVersion: API_VERSION_1_48, buildOptions: [] }).getFeatures();
        const optionNames = Object.keys(FIRMWARE_BUILD_OPTIONS);
        const unmatched = definitions
            .filter(
                (feature) =>
                    feature.dependsOn !== undefined &&
                    !optionNames.some((option) => option.includes(feature.dependsOn)),
            )
            .map((feature) => ({ name: feature.name, dependsOn: feature.dependsOn }));

        expect(unmatched).toEqual([]);
    });

    it.each(VIRTUAL_API_VERSIONS)(
        "keeps the features it enables available after option filtering on API %s",
        (apiVersion) => {
            CONFIGURATOR.virtualApiVersion = apiVersion;
            VirtualFC.setVirtualConfig();

            const expectedStates = {
                ESC_SENSOR: true,
                SONAR: true,
                TELEMETRY: true,
                TRANSPONDER: true,
            };
            const actualStates = Object.fromEntries(
                Object.keys(expectedStates).map((name) => [name, FC.FEATURE_CONFIG.features.isEnabled(name)]),
            );

            expect(actualStates).toEqual(expectedStates);
        },
    );
});
