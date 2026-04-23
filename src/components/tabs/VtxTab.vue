<template>
    <BaseTab tab-name="vtx">
        <div class="content_wrapper">
            <!-- Title -->
            <div class="tab_title" v-html="$t('tabVtx')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="vtx" />
            </div>

            <!-- Help note -->
            <div class="note" v-show="vtxSupported">
                <p v-html="$t('vtxHelp')"></p>
            </div>

            <!-- Not supported -->
            <div class="note" v-show="!vtxSupported">
                <div v-html="$t('vtxMessageNotSupported')"></div>
            </div>

            <!-- Table not configured -->
            <div class="note" v-show="vtxTableNotConfigured">
                <div v-html="$t('vtxMessageTableNotConfigured')"></div>
            </div>

            <!-- Factory bands not supported -->
            <div class="note" v-show="factoryBandsNotSupported">
                <div v-html="$t('vtxMessageFactoryBandsNotSupported')"></div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <!-- Configuration Panel -->
                <div class="lg:col-span-3" v-show="vtxSupported">
                    <UiBox :title="$t('vtxSelectedMode')">
                        <div class="flex flex-col gap-2">
                            <!-- Frequency/Channel toggle -->
                            <SettingRow :label="$t('vtxFrequencyChannel')" :help="$t('vtxFrequencyChannelHelp')">
                                <USwitch v-model="frequencyMode" size="sm" />
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
                                <USwitch v-model="vtxConfig.vtx_pit_mode" size="sm" />
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
                    <UiBox :title="$t('vtxActualState')">
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
                    <UiBox :title="$t('vtxTable')" class="min-w-[750px]">
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
            <div class="note" v-show="savePending">
                <div v-html="$t('vtxMessageVerifyTable')"></div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="content_toolbar xs-compressed toolbar_fixed_bottom">
            <div class="toolbar_expand_btn" nbrow="2">
                <em class="fas fa-ellipsis-h"></em>
            </div>

            <UButton
                :label="saveButtonOverride || $t('vtxButtonSave')"
                :disabled="saveButtonDisabled"
                :color="saveButtonDisabled ? 'neutral' : 'success'"
                @click="handleSave"
            />
            <UFieldGroup size="sm" orientation="horizontal" class="!flex">
                <UButton :label="$t('vtxButtonLoadFile')" @click="loadJsonFile" />
                <UDropdownMenu v-slot="{ open }" :items="loadMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" square />
                </UDropdownMenu>
            </UFieldGroup>
            <UFieldGroup size="sm" orientation="horizontal" class="!flex">
                <UButton :label="$t('vtxButtonSaveFile')" @click="saveJsonFile" />
                <UDropdownMenu v-slot="{ open }" :items="saveFileMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" square />
                </UDropdownMenu>
            </UFieldGroup>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, onMounted, computed } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
import HelpIcon from "../elements/HelpIcon.vue";
import SettingRow from "../elements/SettingRow.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { useVtx } from "../../composables/useVtx";
import { useInterval } from "../../composables/useInterval";
import { useTranslation } from "i18next-vue";

export default defineComponent({
    name: "VtxTab",
    components: {
        BaseTab,
        WikiButton,
        UiBox,
        HelpIcon,
        SettingRow,
    },
    setup() {
        const { t } = useTranslation();

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
            saveButtonText,
            saveButtonDisabled,
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

        const saveButtonOverride = computed(() => saveButtonText.value || "");

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
            await loadVtxConfig();
            addInterval("vtx_device_status_pull", updateDeviceStatus, 1000);
            i18n.localizePage();
            GUI.content_ready();
        });

        const handleSave = () => {
            saveVtx();
        };

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
            saveButtonOverride,

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
