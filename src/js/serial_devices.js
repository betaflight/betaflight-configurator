export const vendorIdNames = {
    1027: "FTDI",
    1155: "STM Electronics",
    4292: "Silicon Labs",
    0x2e3c: "AT32",
};

export const serialDevices = [
    { vendorId: 1027, productId: 24577 }, // FT232R USB UART
    { vendorId: 1155, productId: 22336 }, // STM Electronics Virtual COM Port
    { vendorId: 4292, productId: 60000 }, // CP210x
    { vendorId: 4292, productId: 60001 }, // CP210x
    { vendorId: 4292, productId: 60002 }, // CP210x
    { vendorId: 0x2e3c, productId: 0x5740 }, // AT32 VCP
];

export const webSerialDevices = serialDevices.map(
    ({ vendorId, productId }) => ({
        usbVendorId: vendorId,
        usbProductId: productId,
    }),
);
