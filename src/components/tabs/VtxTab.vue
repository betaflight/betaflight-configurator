<template>
    <BaseTab tab-name="vtx">
        <div class="content_wrapper">
            <!-- Title -->
            <div class="tab_title" v-html="$t('tabVtx')"></div>
            <WikiButton docUrl="vtx" />

            <!-- Help note -->
            <UiBox highlight v-show="vtxSupported">
                <p v-html="$t('vtxHelp')"></p>
            </UiBox>

            <!-- Not supported -->
            <UiBox highlight v-show="!vtxSupported">
                <div v-html="$t('vtxMessageNotSupported')"></div>
            </UiBox>

            <!-- Table not configured / factory bands warnings -->
            <div v-if="vtxTableNotConfigured || factoryBandsNotSupported" class="flex flex-col gap-2">
                <UiBox v-show="vtxTableNotConfigured" highlight>
                    <div v-html="$t('vtxMessageTableNotConfigured')"></div>
                </UiBox>
                <UiBox v-show="factoryBandsNotSupported" highlight>
                    <div v-html="$t('vtxMessageFactoryBandsNotSupported')"></div>
                </UiBox>
            </div>

            <!--
                Deliberately outside the vtxSupported gate. With no UART carrying a VTX protocol the
                FC reports VTXDEV_UNSUPPORTED, which hides every panel below, so gating the only port
                selector on it would leave the user nowhere to assign one - the same circularity the
                serial RX box on the Receiver tab had to break (C5).
            -->
            <UiBox
                :title="$t('vtxSerialPortTitle')"
                type="neutral"
                collapsible
                :help="$t('vtxSerialPortHelp')"
                class="mt-4"
            >
                <SerialFunctionRow
                    ref="serialRow"
                    group="peripherals"
                    :functions="vtxSerialFunctions"
                    :protocol-label="$t('vtxSerialPortProtocol')"
                />
            </UiBox>

            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <!-- Configuration Panel -->
                <div class="lg:col-span-3" v-show="vtxSupported">
                    <UiBox :title="$t('vtxSelectedMode')" type="neutral" collapsible class="mt-4">
                        <div class="flex flex-col gap-2">
                            <!-- Frequency/Channel toggle -->
                            <SettingRow :label="$t('vtxFrequencyChannel')" :help="$t('vtxFrequencyChannelHelp')">
                                <USwitch v-model="frequencyMode" size="xs" />
                            </SettingRow>

                            <!-- Band select -->
                            <SettingRow v-show="!frequencyMode" :label="$t('vtxBand')" :help="$t('vtxBandHelp')">
                                <USelect v-model="vtxConfig.vtx_band" :items="bandOptions" class="w-32" />
                            </SettingRow>

                            <!-- Channel select -->
                            <SettingRow v-show="!frequencyMode" :label="$t('vtxChannel')" :help="$t('vtxChannelHelp')">
                                <USelect v-model="vtxConfig.vtx_channel" :items="channelOptions" class="w-32" />
                            </SettingRow>

                            <!-- Frequency input -->
                            <SettingRow
                                v-show="frequencyMode"
                                :label="$t('vtxFrequency')"
                                :help="$t('vtxFrequencyHelp')"
                            >
                                <UInputNumber
                                    v-model="vtxConfig.vtx_frequency"
                                    :min="64"
                                    :max="5999"
                                    :step="1"
                                    :format-options="{ useGrouping: false }"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-20"
                                />
                            </SettingRow>

                            <!-- Power select -->
                            <SettingRow :label="$t('vtxPower')" :help="$t('vtxPowerHelp')">
                                <USelect v-model="vtxConfig.vtx_power" :items="powerOptions" class="w-32" />
                            </SettingRow>

                            <!-- Pit mode -->
                            <SettingRow :label="$t('vtxPitMode')" :help="$t('vtxPitModeHelp')">
                                <USwitch v-model="vtxConfig.vtx_pit_mode" size="xs" />
                            </SettingRow>

                            <!-- Pit mode frequency -->
                            <SettingRow :label="$t('vtxPitModeFrequency')" :help="$t('vtxPitModeFrequencyHelp')">
                                <UInputNumber
                                    v-model="vtxConfig.vtx_pit_mode_frequency"
                                    :min="0"
                                    :max="5999"
                                    :step="1"
                                    :format-options="{ useGrouping: false }"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-20"
                                />
                            </SettingRow>

                            <!-- Low power disarm -->
                            <SettingRow :label="$t('vtxLowPowerDisarm')" :help="$t('vtxLowPowerDisarmHelp')">
                                <USelect
                                    v-model="vtxConfig.vtx_low_power_disarm"
                                    :items="lowPowerDisarmOptions"
                                    class="w-36"
                                />
                            </SettingRow>
                        </div>
                    </UiBox>
                </div>

                <!-- VTX Info Panel -->
                <div class="lg:col-span-1" v-show="vtxSupported">
                    <UiBox :title="$t('vtxActualState')" type="neutral" collapsible class="mt-4">
                        <div class="flex flex-col text-xs">
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxDeviceReady')"></span>
                                <span class="colorToggle" :class="{ ready: deviceReady }">{{ deviceReadyText }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxType')"></span>
                                <span>{{ vtxTypeString }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxBand')"></span>
                                <span>{{ bandDescription }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxChannel')"></span>
                                <span>{{ vtxConfig.vtx_channel }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxFrequency')"></span>
                                <span>{{ vtxConfig.vtx_frequency }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxPower')"></span>
                                <span>{{ powerDescription }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxPitMode')"></span>
                                <span>{{ pitModeDescription }}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-(--ui-border)">
                                <span v-html="$t('vtxPitModeFrequency')"></span>
                                <span>{{ vtxConfig.vtx_pit_mode_frequency }}</span>
                            </div>
                            <div class="flex justify-between py-1.5">
                                <span v-html="$t('vtxLowPowerDisarm')"></span>
                                <span>{{ lowPowerDisarmDescription }}</span>
                            </div>
                        </div>
                    </UiBox>
                </div>

                <!-- VTX Table -->
                <div class="lg:col-span-4 overflow-x-auto">
                    <UiBox :title="$t('vtxTable')" type="neutral" collapsible class="mt-4 min-w-[750px]">
                        <div class="flex flex-col gap-4">
                            <!-- Bands and channels count -->
                            <div class="flex flex-wrap items-end gap-4">
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center gap-1">
                                        <span class="text-xs" v-html="$t('vtxTableBands')"></span>
                                        <HelpIcon :text="$t('vtxTableBandsHelp')" />
                                    </div>
                                    <UInputNumber
                                        :model-value="vtxConfig.vtx_table_bands"
                                        @update:model-value="setTableBands"
                                        :min="0"
                                        :max="8"
                                        :step="1"
                                        :format-options="{ useGrouping: false }"
                                        size="xs"
                                        orientation="vertical"
                                        class="w-14"
                                    />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center gap-1">
                                        <span class="text-xs" v-html="$t('vtxTableChannels')"></span>
                                        <HelpIcon :text="$t('vtxTableBandsChannelsHelp')" />
                                    </div>
                                    <UInputNumber
                                        :model-value="vtxConfig.vtx_table_channels"
                                        @update:model-value="setTableChannels"
                                        :min="0"
                                        :max="8"
                                        :step="1"
                                        :format-options="{ useGrouping: false }"
                                        size="xs"
                                        orientation="vertical"
                                        class="w-14"
                                    />
                                </div>
                            </div>

                            <!-- Bands/Channels table -->
                            <div v-if="vtxConfig.vtx_table_bands > 0 && vtxConfig.vtx_table_channels > 0">
                                <div class="flex items-center gap-1 mb-2">
                                    <HelpIcon :text="$t('vtxTableBandsChannelsTableHelp')" />
                                </div>
                                <div class="grid gap-x-2 gap-y-1 items-center" :style="bandGridStyle">
                                    <!-- Header -->
                                    <div
                                        class="text-xs font-semibold text-center"
                                        v-html="$t('vtxTableBandTitleName')"
                                    ></div>
                                    <div
                                        class="text-xs font-semibold text-center"
                                        v-html="$t('vtxTableBandTitleLetter')"
                                    ></div>
                                    <div
                                        v-if="factoryBandsSupported"
                                        class="text-xs font-semibold text-center"
                                        v-html="$t('vtxTableBandTitleFactory')"
                                    ></div>
                                    <div
                                        v-for="ch in vtxConfig.vtx_table_channels"
                                        :key="'hdr-ch-' + ch"
                                        class="text-xs font-semibold text-center"
                                    >
                                        {{ ch }}
                                    </div>
                                    <div></div>

                                    <!-- Band rows -->
                                    <template v-for="bandIdx in vtxConfig.vtx_table_bands" :key="'band-' + bandIdx">
                                        <div>
                                            <UInput
                                                :model-value="getBandName(bandIdx)"
                                                @update:model-value="setBandName(bandIdx, String($event).toUpperCase())"
                                                @blur="setBandName(bandIdx, getBandName(bandIdx).trim())"
                                                maxlength="8"
                                                size="xs"
                                                class="uppercase"
                                            />
                                        </div>
                                        <div>
                                            <UInput
                                                :model-value="getBandLetter(bandIdx)"
                                                @update:model-value="
                                                    setBandLetter(bandIdx, String($event).toUpperCase())
                                                "
                                                @blur="setBandLetter(bandIdx, getBandLetter(bandIdx).trim())"
                                                maxlength="1"
                                                size="xs"
                                                class="uppercase w-8"
                                            />
                                        </div>
                                        <div v-if="factoryBandsSupported" class="flex justify-center">
                                            <USwitch
                                                size="xs"
                                                :model-value="getBandFactory(bandIdx)"
                                                @update:model-value="setBandFactory(bandIdx, $event)"
                                            />
                                        </div>
                                        <div
                                            v-for="chIdx in vtxConfig.vtx_table_channels"
                                            :key="'band-' + bandIdx + '-ch-' + chIdx"
                                        >
                                            <UInputNumber
                                                :model-value="getBandChannelFreq(bandIdx, chIdx)"
                                                @update:model-value="setBandChannelFreq(bandIdx, chIdx, $event)"
                                                :min="0"
                                                :max="5999"
                                                :step="1"
                                                :format-options="{ useGrouping: false }"
                                                size="xs"
                                                orientation="vertical"
                                                class="w-full"
                                            />
                                        </div>
                                        <div
                                            class="text-xs text-dimmed whitespace-nowrap"
                                            v-html="$t('vtxBand_X', { bandName: bandIdx })"
                                        ></div>
                                    </template>
                                </div>
                            </div>

                            <!-- Power levels count -->
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center gap-1">
                                    <span class="text-xs" v-html="$t('vtxTablePowerLevels')"></span>
                                    <HelpIcon :text="$t('vtxTablePowerLevelsHelp')" />
                                </div>
                                <UInputNumber
                                    :model-value="vtxConfig.vtx_table_powerlevels"
                                    @update:model-value="setTablePowerLevels"
                                    :min="0"
                                    :max="8"
                                    :step="1"
                                    :format-options="{ useGrouping: false }"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-14"
                                />
                            </div>

                            <!-- Power levels table -->
                            <div v-if="vtxConfig.vtx_table_powerlevels > 0">
                                <div class="flex items-center gap-1 mb-2">
                                    <HelpIcon :text="$t('vtxTablePowerLevelsTableHelp')" />
                                </div>
                                <div class="grid gap-x-2 gap-y-1 items-center" :style="powerGridStyle">
                                    <!-- Header -->
                                    <div
                                        v-for="i in vtxConfig.vtx_table_powerlevels"
                                        :key="'pl-hdr-' + i"
                                        class="text-xs font-semibold text-center"
                                    >
                                        {{ i }}
                                    </div>
                                    <div></div>

                                    <!-- Values row -->
                                    <div v-for="i in vtxConfig.vtx_table_powerlevels" :key="'pl-val-' + i">
                                        <UInputNumber
                                            :model-value="getPowerLevelValue(i)"
                                            @update:model-value="setPowerLevelValue(i, $event)"
                                            :min="0"
                                            :max="65535"
                                            :step="1"
                                            :format-options="{ useGrouping: false }"
                                            size="xs"
                                            orientation="vertical"
                                            class="w-full"
                                        />
                                    </div>
                                    <div
                                        class="text-xs text-dimmed whitespace-nowrap"
                                        v-html="$t('vtxTablePowerLevelsValue')"
                                    ></div>

                                    <!-- Labels row -->
                                    <div v-for="i in vtxConfig.vtx_table_powerlevels" :key="'pl-lbl-' + i">
                                        <UInput
                                            :model-value="getPowerLevelLabel(i)"
                                            @update:model-value="setPowerLevelLabel(i, String($event).toUpperCase())"
                                            @blur="setPowerLevelLabel(i, getPowerLevelLabel(i).trim())"
                                            maxlength="3"
                                            size="xs"
                                            class="uppercase w-full"
                                        />
                                    </div>
                                    <div
                                        class="text-xs text-dimmed whitespace-nowrap"
                                        v-html="$t('vtxTablePowerLevelsLabel')"
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </UiBox>
                </div>
            </div>

            <!-- Save pending warning -->
            <UiBox highlight v-show="savePending">
                <div v-html="$t('vtxMessageVerifyTable')"></div>
            </UiBox>
        </div>

        <!-- Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <UFieldGroup size="xs" orientation="horizontal">
                <UButton :label="$t('vtxButtonLoadFile')" @click="loadJsonFile" variant="soft" />
                <UDropdownMenu v-slot="{ open }" :items="loadMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" square variant="soft" />
                </UDropdownMenu>
            </UFieldGroup>
            <UFieldGroup size="xs" orientation="horizontal">
                <UButton :label="$t('vtxButtonSaveFile')" @click="saveJsonFile" variant="soft" />
                <UDropdownMenu v-slot="{ open }" :items="saveFileMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" square variant="soft" />
                </UDropdownMenu>
            </UFieldGroup>
            <UButton
                :label="$t('vtxButtonSave')"
                :disabled="saveButtonDisabled"
                :loading="isSaving"
                @click="handleSave"
            />
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, onMounted, computed, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
import HelpIcon from "../elements/HelpIcon.vue";
import SettingRow from "../elements/SettingRow.vue";
import SerialFunctionRow from "../ports/SerialFunctionRow.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { useVtx } from "../../composables/useVtx";
import { useInterval } from "../../composables/useInterval";
import { useSaving } from "../../composables/useSaving";
import { useReboot } from "../../composables/useReboot";
import { useSerialPortsStore } from "@/stores/serialPorts";
import { useTranslation } from "i18next-vue";

/**
 * A subset of the peripherals group. Blackbox, the serial rangefinder, FrSky OSD and the gimbal
 * share the same per-port slot but belong to other tabs, so they must not be offered here even
 * though assigning one of these will displace them (which the row previews).
 *
 * VTX_MSP is listed unconditionally: below API 1.45 no such rule exists, so the row simply does
 * not offer it. No API gate is needed in the tab.
 */
const VTX_SERIAL_FUNCTIONS = ["TBS_SMARTAUDIO", "IRC_TRAMP", "VTX_MSP", "RUNCAM_DEVICE_CONTROL"];

export default defineComponent({
    name: "VtxTab",
    components: {
        BaseTab,
        WikiButton,
        UiBox,
        HelpIcon,
        SettingRow,
        SerialFunctionRow,
    },
    setup() {
        const { t } = useTranslation();
        const serialPortsStore = useSerialPortsStore();
        const { saveAndReboot } = useReboot();
        const serialRow = ref(null);

        const {
            MAX_POWERLEVEL_VALUES,
            MAX_BAND_VALUES,
            MAX_BAND_CHANNELS_VALUES,
            savePending,
            factoryBandsSupported,
            frequencyMode,
            vtxConfig,
            bandList,
            powerLevelList,
            deviceReady,
            vtxTypeString,
            saveButtonDisabled: vtxSettingsClean,
            vtxSupported,
            vtxTableNotConfigured,
            factoryBandsNotSupported,
            bandOptions,
            channelOptions,
            powerOptions,
            bandDescription,
            powerDescription,
            pitModeDescription,
            lowPowerDisarmDescription,
            deviceReadyText,
            loadVtxConfig,
            updateDeviceStatus,
            saveVtx,
            saveJsonFile,
            saveLuaFile,
            loadJsonFile,
            loadClipboardJson,
            onVtxTableChange,
        } = useVtx();

        const { addInterval } = useInterval();
        const { isSaving, runSave } = useSaving();

        // The row's pending edit enables Save on its own. It is ORed in here rather than folded
        // into useVtx's snapshot serializer, because apply() clears the pending state partway
        // through the save and a snapshot baseline would then never match again.
        const saveButtonDisabled = computed(() => vtxSettingsClean.value && !serialRow.value?.hasPendingChange);

        const lowPowerDisarmOptions = computed(() => [
            { value: 0, label: t("vtxLowPowerDisarmOption_0") },
            { value: 1, label: t("vtxLowPowerDisarmOption_1") },
            { value: 2, label: t("vtxLowPowerDisarmOption_2") },
        ]);

        // Dynamic grid column styles for band and power tables
        const bandGridStyle = computed(() => {
            const cols = ["minmax(5rem,auto)", "2.5rem"];
            if (factoryBandsSupported.value) {
                cols.push("2.5rem");
            }
            const channelCount = vtxConfig.vtx_table_channels || 0;
            for (let i = 0; i < channelCount; i++) {
                cols.push("minmax(4rem,auto)");
            }
            cols.push("auto");
            return { gridTemplateColumns: cols.join(" ") };
        });

        const powerGridStyle = computed(() => {
            const count = vtxConfig.vtx_table_powerlevels || 0;
            const cols = new Array(count).fill("minmax(5rem,1fr)");
            cols.push("auto");
            return { gridTemplateColumns: cols.join(" ") };
        });

        const loadMenuItems = computed(() => [
            [
                {
                    label: t("vtxButtonLoadFile"),
                    icon: "i-lucide-hard-drive-download",
                    onSelect: loadJsonFile,
                },
                {
                    label: t("vtxButtonLoadClipboard"),
                    icon: "i-lucide-clipboard-paste",
                    onSelect: loadClipboardJson,
                },
            ],
        ]);

        const saveFileMenuItems = computed(() => [
            [
                {
                    label: t("vtxButtonSaveFile"),
                    icon: "i-lucide-hard-drive-upload",
                    onSelect: saveJsonFile,
                },
                {
                    label: t("vtxButtonSaveLua"),
                    icon: "i-lucide-file-code",
                    onSelect: saveLuaFile,
                },
            ],
        ]);

        onMounted(async () => {
            // The store is shared across tabs: this refetches when it is clean and skips when it
            // holds unsaved edits made on another tab. Un-awaited so the port list fills in while
            // the serialised VTX table reads below are still running.
            serialPortsStore.loadConfig();
            await loadVtxConfig();
            addInterval("vtx_device_status_pull", updateDeviceStatus, 1000);
            i18n.localizePage();
            GUI.content_ready();
        });

        const handleSave = () =>
            runSave(
                async () => {
                    // syncStateToFC() sets vtx_table_clear and rewrites every band and power level,
                    // so this must not run just because a port changed - on a board reporting no VTX
                    // the local table is empty and that would wipe it.
                    const vtxDirty = !vtxSettingsClean.value;

                    // This is where the row's edit first reaches shared state. Gate on THIS row's
                    // pending edit, captured before apply(): store.dirty also goes true for an
                    // unsaved Ports-tab edit, which this tab must not adopt and reboot for.
                    const serialChanged = Boolean(serialRow.value?.hasPendingChange);
                    serialRow.value?.apply();

                    if (vtxDirty) {
                        await saveVtx();
                    }

                    if (serialChanged) {
                        await serialPortsStore.writeConfig();
                        // A serial change only takes effect after a restart, and saveVtx()'s own
                        // persist is EEPROM-only. The board is going away and coming back, so
                        // refetching over the link being torn down is pointless.
                        await saveAndReboot();
                        return;
                    }

                    await loadVtxConfig();
                },
                {
                    onError: (error) => {
                        console.error("Error saving VTX configuration:", error);
                    },
                },
            );

        // --- VTX Table count setters (with change tracking) ---

        function setTableBands(value) {
            const count = Math.min(MAX_BAND_VALUES, Math.max(0, Number.parseInt(value) || 0));
            vtxConfig.vtx_table_bands = count;
            for (let i = 1; i <= count; i++) {
                ensureBandExists(i);
                ensureBandFrequencies(i, vtxConfig.vtx_table_channels);
            }
            onVtxTableChange();
        }

        function setTableChannels(value) {
            const count = Math.min(MAX_BAND_CHANNELS_VALUES, Math.max(0, Number.parseInt(value) || 0));
            vtxConfig.vtx_table_channels = count;
            for (let i = 1; i <= vtxConfig.vtx_table_bands; i++) {
                ensureBandExists(i);
                ensureBandFrequencies(i, count);
            }
            onVtxTableChange();
        }

        function setTablePowerLevels(value) {
            const count = Math.min(MAX_POWERLEVEL_VALUES, Math.max(0, Number.parseInt(value) || 0));
            vtxConfig.vtx_table_powerlevels = count;
            for (let i = 1; i <= count; i++) {
                ensurePowerLevelExists(i);
            }
            onVtxTableChange();
        }

        // --- Band table accessors ---

        function ensureBandExists(bandIdx) {
            const idx = bandIdx - 1;
            if (!bandList[idx]) {
                bandList[idx] = {
                    vtxtable_band_number: bandIdx,
                    vtxtable_band_name: "",
                    vtxtable_band_letter: "",
                    vtxtable_band_is_factory_band: false,
                    vtxtable_band_frequencies: [],
                };
            }
        }

        function ensureBandFrequencies(bandIdx, channelCount) {
            const freqs = bandList[bandIdx - 1].vtxtable_band_frequencies;
            while (freqs.length < channelCount) {
                freqs.push(0);
            }
        }

        function getBandName(bandIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_name ?? "";
        }

        function setBandName(bandIdx, value) {
            ensureBandExists(bandIdx);
            bandList[bandIdx - 1].vtxtable_band_name = value;
            onVtxTableChange();
        }

        function getBandLetter(bandIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_letter ?? "";
        }

        function setBandLetter(bandIdx, value) {
            ensureBandExists(bandIdx);
            bandList[bandIdx - 1].vtxtable_band_letter = value;
            onVtxTableChange();
        }

        function getBandFactory(bandIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_is_factory_band ?? false;
        }

        function setBandFactory(bandIdx, value) {
            ensureBandExists(bandIdx);
            bandList[bandIdx - 1].vtxtable_band_is_factory_band = value;
            onVtxTableChange();
        }

        function getBandChannelFreq(bandIdx, chIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_frequencies?.[chIdx - 1] ?? 0;
        }

        function setBandChannelFreq(bandIdx, chIdx, value) {
            ensureBandExists(bandIdx);
            const freqs = bandList[bandIdx - 1].vtxtable_band_frequencies;
            while (freqs.length < chIdx) {
                freqs.push(0);
            }
            freqs[chIdx - 1] = Number.parseInt(value) || 0;
            onVtxTableChange();
        }

        // --- Power level table accessors ---

        function ensurePowerLevelExists(idx) {
            const i = idx - 1;
            if (!powerLevelList[i]) {
                powerLevelList[i] = {
                    vtxtable_powerlevel_number: idx,
                    vtxtable_powerlevel_value: 0,
                    vtxtable_powerlevel_label: "",
                };
            }
        }

        function getPowerLevelValue(idx) {
            return powerLevelList[idx - 1]?.vtxtable_powerlevel_value ?? 0;
        }

        function setPowerLevelValue(idx, value) {
            ensurePowerLevelExists(idx);
            powerLevelList[idx - 1].vtxtable_powerlevel_value = Number.parseInt(value) || 0;
            onVtxTableChange();
        }

        function getPowerLevelLabel(idx) {
            return powerLevelList[idx - 1]?.vtxtable_powerlevel_label ?? "";
        }

        function setPowerLevelLabel(idx, value) {
            ensurePowerLevelExists(idx);
            powerLevelList[idx - 1].vtxtable_powerlevel_label = value;
            onVtxTableChange();
        }

        return {
            // State
            savePending,
            factoryBandsSupported,
            frequencyMode,
            vtxConfig,
            deviceReady,
            vtxTypeString,
            saveButtonDisabled,
            isSaving,

            // Serial port row - the template ref has to be returned, or it silently stays null
            // and apply() becomes a no-op with no error anywhere.
            serialRow,
            vtxSerialFunctions: VTX_SERIAL_FUNCTIONS,

            // Computed
            vtxSupported,
            vtxTableNotConfigured,
            factoryBandsNotSupported,
            bandOptions,
            channelOptions,
            powerOptions,
            lowPowerDisarmOptions,
            bandDescription,
            powerDescription,
            pitModeDescription,
            lowPowerDisarmDescription,
            deviceReadyText,
            bandGridStyle,
            powerGridStyle,
            loadMenuItems,
            saveFileMenuItems,

            // Actions
            handleSave,
            saveJsonFile,
            saveLuaFile,
            loadJsonFile,
            loadClipboardJson,

            // Table count setters
            setTableBands,
            setTableChannels,
            setTablePowerLevels,

            // Band table accessors
            getBandName,
            setBandName,
            getBandLetter,
            setBandLetter,
            getBandFactory,
            setBandFactory,
            getBandChannelFreq,
            setBandChannelFreq,

            // Power level table accessors
            getPowerLevelValue,
            setPowerLevelValue,
            getPowerLevelLabel,
            setPowerLevelLabel,
        };
    },
});
</script>
