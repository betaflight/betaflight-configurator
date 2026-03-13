import { reactive, computed } from "vue";
import geomagnetism from "geomagnetism";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

const SAVED_LOCATIONS_KEY = "preflight_saved_locations";
const MAX_SAVED_LOCATIONS = 5;
const MAX_LABEL_LENGTH = 20;

const WMO_CODES = {
    0: "preflightWmoClearSky",
    1: "preflightWmoMainlyClear",
    2: "preflightWmoPartlyCloudy",
    3: "preflightWmoOvercast",
    45: "preflightWmoFog",
    48: "preflightWmoRimeFog",
    51: "preflightWmoLightDrizzle",
    53: "preflightWmoModerateDrizzle",
    55: "preflightWmoDenseDrizzle",
    56: "preflightWmoLightFreezingDrizzle",
    57: "preflightWmoDenseFreezingDrizzle",
    61: "preflightWmoSlightRain",
    63: "preflightWmoModerateRain",
    65: "preflightWmoHeavyRain",
    66: "preflightWmoLightFreezingRain",
    67: "preflightWmoHeavyFreezingRain",
    71: "preflightWmoSlightSnow",
    73: "preflightWmoModerateSnow",
    75: "preflightWmoHeavySnow",
    77: "preflightWmoSnowGrains",
    80: "preflightWmoSlightRainShowers",
    81: "preflightWmoModerateRainShowers",
    82: "preflightWmoViolentRainShowers",
    85: "preflightWmoSlightSnowShowers",
    86: "preflightWmoHeavySnowShowers",
    95: "preflightWmoThunderstorm",
    96: "preflightWmoThunderstormSlightHail",
    99: "preflightWmoThunderstormHeavyHail",
};

const WIND_DIRECTION_LABELS = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
];

function getWindDirectionLabel(deg) {
    if (deg === null || deg === undefined) {
        return "";
    }
    return WIND_DIRECTION_LABELS[Math.round(deg / 22.5) % 16];
}

