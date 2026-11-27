/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref, type ComponentPublicInstance } from "vue";
import UButton from "@nuxt/ui/components/Button.vue";
import UModal from "@nuxt/ui/components/Modal.vue";
import USelect from "@nuxt/ui/components/Select.vue";
import OnboardLoggingTab from "../../src/components/tabs/OnboardLoggingTab.vue";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { mspHelper } from "../../src/js/msp/MSPHelper";
import FileSystem from "../../src/js/FileSystem";
import { gui_log } from "../../src/js/gui_log";
import { useConnectionStore } from "../../src/stores/connection";
import { useFlightControllerStore } from "../../src/stores/fc";

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/sensor_types", () => ({ sensorTypes: vi.fn(async () => ({ gyro: { elements: [] } })) }));
vi.mock("../../src/js/Analytics", () => ({ getTracking: () => null }));
const saveToEeprom = vi.hoisted(() => vi.fn());
const reboot = vi.hoisted(() => vi.fn());

vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom, reboot }) }));
vi.mock("../../src/js/tab_adapters", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/js/tab_adapters")>()),
    tabSwitchCleanup: (callback: () => void) => callback(),
}));
vi.mock("../../src/composables/ports/useFeaturePort", () => ({
    useFeaturePort: () => ({
        available: ref(false),
        writable: ref(false),
        options: ref([]),
        selectedIdentifier: ref(null),
        baudOptions: ref([]),
        selectedBaud: ref(null),
        conflict: ref(null),
        load: async () => {},
        write: async () => {},
    }),
}));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/FileSystem", () => ({
    default: {
        pickSaveFile: vi.fn(),
        openFile: vi.fn(),
        writeChunck: vi.fn(),
        closeFile: vi.fn(),
    },
}));

const FLASH = 1;
const NO_LOGGING = 0;

function mountTab() {
    return shallowMount(OnboardLoggingTab, {
        global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key } },
    });
}

type Wrapper = ReturnType<typeof mountTab>;

function button(wrapper: Wrapper, label: string) {
    const found = wrapper.findAllComponents(UButton).find((b) => b.props("label") === label);
    if (!found) {
        throw new Error(`no ${label} button`);
    }
    return found;
}

async function click(wrapper: Wrapper, label: string) {
    button(wrapper, label).vm.$emit("click", new MouseEvent("click"));
    await flushPromises();
}

async function selectDevice(wrapper: Wrapper, device: number) {
    const select = wrapper
        .findAllComponents<ComponentPublicInstance>(USelect)
        .find((s) =>
            ((s.props() as { items?: { label: string }[] }).items ?? []).some(
                (item) => item.label === "blackboxLoggingFlash",
            ),
        );
    if (!select) {
        throw new Error("no logging device select");
    }
    select.vm.$emit("update:modelValue", device);
    await nextTick();
}

/** The erase confirmation is the first modal in the dataflash box. */
function eraseDialogOpen(wrapper: Wrapper) {
    return wrapper.findAllComponents(UModal)[0].props("open");
}

async function mountWithSavedDevice(device: number) {
    const fcStore = useFlightControllerStore();
    fcStore.config.apiVersion = "1.47.0";
    fcStore.blackbox.supported = true;
    fcStore.blackbox.blackboxDevice = device;
    fcStore.dataflash.supported = true;
    fcStore.dataflash.ready = true;
    fcStore.dataflash.totalSize = 128 * 1024 * 1024;
    fcStore.dataflash.usedSize = 4 * 1024 * 1024;

    const wrapper = mountTab();
    await flushPromises();
    return wrapper;
}

function eraseRequested() {
    return vi.mocked(MSP.send_message).mock.calls.some(([code]) => code === MSPCodes.MSP_DATAFLASH_ERASE);
}

