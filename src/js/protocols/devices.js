import BuildApi from "../BuildApi.js";
import { get as getConfig, set as setConfig } from "../ConfigStorage.js";

const STORAGE_KEY = "device-filters";

const defaultBluetoothDevices = [
    {
        name: "CC2541",
        serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
        writeCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
        readCharacteristic: "0000ffe2-0000-1000-8000-00805f9b34fb",
        susceptibleToCrcCorruption: true,
    },
    {
        name: "HC-05",
        serviceUuid: "00001101-0000-1000-8000-00805f9b34fb",
        writeCharacteristic: "00001101-0000-1000-8000-00805f9b34fb",
        readCharacteristic: "00001101-0000-1000-8000-00805f9b34fb",
    },
    {
        name: "HM-10",
        serviceUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
        writeCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
        readCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
    },
    {
        name: "HM-11",
        serviceUuid: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
        writeCharacteristic: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
        readCharacteristic: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    },
    {
        name: "Nordic NRF",
        serviceUuid: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
        writeCharacteristic: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
        readCharacteristic: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    },
    {
        name: "SpeedyBee V1",
        serviceUuid: "00001000-0000-1000-8000-00805f9b34fb",
        writeCharacteristic: "00001001-0000-1000-8000-00805f9b34fb",
        readCharacteristic: "00001002-0000-1000-8000-00805f9b34fb",
    },
    {
        name: "SpeedyBee V2",
        serviceUuid: "0000abf0-0000-1000-8000-00805f9b34fb",
        writeCharacteristic: "0000abf1-0000-1000-8000-00805f9b34fb",
        readCharacteristic: "0000abf2-0000-1000-8000-00805f9b34fb",
    },
    {
        name: "DroneBridge",
        serviceUuid: "0000db32-0000-1000-8000-00805f9b34fb",
        writeCharacteristic: "0000db33-0000-1000-8000-00805f9b34fb",
        readCharacteristic: "0000db34-0000-1000-8000-00805f9b34fb",
    },
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
];

const defaultUsbFilters = [
    { vendorId: 1155, productId: 57105 }, // STM Device in DFU Mode || Digital Radio in USB mode
    { vendorId: 10473, productId: 393 }, // GD32 DFU Bootloader
    { vendorId: 11836, productId: 57105 }, // AT32F435 DFU Bootloader
    { vendorId: 12619, productId: 262 }, // APM32 DFU Bootloader
    { vendorId: 11914, productId: 15 }, // Raspberry Pi Pico in Bootloader mode
];

const defaultVendorIdNames = {
    1027: "FTDI",
    1155: "STM Electronics",
    4292: "Silicon Labs",
    11836: "AT32",
    12619: "Geehy Semiconductor",
    11914: "Raspberry Pi Pico",
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
