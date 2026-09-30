import { beforeEach, describe, expect, it } from "vitest";
import { usePreflight, type CurrentWeather } from "../../src/composables/usePreflight";

const preflight = usePreflight();

function calmWeather(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
    return {
        temperature: 20,
        humidity: 50,
        dewPoint: 5,
        apparentTemperature: 20,
        precipitation: 0,
        rain: 0,
        windSpeed: 2,
        windDirection: 0,
        windGusts: 3,
        cloudCover: 10,
        visibility: 20000,
        weatherCode: 0,
        weatherDescription: "preflightWmoClearSky",
        pressure: 1013.25,
        isDay: 1,
        ...overrides,
    };
}

describe("usePreflight launchStatus", () => {
    beforeEach(() => {
        preflight.weather.current = null;
        preflight.solar.kpIndex = null;
        preflight.location.elevation = null;
    });

    it("reports no data until weather or solar data arrives", () => {
        expect(preflight.launchStatus.value.level).toBe("unknown");
        expect(preflight.launchStatus.value.checks).toEqual([]);
    });

    it("takes the worst level across the checks", () => {
        preflight.weather.current = calmWeather({ windGusts: 12 });
        preflight.solar.kpIndex = 1;

        expect(preflight.launchStatus.value.level).toBe("warning");
        expect(preflight.launchStatus.value.label).toBe("preflightStatusWarning");
        expect(preflight.launchStatus.value.checks.map((c) => c.nameKey)).toEqual([
            "preflightCheckWind",
            "preflightCheckVisibility",
            "preflightCheckPrecipitation",
            "preflightCheckBattery",
            "preflightCheckSolar",
        ]);
    });

    it("lists an unknown check without letting it lower a go", () => {
        preflight.weather.current = calmWeather({ visibility: null as unknown as number });

        const status = preflight.launchStatus.value;
        expect(status.checks.find((c) => c.nameKey === "preflightCheckVisibility")?.level).toBe("unknown");
        expect(status.level).toBe("good");
        expect(status.cssClass).toBe("status-good");
    });
});

describe("usePreflight status helpers", () => {
    it("classifies wind by the stronger of speed and gusts", () => {
        expect(preflight.getWindStatus(3, 13).level).toBe("warning");
        expect(preflight.getWindStatus(null, undefined).level).toBe("good");
    });

    it("computes density altitude only when every input is present", () => {
        expect(preflight.getDensityAltitude(null, 1013.25, 15)).toBeNull();
        expect(preflight.getDensityAltitude(0, 1013.25, 15)).toBe(0);
    });

    it("labels wind direction by the nearest of 16 compass points", () => {
        expect(preflight.getWindDirectionLabel(0)).toBe("N");
        expect(preflight.getWindDirectionLabel(350)).toBe("N");
        expect(preflight.getWindDirectionLabel(null)).toBe("");
    });
});
