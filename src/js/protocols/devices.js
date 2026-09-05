import BuildApi from "../BuildApi.js";
import { get as getConfig, set as setConfig } from "../ConfigStorage.js";

const STORAGE_KEY = "device-filters";

// A 16-bit Bluetooth SIG identifier expanded against the Base UUID.
const bt16 = (id) => `0000${id}-0000-1000-8000-00805f9b34fb`;

/**
 * @param {string} name
 * @param {[string, string, string]} uuids - service, write and read, in that order.
 * @param {object} [extra] - additional per-profile flags.
 */
const profile = (name, [service, write, read], extra = {}) => ({
    name,
    serviceUuid: service,
    writeCharacteristic: write,
    readCharacteristic: read,
    ...extra,
});

// Nordic UART is a vendor 128-bit service rather than a SIG identifier.
const NORDIC_UART = [
    "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
    "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
];

// Order matters: a board exposing more than one of these services matches the first
// entry that resolves, so the SpeedyBee variants are listed in the order the Android
// native implementation prefers them.
const defaultBluetoothDevices = [
    profile("CC2541", [bt16("ffe0"), bt16("ffe1"), bt16("ffe2")], { susceptibleToCrcCorruption: true }),
    profile("HC-05", [bt16("1101"), bt16("1101"), bt16("1101")]),
    profile("HM-10", [bt16("ffe1"), bt16("ffe1"), bt16("ffe1")]),
    profile("HM-11", NORDIC_UART),
    profile("Nordic NRF", NORDIC_UART),
    profile("SpeedyBee FF00", [bt16("00ff"), bt16("ff01"), bt16("ff02")]),
    profile("SpeedyBee V2", [bt16("abf0"), bt16("abf1"), bt16("abf2")]),
    profile("SpeedyBee V1", [bt16("1000"), bt16("1001"), bt16("1002")]),
    profile("DroneBridge", [bt16("db32"), bt16("db33"), bt16("db34")]),
];

const defaultSerialDevices = [
    { vendorId: 1027, productId: 24577 }, // FT232R USB UART
    { vendorId: 1155, productId: 12886 }, // STM32 in HID mode
    { vendorId: 1155, productId: 14158 }, // 0483:374e STM Electronics STLink Virtual COM Port (NUCLEO boards)
    { vendorId: 1155, productId: 22336 }, // STM Electronics Virtual COM Port
    { vendorId: 4292, productId: 60000 }, // CP210x
    { vendorId: 4292, productId: 60001 }, // CP210x
    { vendorId: 4292, productId: 60002 }, // CP210x
    { vendorId: 10473, productId: 394 }, // GD32 VCP
    { vendorId: 11836, productId: 22336 }, // AT32 VCP
    { vendorId: 12619, productId: 22336 }, // APM32 VCP
    { vendorId: 11914, productId: 9 }, // Raspberry Pi Pico VCP
    { vendorId: 6790, productId: 29986 }, // CH340 USB-to-Serial (variant)
    { vendorId: 6790, productId: 29987 }, // CH340 USB-to-Serial
    { vendorId: 6790, productId: 21795 }, // CH341 USB-to-Serial
    { vendorId: 6790, productId: 30084 }, // CH340S USB-to-Serial
    { vendorId: 14743, productId: 22336 }, // X32 VCP
];

const defaultUsbFilters = [
    { vendorId: 1155, productId: 57105 }, // STM Device in DFU Mode || Digital Radio in USB mode
    { vendorId: 10473, productId: 393 }, // GD32 DFU Bootloader
    { vendorId: 11836, productId: 57105 }, // AT32F435 DFU Bootloader
    { vendorId: 12619, productId: 262 }, // APM32 DFU Bootloader
    { vendorId: 11914, productId: 15 }, // Raspberry Pi Pico in Bootloader mode
    { vendorId: 14743, productId: 57105 }, // X32 DFU Bootloader
];

const defaultVendorIdNames = {
    1027: "FTDI",
    1155: "STM Electronics",
    4292: "Silicon Labs",
    6790: "WCH (QinHeng Electronics)",
    11836: "AT32",
    12619: "Geehy Semiconductor",
    11914: "Raspberry Pi Pico",
    14743: "X-CORE LABS",
    10473: "GDMicroelectronics",
};

export const bluetoothDevices = [...defaultBluetoothDevices];
export const serialDevices = [...defaultSerialDevices];
export const usbDevices = { filters: [...defaultUsbFilters] };
export const vendorIdNames = { ...defaultVendorIdNames };
export const webSerialDevices = serialDevices.map(({ vendorId, productId }) => ({
    usbVendorId: vendorId,
    usbProductId: productId,
}));

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeVidPidEntries(arr) {
    return arr.filter(
        (entry) => isPlainObject(entry) && typeof entry.vendorId === "number" && typeof entry.productId === "number",
    );
}

function applyFilters(data) {
    if (Array.isArray(data?.bluetoothDevices)) {
        const sanitized = data.bluetoothDevices.filter((d) => isPlainObject(d) && typeof d.serviceUuid === "string");
        bluetoothDevices.splice(0, bluetoothDevices.length, ...sanitized);
    }
    if (Array.isArray(data?.serialDevices)) {
        const sanitized = sanitizeVidPidEntries(data.serialDevices);
        serialDevices.splice(0, serialDevices.length, ...sanitized);
        webSerialDevices.splice(
            0,
            webSerialDevices.length,
            ...sanitized.map(({ vendorId, productId }) => ({
                usbVendorId: vendorId,
                usbProductId: productId,
            })),
        );
    }
    if (Array.isArray(data?.usbDevices?.filters)) {
        const sanitized = sanitizeVidPidEntries(data.usbDevices.filters);
        usbDevices.filters.splice(0, usbDevices.filters.length, ...sanitized);
    }
    if (isPlainObject(data?.vendorIdNames)) {
        for (const key of Object.keys(vendorIdNames)) {
            delete vendorIdNames[key];
        }
        for (const [key, value] of Object.entries(data.vendorIdNames)) {
            if (UNSAFE_KEYS.has(key) || typeof value !== "string") {
                continue;
            }
            vendorIdNames[key] = value;
        }
    }
}

function isValidPayload(data) {
    if (!isPlainObject(data)) {
        return false;
    }
    return (
        Array.isArray(data.bluetoothDevices) ||
        Array.isArray(data.serialDevices) ||
        Array.isArray(data.usbDevices?.filters) ||
        isPlainObject(data.vendorIdNames)
    );
}

export async function loadDeviceFilters(buildApi = new BuildApi()) {
    const remote = await buildApi.loadDeviceFilters();
    if (isValidPayload(remote)) {
        applyFilters(remote);
        setConfig({ [STORAGE_KEY]: remote });
        return;
    }

    const cached = getConfig(STORAGE_KEY)?.[STORAGE_KEY];
    if (cached) {
        applyFilters(cached);
    }
}
