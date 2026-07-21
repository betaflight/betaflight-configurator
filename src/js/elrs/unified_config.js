import CryptoES from "crypto-es";

const ESP_IMAGE_MAGIC = 0xe9;
const PRODUCT_NAME_SIZE = 128;
const LUA_NAME_SIZE = 16;
const DEFINES_SIZE = 512;
const LAYOUT_SIZE = 2048;

function readU32LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function align16(value) {
    return (value + 16) & ~15;
}

export function normalizeEspPlatform(platform) {
    const normalized = String(platform || "").toLowerCase();
    if (normalized === "esp32c2") {
        return "esp32-c2";
    }
    if (normalized === "esp32c3") {
        return "esp32-c3";
    }
    if (normalized === "esp32c6") {
        return "esp32-c6";
    }
    if (normalized === "esp32h2") {
        return "esp32-h2";
    }
    if (normalized === "esp32s2") {
        return "esp32-s2";
    }
    if (normalized === "esp32s3") {
        return "esp32-s3";
    }
    return normalized;
}

export function isEsp32Platform(platform) {
    return normalizeEspPlatform(platform).startsWith("esp32");
}

export function findFirmwareEnd(image, platform) {
    const normalizedPlatform = normalizeEspPlatform(platform);
    if (!normalizedPlatform) {
        throw new Error("The selected target is missing its ESP platform.");
    }
    if (!isEsp32Platform(normalizedPlatform) && normalizedPlatform !== "esp8285") {
        throw new Error(`Unsupported ESP platform '${platform}'.`);
    }

    const headerOffset = normalizedPlatform === "esp8285" ? 0x1000 : 0x0;
    if (
        !(image instanceof Uint8Array) ||
        image.byteLength < headerOffset + 32 ||
        image[headerOffset] !== ESP_IMAGE_MAGIC
    ) {
        throw new Error("The selected file is not a valid ESP firmware binary.");
    }

    let segmentCount = image[headerOffset + 1];
    let offset = isEsp32Platform(normalizedPlatform) ? 24 : 0x1008;

    while (segmentCount--) {
        if (offset + 8 > image.byteLength) {
            throw new Error("The selected firmware binary has a truncated segment table.");
        }
        const size = readU32LE(image, offset + 4);
        offset += 8 + size;
        if (offset > image.byteLength) {
            throw new Error("The selected firmware binary has a truncated segment.");
        }
    }

    const end = align16(offset) + (isEsp32Platform(normalizedPlatform) ? 32 : 0);
    if (end > image.byteLength) {
        throw new Error("The selected firmware binary is missing its image footer.");
    }

    return end;
}

function writeFixedString(output, offset, value, size) {
    const encoded = new TextEncoder().encode(String(value ?? ""));
    output.set(encoded.slice(0, size), offset);
}

function uidFromBindingPhrase(phrase) {
    const rawUid = String(phrase || "")
        .split(",")
        .map((item) => (item.trim().match(/^\d+$/) ? Number.parseInt(item.trim(), 10) : -1));

    if (rawUid.length >= 4 && rawUid.length <= 6 && rawUid.every((item) => item >= 0 && item < 256)) {
        return [...Array.from({ length: 6 - rawUid.length }, () => 0), ...rawUid];
    }

    const hash = CryptoES.MD5(`-DMY_BINDING_PHRASE="${phrase}"`).toString();
    return hash.match(/.{1,2}/g).slice(0, 6).map((byte) => Number.parseInt(byte, 16));
}

function randomUint32() {
    const bytes = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
        return bytes[0] || 1;
    }
    return Math.floor(Math.random() * 0xffffffff) || 1;
}

export function buildUnifiedDefines(settings) {
    const defines = {};

    if (settings.bindingPhrase) {
        defines.uid = uidFromBindingPhrase(settings.bindingPhrase);
    }
    if (settings.wifiSsid) {
        defines["wifi-ssid"] = settings.wifiSsid;
    }
    if (settings.wifiSsid && settings.wifiPassword) {
        defines["wifi-password"] = settings.wifiPassword;
    }
    if (settings.autoWifiEnabled) {
        defines["wifi-on-interval"] = Number.parseInt(settings.autoWifiInterval, 10) || 60;
    }
    if (settings.receiverBaud) {
        defines["rcvr-uart-baud"] = Number.parseInt(settings.receiverBaud, 10) || 420000;
    }
    if (settings.lockOnFirstConnection !== null && settings.lockOnFirstConnection !== undefined) {
        defines["lock-on-first-connection"] = Boolean(settings.lockOnFirstConnection);
    }
    if (settings.domain !== null && settings.domain !== undefined && settings.domain !== "") {
        defines.domain = Number.parseInt(settings.domain, 10);
    }

    defines["flash-discriminator"] = randomUint32();
    return defines;
}

export function appendUnifiedConfiguration(image, { target, layout, settings }) {
    const firmwareEnd = findFirmwareEnd(image, target?.platform);
    const defines = JSON.stringify(buildUnifiedDefines(settings));
    const layoutJson = JSON.stringify(layout ?? {});
    const output = new Uint8Array(firmwareEnd + PRODUCT_NAME_SIZE + LUA_NAME_SIZE + DEFINES_SIZE + LAYOUT_SIZE);

    output.set(image.slice(0, firmwareEnd), 0);
    let offset = firmwareEnd;
    writeFixedString(output, offset, target.productName || "Unified", PRODUCT_NAME_SIZE);
    offset += PRODUCT_NAME_SIZE;
    writeFixedString(output, offset, target.luaName || target.productName || "Unified", LUA_NAME_SIZE);
    offset += LUA_NAME_SIZE;
    writeFixedString(output, offset, defines, DEFINES_SIZE);
    offset += DEFINES_SIZE;
    writeFixedString(output, offset, layoutJson, LAYOUT_SIZE);

    return output;
}