function getKpStatus(kp) {
    if (kp === null || kp === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (kp <= 2) {
        return { level: "good", label: "preflightKpLow", cssClass: "status-good" };
    }
    if (kp <= 4) {
        return { level: "moderate", label: "preflightKpModerate", cssClass: "status-moderate" };
    }
    if (kp <= 5) {
        return { level: "warning", label: "preflightKpElevated", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightKpStorm", cssClass: "status-danger" };
}

function getWindStatus(windSpeed, gusts) {
    const maxWind = Math.max(windSpeed || 0, gusts || 0);
    if (maxWind < 5) {
        return { level: "good", label: "preflightWindCalm", cssClass: "status-good" };
    }
    if (maxWind < 8) {
        return { level: "good", label: "preflightWindLight", cssClass: "status-good" };
    }
    if (maxWind < 11) {
        return { level: "moderate", label: "preflightWindModerate", cssClass: "status-moderate" };
    }
    if (maxWind < 14) {
        return { level: "warning", label: "preflightWindStrong", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightWindDangerous", cssClass: "status-danger" };
}

function getVisibilityStatus(vis) {
    if (vis === null || vis === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (vis >= 10000) {
        return { level: "good", label: "preflightVisExcellent", cssClass: "status-good" };
    }
    if (vis >= 5000) {
        return { level: "good", label: "preflightVisGood", cssClass: "status-good" };
    }
    if (vis >= 1000) {
        return { level: "moderate", label: "preflightVisReduced", cssClass: "status-moderate" };
    }
    return { level: "danger", label: "preflightVisPoor", cssClass: "status-danger" };
}

function getPrecipitationStatus(precip) {
    if (precip === null || precip === undefined || precip === 0) {
        return { level: "good", label: "preflightPrecipNone", cssClass: "status-good" };
    }
    if (precip < 1) {
        return { level: "moderate", label: "preflightPrecipLight", cssClass: "status-moderate" };
    }
    if (precip < 5) {
        return { level: "warning", label: "preflightPrecipModerate", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightPrecipHeavy", cssClass: "status-danger" };
}

function browserGeolocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported"));
            return;
        }
        // prettier-ignore
        navigator.geolocation.getCurrentPosition( // NOSONAR - user-initiated, required for preflight location
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (err) => reject(new Error(err.message || "Geolocation failed")),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    });
}

async function ipGeolocation() {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) {
        throw new Error("IP geolocation request failed");
    }
    const data = await response.json();
    if (data.latitude === undefined || data.longitude === undefined) {
        throw new Error("IP geolocation returned no coordinates");
    }
    return {
        latitude: Number.parseFloat(data.latitude),
        longitude: Number.parseFloat(data.longitude),
    };
}

function getDewPointRisk(temp, dewPoint) {
    if (temp === null || dewPoint === null || temp === undefined || dewPoint === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    const spread = temp - dewPoint;
    if (spread > 10) {
        return { level: "good", label: "preflightDewNoRisk", cssClass: "status-good" };
    }
    if (spread > 4) {
        return { level: "moderate", label: "preflightDewLowRisk", cssClass: "status-moderate" };
    }
    if (spread > 2) {
        return { level: "warning", label: "preflightDewFogLikely", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightDewFogExpected", cssClass: "status-danger" };
}

function getUvStatus(uv) {
    if (uv === null || uv === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (uv < 3) {
        return { level: "good", label: "preflightUvLow", cssClass: "status-good" };
    }
    if (uv < 6) {
        return { level: "moderate", label: "preflightUvModerate", cssClass: "status-moderate" };
    }
    if (uv < 8) {
        return { level: "warning", label: "preflightUvHigh", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightUvVeryHigh", cssClass: "status-danger" };
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function usePreflight() {
    const location = reactive({
        latitude: null,
        longitude: null,
        name: "",
        source: "",
    });

    const weather = reactive({
        loading: false,
        error: null,
        current: null,
        hourly: null,
        daily: null,
        lastUpdated: null,
    });

    const mag = reactive({
        declination: null,
        inclination: null,
    });

    const solar = reactive({
        loading: false,
        error: null,
        kpIndex: null,
        kpTimestamp: null,
        stormLevel: null,
        lastUpdated: null,
    });

    const savedLocations = reactive([]);

    function loadSavedLocations() {
        const stored = getConfig(SAVED_LOCATIONS_KEY);
        const locations = stored[SAVED_LOCATIONS_KEY];
        savedLocations.length = 0;
        if (Array.isArray(locations)) {
            locations.slice(0, MAX_SAVED_LOCATIONS).forEach((loc) => {
                savedLocations.push(loc);
            });
        }
    }

    function persistSavedLocations() {
        const obj = {};
        obj[SAVED_LOCATIONS_KEY] = [...savedLocations];
        setConfig(obj);
    }

    function saveCurrentLocation(label) {
        if (location.latitude === null || location.longitude === null) {
            return false;
        }
        const trimmedLabel = String(label).trim().slice(0, MAX_LABEL_LENGTH);
        if (trimmedLabel.length === 0) {
            return false;
        }
        if (savedLocations.length >= MAX_SAVED_LOCATIONS) {
            return false;
        }
        savedLocations.push({
            label: trimmedLabel,
            latitude: location.latitude,
            longitude: location.longitude,
        });
        persistSavedLocations();
        return true;
    }

    function isActiveSavedLocation(entry) {
        return (
            location.source === "saved" &&
            location.latitude === entry.latitude &&
            location.longitude === entry.longitude &&
            location.name === entry.label
        );
    }

    function renameSavedLocation(index, newLabel) {
        if (index < 0 || index >= savedLocations.length) {
            return false;
        }
        const trimmed = String(newLabel).trim().slice(0, MAX_LABEL_LENGTH);
        if (trimmed.length === 0) {
            return false;
        }
        const entry = savedLocations[index];
        const isActive = isActiveSavedLocation(entry);
        entry.label = trimmed;
        if (isActive) {
            location.name = trimmed;
        }
        persistSavedLocations();
        return true;
    }

    function deleteSavedLocation(index) {
        if (index < 0 || index >= savedLocations.length) {
            return;
        }
        const entry = savedLocations[index];
        const isActive = isActiveSavedLocation(entry);
        savedLocations.splice(index, 1);
        if (isActive) {
            location.source = "manual";
            location.name = `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`;
        }
        persistSavedLocations();
    }

    function applySavedLocation(index) {
        if (index < 0 || index >= savedLocations.length) {
            return null;
        }
        const loc = savedLocations[index];
        setManualLocation(loc.latitude, loc.longitude);
        location.name = loc.label;
        location.source = "saved";
        return loc;
    }

    loadSavedLocations();

    const isLoading = computed(() => weather.loading || solar.loading);

    let weatherRequestId = 0;

    async function fetchWeather(lat, lon) {
        const requestId = ++weatherRequestId;
        weather.loading = true;
        weather.error = null;
        try {
            const params = new URLSearchParams({
                latitude: lat,
                longitude: lon,
                current: [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "dew_point_2m",
                    "apparent_temperature",
                    "precipitation",
                    "rain",
                    "wind_speed_10m",
                    "wind_direction_10m",
                    "wind_gusts_10m",
                    "cloud_cover",
                    "visibility",
                    "weather_code",
                    "pressure_msl",
                    "is_day",
                ].join(","),
                hourly: [
                    "wind_speed_10m",
                    "wind_speed_80m",
                    "wind_speed_120m",
                    "wind_gusts_10m",
                    "precipitation_probability",
                    "visibility",
                    "cloud_cover",
                    "temperature_2m",
                    "dew_point_2m",
                ].join(","),
                daily: [
                    "sunrise",
                    "sunset",
                    "daylight_duration",
                    "uv_index_max",
                    "temperature_2m_max",
                    "temperature_2m_min",
                ].join(","),
                wind_speed_unit: "ms",
                forecast_hours: 12,
                timezone: "auto",
            });

            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }
            const data = await response.json();

            if (requestId !== weatherRequestId) {
                return;
            }

            weather.current = {
                temperature: data.current.temperature_2m,
                humidity: data.current.relative_humidity_2m,
                dewPoint: data.current.dew_point_2m,
                apparentTemperature: data.current.apparent_temperature,
                precipitation: data.current.precipitation,
                rain: data.current.rain,
                windSpeed: data.current.wind_speed_10m,
                windDirection: data.current.wind_direction_10m,
                windGusts: data.current.wind_gusts_10m,
                cloudCover: data.current.cloud_cover,
                visibility: data.current.visibility,
                weatherCode: data.current.weather_code,
                weatherDescription: WMO_CODES[data.current.weather_code] || "preflightLevelUnknown",
                pressure: data.current.pressure_msl,
                isDay: data.current.is_day,
            };

            weather.daily = {
                sunrise: data.daily.sunrise?.[0] || null,
                sunset: data.daily.sunset?.[0] || null,
                daylightDuration: data.daily.daylight_duration?.[0] || null,
                uvIndexMax: data.daily.uv_index_max?.[0] || null,
                temperatureMax: data.daily.temperature_2m_max?.[0] || null,
                temperatureMin: data.daily.temperature_2m_min?.[0] || null,
            };

            weather.hourly = [];
            const hourlyLen = data.hourly.time?.length || 0;
            for (let i = 0; i < hourlyLen; i++) {
                weather.hourly.push({
                    time: data.hourly.time[i],
                    windSpeed10m: data.hourly.wind_speed_10m[i],
                    windSpeed80m: data.hourly.wind_speed_80m[i],
                    windSpeed120m: data.hourly.wind_speed_120m[i],
                    windGusts: data.hourly.wind_gusts_10m[i],
                    precipitationProbability: data.hourly.precipitation_probability[i],
                    visibility: data.hourly.visibility[i],
                    cloudCover: data.hourly.cloud_cover[i],
                    temperature: data.hourly.temperature_2m[i],
                    dewPoint: data.hourly.dew_point_2m[i],
                });
            }

            weather.lastUpdated = new Date();
        } catch (err) {
            if (requestId === weatherRequestId) {
                weather.error = err.message;
            }
        } finally {
            if (requestId === weatherRequestId) {
                weather.loading = false;
            }
        }
    }

    async function fetchSolarActivity() {
        solar.loading = true;
        solar.error = null;
        solar.kpIndex = null;
        solar.kpTimestamp = null;
        solar.stormLevel = null;
        try {
            const response = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
            if (!response.ok) {
                throw new Error(`Solar API error: ${response.status}`);
            }
            const data = await response.json();

            if (data.length > 1) {
                const latest = data[data.length - 1];
                solar.kpIndex = Number.parseFloat(latest[1]);
                solar.kpTimestamp = latest[0];
            }

            try {
                const scaleResponse = await fetch("https://services.swpc.noaa.gov/products/noaa-scales.json");
                if (scaleResponse.ok) {
                    const scaleData = await scaleResponse.json();
                    if (scaleData["-1"]) {
                        solar.stormLevel = {
                            geoStorm: scaleData["-1"].G?.Scale || "0",
                            solarRadiation: scaleData["-1"].S?.Scale || "0",
                            radioBlackout: scaleData["-1"].R?.Scale || "0",
                        };
                    }
                }
            } catch (e) {
                console.warn("Storm scale fetch failed:", e.message);
            }

            solar.lastUpdated = new Date();
        } catch (err) {
            solar.error = err.message;
        } finally {
            solar.loading = false;
        }
    }

    const launchStatus = computed(() => {
        if (!weather.current && solar.kpIndex === null) {
            return { level: "unknown", label: "preflightStatusNoData", cssClass: "status-unknown", checks: [] };
        }

        const LEVELS = { good: 0, moderate: 1, warning: 2, danger: 3 };
        let worstLevel = "good";
        const checks = [];

        const track = (nameKey, status) => {
            checks.push({ nameKey, level: status.level, label: status.label, cssClass: status.cssClass });
            if ((LEVELS[status.level] || 0) > (LEVELS[worstLevel] || 0)) {
                worstLevel = status.level;
            }
        };

        if (weather.current) {
            track("preflightCheckWind", getWindStatus(weather.current.windSpeed, weather.current.windGusts));
            track("preflightCheckVisibility", getVisibilityStatus(weather.current.visibility));
            track("preflightCheckPrecipitation", getPrecipitationStatus(weather.current.precipitation));
        }
        if (solar.kpIndex !== null) {
            track("preflightCheckSolar", getKpStatus(solar.kpIndex));
        }

        const labels = {
            good: "preflightStatusGo",
            moderate: "preflightStatusCaution",
            warning: "preflightStatusWarning",
            danger: "preflightStatusNoGo",
        };
        const cssClasses = {
            good: "status-good",
            moderate: "status-moderate",
            warning: "status-warning",
            danger: "status-danger",
        };

        return { level: worstLevel, label: labels[worstLevel], cssClass: cssClasses[worstLevel], checks };
    });

    async function useGeolocation() {
        let coords;
        try {
            coords = await browserGeolocation();
        } catch (e) {
            console.warn("Browser geolocation failed, using IP fallback:", e.message);
            coords = await ipGeolocation();
        }
        location.latitude = coords.latitude;
        location.longitude = coords.longitude;
        location.source = "geolocation";
        location.name = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
    }

    function setManualLocation(lat, lon) {
        const parsedLat = Number.parseFloat(lat);
        const parsedLon = Number.parseFloat(lon);
        location.latitude = parsedLat;
        location.longitude = parsedLon;
        location.source = "manual";
        location.name = `${parsedLat.toFixed(4)}, ${parsedLon.toFixed(4)}`;
    }

    function updateMagneticDeclination() {
        if (location.latitude === null || location.longitude === null) {
            return;
        }
        try {
            const model = geomagnetism.model();
            const info = model.point([location.latitude, location.longitude]);
            mag.declination = info.decl;
            mag.inclination = info.incl;
        } catch (e) {
            console.warn("Magnetic declination calculation failed:", e.message);
            mag.declination = null;
            mag.inclination = null;
        }
    }

    async function refreshAll() {
        if (location.latitude === null || location.longitude === null) {
            return;
        }
        updateMagneticDeclination();
        await Promise.allSettled([fetchWeather(location.latitude, location.longitude), fetchSolarActivity()]);
    }

    return {
        location,
        weather,
        solar,
        mag,
        savedLocations,
        isLoading,
        launchStatus,
        fetchWeather,
        fetchSolarActivity,
        useGeolocation,
        setManualLocation,
        saveCurrentLocation,
        renameSavedLocation,
        deleteSavedLocation,
        applySavedLocation,
        refreshAll,
        formatTime,
        getKpStatus,
        getWindStatus,
        getVisibilityStatus,
        getPrecipitationStatus,
        getDewPointRisk,
        getUvStatus,
        getWindDirectionLabel,
        WMO_CODES,
        MAX_SAVED_LOCATIONS,
        MAX_LABEL_LENGTH,
    };
}
