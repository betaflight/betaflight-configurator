const HEX_COLOR_REGEX = /^#([0-9a-f]{6})$/i;

const COLOR_THEME_VARIABLES = {
    "--primary-500": "primary500",
    "--primary-700": "primary700",
    "--primary-action": "primary500",
    "--primary-action-border": "primary700",
    "--primary-action-hover": "primary500",
    "--surface-100": "surface100",
    "--surface-300": "surface300",
    "--text": "text",
    "--success-500": "success500",
    "--warning-500": "warning500",
    "--error-500": "error500",
};

const CLEARABLE_CUSTOM_VARIABLES = [
    ...Object.keys(COLOR_THEME_VARIABLES),
    "--primary-600",
    "--surface-200",
    "--primary-transparent-1",
    "--primary-transparent-2",
    "--primary-transparent-3",
    "--primary-transparent-4",
];

export const DEFAULT_CUSTOM_THEME = {
    primary500: "#4f46e5",
    primary700: "#3730a3",
    surface100: "#f8fafc",
    surface300: "#e2e8f0",
    text: "#0f172a",
    success500: "#22c55e",
    warning500: "#f59e0b",
    error500: "#ef4444",
};

export function sanitizeCustomTheme(themeInput) {
    const input = themeInput && typeof themeInput === "object" ? themeInput : {};

    return Object.keys(DEFAULT_CUSTOM_THEME).reduce((acc, key) => {
        const candidateValue = input[key];
        const normalizedCandidate =
            typeof candidateValue === "string" ? candidateValue.trim().toLowerCase() : candidateValue;
        acc[key] = HEX_COLOR_REGEX.test(normalizedCandidate) ? normalizedCandidate : DEFAULT_CUSTOM_THEME[key];
        return acc;
    }, {});
}

export function isDefaultCustomTheme(themeInput) {
    const theme = sanitizeCustomTheme(themeInput);
    return Object.keys(DEFAULT_CUSTOM_THEME).every((key) => theme[key] === DEFAULT_CUSTOM_THEME[key]);
}

function hexToRgb(hex) {
    const normalizedHex = hex.replace("#", "");
    const numericHex = Number.parseInt(normalizedHex, 16);

    return {
        r: (numericHex >> 16) & 255,
        g: (numericHex >> 8) & 255,
        b: numericHex & 255,
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = (value) => value.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function blendHex(baseHex, targetHex, ratio) {
    const base = hexToRgb(baseHex);
    const target = hexToRgb(targetHex);
    const blend = {
        r: Math.round(base.r + (target.r - base.r) * ratio),
        g: Math.round(base.g + (target.g - base.g) * ratio),
        b: Math.round(base.b + (target.b - base.b) * ratio),
    };

    return rgbToHex(blend);
}

export function applyCustomTheme(themeInput) {
    const theme = sanitizeCustomTheme(themeInput);
    const surface200 = blendHex(theme.surface100, theme.surface300, 0.5);
    const primary600 = blendHex(theme.primary500, theme.primary700, 0.5);

    Object.entries(COLOR_THEME_VARIABLES).forEach(([cssVariable, themeKey]) => {
        document.body.style.setProperty(cssVariable, theme[themeKey]);
    });

    document.body.style.setProperty("--primary-600", primary600);
    document.body.style.setProperty("--surface-200", surface200);
}

export function clearCustomTheme() {
    CLEARABLE_CUSTOM_VARIABLES.forEach((cssVariable) => {
        document.body.style.removeProperty(cssVariable);
    });
}
