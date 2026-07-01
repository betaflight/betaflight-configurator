import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en", "messages.json"), "utf8"));

const keys = [
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
    "ledStripProfileName",
    "ledStripProfileNameHelp",
    "ledStripActiveProfileHint",
];

const block = {};
for (const key of keys) {
    block[key] = en[key];
}

for (const locale of fs.readdirSync(localesDir)) {
    const localeDir = path.join(localesDir, locale);
    if (!fs.statSync(localeDir).isDirectory() || locale === "en") {
        continue;
    }

    const file = path.join(localeDir, "messages.json");
    if (!fs.existsSync(file)) {
        continue;
    }

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.ledStripProfileTitle) {
        continue;
    }

    const entries = Object.entries(data);
    const helpIndex = entries.findIndex(([key]) => key === "ledStripHelp");
    if (helpIndex === -1) {
        console.warn(`skip ${locale}: ledStripHelp not found`);
        continue;
    }

    const merged = Object.fromEntries([
        ...entries.slice(0, helpIndex + 1),
        ...Object.entries(block),
        ...entries.slice(helpIndex + 1),
    ]);

    fs.writeFileSync(file, `${JSON.stringify(merged, null, 4)}\n`);
    console.log(`updated ${locale}`);
}
