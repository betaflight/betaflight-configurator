/**
 * Lightweight CLI syntax highlighter using one-dark-pro color palette.
 *
 * Inspired by the Betaflight Support Explorer which uses Shiki + Nim grammar
 * on the one-dark-pro theme.  This module achieves a similar look with simple
 * regex rules tailored to Betaflight CLI output, avoiding the weight of a
 * full highlighting engine.
 *
 * Each helper returns an HTML string with <span class="cli-*"> wrappers.
 * The matching CSS lives in CliTab.vue.
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

    // Split into leading whitespace, first word, and the rest
    const m = line.match(/^(\s*)(\w+)(.*)/);
    if (!m) {
        return line;
    }

    const [, indent, cmd, rest] = m;
    const cmdLower = cmd.toLowerCase();

    if (!CLI_COMMANDS.has(cmdLower)) {
        return line;
    }

    // --- set <name> = <value> ---
    if (cmdLower === "set") {
        const sm = rest.match(/^(\s+)(\S+)(\s*=\s*)(.*)/);
        if (sm) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${sm[1]}<span class="cli-name">${sm[2]}</span>` +
                `<span class="cli-op">${sm[3]}</span>` +
                `<span class="cli-val">${sm[4]}</span>`
            );
        }
    }

    // --- resource <NAME> <index> <pin|NONE> ---
    if (cmdLower === "resource") {
        const rm3 = rest.match(/^(\s+)(\S+)(\s+)(\d+)(\s+)(\S+)(.*)/);
        if (rm3) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${rm3[1]}<span class="cli-name">${rm3[2]}</span>` +
                `${rm3[3]}<span class="cli-num">${rm3[4]}</span>` +
                `${rm3[5]}<span class="cli-val">${rm3[6]}</span>` +
                `${rm3[7]}`
            );
        }
        // resource <NAME> <pin> (single-index resources)
        const rm2 = rest.match(/^(\s+)(\S+)(\s+)(\S+)(.*)/);
        if (rm2) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${rm2[1]}<span class="cli-name">${rm2[2]}</span>` +
                `${rm2[3]}<span class="cli-val">${rm2[4]}</span>` +
                `${rm2[5]}`
            );
        }
    }

    // --- feature / beeper [-]<NAME> ---
    if (cmdLower === "feature" || cmdLower === "beeper" || cmdLower === "beacon") {
        const fb = rest.match(/^(\s+)(-?)(\S+)(.*)/);
        if (fb) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${fb[1]}<span class="cli-val">${fb[2]}${fb[3]}</span>` +
                `${fb[4]}`
            );
        }
    }

    // --- serial <port> <function_mask> <msp_baud> <gps_baud> <tlm_baud> <periph_baud> ---
    if (cmdLower === "serial") {
        const sr = rest.match(/^(\s+)(\d+)(\s+)(.*)/);
        if (sr) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${sr[1]}<span class="cli-num">${sr[2]}</span>` +
                `${sr[3]}${highlightNumbers(sr[4])}`
            );
        }
    }

    // --- aux / adjrange / rxrange / rxfail / servo / mmix / smix ---
    if (["aux", "adjrange", "rxrange", "rxfail", "servo", "mmix", "smix"].includes(cmdLower)) {
        const ar = rest.match(/^(\s+)(\d+)(\s+)(.*)/);
        if (ar) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${ar[1]}<span class="cli-num">${ar[2]}</span>` +
                `${ar[3]}${highlightNumbers(ar[4])}`
            );
        }
    }

    // --- profile / rateprofile <n> ---
    if (cmdLower === "profile" || cmdLower === "rateprofile") {
        const pr = rest.match(/^(\s+)(\d+)(.*)/);
        if (pr) {
            return (
                `${indent}<span class="cli-cmd">${cmd}</span>` +
                `${pr[1]}<span class="cli-num">${pr[2]}</span>` +
                `${pr[3]}`
            );
        }
    }

    // --- batch start/end ---
    if (cmdLower === "batch") {
        return `${indent}<span class="cli-cmd">${cmd}</span><span class="cli-val">${rest}</span>`;
    }

    // --- Default: highlight command, leave rest with numbers highlighted ---
    return `${indent}<span class="cli-cmd">${cmd}</span>${highlightNumbers(rest)}`;
}

/**
 * Wrap standalone numbers in the text with cli-num spans.
 */
function highlightNumbers(text) {
    return text.replace(/\b(\d+)\b/g, '<span class="cli-num">$1</span>');
}
