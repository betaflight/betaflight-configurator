/**
 * Lightweight CLI syntax highlighter using one-dark-pro color palette.
 *
 * Uses simple heuristics rather than a static command list:
 * - Lines starting with # are comments (gray)
 * - First word that is all lowercase (a-z, underscores) is a CLI command (blue)
 * - Words followed by colon are labels (blue)
 * - Numbers and hex literals are highlighted (orange)
 * - Uppercase constants are highlighted (red)
 *
 * The matching CSS lives in CliTab.vue.
 */

import { escapeHtml } from "./utils/common";

/**
 * Highlight a single line of CLI output.
 * The input may contain raw CLI text (not escaped). This function
 * HTML-escapes the line before applying highlighting to avoid XSS
 * when firmware echoes HTML-like text.
 *
 * @param {string} line - One line of CLI text (raw, unescaped).
 * @returns {string} The escaped line with <span> wrappers for syntax classes.
 */
export function highlightCliLine(line) {
    // Escape raw input to prevent XSS (we render with innerHTML elsewhere)
    line = escapeHtml(line);

    // Comment lines: # ... (base color gray, tokens override)
    if (/^\s*#/.test(line)) {
        return `<span class="cli-comment">${highlightTokens(line)}</span>`;
    }

    // Extract leading whitespace + first word (hyphens included for labels like SD-CARD:)
    const m = /^(\s*)([\w-]+)(.*)/.exec(line);
    if (!m) {
        return line;
    }

    const [, indent, firstWord, rest] = m;
    let prefix;
    let tokens;

    if (/^[a-z][a-z_]*$/.test(firstWord)) {
        // All-lowercase first word → CLI command (set, resource, board_name, version, …)
        prefix = `${indent}<span class="cli-cmd">${firstWord}</span>`;
        tokens = rest;
    } else if (rest.startsWith(":")) {
        // Label (MCU:, GYRO:, STACK:, etc.)
        prefix = `${indent}<span class="cli-label">${firstWord}:</span>`;
        tokens = rest.slice(1);
    } else {
        prefix = indent;
        tokens = firstWord + rest;
    }

    return prefix + highlightTokens(tokens);
}

/**
 * Highlight labels (WORD:), hex literals, and decimal numbers
 * within a text fragment.
 */
function highlightTokens(text) {
    return text.replace(
        /(\b[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*:)|(\b0x[0-9A-Fa-f]+)|(\b\d+(?:\.\d+)?)/g,
        (match, label, hex, num) => {
            if (label) {
                return `<span class="cli-label">${label}</span>`;
            }
            if (hex) {
                return `<span class="cli-num">${hex}</span>`;
            }
            if (num) {
                return `<span class="cli-num">${num}</span>`;
            }
            return match;
        },
    );
}
