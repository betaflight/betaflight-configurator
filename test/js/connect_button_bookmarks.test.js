import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope } from "vue";

// ---------------------------------------------------------------------------
// The connect dropdown is where a saved address turns into an actual connection:
// the menu item has to route through the "manual" pseudo-device with portOverride
// set, or the attempt goes to whatever was selected before. Its collaborators are
// stubbed, and setup() is driven directly (the repo has no rendering harness).
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

function mountLogic() {
    const scope = effectScope();
    return scope.run(() => ConnectButton.setup({}, { emit: vi.fn() }));
}

function bookmarkItem(api, label) {
    return api.menuItems.value.find((item) => item.label === label);
}

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
    it("points the manual target at the saved address and starts the connection", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const api = mountLogic();
        bookmarkItem(api, "Wi-Fi quad").onSelect();

        expect(DeviceHandler.devicePicker.portOverride).toBe("tcp://192.168.4.1:5761");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("manual");
        expect(connectDisconnect).toHaveBeenCalledTimes(1);
    });

    it("remembers the address, so a later connect without the dialog uses it", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const api = mountLogic();
        bookmarkItem(api, "Wi-Fi quad").onSelect();

        expect(JSON.parse(localStorage.getItem("portOverride")).portOverride).toBe("tcp://192.168.4.1:5761");
    });

    it("offers the built-in SITL target too", () => {
        const api = mountLogic();

        const sitl = bookmarkItem(api, "Betaflight SITL");
        expect(sitl.icon).toBe("i-lucide-flask-conical");

        sitl.onSelect();

        expect(DeviceHandler.devicePicker.portOverride).toBe("ws://127.0.0.1:6761");
        expect(connectDisconnect).toHaveBeenCalledTimes(1);
    });

    it("labels the connect button with the bookmark behind a manual selection", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const api = mountLogic();
        bookmarkItem(api, "Wi-Fi quad").onSelect();

        expect(api.mainLabel.value).toBe("Wi-Fi quad");
    });

    it("keeps bookmarks out of the menu when manual mode is not available", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        expertMode.enabled = false;
        expect(bookmarkItem(mountLogic(), "Wi-Fi quad")).toBeUndefined();

        expertMode.enabled = true;
        DeviceHandler.showManualMode = false;
        expect(bookmarkItem(mountLogic(), "Wi-Fi quad")).toBeUndefined();
    });
});
