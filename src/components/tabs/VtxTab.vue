<template>
    <BaseTab tab-name="vtx">
        <div class="content_wrapper">
            <!-- Title -->
            <div class="cf_column">
                <div class="tab_title" v-html="$t('tabVtx')"></div>
                <WikiButton docUrl="vtx" />
            </div>

            <!-- Help note -->
            <div class="note vtx_supported" v-show="vtxSupported">
                <p v-html="$t('vtxHelp')"></p>
            </div>

            <!-- Not supported -->
            <div class="note vtx_not_supported" v-show="!vtxSupported">
                <div v-html="$t('vtxMessageNotSupported')"></div>
            </div>

            <!-- Table not configured -->
            <div class="note vtx_table_not_configured" v-show="vtxTableNotConfigured">
                <div v-html="$t('vtxMessageTableNotConfigured')"></div>
            </div>

            <!-- Factory bands not supported -->
            <div class="note vtx_table_factory_bands_not_supported" v-show="factoryBandsNotSupported">
                <div v-html="$t('vtxMessageFactoryBandsNotSupported')"></div>
            </div>

            <div class="grid-box col4">
                <!-- Configuration Panel -->
                <div class="gui_box grey select_mode vtx_supported col-span-3" v-show="vtxSupported">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title" v-html="$t('vtxSelectedMode')"></div>
                    </div>

                    <div class="spacer_box">
                        <!-- Frequency/Channel toggle -->
                        <div class="field checkbox vtx_frequency_channel">
                            <span class="checkboxspacer">
                                <input
                                    type="checkbox"
                                    id="vtx_frequency_channel"
                                    class="toggle"
                                    v-model="frequencyMode"
                                />
                            </span>
                            <label>
                                <span class="freelabel" v-html="$t('vtxFrequencyChannel')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxFrequencyChannelHelp')"></div>
                        </div>

                        <!-- Band select -->
                        <div class="field number vtx_band" v-show="!frequencyMode">
                            <span class="numberspacer">
                                <select id="vtx_band" v-model.number="vtxConfig.vtx_band">
                                    <option v-for="opt in bandOptions" :key="opt.value" :value="opt.value">
                                        {{ opt.label }}
                                    </option>
                                </select>
                            </span>
                            <label>
                                <span v-html="$t('vtxBand')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxBandHelp')"></div>
                        </div>

                        <!-- Channel select -->
                        <div class="field number vtx_channel" v-show="!frequencyMode">
                            <span class="numberspacer">
                                <select id="vtx_channel" v-model.number="vtxConfig.vtx_channel">
                                    <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">
                                        {{ opt.label }}
                                    </option>
                                </select>
                            </span>
                            <label>
                                <span v-html="$t('vtxChannel')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxChannelHelp')"></div>
                        </div>

                        <!-- Frequency input -->
                        <div class="field number vtx_frequency" v-show="frequencyMode">
                            <span class="numberspacer">
                                <UInputNumber
                                    class="frequency_input"
                                    id="vtx_frequency"
                                    :min="64"
                                    :max="5999"
                                    :step="1"
                                    v-model="vtxConfig.vtx_frequency"
                                />
                            </span>
                            <label>
                                <span v-html="$t('vtxFrequency')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxFrequencyHelp')"></div>
                        </div>

                        <!-- Power select -->
                        <div class="field number vtx_power">
                            <span class="numberspacer">
                                <select id="vtx_power" v-model.number="vtxConfig.vtx_power">
                                    <option v-for="opt in powerOptions" :key="opt.value" :value="opt.value">
                                        {{ opt.label }}
                                    </option>
                                </select>
                            </span>
                            <label>
                                <span v-html="$t('vtxPower')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxPowerHelp')"></div>
                        </div>

                        <!-- Pit mode -->
                        <div class="field checkbox vtx_pit_mode">
                            <span class="checkboxspacer">
                                <input
                                    type="checkbox"
                                    id="vtx_pit_mode"
                                    class="toggle"
                                    v-model="vtxConfig.vtx_pit_mode"
                                />
                            </span>
                            <label>
                                <span class="freelabel" v-html="$t('vtxPitMode')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxPitModeHelp')"></div>
                        </div>

                        <!-- Pit mode frequency -->
                        <div class="field number vtx_pit_mode_frequency">
                            <span class="numberspacer">
                                <UInputNumber
                                    class="frequency_input"
                                    id="vtx_pit_mode_frequency"
                                    :min="0"
                                    :max="5999"
                                    :step="1"
                                    v-model="vtxConfig.vtx_pit_mode_frequency"
                                />
                            </span>
                            <label>
                                <span v-html="$t('vtxPitModeFrequency')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxPitModeFrequencyHelp')"></div>
                        </div>

                        <!-- Low power disarm -->
                        <div class="field select vtx_low_power_disarm">
                            <span class="selectspacer">
                                <select id="vtx_low_power_disarm" v-model.number="vtxConfig.vtx_low_power_disarm">
                                    <option value="0" v-html="$t('vtxLowPowerDisarmOption_0')"></option>
                                    <option value="1" v-html="$t('vtxLowPowerDisarmOption_1')"></option>
                                    <option value="2" v-html="$t('vtxLowPowerDisarmOption_2')"></option>
                                </select>
                            </span>
                            <label>
                                <span v-html="$t('vtxLowPowerDisarm')"></span>
                            </label>
                            <div class="helpicon cf_tip" :title="$t('vtxLowPowerDisarmHelp')"></div>
                        </div>
                    </div>
                </div>

                <!-- VTX Info Panel -->
                <div class="gui_box grey vtx_supported col-span-1" v-show="vtxSupported">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title" v-html="$t('vtxActualState')"></div>
                    </div>

                    <div class="spacer_box VTX_info">
                        <table class="cf_table">
                            <thead class="visually-hidden">
                                <tr>
                                    <th>Property</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="description_text" v-html="$t('vtxDeviceReady')"></td>
                                    <td>
                                        <span class="colorToggle" :class="{ ready: deviceReady }">{{
                                            deviceReadyText
                                        }}</span>
                                    </td>
                                </tr>
                                <tr class="description vtx_type">
                                    <td class="description_text" v-html="$t('vtxType')"></td>
                                    <td class="description_value">{{ vtxTypeString }}</td>
                                </tr>
                                <tr class="description vtx_band">
                                    <td class="description_text" v-html="$t('vtxBand')"></td>
                                    <td class="description_value">{{ bandDescription }}</td>
                                </tr>
                                <tr class="description vtx_channel">
                                    <td class="description_text" v-html="$t('vtxChannel')"></td>
                                    <td class="description_value">{{ vtxConfig.vtx_channel }}</td>
                                </tr>
                                <tr class="description vtx_frequency">
                                    <td class="description_text" v-html="$t('vtxFrequency')"></td>
                                    <td class="description_value">{{ vtxConfig.vtx_frequency }}</td>
                                </tr>
                                <tr class="description vtx_power">
                                    <td class="description_text" v-html="$t('vtxPower')"></td>
                                    <td class="description_value">{{ powerDescription }}</td>
                                </tr>
                                <tr class="description pit_mode">
                                    <td class="description_text" v-html="$t('vtxPitMode')"></td>
                                    <td class="description_value">{{ pitModeDescription }}</td>
                                </tr>
                                <tr class="description vtx_pit_mode">
                                    <td class="description_text" v-html="$t('vtxPitModeFrequency')"></td>
                                    <td class="description_value">{{ vtxConfig.vtx_pit_mode_frequency }}</td>
                                </tr>
                                <tr class="description vtx_low_power_disarm">
                                    <td class="description_text" v-html="$t('vtxLowPowerDisarm')"></td>
                                    <td class="description_value">{{ lowPowerDisarmDescription }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- VTX Table -->
                <div class="x-scroll-wrapper col-span-4">
                    <div id="vtx_table" class="gui_box grey vtx_table_box" @change="onVtxTableChange">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('vtxTable')"></div>
                        </div>
                        <div class="spacer_box">
                            <!-- Bands count -->
                            <div class="field number vtx_table_bands_channels">
                                <span class="numberspacer">
                                    <UInputNumber
                                        class="one_digit_input"
                                        id="vtx_table_bands"
                                        :min="0"
                                        :max="8"
                                        :step="1"
                                        v-model="vtxConfig.vtx_table_bands"
                                    />
                                </span>
                                <label>
                                    <span v-html="$t('vtxTableBands')"></span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('vtxTableBandsHelp')"></div>
                            </div>

                            <!-- Channels count -->
                            <div class="field number vtx_table_channels">
                                <span class="numberspacer">
                                    <UInputNumber
                                        class="one_digit_input"
                                        id="vtx_table_channels"
                                        :min="0"
                                        :max="8"
                                        :step="1"
                                        v-model="vtxConfig.vtx_table_channels"
                                    />
                                </span>
                                <label>
                                    <span v-html="$t('vtxTableChannels')"></span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('vtxTableBandsChannelsHelp')"></div>
                            </div>

                            <!-- Bands/Channels table -->
                            <div class="field number table vtx_table_bands_table">
                                <span>
                                    <table class="table_vtx_bands">
                                        <thead>
                                            <tr class="vtx_table_band_values_title">
                                                <th><span v-html="$t('vtxTableBandTitleName')"></span></th>
                                                <th><span v-html="$t('vtxTableBandTitleLetter')"></span></th>
                                                <th v-show="factoryBandsSupported">
                                                    <span v-html="$t('vtxTableBandTitleFactory')"></span>
                                                </th>
                                                <th
                                                    v-for="ch in MAX_BAND_CHANNELS_VALUES"
                                                    :key="'title-ch-' + ch"
                                                    v-show="ch <= vtxConfig.vtx_table_channels"
                                                >
                                                    <span>{{ ch }}</span>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <!-- Band rows -->
                                            <tr
                                                v-for="bandIdx in MAX_BAND_VALUES"
                                                :key="'band-' + bandIdx"
                                                class="vtx_table_band_values"
                                                v-show="bandIdx <= vtxConfig.vtx_table_bands"
                                            >
                                                <td>
                                                    <span class="textspacer field_band_name">
                                                        <input
                                                            class="uppercase"
                                                            type="text"
                                                            maxlength="8"
                                                            size="8"
                                                            :value="getBandName(bandIdx)"
                                                            @input="
                                                                setBandName(
                                                                    bandIdx,
                                                                    $event.target.value.toUpperCase().trim(),
                                                                )
                                                            "
                                                        />
                                                    </span>
                                                </td>
                                                <td>
                                                    <span class="textspacer field_band_letter">
                                                        <input
                                                            class="uppercase"
                                                            type="text"
                                                            maxlength="1"
                                                            size="1"
                                                            :value="getBandLetter(bandIdx)"
                                                            @input="
                                                                setBandLetter(
                                                                    bandIdx,
                                                                    $event.target.value.toUpperCase().trim(),
                                                                )
                                                            "
                                                        />
                                                    </span>
                                                </td>
                                                <td v-show="factoryBandsSupported">
                                                    <span class="checkboxspacer">
                                                        <input
                                                            type="checkbox"
                                                            class="togglesmall"
                                                            :checked="getBandFactory(bandIdx)"
                                                            @change="setBandFactory(bandIdx, $event.target.checked)"
                                                        />
                                                    </span>
                                                </td>
                                                <td
                                                    v-for="chIdx in MAX_BAND_CHANNELS_VALUES"
                                                    :key="'band-' + bandIdx + '-ch-' + chIdx"
                                                    v-show="chIdx <= vtxConfig.vtx_table_channels"
                                                >
                                                    <span class="numberspacer field_band_channel">
                                                        <UInputNumber
                                                            class="frequency_input"
                                                            :min="0"
                                                            :max="5999"
                                                            :step="1"
                                                            :model-value="getBandChannelFreq(bandIdx, chIdx)"
                                                            @update:model-value="
                                                                setBandChannelFreq(bandIdx, chIdx, $event)
                                                            "
                                                        />
                                                    </span>
                                                </td>
                                                <td>
                                                    <span v-html="$t('vtxBand_X', { bandName: bandIdx })"></span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </span>
                                <span>
                                    <div class="helpicon cf_tip" :title="$t('vtxTableBandsChannelsTableHelp')"></div>
                                </span>
                            </div>

                            <!-- Power levels count -->
                            <div class="field number vtx_table_powerlevels">
                                <span class="numberspacer">
                                    <UInputNumber
                                        class="one_digit_input"
                                        id="vtx_table_powerlevels"
                                        :min="0"
                                        :max="8"
                                        :step="1"
                                        v-model="vtxConfig.vtx_table_powerlevels"
                                    />
                                </span>
                                <label>
                                    <span v-html="$t('vtxTablePowerLevels')"></span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('vtxTablePowerLevelsHelp')"></div>
                            </div>

                            <!-- Power levels table -->
                            <div class="field number table vtx_table_powerlevels_table">
                                <span>
                                    <table class="table_vtx_powerlevels">
                                        <thead>
                                            <tr class="vtx_table_powerlevels_title">
                                                <th
                                                    v-for="i in MAX_POWERLEVEL_VALUES"
                                                    :key="'pl-title-' + i"
                                                    v-show="i <= vtxConfig.vtx_table_powerlevels"
                                                >
                                                    <span>{{ i }}</span>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <!-- Values row -->
                                            <tr class="vtx_table_powerlevels_values">
                                                <td
                                                    v-for="i in MAX_POWERLEVEL_VALUES"
                                                    :key="'pl-val-' + i"
                                                    v-show="i <= vtxConfig.vtx_table_powerlevels"
                                                >
                                                    <span class="numberspacer field_powerlevel_value">
                                                        <UInputNumber
                                                            :min="0"
                                                            :max="65535"
                                                            :step="1"
                                                            :model-value="getPowerLevelValue(i)"
                                                            @update:model-value="setPowerLevelValue(i, $event)"
                                                        />
                                                    </span>
                                                </td>
                                                <td><span v-html="$t('vtxTablePowerLevelsValue')"></span></td>
                                            </tr>
                                            <!-- Labels row -->
                                            <tr class="vtx_table_powerlevels_labels">
                                                <td
                                                    v-for="i in MAX_POWERLEVEL_VALUES"
                                                    :key="'pl-lbl-' + i"
                                                    v-show="i <= vtxConfig.vtx_table_powerlevels"
                                                >
                                                    <span class="textspacer field_powerlevel_label">
                                                        <input
                                                            class="uppercase"
                                                            type="text"
                                                            maxlength="3"
                                                            size="1"
                                                            :value="getPowerLevelLabel(i)"
                                                            @input="
                                                                setPowerLevelLabel(
                                                                    i,
                                                                    $event.target.value.toUpperCase().trim(),
                                                                )
                                                            "
                                                        />
                                                    </span>
                                                </td>
                                                <td><span v-html="$t('vtxTablePowerLevelsLabel')"></span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </span>
                                <span>
                                    <div class="helpicon cf_tip" :title="$t('vtxTablePowerLevelsTableHelp')"></div>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Save pending warning -->
            <div class="note vtx_table_save_pending" v-show="savePending">
                <div v-html="$t('vtxMessageVerifyTable')"></div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="content_toolbar xs-compressed toolbar_fixed_bottom">
            <div class="toolbar_expand_btn" nbrow="2">
                <em class="fas fa-ellipsis-h"></em>
            </div>

            <div class="btn save_btn">
                <a
                    class="save"
                    id="save_button"
                    href="#"
                    :class="{ disabled: saveButtonDisabled }"
                    @click.prevent="handleSave"
                    >{{ saveButtonOverride || $t("vtxButtonSave") }}</a
                >
            </div>
            <div class="btn load_cliboard_btn clipboard_available">
                <a
                    class="load_clipboard"
                    id="load_clipboard_button"
                    href="#"
                    :aria-label="$t('vtxButtonLoadClipboard')"
                    @click.prevent="loadClipboardJson"
                    v-html="$t('vtxButtonLoadClipboard')"
                ></a>
            </div>
            <div class="btn load_file_btn">
                <a
                    class="load_file"
                    id="load_file_button"
                    href="#"
                    :aria-label="$t('vtxButtonLoadFile')"
                    @click.prevent="loadJsonFile"
                    v-html="$t('vtxButtonLoadFile')"
                ></a>
            </div>
            <div class="btn save_file_btn">
                <a
                    class="save_file"
                    id="save_file_button"
                    href="#"
                    :aria-label="$t('vtxButtonSaveFile')"
                    @click.prevent="saveJsonFile"
                    v-html="$t('vtxButtonSaveFile')"
                ></a>
            </div>
            <div class="btn save_lua_btn">
                <a class="save_lua" id="save_lua_button" href="#" @click.prevent="saveLuaFile">
                    <span v-html="$t('vtxButtonSaveLua')"></span>
                    <div class="helpicon cf_tip" :title="$t('vtxLuaFileHelp')"></div>
                </a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, onMounted, computed } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { useVtx } from "../../composables/useVtx";
