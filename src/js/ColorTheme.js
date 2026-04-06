const HEX_COLOR_REGEX = /^#([0-9a-f]{6})$/i;

const WHITE = "#ffffff";
const BLACK = "#000000";

const COLOR_THEME_VARIABLES = {
    "--primary-50": (theme) => blendHex(theme.primary500, WHITE, 0.9),
    "--primary-100": (theme) => blendHex(theme.primary500, WHITE, 0.82),
    "--primary-200": (theme) => blendHex(theme.primary500, WHITE, 0.65),
    "--primary-300": (theme) => blendHex(theme.primary500, WHITE, 0.5),
    "--primary-400": (theme) => blendHex(theme.primary500, WHITE, 0.25),
    "--primary-500": (theme) => theme.primary500,
    "--primary-600": (theme) => blendHex(theme.primary500, theme.primary700, 0.5),
    "--primary-700": (theme) => theme.primary700,
    "--primary-800": (theme) => blendHex(theme.primary700, BLACK, 0.35),
    "--primary-900": (theme) => blendHex(theme.primary700, BLACK, 0.55),
    "--primary-950": (theme) => blendHex(theme.primary700, BLACK, 0.68),
    "--primary-action": (theme) => theme.primary500,
    "--primary-action-border": (theme) => blendHex(theme.primary500, theme.primary700, 0.5),
    "--primary-action-hover": (theme) => blendHex(theme.primary500, WHITE, 0.25),
    "--surface-50": (theme) => blendHex(theme.surface100, WHITE, 0.5),
    "--surface-100": (theme) => theme.surface100,
    "--surface-200": (theme) => blendHex(theme.surface100, theme.surface300, 0.5),
    "--surface-300": (theme) => theme.surface300,
    "--surface-400": (theme) => blendHex(theme.surface300, BLACK, 0.12),
    "--surface-500": (theme) => blendHex(theme.surface300, BLACK, 0.24),
    "--surface-600": (theme) => blendHex(theme.surface300, BLACK, 0.38),
    "--surface-700": (theme) => blendHex(theme.surface300, BLACK, 0.52),
    "--surface-800": (theme) => blendHex(theme.surface300, BLACK, 0.66),
    "--surface-900": (theme) => blendHex(theme.surface300, BLACK, 0.78),
    "--surface-950": (theme) => blendHex(theme.surface300, BLACK, 0.88),
    "--text": (theme) => theme.text,
    "--success-400": (theme) => blendHex(theme.success500, WHITE, 0.35),
    "--success-500": (theme) => theme.success500,
    "--success-600": (theme) => blendHex(theme.success500, BLACK, 0.25),
    "--warning-400": (theme) => blendHex(theme.warning500, WHITE, 0.35),
    "--warning-500": (theme) => theme.warning500,
    "--warning-600": (theme) => blendHex(theme.warning500, BLACK, 0.25),
    "--error-400": (theme) => blendHex(theme.error500, WHITE, 0.35),
    "--error-500": (theme) => theme.error500,
    "--error-600": (theme) => blendHex(theme.error500, BLACK, 0.25),
};

const CLEARABLE_CUSTOM_VARIABLES = [
    ...Object.keys(COLOR_THEME_VARIABLES),
    "--primary-contrast",
    "--primary-transparent-1",
    "--primary-transparent-2",
    "--primary-transparent-3",
    "--primary-transparent-4",
];

export const DEFAULT_CUSTOM_THEME = {
    primary500: "#ffbb00",
    primary700: "#d29600",
    surface100: "#fafafa",
    surface300: "#ebebeb",
    text: "#000000",
    success500: "#96e212",
    warning500: "#ff6600",
    error500: "#e2123f",
};

export function getDefaultCustomTheme() {
    const isDark = document.body?.classList.contains("dark-theme");
    return {
        primary500: "#ffbb00",
        primary700: "#d29600",
        surface100: isDark ? "#141414" : "#fafafa",
        surface300: isDark ? "#242424" : "#ebebeb",
        text: isDark ? "#f2f2f2" : "#000000",
        success500: "#96e212",
        warning500: "#ff6600",
        error500: "#e2123f",
    };
}

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

function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getReadableContrastColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    return luminance >= 160 ? BLACK : WHITE;
}

function getRelativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const red = toLinear(r);
    const green = toLinear(g);
    const blue = toLinear(b);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(firstHex, secondHex) {
    const first = getRelativeLuminance(firstHex);
    const second = getRelativeLuminance(secondHex);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

function getReadableTextColor(textHex, backgroundHex, minimumContrast = 4.5) {
    if (getContrastRatio(textHex, backgroundHex) >= minimumContrast) {
        return textHex;
    }

    return getReadableContrastColor(backgroundHex);
}

export function applyCustomTheme(themeInput) {
    const theme = sanitizeCustomTheme(themeInput);
    const resolvedText = getReadableTextColor(theme.text, theme.surface100);
    const resolvedTheme = {
        ...theme,
        text: resolvedText,
    };
    const primaryTransparent1 = rgbaFromHex(theme.primary500, 0.08);
    const primaryTransparent2 = rgbaFromHex(theme.primary500, 0.12);
    const primaryTransparent3 = rgbaFromHex(theme.primary500, 0.16);
    const primaryTransparent4 = rgbaFromHex(theme.primary500, 0.2);
    const primaryContrast = getReadableContrastColor(theme.primary500);

    Object.entries(COLOR_THEME_VARIABLES).forEach(([cssVariable, resolver]) => {
        const value = resolver(resolvedTheme);
        document.body.style.setProperty(cssVariable, value);
    });

    document.body.style.setProperty("--primary-transparent-1", primaryTransparent1);
    document.body.style.setProperty("--primary-transparent-2", primaryTransparent2);
    document.body.style.setProperty("--primary-transparent-3", primaryTransparent3);
    document.body.style.setProperty("--primary-transparent-4", primaryTransparent4);
    document.body.style.setProperty("--primary-contrast", primaryContrast);

    document.documentElement.style.setProperty("--primary-transparent-1", primaryTransparent1);
    document.documentElement.style.setProperty("--primary-transparent-2", primaryTransparent2);
    document.documentElement.style.setProperty("--primary-transparent-3", primaryTransparent3);
    document.documentElement.style.setProperty("--primary-transparent-4", primaryTransparent4);
    document.documentElement.style.setProperty("--primary-contrast", primaryContrast);
}

export function clearCustomTheme() {
    CLEARABLE_CUSTOM_VARIABLES.forEach((cssVariable) => {
        document.body.style.removeProperty(cssVariable);
        document.documentElement.style.removeProperty(cssVariable);
    });
}
