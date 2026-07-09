import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const keysToRemove = [
    "ledStripProfileTitle",
    "ledStripProfileOption",
    "ledStripProfile1Label",
    "ledStripProfile2Label",
    "ledStripProfile3Label",
    "ledStripProfileTip",
    "ledStripActiveProfileTitle",
    "ledStripActiveProfileTip",
    "ledStripProfileRace",
    "ledStripProfileBeacon",
    "ledStripProfileStatus",
    "ledStripProfileRaceCmsWarning",
    "ledStripProfileBeaconCmsWarning",
    "ledStripProfileName",
    "ledStripProfileNameHelp",
    "ledStripActiveProfileHint",
];

// Crowdin-managed locales fall back to en for missing keys; keep translations in en (+ fr manually).
const preserveLocales = new Set(["en", "fr"]);

for (const locale of fs.readdirSync(localesDir)) {
    const localeDir = path.join(localesDir, locale);
    if (!fs.statSync(localeDir).isDirectory() || preserveLocales.has(locale)) {
        continue;
    }

    const file = path.join(localeDir, "messages.json");
    if (!fs.existsSync(file)) {
        continue;
    }

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    let changed = false;

    for (const key of keysToRemove) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            delete data[key];
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`);
        console.log(`removed LED profile keys from ${locale}`);
    }
}
