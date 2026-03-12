import { reactive, computed } from "vue";
import geomagnetism from "geomagnetism";

const WMO_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
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
        return { level: "unknown", label: "Unknown", cssClass: "status-unknown" };
    }
    if (kp <= 2) {
        return { level: "good", label: "Low", cssClass: "status-good" };
    }
    if (kp <= 4) {
        return { level: "moderate", label: "Moderate", cssClass: "status-moderate" };
    }
    if (kp <= 5) {
        return { level: "warning", label: "Elevated", cssClass: "status-warning" };
    }
    return { level: "danger", label: "Storm", cssClass: "status-danger" };
}

function getWindStatus(windSpeed, gusts) {
    const maxWind = Math.max(windSpeed || 0, gusts || 0);
    if (maxWind < 5) {
        return { level: "good", label: "Calm", cssClass: "status-good" };
    }
    if (maxWind < 8) {
        return { level: "good", label: "Light", cssClass: "status-good" };
    }
    if (maxWind < 11) {
        return { level: "moderate", label: "Moderate", cssClass: "status-moderate" };
    }
    if (maxWind < 14) {
        return { level: "warning", label: "Strong", cssClass: "status-warning" };
    }
    return { level: "danger", label: "Dangerous", cssClass: "status-danger" };
}

function getVisibilityStatus(vis) {
    if (vis === null || vis === undefined) {
        return { level: "unknown", label: "Unknown", cssClass: "status-unknown" };
    }
    if (vis >= 10000) {
        return { level: "good", label: "Excellent", cssClass: "status-good" };
    }
    if (vis >= 5000) {
        return { level: "good", label: "Good", cssClass: "status-good" };
    }
    if (vis >= 1000) {
        return { level: "moderate", label: "Reduced", cssClass: "status-moderate" };
    }
    return { level: "danger", label: "Poor", cssClass: "status-danger" };
}

function getPrecipitationStatus(precip) {
    if (precip === null || precip === undefined || precip === 0) {
        return { level: "good", label: "None", cssClass: "status-good" };
    }
    if (precip < 1) {
        return { level: "moderate", label: "Light", cssClass: "status-moderate" };
    }
    if (precip < 5) {
        return { level: "warning", label: "Moderate", cssClass: "status-warning" };
    }
    return { level: "danger", label: "Heavy", cssClass: "status-danger" };
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

    const isLoading = computed(() => weather.loading || solar.loading);

    async function fetchWeather(lat, lon) {
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
                forecast_days: 1,
                timezone: "auto",
            });

            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }
            const data = await response.json();

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
                weatherDescription: WMO_CODES[data.current.weather_code] || "Unknown",
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

            const now = new Date();
            const currentHourIndex = data.hourly.time.findIndex((t) => new Date(t) >= now);
            const startIdx = Math.max(0, currentHourIndex);
            const endIdx = Math.min(startIdx + 12, data.hourly.time.length);

            weather.hourly = [];
            for (let i = startIdx; i < endIdx; i++) {
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
            weather.error = err.message;
        } finally {
            weather.loading = false;
        }
    }

    async function fetchSolarActivity() {
        solar.loading = true;
        solar.error = null;
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
            } catch (_e) {
                // Storm scale is optional, don't fail
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
            return { level: "unknown", label: "No Data", cssClass: "status-unknown" };
        }

        const LEVELS = { good: 0, moderate: 1, warning: 2, danger: 3 };
        let worstLevel = "good";

        const check = (status) => {
            if ((LEVELS[status.level] || 0) > (LEVELS[worstLevel] || 0)) {
                worstLevel = status.level;
            }
        };

        if (weather.current) {
            check(getWindStatus(weather.current.windSpeed, weather.current.windGusts));
            check(getVisibilityStatus(weather.current.visibility));
            check(getPrecipitationStatus(weather.current.precipitation));
        }
        if (solar.kpIndex !== null) {
            check(getKpStatus(solar.kpIndex));
        }

        const labels = { good: "GO", moderate: "CAUTION", warning: "WARNING", danger: "NO-GO" };
        const cssClasses = {
            good: "status-good",
            moderate: "status-moderate",
            warning: "status-warning",
            danger: "status-danger",
        };

        return { level: worstLevel, label: labels[worstLevel], cssClass: cssClasses[worstLevel] };
    });

    async function useGeolocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation not supported"));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    location.latitude = position.coords.latitude;
                    location.longitude = position.coords.longitude;
                    location.source = "geolocation";
                    location.name = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                    resolve();
                },
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000 },
            );
        });
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
        } catch (_e) {
            mag.declination = null;
            mag.inclination = null;
        }
    }

    function getDewPointRisk(temp, dewPoint) {
        if (temp === null || dewPoint === null || temp === undefined || dewPoint === undefined) {
            return { level: "unknown", label: "Unknown", cssClass: "status-unknown" };
        }
        const spread = temp - dewPoint;
        if (spread > 10) {
            return { level: "good", label: "No risk", cssClass: "status-good" };
        }
        if (spread > 4) {
            return { level: "moderate", label: "Low risk", cssClass: "status-moderate" };
        }
        if (spread > 2) {
            return { level: "warning", label: "Fog/condensation likely", cssClass: "status-warning" };
        }
        return { level: "danger", label: "Fog/lens fogging expected", cssClass: "status-danger" };
    }

    function getUvStatus(uv) {
        if (uv === null || uv === undefined) {
            return { level: "unknown", label: "Unknown", cssClass: "status-unknown" };
        }
        if (uv < 3) {
            return { level: "good", label: "Low", cssClass: "status-good" };
        }
        if (uv < 6) {
            return { level: "moderate", label: "Moderate", cssClass: "status-moderate" };
        }
        if (uv < 8) {
            return { level: "warning", label: "High", cssClass: "status-warning" };
        }
        return { level: "danger", label: "Very High", cssClass: "status-danger" };
    }

    async function refreshAll() {
        if (location.latitude === null || location.longitude === null) {
            return;
        }
        updateMagneticDeclination();
        await Promise.allSettled([fetchWeather(location.latitude, location.longitude), fetchSolarActivity()]);
    }

    function formatTime(isoString) {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    return {
        location,
        weather,
        solar,
        mag,
        isLoading,
        launchStatus,
        fetchWeather,
        fetchSolarActivity,
        useGeolocation,
        setManualLocation,
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
    };
}
