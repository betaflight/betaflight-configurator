export const usbDevices = {
    filters: [
        { vendorId: 1155, productId: 57105 }, // STM Device in DFU Mode || Digital Radio in USB mode
        { vendorId: 10473, productId: 393 }, // GD32 DFU Bootloader
        { vendorId: 0x2e3c, productId: 0xdf11 }, // AT32F435 DFU Bootloader
        { vendorId: 12619, productId: 262 }, // APM32 DFU Bootloader
    ],
};