import { useInterval } from "../../composables/useInterval";

export default defineComponent({
    name: "VtxTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const {
            MAX_POWERLEVEL_VALUES,
            MAX_BAND_VALUES,
            MAX_BAND_CHANNELS_VALUES,
            updating,
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

        // Override text for the save button (shows saving/saved states)
        const saveButtonOverride = computed(() => saveButtonText.value || "");

        onMounted(async () => {
            await loadVtxConfig();

            // Start device status polling
            addInterval("vtx_device_status_pull", updateDeviceStatus, 1000);

            i18n.localizePage();
            GUI.content_ready();
        });

        // Interval cleanup handled automatically by useInterval on unmount

        const handleSave = () => {
            saveVtx();
        };

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

        function getBandName(bandIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_name ?? "";
        }

        function setBandName(bandIdx, value) {
            ensureBandExists(bandIdx);
            bandList[bandIdx - 1].vtxtable_band_name = value;
        }

        function getBandLetter(bandIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_letter ?? "";
        }

        function setBandLetter(bandIdx, value) {
            ensureBandExists(bandIdx);
            bandList[bandIdx - 1].vtxtable_band_letter = value;
        }

        function getBandFactory(bandIdx) {
            return bandList[bandIdx - 1]?.vtxtable_band_is_factory_band ?? false;
        }

        function setBandFactory(bandIdx, value) {
            ensureBandExists(bandIdx);
            bandList[bandIdx - 1].vtxtable_band_is_factory_band = value;
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
        }

        function getPowerLevelLabel(idx) {
            return powerLevelList[idx - 1]?.vtxtable_powerlevel_label ?? "";
        }

        function setPowerLevelLabel(idx, value) {
            ensurePowerLevelExists(idx);
            powerLevelList[idx - 1].vtxtable_powerlevel_label = value;
        }

        return {
            // Constants
            MAX_POWERLEVEL_VALUES,
            MAX_BAND_VALUES,
            MAX_BAND_CHANNELS_VALUES,

            // State
            updating,
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
            bandDescription,
            powerDescription,
            pitModeDescription,
            lowPowerDisarmDescription,
            deviceReadyText,

            // Actions
            handleSave,
            saveJsonFile,
            saveLuaFile,
            loadJsonFile,
            loadClipboardJson,
            onVtxTableChange,

            // Table accessors
            getBandName,
            setBandName,
            getBandLetter,
            setBandLetter,
            getBandFactory,
            setBandFactory,
            getBandChannelFreq,
            setBandChannelFreq,
            getPowerLevelValue,
            setPowerLevelValue,
            getPowerLevelLabel,
            setPowerLevelLabel,
        };
    },
});
</script>