/** Run Save & Erase to completion: the whole used flash is read in one chunk and written to file. */
async function saveAndErase(wrapper: Wrapper) {
    const fcStore = useFlightControllerStore();
    fcStore.dataflash.usedSize = 16;
    const connectionStore = useConnectionStore();
    connectionStore.connectedTo = "serial";
    connectionStore.connectionValid = true;

    vi.mocked(MSP.send_message).mockImplementation((code, _data, _callbackAfterSend, callback) => {
        if (code === MSPCodes.MSP_DATAFLASH_SUMMARY && typeof callback === "function") {
            callback(null);
        }
        return false;
    });
    vi.mocked(FileSystem.pickSaveFile).mockResolvedValue({} as Awaited<ReturnType<typeof FileSystem.pickSaveFile>>);
    vi.mocked(FileSystem.openFile).mockResolvedValue({} as Awaited<ReturnType<typeof FileSystem.openFile>>);
    vi.mocked(FileSystem.writeChunck).mockResolvedValue(undefined);
    vi.spyOn(mspHelper, "dataflashRead").mockImplementation((_address, blockSize, onChunkRead) =>
        onChunkRead(0, new DataView(new ArrayBuffer(Math.min(blockSize, fcStore.dataflash.usedSize))), null),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Clicked directly: the disabled state alone must not be what keeps the erase from being sent.
    await click(wrapper, "dataflashButtonSaveAndErase");
    await flushPromises();
}

describe("Onboard logging dataflash erase", () => {
    let wrapper: Wrapper;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it("warns and blocks erasing when the FC is not logging to onboard flash", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);

        expect(wrapper.text()).toContain("dataflashEraseRequiresFlashDevice");
        expect(button(wrapper, "dataflashButtonErase").props("disabled")).toBe(true);
        expect(button(wrapper, "dataflashButtonSaveAndErase").props("disabled")).toBe(true);
        // Reading the flash does not depend on the logging device, so saving stays available.
        expect(button(wrapper, "dataflashButtonSaveFile").props("disabled")).toBe(false);

        await click(wrapper, "dataflashButtonErase");
        expect(eraseDialogOpen(wrapper)).toBe(false);
        expect(eraseRequested()).toBe(false);
    });

    it("keeps erasing blocked until a switch to onboard flash is saved to the FC", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);
        await selectDevice(wrapper, FLASH);

        expect(wrapper.text()).toContain("dataflashEraseRequiresFlashDevice");
        expect(button(wrapper, "dataflashButtonErase").props("disabled")).toBe(true);
    });

    it("keeps erasing blocked when saving onboard flash as the device fails", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP_SET_BLACKBOX_CONFIG) {
                throw new Error("refused");
            }
        });
        await selectDevice(wrapper, FLASH);
        await click(wrapper, "saveAndReboot");

        expect(wrapper.text()).toContain("dataflashEraseRequiresFlashDevice");
        expect(button(wrapper, "dataflashButtonErase").props("disabled")).toBe(true);
    });

    it("keeps erasing blocked when the EEPROM write of onboard flash as the device fails", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);
        vi.spyOn(console, "error").mockImplementation(() => {});
        saveToEeprom.mockRejectedValue(new Error("EEPROM write timed out"));
        await selectDevice(wrapper, FLASH);
        await click(wrapper, "saveAndReboot");

        expect(reboot).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain("dataflashEraseRequiresFlashDevice");
        expect(button(wrapper, "dataflashButtonErase").props("disabled")).toBe(true);
    });

    it("allows erasing once onboard flash has been saved as the device", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);
        await selectDevice(wrapper, FLASH);
        await click(wrapper, "saveAndReboot");

        expect(saveToEeprom).toHaveBeenCalledOnce();
        expect(wrapper.text()).not.toContain("dataflashEraseRequiresFlashDevice");
        expect(button(wrapper, "dataflashButtonErase").props("disabled")).toBe(false);
    });

    it("saves but does not send the erase from Save & Erase when the FC is not logging to onboard flash", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);

        await saveAndErase(wrapper);

        expect(FileSystem.closeFile).toHaveBeenCalled();
        expect(eraseRequested()).toBe(false);
        expect(eraseDialogOpen(wrapper)).toBe(false);
        expect(gui_log).toHaveBeenCalledWith("dataflashEraseRequiresFlashDevice");
    });

    it("sends the erase from Save & Erase when the FC logs to onboard flash", async () => {
        wrapper = await mountWithSavedDevice(FLASH);

        await saveAndErase(wrapper);

        expect(eraseRequested()).toBe(true);
        expect(eraseDialogOpen(wrapper)).toBe(true);
    });

    it("allows erasing without the warning when the FC logs to onboard flash", async () => {
        wrapper = await mountWithSavedDevice(FLASH);

        expect(wrapper.text()).not.toContain("dataflashEraseRequiresFlashDevice");
        expect(button(wrapper, "dataflashButtonErase").props("disabled")).toBe(false);
        expect(button(wrapper, "dataflashButtonSaveAndErase").props("disabled")).toBe(false);

        await click(wrapper, "dataflashButtonErase");
        expect(eraseDialogOpen(wrapper)).toBe(true);
    });

    it("shows no warning when the flash is already empty", async () => {
        wrapper = await mountWithSavedDevice(NO_LOGGING);
        useFlightControllerStore().dataflash.usedSize = 0;
        await nextTick();

        expect(wrapper.text()).not.toContain("dataflashEraseRequiresFlashDevice");
    });
});
