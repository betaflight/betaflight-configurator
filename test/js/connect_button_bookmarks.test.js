import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope } from "vue";

// ---------------------------------------------------------------------------
// The connect dropdown is where a saved address turns into an actual connection:
// the menu item has to route through the "manual" pseudo-device with portOverride
// set, or the attempt goes to whatever was selected before. That portOverride is
// then what serial_backend opens — see serial_backend.test.js.
// ---------------------------------------------------------------------------

const { DeviceHandler, connectDisconnect, expertMode, networkOnly } = vi.hoisted(() => ({
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
        selectActivePort: vi.fn(),
        requestDevicePermission: vi.fn(),
    },
    connectDisconnect: vi.fn(),
    expertMode: { enabled: true },
    networkOnly: { enabled: false },
}));

// Mirrors the real gate in device_handler.js: a browser with nothing but the network, or
// the development option behind expert mode.
DeviceHandler.manualModeAvailable = () => networkOnly.enabled || (DeviceHandler.showManualMode && expertMode.enabled);

vi.mock("../../src/js/device_handler", () => ({ __esModule: true, default: DeviceHandler }));
vi.mock("../../src/js/serial_backend", () => ({ __esModule: true, connectDisconnect, disconnect: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ __esModule: true, i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/utils/isExpertModeEnabled", () => ({
    __esModule: true,
    isExpertModeEnabled: () => expertMode.enabled,
}));
vi.mock("../../src/js/utils/checkCompatibility", () => ({
    __esModule: true,
    isAndroid: () => false,
    isTauri: () => false,
    isNetworkOnlyBrowser: () => networkOnly.enabled,
}));
// The web shell's TCP slot is a WebSocket, so raw tcp:// targets cannot be opened.
vi.mock("../../src/js/serial", () => ({
    __esModule: true,
    serial: { canOpen: (target) => !/^tcp:\/\//i.test(target) },
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
    networkOnly.enabled = false;
    DeviceHandler.showManualMode = true;
    DeviceHandler.selectActivePort.mockReset();
    DeviceHandler.requestDevicePermission.mockReset();
    DeviceHandler.devicePicker.selectedDevice = "noselection";
    DeviceHandler.devicePicker.portOverride = "";
});

describe("connecting to a bookmark from the dropdown", () => {
    it("points the manual target at the saved address, remembers it, and connects", () => {
        useConnectionBookmarksStore().save("ws://192.168.4.1:6761", "Wi-Fi quad");

        const api = mountLogic();
        item(api, "Wi-Fi quad").onSelect();

        expect(DeviceHandler.devicePicker.selectedDevice).toBe("manual");
        expect(DeviceHandler.devicePicker.portOverride).toBe("ws://192.168.4.1:6761");
        // Persisted, so a restart still has the address to connect to.
        expect(getConfig("portOverride").portOverride).toBe("ws://192.168.4.1:6761");
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

    // Safari and Firefox have no serial, Bluetooth or USB, so the network target is all
    // they have — expert mode must not be what stands between them and connecting.
    it("offers bookmarks without expert mode on a network-only browser", () => {
        useConnectionBookmarksStore().save("ws://192.168.4.1:6761", "Wi-Fi quad");

        expertMode.enabled = false;
        networkOnly.enabled = true;

        expect(item(mountLogic(), "Wi-Fi quad")).toBeDefined();
    });

    // A development-option reset calls setShowManualMode(false). On a network-only browser
    // that would otherwise leave no way to connect at all.
    it("keeps the network entry when the manual development option is off", () => {
        useConnectionBookmarksStore().save("ws://192.168.4.1:6761", "Wi-Fi quad");

        expertMode.enabled = false;
        networkOnly.enabled = true;
        DeviceHandler.showManualMode = false;

        expect(item(mountLogic(), "Wi-Fi quad")).toBeDefined();
    });

    // The web shell routes tcp:// to a WebSocket, which rejects the scheme, so a saved raw
    // TCP target could only ever fail from a browser.
    it("hides targets this platform cannot open", () => {
        useConnectionBookmarksStore().save("tcp://192.168.4.1:5761", "Raw TCP quad");
        useConnectionBookmarksStore().save("ws://192.168.4.1:6761", "Wi-Fi quad");

        networkOnly.enabled = true;
        const api = mountLogic();

        expect(item(api, "Raw TCP quad")).toBeUndefined();
        expect(item(api, "Wi-Fi quad")).toBeDefined();
    });

    // Asking for serial permission is pointless where there is no Web Serial; the connect
    // button has to land the user on the network target dialog instead.
    it("opens the manual dialog instead of asking for serial permission", async () => {
        networkOnly.enabled = true;
        expertMode.enabled = false;
        DeviceHandler.devicePicker.selectedDevice = "noselection";

        const api = mountLogic();
        await api.onConnectClick();

        expect(api.dialogOpen.value).toBe(true);
        expect(api.dialogMode.value).toBe("manual");
        expect(DeviceHandler.requestDevicePermission).not.toHaveBeenCalled();
        expect(connectDisconnect).not.toHaveBeenCalled();
    });
});
