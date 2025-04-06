import WebBluetooth from "../WebBluetooth";
import { bluetoothDevices } from "../devices";

// Mock navigator.bluetooth API
global.navigator = {
    bluetooth: {
        getAvailability: jest.fn().mockResolvedValue(true),
        requestDevice: jest.fn(),
    },
};

// Create mock event listeners
global.navigator.bluetooth.addEventListener = jest.fn();

describe("WebBluetooth", () => {
    let webBluetooth;
    let mockServer;
    let mockService;
    let mockGatt;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup mock device
        mockGatt = {
            connected: true,
            connect: jest.fn().mockResolvedValue({}),
        };

        mockServer = {
            getPrimaryServices: jest.fn(),
        };

        mockService = {
            getCharacteristics: jest.fn(),
            uuid: bluetoothDevices[0].serviceUuid,
        };

        // Create WebBluetooth instance
        webBluetooth = new WebBluetooth();
        webBluetooth.device = {
            gatt: mockGatt,
            addEventListener: jest.fn(),
            name: "TestDevice",
        };
        webBluetooth.server = mockServer;
        webBluetooth.service = mockService;
        webBluetooth.deviceDescription = bluetoothDevices[0];
    });

    describe("getCharacteristics", () => {
        test("should throw error when no characteristics are found", async () => {
            // Return empty array from getCharacteristics
            mockService.getCharacteristics.mockResolvedValue([]);

            // Expect the method to throw with specific message
            await expect(webBluetooth.getCharacteristics()).rejects.toThrow("No characteristics found");
        });

        test("should throw error when write characteristic is not found", async () => {
            // Return only read characteristic
            const mockCharacteristics = [
                {
                    uuid: webBluetooth.deviceDescription.readCharacteristic,
                    addEventListener: jest.fn(),
                    readValue: jest.fn().mockResolvedValue({}),
                    properties: { notify: true },
                },
            ];
            mockService.getCharacteristics.mockResolvedValue(mockCharacteristics);

            await expect(webBluetooth.getCharacteristics()).rejects.toThrow(/Write characteristic not found/);
        });

        test("should throw error when read characteristic is not found", async () => {
            // Return only write characteristic
            const mockCharacteristics = [
                {
                    uuid: webBluetooth.deviceDescription.writeCharacteristic,
                },
            ];
            mockService.getCharacteristics.mockResolvedValue(mockCharacteristics);

            await expect(webBluetooth.getCharacteristics()).rejects.toThrow(/Read characteristic not found/);
        });

        test("should handle service.getCharacteristics throwing an error", async () => {
            // Make the API call throw
            const testError = new Error("API Error");
            mockService.getCharacteristics.mockRejectedValue(testError);

            await expect(webBluetooth.getCharacteristics()).rejects.toThrow("API Error");
        });

        test("should succeed when both characteristics are found", async () => {
            // Return both characteristics
            const mockCharacteristics = [
                {
                    uuid: webBluetooth.deviceDescription.writeCharacteristic,
                },
                {
                    uuid: webBluetooth.deviceDescription.readCharacteristic,
                    addEventListener: jest.fn(),
                    readValue: jest.fn().mockResolvedValue({}),
                    properties: { notify: true },
                },
            ];
            mockService.getCharacteristics.mockResolvedValue(mockCharacteristics);

            await expect(webBluetooth.getCharacteristics()).resolves.not.toThrow();
        });
    });
});
