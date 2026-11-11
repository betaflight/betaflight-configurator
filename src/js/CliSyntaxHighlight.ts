/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

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
 * @param line - One line of CLI text (raw, unescaped).
 * @returns The escaped line with <span> wrappers for syntax classes.
 */
export function highlightCliLine(line: string): string {
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
    let prefix: string;
    let tokens: string;

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

// One or more words followed by a colon ("Clock:", "MCU F405 Clock:").
const LABEL_RE = /\b[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*:/;
const HEX_RE = /\b0x[0-9A-Fa-f]+/;
const DECIMAL_RE = /\b\d+(?:\.\d+)?/;
// Alternation order is match priority; only the label is captured, to pick its class.
const TOKEN_RE = new RegExp(`(${LABEL_RE.source})|${HEX_RE.source}|${DECIMAL_RE.source}`, "g");

/**
 * Highlight labels (WORD:), hex literals, and decimal numbers
 * within a text fragment.
 */
function highlightTokens(text: string): string {
    return text.replace(TOKEN_RE, (match, label: string | undefined) => {
        if (label) return `<span class="cli-label">${match}</span>`;
        return `<span class="cli-num">${match}</span>`;
    });
}
