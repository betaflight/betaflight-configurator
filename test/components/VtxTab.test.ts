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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { reactive, ref } from "vue";
import VtxTab from "../../src/components/tabs/VtxTab.vue";

const events = vi.hoisted(() => [] as string[]);
const saveVtx = vi.hoisted(() => vi.fn());
const loadVtxConfig = vi.hoisted(() => vi.fn());
const writeVtxPort = vi.hoisted(() => vi.fn());
const markVtxPortSaved = vi.hoisted(() => vi.fn());
const loadPort = vi.hoisted(() => vi.fn());

vi.mock("../../src/composables/useVtx", () => ({
    useVtx: () => ({
        MAX_POWERLEVEL_VALUES: 8,
        MAX_BAND_VALUES: 8,
        MAX_BAND_CHANNELS_VALUES: 8,
        savePending: ref(false),
        factoryBandsSupported: ref(false),
        frequencyMode: ref(false),
        vtxConfig: reactive({}),
        bandList: ref([]),
        powerLevelList: ref([]),
        deviceReady: ref(false),
        vtxTypeString: ref(""),
        saveButtonDisabled: ref(false),
        vtxSupported: ref(true),
        vtxTableNotConfigured: ref(false),
        factoryBandsNotSupported: ref(false),
        bandOptions: ref([]),
        channelOptions: ref([]),
        powerOptions: ref([]),
        bandDescription: ref(""),
        powerDescription: ref(""),
        pitModeDescription: ref(""),
        lowPowerDisarmDescription: ref(""),
        deviceReadyText: ref(""),
        loadVtxConfig,
        updateDeviceStatus: vi.fn(),
        saveVtx,
        saveJsonFile: vi.fn(),
        saveLuaFile: vi.fn(),
        loadJsonFile: vi.fn(),
        loadClipboardJson: vi.fn(),
        onVtxTableChange: vi.fn(),
    }),
}));
// One mock serves both the VTX port and the read-only OSD port the tab also loads.
vi.mock("../../src/composables/ports/useFeaturePort", () => ({
    useFeaturePort: () => ({
        available: ref(false),
        writable: ref(false),
        options: ref([]),
        selectedIdentifier: ref(null),
        changed: ref(false),
        conflict: ref(null),
        selection: ref(null),
        load: loadPort,
        write: writeVtxPort,
        markSaved: markVtxPortSaved,
        selectedProtocol: ref(null),
        protocolOptions: ref([]),
    }),
}));
vi.mock("../../src/composables/ports/usePortConflicts", () => ({
    usePortConflicts: () => ({ confirmPortConflicts: async () => true }),
}));
vi.mock("../../src/composables/useInterval", () => ({ useInterval: () => ({ addInterval: vi.fn() }) }));
vi.mock("../../src/js/localization", () => ({
    __esModule: true,
    i18n: { getMessage: (key: string) => key, localizePage: () => {} },
}));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function mountTab() {
    return shallowMount(VtxTab, { global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key } } });
}

describe("VtxTab save", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        events.length = 0;
        setActivePinia(createPinia());
        vi.spyOn(console, "error").mockImplementation(() => {});
        saveVtx.mockImplementation(async (beforePersist?: () => Promise<void>) => {
            await beforePersist?.();
            events.push("saveVtx");
        });
        markVtxPortSaved.mockImplementation(() => events.push("markSaved"));
        loadPort.mockImplementation(async () => events.push("loadPort"));
        loadVtxConfig.mockResolvedValue(undefined);
        writeVtxPort.mockResolvedValue(undefined);
    });

    it("marks the port saved once saveVtx has persisted, before the reload", async () => {
        const wrapper = mountTab();
        await flushPromises();
        events.length = 0;

        await (wrapper.vm as unknown as { handleSave: () => Promise<unknown> }).handleSave();

        expect(saveVtx).toHaveBeenCalledWith(writeVtxPort);
        expect(events).toEqual(["saveVtx", "markSaved", "loadPort", "loadPort"]);
    });

    it("leaves the port changed when the persist fails", async () => {
        saveVtx.mockRejectedValue(new Error("EEPROM"));
        const wrapper = mountTab();
        await flushPromises();

        await (wrapper.vm as unknown as { handleSave: () => Promise<unknown> }).handleSave();

        expect(markVtxPortSaved).not.toHaveBeenCalled();
    });
});