<style scoped>
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
}

.cf_table {
    -webkit-border-horizontal-spacing: 1px;
}

.select_mode .field {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0 !important;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--surface-500);
}

.select_mode .field .helpicon {
    margin-top: 0;
    margin-right: 0;
}

.select_mode .field > span {
    display: inline-block;
    min-width: 9rem;
}

.select_mode .field > span + span {
    margin-right: auto;
}

.select_mode .field .label {
    width: 100%;
}

.select_mode .field .label > span {
    margin-right: auto;
}

.select_mode .field:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
}

.select_mode .field .checkboxspacer {
    height: 1.5rem;
    display: flex;
    align-items: center;
}

.one_digit_input {
    width: 80px;
}

.frequency_input {
    width: 120px;
}

.vtx_table_box {
    min-width: 750px;
}

.VTX_info table td {
    padding: 0.25rem 0;
}

.VTX_info table td:first-child {
    padding-right: 1rem;
}

.table_vtx_bands tr:first-child td {
    text-align: center;
}

.table_vtx_bands td {
    padding: 0.25rem;
    text-align: center;
}

.table_vtx_bands :deep(input) {
    min-width: 0;
    padding-right: 0.25rem;
}

.table_vtx_powerlevels tr:first-child td {
    text-align: center;
}

.table_vtx_powerlevels td {
    padding: 0.25rem;
    text-align: center;
}

.table_vtx_powerlevels :deep(input) {
    display: block;
    min-width: 5rem;
}

@media all and (max-width: 575px) {
    .x-scroll-wrapper {
        overflow-x: auto;
    }

    .x-scroll-wrapper .gui_box {
        min-width: fit-content;
    }

    .grid-box.col4 {
        grid-template-columns: 1fr;
    }

    .grid-box.col4 .col-span-3 {
        grid-column: span 1;
    }

    .grid-box.col4 .col-span-4 {
        grid-column: span 1;
    }
}
</style>
