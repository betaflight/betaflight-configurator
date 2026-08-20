import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope } from "vue";

// ---------------------------------------------------------------------------
// The connect dropdown is where a saved address turns into an actual connection:
// the menu item has to route through the "manual" pseudo-device with portOverride
// set, or the attempt goes to whatever was selected before. That portOverride is
// then what serial_backend opens — see serial_backend.test.js.
// ---------------------------------------------------------------------------

const { DeviceHandler, connectDisconnect, expertMode } = vi.hoisted(() => ({
    DeviceHandler: {
        devicePicker: { selectedDevice: "noselection", portOverride: "", autoConnect: false },
        devicePickerDisabled: false,
        currentSerialPorts: [],
        currentUsbPorts: [],
        currentBluetoothPorts: [],
        showSerialOption: false,
        showUsbOption: false,
        showBluetoothOption: false,
        showVirtualMode: false,
        showManualMode: true,
    },
    connectDisconnect: vi.fn(),
    expertMode: { enabled: true },
}));

vi.mock("../../src/js/device_handler", () => ({ __esModule: true, default: DeviceHandler }));
vi.mock("../../src/js/serial_backend", () => ({ __esModule: true, connectDisconnect, disconnect: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ __esModule: true, i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/utils/isExpertModeEnabled", () => ({
    __esModule: true,
    isExpertModeEnabled: () => expertMode.enabled,
}));
vi.mock("../../src/stores/connection", () => ({
    __esModule: true,
    useConnectionStore: () => ({ connectionValid: false, connectingTo: false, virtualMode: false, connectedTo: false }),
}));

import ConnectButton from "../../src/components/device-picker/ConnectButton.vue";
import { useConnectionBookmarksStore } from "../../src/stores/connectionBookmarks.js";
import { get as getConfig } from "../../src/js/ConfigStorage.js";

const mountLogic = () => effectScope().run(() => ConnectButton.setup({}, { emit: vi.fn() }));
const item = (api, label) => api.menuItems.value.find((entry) => entry.label === label);

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    connectDisconnect.mockClear();
    expertMode.enabled = true;
    DeviceHandler.showManualMode = true;
    DeviceHandler.devicePicker.selectedDevice = "noselection";
    DeviceHandler.devicePicker.portOverride = "";
});

describe("connecting to a bookmark from the dropdown", () => {
    it("points the manual target at the saved address, remembers it, and connects", () => {
        useConnectionBookmarksStore().save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const api = mountLogic();
        item(api, "Wi-Fi quad").onSelect();

        expect(DeviceHandler.devicePicker.selectedDevice).toBe("manual");
        expect(DeviceHandler.devicePicker.portOverride).toBe("tcp://192.168.4.1:5761");
        // Persisted, so a restart still has the address to connect to.
        expect(getConfig("portOverride").portOverride).toBe("tcp://192.168.4.1:5761");
        expect(connectDisconnect).toHaveBeenCalledTimes(1);
        expect(api.mainLabel.value).toBe("Wi-Fi quad");
    });

    it("offers the seeded SITL target too", () => {
        const api = mountLogic();

        item(api, "Betaflight SITL").onSelect();

        expect(DeviceHandler.devicePicker.portOverride).toBe("ws://127.0.0.1:6761");
        expect(connectDisconnect).toHaveBeenCalledTimes(1);
    });

    it("keeps bookmarks out of the menu when manual mode is not available", () => {
        useConnectionBookmarksStore().save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        expertMode.enabled = false;
        expect(item(mountLogic(), "Wi-Fi quad")).toBeUndefined();

        expertMode.enabled = true;
        DeviceHandler.showManualMode = false;
        expect(item(mountLogic(), "Wi-Fi quad")).toBeUndefined();
    });
});
