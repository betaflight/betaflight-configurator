export const bluetoothDevices = [
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

export const serialDevices = [
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

export const usbDevices = {
    filters: [
        { vendorId: 1155, productId: 57105 }, // STM Device in DFU Mode || Digital Radio in USB mode
        { vendorId: 10473, productId: 393 }, // GD32 DFU Bootloader
        { vendorId: 11836, productId: 57105 }, // AT32F435 DFU Bootloader
        { vendorId: 12619, productId: 262 }, // APM32 DFU Bootloader
        { vendorId: 11914, productId: 15 }, // Raspberry Pi Pico in Bootloader mode
    ],
};

export const vendorIdNames = {
    1027: "FTDI",
    1155: "STM Electronics",
    4292: "Silicon Labs",
    11836: "AT32",
    12619: "Geehy Semiconductor",
    11914: "Raspberry Pi Pico",
    10473: "GDMicroelectronics",
};

export const webSerialDevices = serialDevices.map(({ vendorId, productId }) => ({
    usbVendorId: vendorId,
    usbProductId: productId,
}));
