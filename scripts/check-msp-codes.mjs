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

/*
 * Check `src/js/msp/MSPCodes.ts` against the firmware's MSP headers.
 *
 * Every member of `MSPCodes` and `MSP2TextType` mirrors a `#define` in
 * `src/main/msp/msp_protocol.h`, `msp_protocol_v2_common.h` or
 * `msp_protocol_v2_betaflight.h` of betaflight/betaflight. The firmware renames
 * and retires codes without a configurator PR to carry the change over, so the
 * two drift apart silently: before this check landed, six names had been renamed
 * in firmware years earlier and seven codes were ones no supported firmware
 * answers any more.
 *
 * The configurator connects to every firmware from `API_VERSION_ACCEPTED` in
 * `data_storage.ts` up, so a name is checked against each firmware branch still in that range, not against
 * master alone: `MSP_SET_CF_SERIAL_CONFIG` left master in 2026.8 but 4.5 still
 * answers it, so it stays. The rules:
 *
 *   - a name that no supported firmware defines fails, with the firmware's
 *     current name for that value when it was a rename;
 *   - a name whose value differs from any supported firmware fails;
 *   - a firmware code the configurator does not implement is listed, not failed:
 *     the configurator never spoke every code.
 *
 * Usage:
 *   npm run check:msp-codes [-- --ref <a,b,...>]
 *
 *   --ref <a,b,...>     Firmware refs to read instead of discovering the
 *                       maintenance branches through the GitHub API.
 *
 * `GITHUB_TOKEN`, when set, authenticates the branch listing so CI does not
 * share the unauthenticated rate limit. The header downloads need no token.
 *
 * No shebang: the npm script runs this through `node`, and the unit tests import
 * the parsing and comparison below.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const FIRMWARE_REPO = "betaflight/betaflight";
const HEADERS = ["msp_protocol.h", "msp_protocol_v2_common.h", "msp_protocol_v2_betaflight.h"];
const CODES_FILE = new URL("../src/js/msp/MSPCodes.ts", import.meta.url);
const VERSIONS_FILE = new URL("../src/js/data_storage.ts", import.meta.url);
const FETCH_TIMEOUT_MS = 30_000;

/** Numeric `#define MSP_*` / `MSP2_*` / `MSP2TEXT_*` entries of a firmware header. */
function parseDefines(text) {
    const defines = new Map();
    for (const match of text.matchAll(/^#define\s+((?:MSP2?_|MSP2TEXT_)[A-Z0-9_]+)\s+(0x[0-9A-Fa-f]+|\d+)\b/gm)) {
        defines.set(match[1], Number(match[2]));
    }
    return defines;
}

/** The forward entries of a numeric `enum <name> {}` block in `MSPCodes.ts`. */
function parseEnum(text, name) {
    const block = text.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
    if (!block) {
        throw new Error(`No enum ${name} in MSPCodes.ts`);
    }
    const entries = new Map();
    for (const match of block[1].matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(0x[0-9A-Fa-f]+|\d+)\b/gm)) {
        entries.set(match[1], Number(match[2]));
    }
    return entries;
}

