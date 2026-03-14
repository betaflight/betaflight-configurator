/**
 * Lightweight CLI syntax highlighter using one-dark-pro color palette.
 *
 * Highlights CLI command keywords, labels (WORD:), numbers, hex literals,
 * and uppercase constants.  The matching CSS lives in CliTab.vue.
 */

const CLI_COMMANDS = new Set([
    "adjrange",
    "aux",
    "batch",
    "beacon",
    "beeper",
    "color",
    "display_name",
    "feature",
    "led",
    "map",
    "mixer",
    "mmix",
    "mode_color",
    "motor",
    "name",
    "profile",
    "rateprofile",
    "resource",
    "rxfail",
    "rxrange",
    "save",
    "serial",
    "servo",
    "set",
    "smix",
    "vtx_settings",
    "vtxtable",
]);

/**
 * Highlight a single line of CLI output.
 * The input is already HTML-escaped (angle brackets replaced with entities).
 *
 * @param {string} line - One line of CLI text.
 * @returns {string} The line with <span> wrappers for syntax classes.
 */
export function highlightCliLine(line) {
    // Comment lines: # ...
    if (/^\s*#/.test(line)) {
        return `<span class="cli-comment">${line}</span>`;
    }

    // Extract leading whitespace + first word
    const m = line.match(/^(\s*)(\w+)(.*)/);
    if (!m) {
        return line;
    }

    const [, indent, firstWord, rest] = m;
    let prefix;
    let tokens;

    if (CLI_COMMANDS.has(firstWord.toLowerCase())) {
        // Known CLI command → blue
        prefix = `${indent}<span class="cli-cmd">${firstWord}</span>`;
        tokens = rest;
    } else if (rest.startsWith(":")) {
        // Label (MCU:, GYRO:, STACK:, etc.) → blue
        prefix = `${indent}<span class="cli-label">${firstWord}:</span>`;
        tokens = rest.slice(1);
    } else {
        prefix = `${indent}${firstWord}`;
        tokens = rest;
    }

    return prefix + highlightTokens(tokens);
}

/**
 * Highlight labels (WORD:), hex literals, decimal numbers, and
 * uppercase constants within a text fragment.
 */
function highlightTokens(text) {
    return text.replace(
        /(\b[A-Za-z_][\w]*:)|(\b0x[0-9A-Fa-f]+)|(\b\d+(?:\.\d+)?)|(\b[A-Z][A-Z_]{2,}\b)/g,
        (match, label, hex, num, upper) => {
            if (label) {
                return `<span class="cli-label">${label}</span>`;
            }
            if (hex) {
                return `<span class="cli-num">${hex}</span>`;
            }
            if (num) {
                return `<span class="cli-num">${num}</span>`;
            }
            if (upper) {
                return `<span class="cli-const">${upper}</span>`;
            }
            return match;
        },
    );
}