function apiMinor(mspProtocolHeader) {
    const match = mspProtocolHeader.match(/^#define\s+API_VERSION_MINOR\s+(\d+)/m);
    if (!match) {
        throw new Error("No API_VERSION_MINOR in msp_protocol.h");
    }
    return Number(match[1]);
}

/** The minor of `API_VERSION_ACCEPTED`, so the check and the app agree on the oldest firmware. */
function acceptedApiMinor(dataStorageSource) {
    const match = dataStorageSource.match(/^export const API_VERSION_ACCEPTED = API_VERSION_1_(\d+);/m);
    if (!match) {
        throw new Error("No API_VERSION_ACCEPTED in data_storage.ts");
    }
    return Number(match[1]);
}

/**
 * Compare the configurator's names against the firmware's, one map per firmware ref.
 * `refs` is ordered newest first, so a rename reports the current firmware name.
 */
function compare(configurator, refs) {
    const errors = [];
    const firmwareOnly = [];

    for (const [name, value] of configurator) {
        const defining = refs.filter(({ defines }) => defines.has(name));
        if (defining.length === 0) {
            const renamed = refs.map(({ defines }) => [...defines].find(([, v]) => v === value)?.[0]).find(Boolean);
            const hint = renamed
                ? `firmware calls ${formatValue(value)} ${renamed}`
                : "no supported firmware defines it";
            errors.push(`${name} = ${formatValue(value)}: ${hint}`);
            continue;
        }
        for (const { ref, defines } of defining) {
            if (defines.get(name) !== value) {
                errors.push(`${name} = ${formatValue(value)}: ${ref} has ${formatValue(defines.get(name))}`);
            }
        }
    }

    const newest = refs[0];
    for (const [name, value] of newest.defines) {
        if (!configurator.has(name)) {
            firmwareOnly.push(`${name} = ${formatValue(value)}`);
        }
    }

    return { errors, firmwareOnly };
}

function formatValue(value) {
    return value >= 0x1000 ? `0x${value.toString(16)}` : String(value);
}

/** Both enums under the firmware's names: the text types sit in a separate enum without their prefix. */
function readConfiguratorCodes(text) {
    const codes = parseEnum(text, "MSPCodes");
    for (const [name, value] of parseEnum(text, "MSP2TextType")) {
        codes.set(`MSP2TEXT_${name}`, value);
    }
    return codes;
}

async function fetchText(url, headers = {}) {
    let response;
    try {
        response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
}

async function fetchHeader(ref, header) {
    return fetchText(`https://raw.githubusercontent.com/${FIRMWARE_REPO}/${ref}/src/main/msp/${header}`);
}

async function listFirmwareRefs() {
    const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
    const branches = JSON.parse(
        await fetchText(`https://api.github.com/repos/${FIRMWARE_REPO}/branches?per_page=100`, headers),
    );
    return ["master", ...branches.map(({ name }) => name).filter((name) => name.endsWith("-maintenance"))];
}

/** Each ref's defines with its API minor, newest first, without the refs below `minApi`. */
async function loadFirmware(refNames, minApi) {
    const refs = await Promise.all(
        refNames.map(async (ref) => {
            // Old branches lack the MSPv2 headers, so read those only for refs the check keeps.
            const protocol = await fetchHeader(ref, HEADERS[0]);
            const minor = apiMinor(protocol);
            if (minor < minApi) {
                return null;
            }
            const rest = await Promise.all(HEADERS.slice(1).map((header) => fetchHeader(ref, header)));
            const defines = new Map([protocol, ...rest].flatMap((text) => [...parseDefines(text)]));
            return { ref, minor, defines };
        }),
    );
    return refs.filter(Boolean).sort((a, b) => b.minor - a.minor);
}

async function main() {
    const { values: args } = parseArgs({ options: { ref: { type: "string" } } });
    const minApi = acceptedApiMinor(readFileSync(VERSIONS_FILE, "utf8"));
    const refNames = args.ref ? args.ref.split(",") : await listFirmwareRefs();
    const refs = await loadFirmware(refNames, minApi);
    if (refs.length === 0) {
        throw new Error(`None of ${refNames.join(", ")} carries API 1.${minApi} or newer`);
    }
    console.log(`Firmware: ${refs.map(({ ref, minor }) => `${ref} (1.${minor})`).join(", ")}`);

    const { errors, firmwareOnly } = compare(readConfiguratorCodes(readFileSync(CODES_FILE, "utf8")), refs);
    if (firmwareOnly.length > 0) {
        console.log(`Defined by ${refs[0].ref}, not implemented here:\n  ${firmwareOnly.join("\n  ")}`);
    }
    if (errors.length > 0) {
        console.error(`MSPCodes.ts disagrees with the firmware headers:\n  ${errors.join("\n  ")}`);
        process.exit(1);
    }
    console.log("MSPCodes.ts matches the firmware headers.");
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
    try {
        await main();
    } catch (error) {
        console.error(`check-msp-codes: ${error.message}`);
        process.exit(1);
    }
}

export { acceptedApiMinor, apiMinor, compare, parseDefines, parseEnum, readConfiguratorCodes };
