<template>
    <BaseTab tab-name="firmware_flasher">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabFirmwareFlasher") }}</div>
            <WikiButton docUrl="firmware_flasher" />
            <div ref="tabSponsor" class="tab_sponsor"></div>
            <div v-if="state.flashingInProgress" class="data-loading flashing-wait">
                <p>{{ state.progressLabelText }} {{ $t("firmwareFlasherPleaseWait") }}</p>
            </div>
            <template v-else>
                <div class="grid-box-spacer"></div>
                <div class="grid-box col2">
                    <div class="options gui_box col-span-1">
                        <div class="darkgrey_box gui_box_titlebar">
                            <div class="spacer_box_title">
                                {{
                                    $t("firmwareFlasherBoardSelectionHead") || $t("firmwareFlasherTargetSelectionHead")
                                }}
                            </div>
                        </div>
                        <div class="spacer">
                            <div class="board-selection-grid">
                                <div class="grid-row">
                                    <div
                                        v-if="state.targetQualificationVisible"
                                        :class="['note', state.targetQualificationClass]"
                                    >
                                        <span class="target-qualification-label">{{
                                            state.targetQualificationText
                                        }}</span>
                                    </div>
                                </div>
                                <div class="grid-row expert_mode option">
                                    <label class="vue-switch-label">
                                        <input
                                            v-model="state.expertMode"
                                            class="expert_mode vue-switch-input"
                                            type="checkbox"
                                            @change="handleExpertModeChange"
                                        />
                                        <span class="vue-switch-slider" aria-hidden="true"></span>
                                        <span class="vue-switch-text">{{ $t("expertMode") }}</span>
                                        <span class="helpicon cf_tip_wide" :title="$t('expertModeDescription')"></span>
                                    </label>
                                </div>
                                <div class="grid-row option">
                                    <label class="vue-switch-label">
                                        <input
                                            v-model="state.showDevelopmentReleases"
                                            class="show_development_releases vue-switch-input"
                                            type="checkbox"
                                            @change="handleShowDevelopmentReleasesChange"
                                        />
                                        <span class="vue-switch-slider" aria-hidden="true"></span>
                                        <span class="vue-switch-text">{{
                                            $t("firmwareFlasherShowDevelopmentReleases")
                                        }}</span>
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherShowDevelopmentReleasesDescription')"
                                        ></span>
                                    </label>
                                </div>
                                <div v-if="state.buildTypeRowVisible" class="grid-row select-row">
                                    <div class="build-select">
                                        <div class="select-wrapper-simple">
                                            <select
                                                id="buildTypeSelect"
                                                v-model.number="state.selectedBuildType"
                                                @change="onBuildTypeChange"
                                            >
                                                <option
                                                    v-for="option in state.buildTypeOptions"
                                                    :key="option.value"
                                                    :value="option.value"
                                                >
                                                    {{ option.label }}
                                                </option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="help-icon-cell">
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherOnlineSelectBuildType')"
                                        ></div>
                                    </div>
                                </div>
                                <div class="grid-row select-row">
                                    <div class="board-select">
                                        <div class="select-wrapper-simple">
                                            <Multiselect
                                                v-model="boardSelection.state.selectedBoard"
                                                :options="boardSelection.getGroupedBoardOptions()"
                                                :searchable="true"
                                                :show-labels="false"
                                                :internal-search="true"
                                                :clear-on-select="true"
                                                group-values="boards"
                                                group-label="name"
                                                placeholder="Search for a board..."
                                                label="target"
                                                track-by="target"
                                                @select="onBoardChange"
                                                class="standard-select"
                                                :key="
                                                    boardSelection.state.boardOptions.length +
                                                    '-' +
                                                    (boardSelection.state.selectedBoard || '')
                                                "
                                            />
                                        </div>
                                    </div>
                                    <div class="help-icon-cell">
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherOnlineSelectBoardHint')"
                                        ></span>
                                    </div>
                                    <div class="action-button-cell">
                                        <a
                                            ref="detectBoardButton"
                                            href="#"
                                            class="detect-board cf_tip_wide"
                                            :title="$t('firmwareFlasherOnlineSelectBoardDescription')"
                                            @click.prevent="handleDetectBoard"
                                        >
                                            <span>{{ $t("firmwareFlasherDetectBoardButton") }}</span>
                                        </a>
                                    </div>
                                </div>
                                <div class="grid-row select-row">
                                    <div class="firmware-version">
                                        <div
                                            class="select-wrapper-simple"
                                            :class="{ 'no-board-selected': !boardSelection.state.selectedBoard }"
                                        >
                                            <Multiselect
                                                v-model="boardSelection.state.selectedFirmwareVersion"
                                                :options="boardSelection.state.firmwareVersionOptions"
                                                :searchable="true"
                                                :show-labels="false"
                                                :internal-search="true"
                                                :clear-on-select="true"
                                                placeholder="Select Version..."
                                                label="label"
                                                track-by="release"
                                                @select="onFirmwareVersionChange"
                                                class="standard-select"
                                            />
                                        </div>
                                    </div>
                                    <div class="help-icon-cell">
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherOnlineSelectFirmwareVersionDescription')"
                                        ></span>
                                    </div>
                                    <div></div>
                                </div>
                                <div v-show="state.expertOptionsVisible" class="grid-row expertOptions option">
                                    <label class="vue-switch-label">
                                        <input
                                            v-model="state.noRebootSequence"
                                            class="updating vue-switch-input"
                                            type="checkbox"
                                            @change="handleNoRebootChange"
                                        />
                                        <span class="vue-switch-slider" aria-hidden="true"></span>
                                        <span class="vue-switch-text">{{ $t("firmwareFlasherNoReboot") }}</span>
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherNoRebootDescription')"
                                        ></span>
                                    </label>
                                </div>
                                <div
                                    v-show="state.flashOnConnectWrapperVisible"
                                    class="grid-row expertOptions option flash_on_connect_wrapper"
                                >
                                    <label class="vue-switch-label">
                                        <input
                                            v-model="state.flashOnConnect"
                                            class="flash_on_connect vue-switch-input"
                                            type="checkbox"
                                        />
                                        <span class="vue-switch-slider" aria-hidden="true"></span>
                                        <span class="vue-switch-text">{{ $t("firmwareFlasherFlashOnConnect") }}</span>
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherFlashOnConnectDescription')"
                                        ></span>
                                    </label>
                                </div>
                                <div v-show="state.expertOptionsVisible" class="grid-row expertOptions option">
                                    <label class="vue-switch-label">
                                        <input
                                            v-model="state.eraseChip"
                                            class="erase_chip vue-switch-input"
                                            type="checkbox"
                                            @change="handleEraseChipChange"
                                        />
                                        <span class="vue-switch-slider" aria-hidden="true"></span>
                                        <span class="vue-switch-text">{{ $t("firmwareFlasherFullChipErase") }}</span>
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherFullChipEraseDescription')"
                                        ></span>
                                    </label>
                                </div>
                                <div
                                    v-show="state.expertOptionsVisible"
                                    class="grid-row expertOptions option manual_baud_rate noboarder"
                                >
                                    <label class="vue-switch-label">
                                        <input
                                            v-model="state.flashManualBaud"
                                            class="flash_manual_baud vue-switch-input"
                                            type="checkbox"
                                            @change="handleFlashManualBaudChange"
                                        />
                                        <span class="vue-switch-slider" aria-hidden="true"></span>
                                        <span class="vue-switch-text">{{ $t("firmwareFlasherManualBaud") }}</span>
                                        <select
                                            v-model="state.flashManualBaudRate"
                                            id="flash_manual_baud_rate"
                                            :title="$t('firmwareFlasherBaudRate')"
                                            @change="handleFlashManualBaudRateChange"
                                        >
                                            <option value="921600">921600</option>
                                            <option value="460800">460800</option>
                                            <option value="256000">256000</option>
                                            <option value="230400">230400</option>
                                            <option value="115200">115200</option>
                                            <option value="57600">57600</option>
                                            <option value="38400">38400</option>
                                            <option value="28800">28800</option>
                                            <option value="19200">19200</option>
                                        </select>
                                        <span
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherManualBaudDescription')"
                                        ></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-if="state.buildConfigVisible" class="build_configuration gui_box col-span-1">
                        <div class="darkgrey_box gui_box_titlebar">
                            <div class="build_configuration_toggle_wrapper">
                                <label id="build_configuration_toggle_label" class="vue-switch-label">
                                    <input
                                        v-model="state.coreBuildMode"
                                        ref="corebuildModeCheckbox"
                                        class="corebuild_mode vue-switch-input"
                                        type="checkbox"
                                        @change="handleCoreBuildModeChange"
                                    />
                                    <span class="vue-switch-slider" aria-hidden="true"></span>
                                    <span id="build_configuration_toggle_label_text" class="vue-switch-text">{{
                                        $t("coreBuild")
                                    }}</span>
                                </label>
                                <div class="helpicon cf_tip_wide" :title="$t('coreBuildModeDescription')"></div>
                            </div>
                            <div class="spacer_box_title" v-html="$t('firmwareFlasherBuildConfigurationHead')"></div>
                        </div>
                        <div class="grid-box col1">
                            <div class="spacer hide-in-core-build-mode">
                                <div class="grid-box col2">
                                    <div class="select-group">
                                        <strong>{{ $t("firmwareFlasherBuildRadioProtocols") }}</strong>
                                        <div id="radioProtocolInfo" class="select-wrapper">
                                            <Multiselect
                                                v-model="state.selectedRadioProtocol"
                                                :options="state.radioProtocolOptions"
                                                :show-labels="false"
                                                placeholder="Select protocol"
                                                track-by="value"
                                                label="name"
                                                @input="onRadioProtocolChange"
                                                class="standard-select"
                                            />
                                        </div>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherRadioProtocolDescription')"
                                        ></div>
                                    </div>
                                    <div class="select-group">
                                        <strong>{{ $t("firmwareFlasherBuildTelemetryProtocols") }}</strong>
                                        <div id="telemetryProtocolInfo" class="select-wrapper">
                                            <Multiselect
                                                v-model="state.selectedTelemetryProtocol"
                                                :options="state.telemetryProtocolOptions"
                                                :show-labels="false"
                                                placeholder="Select protocol"
                                                track-by="value"
                                                label="name"
                                                @input="onTelemetryProtocolChange"
                                                class="standard-select"
                                            />
                                        </div>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherTelemetryProtocolDescription')"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <div class="spacer hide-in-core-build-mode">
                                <div class="grid-box col2">
                                    <div class="select-group">
                                        <strong>{{ $t("firmwareFlasherBuildOsdProtocols") }}</strong>
                                        <div
                                            id="osdProtocolInfo"
                                            class="select-wrapper"
                                            :class="{ 'osd-needs-attention': state.osdProtocolNeedsAttention }"
                                        >
                                            <Multiselect
                                                v-model="state.selectedOsdProtocol"
                                                :options="state.osdProtocolOptions"
                                                :show-labels="false"
                                                placeholder="Select protocol"
                                                track-by="value"
                                                label="name"
                                                @input="onOsdProtocolChange"
                                                class="standard-select"
                                            />
                                        </div>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherOsdProtocolDescription')"
                                        ></div>
                                    </div>
                                    <div class="select-group">
                                        <strong>{{ $t("firmwareFlasherBuildMotorProtocols") }}</strong>
                                        <div id="motorProtocolInfo" class="select-wrapper">
                                            <Multiselect
                                                v-model="state.selectedMotorProtocol"
                                                :options="state.motorProtocolOptions"
                                                :show-labels="false"
                                                placeholder="Select protocol"
                                                track-by="value"
                                                label="name"
                                                @input="onMotorProtocolChange"
                                                class="standard-select"
                                            />
                                        </div>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherMotorProtocolDescription')"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <div class="spacer hide-in-core-build-mode">
                                <div class="grid-box col1">
                                    <div class="select-group">
                                        <strong>{{ $t("firmwareFlasherBuildOptions") }}</strong>
                                        <div id="optionsInfo" class="select-wrapper">
                                            <Multiselect
                                                v-model="state.selectedOptions"
                                                :options="state.optionsListOptions"
                                                :show-labels="false"
                                                :multiple="true"
                                                placeholder="Select options"
                                                track-by="value"
                                                label="name"
                                                @input="onOptionsChange"
                                                class="standard-select"
                                            />
                                        </div>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherOptionsDescription')"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <div class="expertOptions spacer hide-in-core-build-mode">
                                <div class="grid-box col1">
                                    <div class="select-group">
                                        <strong>{{ $t("firmwareFlasherBuildCustomDefines") }}</strong>
                                        <div id="customDefinesInfo" class="build-options-wrapper">
                                            <input ref="customDefinesInput" id="customDefines" name="customDefines" />
                                            <div
                                                class="helpicon cf_tip_wide"
                                                :title="$t('firmwareFlasherCustomDefinesDescription')"
                                            ></div>
                                        </div>
                                    </div>
                                    <div v-show="state.commitSelectionVisible" class="commitSelection select-group">
                                        <strong>{{ $t("firmwareFlasherBranch") }}</strong>
                                        <div id="branchInfo" class="select-wrapper">
                                            <Multiselect
                                                v-model="state.selectedCommit"
                                                :options="state.commitOptions"
                                                :show-labels="false"
                                                placeholder="Select branch"
                                                track-by="value"
                                                label="label"
                                                @input="onCommitChange"
                                                class="standard-select"
                                            />
                                        </div>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherBranchDescription')"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        v-if="state.releaseInfoVisible"
                        ref="releaseInfoContainer"
                        class="release_info gui_box col-span-1"
                    >
                        <div class="darkgrey_box gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('firmwareFlasherReleaseSummaryHead')"></div>
                        </div>
                        <div class="spacer">
                            <div class="release_info_grid">
                                <!-- Target Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherReleaseTarget") }}</strong>
                                    <span ref="targetSpan" class="target">{{ state.targetSpanText }}</span>
                                    <div class="board_support">
                                        <a id="targetSupportInfoUrl" :href="state.targetSupportUrl" target="_blank">{{
                                            $t("betaflightSupportButton")
                                        }}</a>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('firmwareFlasherTargetWikiUrlInfo')"
                                        ></div>
                                    </div>
                                </div>

                                <!-- Manufacturer Row (conditional) -->
                                <div v-if="state.manufacturerInfoVisible" ref="manufacturerInfoDiv" class="info_row">
                                    <strong>{{ $t("firmwareFlasherReleaseManufacturer") }}</strong>
                                    <span ref="manufacturerSpan" id="manufacturer">{{
                                        state.manufacturerSpanText
                                    }}</span>
                                    <div></div>
                                </div>

                                <!-- Version Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherReleaseVersion") }}</strong>
                                    <a
                                        ref="releaseNameLink"
                                        :title="$t('firmwareFlasherReleaseVersionUrl')"
                                        class="name"
                                        :href="state.releaseNameLink"
                                        target="_blank"
                                        >{{ state.releaseNameText }}</a
                                    >
                                    <div></div>
                                </div>

                                <!-- MCU Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherReleaseMCU") }}</strong>
                                    <span ref="targetMCUSpan" id="targetMCU">{{ state.targetMCUText }}</span>
                                    <div></div>
                                </div>

                                <!-- Date Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherReleaseDate") }}</strong>
                                    <span ref="releaseDateSpan" class="date">{{ state.releaseDateText }}</span>
                                    <div></div>
                                </div>

                                <!-- Configuration File Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherConfigurationFile") }}</strong>
                                    <span ref="configFilenameSpan" class="configFilename">{{
                                        state.configFilenameText
                                    }}</span>
                                    <div></div>
                                </div>

                                <!-- Cloud Details Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherCloudBuildDetails") }}</strong>
                                    <a
                                        ref="cloudTargetLogLink"
                                        :title="$t('firmwareFlasherCloudBuildLogUrl')"
                                        id="cloudTargetLog"
                                        :href="cloudBuild.state.cloudTargetLogUrl"
                                        target="_blank"
                                        >{{ cloudBuild.state.cloudTargetLogText }}</a
                                    >
                                    <div></div>
                                </div>

                                <!-- Cloud Status Row -->
                                <div class="info_row">
                                    <strong>{{ $t("firmwareFlasherCloudBuildStatus") }}</strong>
                                    <div class="status_wrapper">
                                        <progress
                                            :ref="cloudBuild.buildProgressBar"
                                            class="buildProgress"
                                            value="0"
                                            min="0"
                                            max="100"
                                        ></progress>
                                        <span ref="cloudTargetStatusSpan" id="cloudTargetStatus">
                                            {{ cloudBuild.state.cloudTargetStatusText }}</span
                                        >
                                    </div>
                                    <div class="btn default_btn">
                                        <a
                                            ref="cloudBuildCancelButton"
                                            :class="[
                                                'cloud_build_cancel',
                                                { disabled: cloudBuild.state.cancelBuildButtonDisabled },
                                            ]"
                                            href="#"
                                            @click.prevent="cloudBuild.handleCancelBuild"
                                            >{{ $t("cancel") }}</a
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="grid-box-spacer"></div>
                <div class="grid-box col2">
                    <div class="gui_box gui_warning">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('warningTitle')"></div>
                        </div>
                        <div class="spacer">
                            <p v-html="$t('firmwareFlasherWarningText')"></p>
                            <br />
                            <p v-html="$t('firmwareFlasherTargetWarning')"></p>
                        </div>
                    </div>
                    <div class="gui_box gui_note">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('firmwareFlasherRecoveryHead')"></div>
                        </div>
                        <div class="spacer">
                            <p v-html="$t('firmwareFlasherRecoveryText')"></p>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="info">
                <div id="progressbar"></div>
                <progress ref="progressBar" class="progress" value="0" min="0" max="100"></progress>
                <span
                    ref="progressLabel"
                    :class="['progressLabel', state.progressLabelClass]"
                    v-html="state.progressLabelText"
                    @click="handleProgressLabelClick"
                ></span>
            </div>
            <div class="btn">
                <a
                    ref="exitDfuButton"
                    :class="['exit_dfu', { disabled: state.dfuExitButtonDisabled }]"
                    href="#"
                    :title="$t('firmwareFlasherExitDfu')"
                    @click.prevent="handleExitDfu"
                    >{{ $t("firmwareFlasherExitDfu") }}</a
                >
            </div>
            <div class="btn">
                <a
                    ref="flashFirmwareButton"
                    :class="['flash_firmware', { disabled: state.flashButtonDisabled }]"
                    href="#progressbar"
                    @click.prevent="handleFlashFirmware"
                    >{{ $t("firmwareFlasherFlashFirmware") }}</a
                >
            </div>
            <div class="btn">
                <a
                    ref="loadRemoteFileButton"
                    :class="['load_remote_file', { disabled: state.loadRemoteButtonDisabled }]"
                    href="#"
                    @click.prevent="handleLoadRemoteFile"
                    >{{ $t("firmwareFlasherButtonLoadOnline") }}</a
                >
            </div>
            <div class="btn">
                <a
                    ref="loadFileButton"
                    :class="['load_file', { disabled: state.loadFileButtonDisabled }]"
                    href="#"
                    @click.prevent="handleLoadFile"
                    >{{ $t("firmwareFlasherButtonLoadLocal") }}</a
                >
            </div>
        </div>

        <dialog
            ref="unstableFirmwareDialog"
            id="dialogUnstableFirmwareAcknowledgement"
            @close="handleUnstableFirmwareDialogClose"
        >
            <h3>{{ $t("warningTitle") }}</h3>
            <div class="content">
                <div v-html="$t('unstableFirmwareAcknowledgementDialog')"></div>
                <div>
                    <label class="vue-switch-label" for="dialogUnstableFirmwareAcknowledgement-acknowledge">
                        <input
                            id="dialogUnstableFirmwareAcknowledgement-acknowledge"
                            v-model="state.dialogUnstableFirmwareAcknowledgementCheckbox"
                            name="dialogUnstableFirmwareAcknowledgement-acknowledge"
                            class="vue-switch-input"
                            type="checkbox"
                        />
                        <span class="vue-switch-slider" aria-hidden="true"></span>
                        <span class="vue-switch-text" v-html="$t('unstableFirmwareAcknowledgement')"></span>
                    </label>
                </div>
            </div>
            <div class="dialog_toolbar">
                <div class="btn">
                    <a
                        :class="[
                            'disabled',
                            'regular-button',
                            { disabled: !state.dialogUnstableFirmwareAcknowledgementCheckbox },
                        ]"
                        href="#"
                        id="dialogUnstableFirmwareAcknowledgement-flashbtn"
                        @click.prevent="handleUnstableFirmwareFlash"
                        >{{ $t("unstableFirmwareAcknowledgementFlash") }}</a
                    >
                </div>
                <div class="btn">
                    <a
                        href="#"
                        id="dialogUnstableFirmwareAcknowledgement-cancelbtn"
                        class="regular-button"
                        @click.prevent="handleUnstableFirmwareCancel"
                        >{{ $t("cancel") }}</a
                    >
                </div>
            </div>
        </dialog>

        <dialog ref="verifyBoardDialog" id="dialog-verify-board" @close="handleVerifyBoardDialogClose">
            <div id="dialog-verify-board-content-wrapper">
                <div ref="verifyBoardContent" id="dialog-verify-board-content"></div>
                <div class="btn dialog-buttons">
                    <a
                        href="#"
                        id="dialog-verify-board-abort-confirmbtn"
                        class="regular-button"
                        @click.prevent="handleVerifyBoardAbort"
                        >{{ $t("firmwareFlasherButtonAbort") }}</a
                    >
                    <a
                        href="#"
                        id="dialog-verify-board-continue-confirmbtn"
                        class="regular-button"
                        @click.prevent="handleVerifyBoardContinue"
                        >{{ $t("firmwareFlasherButtonContinue") }}</a
                    >
                </div>
            </div>
        </dialog>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, ref, onMounted, onBeforeUnmount, inject, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import Multiselect from "vue-multiselect";
import "vue-multiselect/dist/vue-multiselect.css";
import { i18n } from "../../js/localization";
import GUI, { TABS } from "../../js/gui";
import { useCloudBuild } from "../../composables/useCloudBuild.js";
import { useBoardSelection } from "../../composables/useBoardSelection.js";
import { useFirmwareFlashing, cleanUnifiedConfigFile } from "../../composables/useFirmwareFlashing.js";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { get as getStorage, set as setStorage } from "../../js/SessionStorage";
import BuildApi from "../../js/BuildApi";
import { tracking } from "../../js/Analytics";
import PortHandler from "../../js/port_handler";
import { gui_log } from "../../js/gui_log";
import semver from "semver";
import Sponsor from "../../js/Sponsor";
import FileSystem from "../../js/FileSystem";
import AutoBackup from "../../js/utils/AutoBackup.js";
import { EventBus } from "../eventBus";
import { ispConnected } from "../../js/utils/connection.js";
import FC from "../../js/fc";

export default defineComponent({
    name: "FirmwareFlasherTab",
    components: {
        BaseTab,
        WikiButton,
        Multiselect,
    },
    setup() {
        // Get $t from Vue i18n if available, otherwise use fallback
        const $t = inject("$t", (key, params) => i18n.getMessage(key, params));

        // Reactive state
        const state = reactive({
            localFirmwareLoaded: false,
            selectedBuildType: 0,
            selectedRadioProtocol: undefined,
            selectedTelemetryProtocol: undefined,
            selectedOsdProtocol: undefined,
            selectedMotorProtocol: undefined,
            selectedOptions: [],
            selectedCommit: undefined,
            cloudBuildOptions: null,
            isConfigLocal: false,
            filename: null,
            configFilename: null,
            config: {},
            developmentFirmwareLoaded: false,
            preFlashingMessage: null,
            preFlashingMessageType: null,
            firmware_type: undefined,
            targetDetail: null,
            // Select options
            buildTypeOptions: [],
            radioProtocolOptions: [],
            telemetryProtocolOptions: [],
            osdProtocolOptions: [],
            motorProtocolOptions: [],
            optionsListOptions: [],
            commitOptions: [],
            // UI State - Checkboxes
            expertMode: false,
            showDevelopmentReleases: false,
            noRebootSequence: false,
            flashOnConnect: false,
            eraseChip: false,
            flashManualBaud: false,
            coreBuildMode: false,
            // UI State - Button disabled flags
            flashButtonDisabled: true,
            loadRemoteButtonDisabled: true,
            loadFileButtonDisabled: false,
            dfuExitButtonDisabled: true,
            // UI State - Visibility flags
            releaseInfoVisible: false,
            buildConfigVisible: false,
            flashOnConnectWrapperVisible: false,
            manufacturerInfoVisible: false,
            cloudTargetInfoVisible: false,
            targetQualificationVisible: false,
            expertOptionsVisible: false,
            buildTypeRowVisible: false,
            hideInCoreBuildMode: true,
            commitSelectionVisible: false,
            // UI State - Text content
            targetQualificationText: "",
            targetQualificationClass: "", // "gui_note" or "gui_warning"
            targetSpanText: "",
            releaseNameText: "",
            releaseNameLink: "",
            releaseDateText: "",
            targetMCUText: "",
            configFilenameText: "",
            manufacturerSpanText: "",
            targetSupportUrl: "https://betaflight.com/docs/wiki/boards/archive/Missing",
            progressLabelText: "",
            progressLabelClass: "", // "valid", "invalid", "actionRequired"
            osdProtocolNeedsAttention: false, // True if OSD protocol is empty (shows red)
            // UI State - Input values
            flashManualBaudRate: "256000",
            // Dialog states
            dialogUnstableFirmwareAcknowledgementCheckbox: false,
            flashingInProgress: false,
        });

        // Template refs for all interactive elements
        // Checkboxes
        const corebuildModeCheckbox = ref(null);

        // Inputs
        const customDefinesInput = ref(null);

        // Buttons
        const detectBoardButton = ref(null);
        const exitDfuButton = ref(null);
        const flashFirmwareButton = ref(null);
        const loadRemoteFileButton = ref(null);
        const loadFileButton = ref(null);
        const cloudBuildCancelButton = ref(null);

        // Progress elements
        const progressBar = ref(null);
        const progressLabel = ref(null);

        // Release info elements
        const releaseInfoContainer = ref(null);
        const targetSpan = ref(null);
        const manufacturerInfoDiv = ref(null);
        const manufacturerSpan = ref(null);
        const releaseNameLink = ref(null);
        const targetMCUSpan = ref(null);
        const releaseDateSpan = ref(null);
        const configFilenameSpan = ref(null);

        // Cloud build info elements
        const cloudTargetInfoDiv = ref(null);
        const cloudTargetLogLink = ref(null);
        const cloudTargetStatusSpan = ref(null);

        // Other refs
        const tabSponsor = ref(null);

        // Verify board dialog refs
        const verifyBoardDialog = ref(null);
        const verifyBoardContent = ref(null);
        const verifyBoardOnAcceptCallback = ref(null);
        const verifyBoardOnAbortCallback = ref(null);

        // Unstable firmware dialog refs
        const unstableFirmwareDialog = ref(null);
        const unstableFirmwareAcknowledgementCallback = ref(null);

        let dfuMonitorInterval = null;

        const buildApi = new BuildApi();
        const sponsor = new Sponsor();
        const logHead = "[FIRMWARE_FLASHER]";

        const FLASH_MESSAGE_TYPES = {
            NEUTRAL: "NEUTRAL",
            VALID: "VALID",
            INVALID: "INVALID",
            ACTION: "ACTION",
        };

        // Helper functions
        const getExtension = (key) => {
            if (!key) {
                return undefined;
            }
            const lower = key.toLowerCase();
            return lower.split("?")[0].split("#")[0].split(".").pop();
        };

        // Flashing state control - update reactive state instead of DOM
        const enableFlashButton = (enabled) => {
            state.flashButtonDisabled = !enabled;
        };

        const enableLoadRemoteFileButton = (enabled) => {
            state.loadRemoteButtonDisabled = !enabled;
        };

        const enableLoadFileButton = (enabled) => {
            state.loadFileButtonDisabled = !enabled;
        };

        const enableDfuExitButton = (enabled) => {
            state.dfuExitButtonDisabled = !enabled;
        };

        const updateDfuExitButtonState = () => {
            const selectedPort = PortHandler.portPicker?.selectedPort || "";
            const hasDfuPortSelected = typeof selectedPort === "string" && selectedPort.startsWith("usb");
            enableDfuExitButton(PortHandler.dfuAvailable || hasDfuPortSelected);
        };

        const flashingMessage = (message, type) => {
            switch (type) {
                case FLASH_MESSAGE_TYPES.VALID:
                    state.progressLabelClass = "valid";
                    break;
                case FLASH_MESSAGE_TYPES.INVALID:
                    state.progressLabelClass = "invalid";
                    break;
                case FLASH_MESSAGE_TYPES.ACTION:
                    state.progressLabelClass = "actionRequired";
                    break;
                case FLASH_MESSAGE_TYPES.NEUTRAL:
                default:
                    state.progressLabelClass = "";
                    break;
            }
            if (message !== null) {
                state.progressLabelText = message;
            }
            return TABS.firmware_flasher;
        };

        const flashProgress = (value) => {
            if (progressBar.value) {
                progressBar.value.value = value;
            } else {
                console.warn(`${logHead} progressBar ref is null!`);
            }
            if (value >= 100) {
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
            }
            return TABS.firmware_flasher;
        };

        const resetFlashingState = () => {
            state.flashingInProgress = false;
            GUI.flashingInProgress = false;
            enableFlashButton(!!firmwareFlashing.getParsedHex() || !!firmwareFlashing.getUf2Binary());
            updateDfuExitButtonState();
            enableLoadRemoteFileButton(true);
            enableLoadFileButton(true);

            if (firmwareFlashing.getParsedHex() || firmwareFlashing.getUf2Binary()) {
                if (state.preFlashingMessage && state.preFlashingMessageType) {
                    flashingMessage(state.preFlashingMessage, state.preFlashingMessageType);
                }
            } else {
                flashingMessage($t("firmwareFlasherFirmwareNotLoaded"), FLASH_MESSAGE_TYPES.NEUTRAL);
            }

            GUI.interval_resume("sponsor");
        };

        const preservePreFlashingState = () => {
            state.preFlashingMessage = state.progressLabelText;

            if (state.progressLabelClass === "valid") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.VALID;
            } else if (state.progressLabelClass === "invalid") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.INVALID;
            } else if (state.progressLabelClass === "actionRequired") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.ACTION;
            } else {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.NEUTRAL;
            }
        };

        const clearBoardConfig = () => {
            state.config = {};
            state.isConfigLocal = false;
            state.configFilename = null;
        };

        const setBoardConfig = (config, filename) => {
            state.config = config.join("\n");
            const hasFilename = filename !== undefined;
            state.isConfigLocal = hasFilename;
            state.configFilename = hasFilename ? filename : null;
        };

        const clearBufferedFirmware = () => {
            clearBoardConfig();
            firmwareFlashing.clearFirmwareState();
            state.firmware_type = undefined;
            state.localFirmwareLoaded = false;
            state.filename = null;
        };

        const showLoadedFirmware = (filename, bytes) => {
            state.filename = filename;

            if (state.localFirmwareLoaded) {
                flashingMessage(
                    $t("firmwareFlasherFirmwareLocalLoaded", {
                        filename: filename,
                        bytes: bytes,
                    }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            } else {
                flashingMessage(
                    `<a class="save_firmware" href="#" title="${$t("firmwareFlasherTooltipSaveFirmware")}">${$t(
                        "firmwareFlasherFirmwareOnlineLoaded",
                        { filename: filename, bytes: bytes },
                    )}</a>`,
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            }
            enableFlashButton(true);

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "FirmwareLoaded", {
                firmwareSize: bytes,
                firmwareName: filename,
                firmwareSource: state.localFirmwareLoaded ? "file" : "http",
                selectedTarget: state.targetDetail?.target,
                selectedRelease: state.targetDetail?.release,
            });
        };

        const cleanUnifiedConfigFileWrapper = (input) => {
            return cleanUnifiedConfigFile(input, {
                flashingMessage,
                gui_log,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
            });
        };

        const validateBuildKey = () => {
            return cloudBuild.state.cloudBuildKey?.length === 32 && ispConnected();
        };

        const findTargetDescriptor = (targetName) => {
            return boardSelection.state.targets?.find((descriptor) => descriptor.target === targetName);
        };

        const getSupportUrlForTarget = (targetName) => {
            const baseBoardUrl = "https://betaflight.com/docs/wiki/boards/current";
            const fallbackUrl = "https://betaflight.com/docs/wiki/boards/archive/Missing";

            if (!targetName || targetName === "0") {
                return fallbackUrl;
            }

            return `${baseBoardUrl}/${encodeURIComponent(targetName)}`;
        };

        const updateTargetQualification = (targetName) => {
            if (!targetName || targetName === "0") {
                state.targetQualificationVisible = false;
                return;
            }

            const targetDescriptor = findTargetDescriptor(targetName) ?? state.targetDetail;
            const descriptorGroup = targetDescriptor?.group;
            const isQualified = descriptorGroup === "supported" || targetDescriptor?.partnerApproved === true;

            if (isQualified) {
                state.targetQualificationClass = "gui_note";
                state.targetQualificationText = $t("firmwareFlasherOptionLabelVerifiedPartner");
            } else {
                state.targetQualificationClass = "gui_warning";
                state.targetQualificationText = $t("firmwareFlasherOptionLabelNotQualified");
            }

            state.targetQualificationVisible = true;
        };

        const showReleaseNotes = (summary) => {
            if (!summary) {
                console.warn(`${logHead} showReleaseNotes called with null/undefined summary`);
                return;
            }

            if (summary.manufacturer) {
                state.manufacturerSpanText = summary.manufacturer;
                state.manufacturerInfoVisible = true;
            } else {
                state.manufacturerInfoVisible = false;
            }

            state.targetSpanText = summary.target || "";
            state.releaseNameText = summary.release || "";
            state.releaseNameLink = summary.releaseUrl || "#";
            state.releaseDateText = summary.date || "";
            state.targetMCUText = summary.mcu || "";
            state.configFilenameText = state.isConfigLocal ? state.configFilename : "[default]";

            if (summary.cloudBuild) {
                state.cloudTargetInfoVisible = true;
                cloudBuild.state.cloudTargetLogText = "";
                cloudBuild.state.cloudTargetLogUrl = "";
                cloudBuild.state.cloudTargetStatusText = "pending";
            } else {
                state.cloudTargetInfoVisible = false;
            }

            // Note: Don't set releaseInfoVisible or buildConfigVisible here
            // These will be set when user clicks Load Firmware Online button
        };

        const loadFailed = () => {
            if (progressLabel.value) {
                progressLabel.value.setAttribute("i18n", "firmwareFlasherFailedToLoadOnlineFirmware");
                progressLabel.value.classList.remove("i18n-replaced");
            }
            enableLoadRemoteFileButton(true);
            if (loadRemoteFileButton.value) {
                loadRemoteFileButton.value.textContent = $t("firmwareFlasherButtonLoadOnline");
            }
            i18n.localizePage();
        };

        const buildOptionsList = (optionKey, options) => {
            // Updated for Vue-based selects - just update state
            if (optionKey === "radioProtocols") {
                state.radioProtocolOptions = options;
            } else if (optionKey === "telemetryProtocols") {
                state.telemetryProtocolOptions = options;
            } else if (optionKey === "osdProtocols") {
                state.osdProtocolOptions = options;
            } else if (optionKey === "options") {
                state.optionsListOptions = options;
            } else if (optionKey === "motorProtocols") {
                state.motorProtocolOptions = options;
            }
        };

        const toggleTelemetryProtocolInfo = () => {
            const radioProtocol = state.selectedRadioProtocol;
            const hasTelemetryEnabledByDefault = [
                "USE_SERIALRX_CRSF",
                "USE_SERIALRX_FPORT",
                "USE_SERIALRX_GHST",
                "USE_SERIALRX_JETIEXBUS",
            ].includes(radioProtocol);

            if (hasTelemetryEnabledByDefault) {
                state.selectedTelemetryProtocol = "-1";
            }
        };

        const updateOsdProtocolColor = () => {
            state.osdProtocolNeedsAttention =
                state.selectedOsdProtocol === "" || state.selectedOsdProtocol === undefined;
        };

        const preselectRadioProtocolFromStorage = () => {
            const storedRadioProtocol = getConfig("ffRadioProtocol").ffRadioProtocol;
            if (storedRadioProtocol) {
                const valueExistsInSelect = state.radioProtocolOptions.some(
                    (option) => option.value === storedRadioProtocol,
                );
                if (valueExistsInSelect) {
                    state.selectedRadioProtocol = storedRadioProtocol;
                }
            }
        };

        const buildOptions = (data) => {
            if (!data) {
                return;
            }

            // extract osd protocols from general options and add to osdProtocols
            state.cloudBuildOptions = FC.CONFIG.buildOptions || [];
            data.osdProtocols = data.generalOptions
                .filter((option) => option.group === "OSD")
                .map((option) => {
                    option.name = option.groupedName;
                    option.default = state.cloudBuildOptions?.includes(option.value);
                    return option;
                });

            // add None option to osdProtocols as first option
            data.osdProtocols.unshift({ name: "None", value: "" });

            // remove osdProtocols from generalOptions
            data.generalOptions = data.generalOptions.filter((option) => !option.group);

            buildOptionsList("radioProtocols", data.radioProtocols);
            buildOptionsList("telemetryProtocols", data.telemetryProtocols);
            buildOptionsList("osdProtocols", data.osdProtocols);
            buildOptionsList("options", data.generalOptions);
            buildOptionsList("motorProtocols", data.motorProtocols);

            // Preselect options where default === true
            state.selectedOptions = data.generalOptions.filter((option) => option.default === true);

            // Preselect radio protocol with default === true
            const defaultRadioProtocol = data.radioProtocols.find((option) => option.default === true);
            if (defaultRadioProtocol) {
                state.selectedRadioProtocol = defaultRadioProtocol;
            }

            // Preselect telemetry protocol with default === true
            const defaultTelemetryProtocol = data.telemetryProtocols.find((option) => option.default === true);
            if (defaultTelemetryProtocol) {
                state.selectedTelemetryProtocol = defaultTelemetryProtocol;
            }

            // Preselect OSD protocol with default === true
            const defaultOsdProtocol = data.osdProtocols.find((option) => option.default === true);
            if (defaultOsdProtocol) {
                state.selectedOsdProtocol = defaultOsdProtocol;
            }

            // Preselect motor protocol with default === true
            const defaultMotorProtocol = data.motorProtocols.find((option) => option.default === true);
            if (defaultMotorProtocol) {
                state.selectedMotorProtocol = defaultMotorProtocol;
            }

            // Initialize OSD protocol color state
            updateOsdProtocolColor();

            if (!validateBuildKey()) {
                preselectRadioProtocolFromStorage();
            }

            toggleTelemetryProtocolInfo();
        };

        // Build types configuration
        const buildTypes = [
            {
                tag: "firmwareFlasherOptionLabelBuildTypeRelease",
            },
            {
                tag: "firmwareFlasherOptionLabelBuildTypeReleaseCandidate",
            },
            {
                tag: "firmwareFlasherOptionLabelBuildTypeDevelopment",
            },
        ];

        let buildTypesToShow = reactive([]);

        const buildBuildTypeOptionsList = () => {
            // Update state with build type options
            state.buildTypeOptions = buildTypesToShow.map(({ tag, title }, index) => ({
                value: index,
                label: tag ? $t(tag) : title,
            }));
        };

        const sortReleases = (a, b) => {
            return -semver.compareBuild(a.release, b.release);
        };

        // Initialize UI setup on mount
        const setupUIHandlers = async () => {
            // Setup expert mode toggle
            const expertMode = getConfig("expertMode").expertMode;
            state.expertMode = expertMode;

            // Initialize build types based on expert mode
            if (state.expertMode) {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes);
            } else {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes.slice(0, 2));
            }
            buildBuildTypeOptionsList();

            // Setup erase chip setting
            let result = getConfig("erase_chip");
            state.eraseChip = result.erase_chip;

            // Setup development releases
            result = getConfig("show_development_releases");
            state.showDevelopmentReleases = result.show_development_releases;
            state.buildTypeRowVisible = state.showDevelopmentReleases;

            // Setup no reboot setting
            result = getConfig("no_reboot_sequence");
            state.noRebootSequence = result.no_reboot_sequence;
            state.flashOnConnectWrapperVisible = state.noRebootSequence;

            // Setup manual baud rate
            result = getConfig("flash_manual_baud");
            state.flashManualBaud = result.flash_manual_baud;

            result = getConfig("flash_manual_baud_rate");
            state.flashManualBaudRate = String(result.flash_manual_baud_rate || 256000);

            // Setup expert options visibility
            state.expertOptionsVisible = state.expertMode;
            state.hideInCoreBuildMode = true;

            // Restore selected build type and trigger initial load
            const selectedBuildType = getConfig("selected_build_type").selected_build_type || 0;
            state.selectedBuildType = selectedBuildType;

            flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);

            updateDfuExitButtonState();

            await onBuildTypeChange();

            if (boardSelection.state.selectedBoard && boardSelection.state.selectedBoard !== "0") {
                await onBoardChange();
            }
        };

        const selectFirmware = async (release) => {
            // Extract release string from object if needed
            const releaseStr = typeof release === "string" ? release : release?.release;
            // Hide release info when changing firmware (will show when Load Online clicked)
            state.releaseInfoVisible = false;

            if (!state.localFirmwareLoaded) {
                enableFlashButton(false);
                flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);
                if (firmwareFlashing.getParsedHex() && firmwareFlashing.getParsedHex().bytes_total) {
                    // Changing the board triggers a version change, so we need only dump it here.
                    firmwareFlashing.clearFirmwareState();
                }
            }

            const target =
                typeof boardSelection.state.selectedBoard === "string"
                    ? boardSelection.state.selectedBoard
                    : boardSelection.state.selectedBoard?.target;

            const loadCommitsForUnstableRelease = async (detail) => {
                const commits = await buildApi.loadCommits(detail.release);
                if (commits) {
                    state.commitOptions = commits.map((commit) => ({
                        label: commit.message.split("\n")[0],
                        value: commit.sha,
                    }));
                }
                state.commitSelectionVisible = true;
            };

            const handleCloudBuildConfiguration = async (detail) => {
                state.buildConfigVisible = true;

                const expertMode = state.expertMode;
                if (expertMode && detail.releaseType === "Unstable") {
                    await loadCommitsForUnstableRelease(detail);
                } else {
                    state.commitSelectionVisible = false;
                }

                state.expertOptionsVisible = expertMode;
                // Need to reset core build mode
                if (corebuildModeCheckbox.value) {
                    corebuildModeCheckbox.value.dispatchEvent(new Event("change", { bubbles: true }));
                }
            };

            const loadTargetDetail = async (detail) => {
                if (!detail) {
                    enableLoadRemoteFileButton(false);
                    return;
                }

                state.targetDetail = detail;

                if (detail.cloudBuild === true) {
                    await handleCloudBuildConfiguration(detail);
                }

                if (detail.configuration && !state.isConfigLocal) {
                    setBoardConfig(detail.configuration);
                }

                enableLoadRemoteFileButton(true);
                enableLoadFileButton(true);
            };

            try {
                let targetDetail = await buildApi.loadTarget(target, releaseStr);
                await loadTargetDetail(targetDetail);

                // Show release notes after loading target detail
                if (targetDetail) {
                    showReleaseNotes(targetDetail);
                }
            } catch (error) {
                console.error("Failed to load target:", error);
                loadFailed();
                updateTargetQualification(null);
                return;
            }

            try {
                if (validateBuildKey()) {
                    let options = await buildApi.loadOptionsByBuildKey(releaseStr, cloudBuild.state.cloudBuildKey);
                    if (options) {
                        buildOptions(options);
                        return;
                    }
                }
                let options = await buildApi.loadOptions(releaseStr);
                buildOptions(options);
            } catch (error) {
                console.error("Failed to load build options:", error);
                return;
            }
        };

        const populateReleases = async (target) => {
            const releases = target.releases;
            if (releases && releases.length > 0) {
                const build_type = state.selectedBuildType || 0;

                const filteredReleases = releases
                    .sort(sortReleases)
                    .filter((r) => {
                        return (
                            (r.type === "Unstable" && build_type > 1) ||
                            (r.type === "ReleaseCandidate" && build_type > 0) ||
                            r.type === "Stable"
                        );
                    })
                    .map((release) => ({
                        ...release,
                        label: `${release.release} [${release.label}]`,
                    }));

                boardSelection.state.firmwareVersionOptions = filteredReleases;

                // Assume flashing latest, so default to it.
                if (filteredReleases.length > 0) {
                    boardSelection.state.selectedFirmwareVersion = filteredReleases[0];
                    await selectFirmware(boardSelection.state.selectedFirmwareVersion);
                }
            } else {
                boardSelection.state.firmwareVersionOptions = [];
                boardSelection.state.selectedFirmwareVersion = "";
            }
        };

        const saveFirmware = async () => {
            const fileType = state.firmware_type;
            try {
                const file = await FileSystem.pickSaveFile(
                    state.filename,
                    $t("fileSystemPickerFiles", { typeof: fileType.toUpperCase() }),
                    `.${fileType.toLowerCase()}`,
                );
                if (!file) {
                    return false;
                }

                await FileSystem.writeFile(
                    file,
                    fileType === "UF2" ? firmwareFlashing.getUf2Binary() : firmwareFlashing.getIntelHex(),
                );
                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        };

        const setupEventBusListeners = () => {
            const { detectedUsbDevice, onDeviceRemoved } = firmwareFlashing.setupFlashingEventListeners({
                flashOnConnect: state.flashOnConnect,
                onBoardChange,
                clearBufferedFirmware,
                updateDfuExitButtonState,
                initiateFlashing,
                logHead,
            });

            EventBus.$on("port-handler:auto-select-usb-device", detectedUsbDevice);
            EventBus.$on("port-handler:device-removed", onDeviceRemoved);

            return { detectedUsbDevice, onDeviceRemoved };
        };

        onMounted(async () => {
            if (GUI.active_tab !== "firmware_flasher") {
                GUI.active_tab = "firmware_flasher";
            }

            // Reset state on tab initialization
            boardSelection.resetBoardSelection();
            cloudBuild.resetCloudBuildState();
            firmwareFlashing.clearFirmwareState();
            state.cloudBuildOptions = null;
            state.localFirmwareLoaded = false;
            state.isConfigLocal = false;

            // Setup UI handlers and event bus listeners
            await setupUIHandlers();
            setupFlashButton();
            setupLoadRemoteFileButton();
            setupEventBusListeners();

            // Register this module for backward compatibility
            TABS.firmware_flasher = {
                targets: boardSelection.state.targets,
                validateBuildKey,
                resetFlashingState,
                preservePreFlashingState,
                flashingMessage,
                flashProgress,
                cleanup,
                FLASH_MESSAGE_TYPES,
                get parsed_hex() {
                    return firmwareFlashing.getParsedHex();
                },
                get hex() {
                    return firmwareFlashing.getIntelHex();
                },
                get uf2_binary() {
                    return firmwareFlashing.getUf2Binary();
                },
            };

            GUI.content_ready(function () {});

            // Localize and load sponsor content
            i18n.localizePage();

            // Use setTimeout to give Vue time to populate the ref after async operations
            setTimeout(() => {
                if (tabSponsor.value) {
                    // Technical debt: Sponsor.js can accept raw DOM element but jQuery is used here
                    // for backward compatibility. Sponsor.loadSponsorTile internally checks for jQuery.
                    sponsor.loadSponsorTile("flash", $(tabSponsor.value));
                }
            }, 100);
        });

        onBeforeUnmount(() => {
            // Unsubscribe from EventBus
            const eventListeners = setupEventBusListeners();
            if (eventListeners) {
                EventBus.$off("port-handler:auto-select-usb-device", eventListeners.detectedUsbDevice);
                EventBus.$off("port-handler:device-removed", eventListeners.onDeviceRemoved);
            }

            if (dfuMonitorInterval) {
                clearInterval(dfuMonitorInterval);
                dfuMonitorInterval = null;
            }

            // Cleanup cloud build polling
            cloudBuild.cleanup();
        });

        const cleanup = (callback) => {
            // Unsubscribe from EventBus
            EventBus.$off("port-handler:auto-select-usb-device");
            EventBus.$off("port-handler:device-removed");

            if (callback) {
                callback();
            }
        };

        // Flashing methods
        const startFlashing = async () => {
            const selectedBoardTarget =
                typeof boardSelection.state.selectedBoard === "string"
                    ? boardSelection.state.selectedBoard
                    : boardSelection.state.selectedBoard?.target;

            await firmwareFlashing.startFlashing({
                config: state.config,
                clearBoardConfig,
                // Flash HEX options
                eraseChip: state.eraseChip,
                noRebootSequence: state.noRebootSequence,
                flashManualBaud: state.flashManualBaud,
                flashManualBaudRate: state.flashManualBaudRate,
                filename: state.filename,
                resetFlashingState,
                // Board verification options
                selectedBoard: selectedBoardTarget,
                localFirmwareLoaded: state.localFirmwareLoaded,
                showDialogVerifyBoard,
                // UI callbacks
                flashingMessage,
                flashProgress,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                setFlashOnConnect: (value) => {
                    state.flashOnConnect = value;
                },
                logHead,
            });
        };

        const startBackup = async (callback) => {
            GUI.connect_lock = true;

            const aborted = function (message) {
                GUI.connect_lock = false;
                enableFlashButton(true);
                enableLoadRemoteFileButton(true);
                enableLoadFileButton(true);
                GUI.interval_resume("sponsor");
                flashingMessage($t(message), FLASH_MESSAGE_TYPES.INVALID);
            };

            const callBackWhenPortAvailable = function () {
                const startTime = Date.now();
                const interval = setInterval(() => {
                    if (PortHandler.portAvailable) {
                        clearInterval(interval);
                        callback();
                    } else if (Date.now() - startTime > 5000) {
                        clearInterval(interval);
                        aborted("portsSelectNone");
                    }
                }, 100);
            };

            AutoBackup.execute((result) => {
                GUI.connect_lock = false;
                if (result) {
                    callBackWhenPortAvailable();
                } else {
                    aborted("firmwareFlasherCanceledBackup");
                }
            });
        };

        const checkShowAcknowledgementDialog = async () => {
            const DAY_MS = 86400 * 1000;
            const storageTag = "lastDevelopmentWarningTimestamp";

            function setAcknowledgementTimestamp() {
                const storageObj = {};
                storageObj[storageTag] = Date.now();
                setStorage(storageObj);
            }

            const result = getStorage(storageTag);
            if (!result[storageTag] || Date.now() - result[storageTag] > DAY_MS) {
                await showAcknowledgementDialog(setAcknowledgementTimestamp);
            } else {
                await startFlashing();
            }
        };

        const showAcknowledgementDialog = async (acknowledgementCallback) => {
            await nextTick();

            if (!unstableFirmwareDialog.value) {
                console.error("Dialog element not found");
                return;
            }

            unstableFirmwareAcknowledgementCallback.value = acknowledgementCallback;
            unstableFirmwareDialog.value.showModal();
        };

        const handleUnstableFirmwareDialogClose = () => {
            state.dialogUnstableFirmwareAcknowledgementCheckbox = false;
            unstableFirmwareAcknowledgementCallback.value = null;
        };

        const initiateFlashing = async () => {
            const isUnstableFirmware =
                state.developmentFirmwareLoaded || state.targetDetail?.releaseType === "Unstable";

            if (isUnstableFirmware) {
                await checkShowAcknowledgementDialog();
            } else {
                await startFlashing();
            }
        };

        // Setup flash firmware button
        const setupFlashButton = () => {};

        // Remote build and firmware loading
        const enforceOSDSelection = async () => {
            const selectedRelease = boardSelection.state.selectedFirmwareVersion || "";
            const selectedFirmware = boardSelection.state.firmwareVersionOptions?.find(
                (option) => option.release === selectedRelease,
            );
            const versionText = selectedFirmware?.release ?? selectedRelease;

            // Skip OSD selection enforcement for firmware versions 4.3.x
            if (typeof versionText === "string" && versionText.startsWith("4.3.")) {
                return true;
            }

            if (state.selectedOsdProtocol === "" || state.selectedOsdProtocol === undefined) {
                return new Promise((resolve) => {
                    GUI.showYesNoDialog({
                        title: $t("firmwareFlasherOSDProtocolNotSelected"),
                        text: $t("firmwareFlasherOSDProtocolNotSelectedDescription"),
                        buttonYesText: $t("firmwareFlasherOSDProtocolNotSelectedContinue"),
                        buttonNoText: $t("firmwareFlasherOSDProtocolSelect"),
                        buttonYesCallback: () => resolve(true),
                        buttonNoCallback: () => resolve(false),
                    });
                });
            } else {
                return true;
            }
        };

        const setupLoadRemoteFileButton = () => {};

        const requestCloudBuild = async (targetDetail) => {
            const additionalParams = {
                coreBuildMode: state.coreBuildMode,
                selectedRadioProtocol: state.selectedRadioProtocol,
                selectedTelemetryProtocol: state.selectedTelemetryProtocol,
                selectedOptions: state.selectedOptions,
                selectedOsdProtocol: state.selectedOsdProtocol,
                selectedMotorProtocol: state.selectedMotorProtocol,
                expertMode: state.expertMode,
                selectedCommit: state.selectedCommit,
                customDefinesInput: customDefinesInput.value,
                isConfigLocal: state.isConfigLocal,
            };

            const response = await cloudBuild.requestCloudBuild(targetDetail, additionalParams);
            if (response) {
                state.targetDetail.file = response.file;
            }
        };

        const processFile = async (data, key) => {
            const ext = getExtension(key);
            const result = await firmwareFlashing.processFirmware(data, ext, {
                enableFlashButton,
                enableLoadRemoteFileButton,
                showLoadedFirmware,
                key,
            });

            if (result) {
                state.firmware_type = result.firmwareType;
            }

            enableLoadRemoteFileButton(true);
        };

        // Initialize firmware flashing composable
        const firmwareFlashing = useFirmwareFlashing({
            flashingMessage,
            flashProgress,
            FLASH_MESSAGE_TYPES,
            $t,
            logHead,
        });

        // Initialize cloud build composable
        const cloudBuild = useCloudBuild({
            buildApi,
            $t,
            setBoardConfig,
            processFile,
            flashingMessage,
            enableLoadRemoteFileButton,
            FLASH_MESSAGE_TYPES,
        });

        // Initialize board selection composable
        const boardSelection = useBoardSelection({
            buildApi,
            $t,
            updateTargetQualification,
            getSupportUrlForTarget,
            populateReleases,
            enableLoadRemoteFileButton,
            flashingMessage,
            flashProgress,
            FLASH_MESSAGE_TYPES,
            getSelectedBuildType: () => Number.parseInt(state.selectedBuildType, 10),
            logHead,
        });

        // Wrapper functions to handle state updates from composable
        const onBuildTypeChange = async () => {
            await boardSelection.onBuildTypeChange();
        };

        const onBoardChange = async () => {
            const result = await boardSelection.onBoardChange();
            if (result) {
                state.targetSupportUrl = result.targetSupportUrl;
            }
            state.releaseInfoVisible = false;
        };

        const handleDetectBoard = async () => {
            await boardSelection.handleDetectBoard(detectBoardButton);
        };

        const onFirmwareVersionChange = async () => {
            await selectFirmware(boardSelection.state.selectedFirmwareVersion);
        };

        const onRadioProtocolChange = (value) => {
            state.selectedRadioProtocol = value;
            toggleTelemetryProtocolInfo();
            if (state.cloudBuildOptions) {
                setConfig({ ffRadioProtocol: value });
            }
        };

        const onTelemetryProtocolChange = (value) => {
            state.selectedTelemetryProtocol = value;
        };

        const onOsdProtocolChange = (value) => {
            state.selectedOsdProtocol = value;
            updateOsdProtocolColor();
        };

        const onMotorProtocolChange = (value) => {
            state.selectedMotorProtocol = value;
        };

        const onOptionsChange = (value) => {
            state.selectedOptions = Array.isArray(value) ? value : [];
        };

        const onCommitChange = (value) => {
            state.selectedCommit = value;
        };

        // UI State change handlers
        const handleExpertModeChange = () => {
            setConfig({ expertMode: state.expertMode });
            state.expertOptionsVisible = state.expertMode;
            state.hideInCoreBuildMode = !state.coreBuildMode;

            // Update build types based on expert mode
            if (state.expertMode) {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes);
            } else {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes.slice(0, 2));
            }
            buildBuildTypeOptionsList();
            state.selectedBuildType = 0;
        };

        const handleShowDevelopmentReleasesChange = async () => {
            setConfig({ show_development_releases: state.showDevelopmentReleases });
            state.buildTypeRowVisible = state.showDevelopmentReleases;

            // When hiding release candidates/development builds, force Release list and default to first option
            if (!state.buildTypeRowVisible && state.selectedBuildType > 0) {
                state.selectedBuildType = 0;
                setConfig({ selected_build_type: 0 });

                const boardTarget =
                    typeof boardSelection.state.selectedBoard === "string"
                        ? boardSelection.state.selectedBoard
                        : boardSelection.state.selectedBoard?.target;

                if (boardTarget) {
                    try {
                        const targetReleases = await buildApi.loadTargetReleases(boardTarget);
                        await populateReleases({ target: boardTarget, releases: targetReleases.releases });
                    } catch (error) {
                        console.error(
                            `${logHead} Failed to load target releases when hiding development releases:`,
                            error,
                        );
                    }
                } else {
                    boardSelection.state.firmwareVersionOptions = [];
                    boardSelection.state.selectedFirmwareVersion = "";
                }
            }
        };

        const handleNoRebootChange = () => {
            setConfig({ no_reboot_sequence: state.noRebootSequence });
            state.flashOnConnectWrapperVisible = state.noRebootSequence;
            if (!state.noRebootSequence) {
                state.flashOnConnect = false;
            }
        };

        const handleEraseChipChange = () => {
            setConfig({ erase_chip: state.eraseChip });
        };

        const handleFlashManualBaudChange = () => {
            setConfig({ flash_manual_baud: state.flashManualBaud });
        };

        const handleFlashManualBaudRateChange = () => {
            const baud = Number.parseInt(state.flashManualBaudRate);
            setConfig({ flash_manual_baud_rate: baud });
        };

        const handleCoreBuildModeChange = () => {
            state.hideInCoreBuildMode = !state.coreBuildMode;
            if (state.coreBuildMode) {
                state.expertOptionsVisible = false;
            } else {
                state.expertOptionsVisible = state.expertMode;
            }
        };

        // Click event handlers for buttons
        const handleExitDfu = async () => {
            await firmwareFlashing.exitDfu({
                parsedHex: firmwareFlashing.getParsedHex(),
                dfuExitButtonDisabled: state.dfuExitButtonDisabled,
                connectLock: GUI.connect_lock,
                flashingMessage,
                flashProgress,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                logHead,
            });
        };

        const handleFlashFirmware = async () => {
            if (state.flashButtonDisabled) {
                return;
            }

            state.progressLabelText = "";
            state.flashingInProgress = true;
            GUI.flashingInProgress = true;
            await nextTick();

            const options = {
                connectLock: GUI.connect_lock,
                firmwareType: state.firmware_type,
                filename: state.filename,
                flashOnConnect: state.flashOnConnect,
                portAvailable: PortHandler.portAvailable,
                dfuAvailable: PortHandler.dfuAvailable,
                preservePreFlashingState,
                pauseSponsorInterval: () => GUI.interval_pause("sponsor"),
                resumeSponsorInterval: () => GUI.interval_resume("sponsor"),
                enableFlashButton,
                enableDfuExitButton,
                enableLoadRemoteFileButton,
                enableLoadFileButton,
                flashingMessage,
                flashProgress,
                saveFirmware,
                startFlashing,
                startBackup,
                initiateFlashing,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                t: $t,
                progressCallback: () => {
                    /* callback reserved for future use */
                },
            };

            try {
                await firmwareFlashing.runFlashWorkflow(options);
            } catch (error) {
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
                throw error;
            }
        };

        const handleLoadRemoteFile = async () => {
            if (state.loadRemoteButtonDisabled || !boardSelection.state.selectedBoard) {
                return;
            }

            const shouldContinue = await enforceOSDSelection();
            if (!shouldContinue) {
                return;
            }

            enableFlashButton(false);
            enableLoadRemoteFileButton(false);

            state.localFirmwareLoaded = false;
            const buildType = state.selectedBuildType;
            state.developmentFirmwareLoaded = buildType > 1;

            if (!boardSelection.state.selectedFirmwareVersion || boardSelection.state.selectedFirmwareVersion === "0") {
                gui_log($t("firmwareFlasherNoFirmwareSelected"));
                enableLoadRemoteFileButton(true);
                return;
            }

            if (state.targetDetail) {
                flashingMessage($t("firmwareFlasherButtonDownloading"), FLASH_MESSAGE_TYPES.NEUTRAL);
                showReleaseNotes(state.targetDetail);
                // Show release info section when Load Firmware Online button is clicked
                state.releaseInfoVisible = true;
                await requestCloudBuild(state.targetDetail);
            } else {
                flashingMessage($t("firmwareFlasherFailedToLoadOnlineFirmware"), FLASH_MESSAGE_TYPES.NEUTRAL);
                i18n.localizePage();
                enableLoadRemoteFileButton(true);
            }
        };

        const processFirmwareFile = async (file, extension, data) => {
            state.localFirmwareLoaded = true;
            const result = await firmwareFlashing.processFirmware(data, extension, {
                flashingMessage,
                enableFlashButton,
                enableLoadRemoteFileButton: () => {}, // Don't enable remote button for local files
                showLoadedFirmware,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                key: file.name,
                logHead,
                isLocalFile: true,
            });
            if (result) {
                state.firmware_type = result.firmwareType;
            }
            enableLoadFileButton(true);
        };

        const processConfigFile = (file, data) => {
            clearBufferedFirmware();
            const config = cleanUnifiedConfigFileWrapper(data);
            if (config === null) {
                return;
            }

            setBoardConfig(config, file.name);

            if (state.isConfigLocal && !firmwareFlashing.getParsedHex()) {
                flashingMessage($t("firmwareFlasherLoadedConfig"), FLASH_MESSAGE_TYPES.NEUTRAL);
                return;
            }

            const shouldEnableFlash =
                (state.isConfigLocal && firmwareFlashing.getParsedHex() && !state.localFirmwareLoaded) ||
                state.localFirmwareLoaded;
            if (shouldEnableFlash) {
                enableFlashButton(true);
                flashingMessage(
                    $t("firmwareFlasherFirmwareLocalLoaded", {
                        filename: file.name,
                        bytes: firmwareFlashing.getParsedHex()?.bytes_total || 0,
                    }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            }
        };

        const handleLoadFile = async () => {
            if (state.loadFileButtonDisabled) {
                return;
            }

            enableFlashButton(false);
            enableLoadRemoteFileButton(false);
            enableLoadFileButton(false);
            state.developmentFirmwareLoaded = false;

            try {
                const file = await FileSystem.pickOpenFile($t("fileSystemPickerFirmwareFiles"), [".hex", ".uf2"]);

                if (!file) {
                    enableLoadRemoteFileButton(true);
                    enableLoadFileButton(true);
                    return;
                }

                const extension = getExtension(file.name);

                if (extension === "uf2") {
                    const data = await FileSystem.readFileAsBlob(file);
                    await processFirmwareFile(file, extension, data);
                } else if (extension === "hex") {
                    const data = await FileSystem.readFile(file);
                    await processFirmwareFile(file, extension, data);
                } else {
                    const data = await FileSystem.readFile(file);
                    processConfigFile(file, data);
                }
            } catch (error) {
                console.error("Error reading file:", error);
                enableLoadRemoteFileButton(true);
                enableLoadFileButton(true);
            }
        };

        const handleUnstableFirmwareFlash = () => {
            if (!state.dialogUnstableFirmwareAcknowledgementCheckbox) {
                return;
            }

            if (unstableFirmwareDialog.value) {
                unstableFirmwareDialog.value.close();
            }

            if (unstableFirmwareAcknowledgementCallback.value) {
                unstableFirmwareAcknowledgementCallback.value();
            }

            startFlashing();
        };

        const handleUnstableFirmwareCancel = () => {
            state.dialogUnstableFirmwareAcknowledgementCheckbox = false;
            if (unstableFirmwareDialog.value) {
                unstableFirmwareDialog.value.close();
            }
        };

        const handleVerifyBoardAbort = () => {
            if (verifyBoardDialog.value) {
                verifyBoardDialog.value.close();
            }

            if (verifyBoardOnAbortCallback.value) {
                verifyBoardOnAbortCallback.value();
            }
        };

        const handleVerifyBoardContinue = () => {
            if (verifyBoardDialog.value) {
                verifyBoardDialog.value.close();
            }

            if (verifyBoardOnAcceptCallback.value) {
                verifyBoardOnAcceptCallback.value();
            }
        };

        const handleVerifyBoardDialogClose = () => {
            verifyBoardOnAcceptCallback.value = null;
            verifyBoardOnAbortCallback.value = null;
        };

        const showDialogVerifyBoard = (selected, verified, onAccept, onAbort) => {
            if (verifyBoardContent.value) {
                verifyBoardContent.value.innerHTML = $t("firmwareFlasherVerifyBoard", {
                    selected_board: selected,
                    verified_board: verified,
                });
            }

            if (verifyBoardDialog.value && !verifyBoardDialog.value.hasAttribute("open")) {
                verifyBoardOnAcceptCallback.value = onAccept;
                verifyBoardOnAbortCallback.value = onAbort;
                verifyBoardDialog.value.showModal();
            }
        };

        const handleProgressLabelClick = (event) => {
            if (event.target?.classList.contains("save_firmware")) {
                saveFirmware();
            }
        };

        // Return all public methods and state
        return {
            state,
            cloudBuild,
            boardSelection,
            tabSponsor,
            FLASH_MESSAGE_TYPES,
            // Template refs
            customDefinesInput,
            detectBoardButton,
            exitDfuButton,
            flashFirmwareButton,
            loadRemoteFileButton,
            loadFileButton,
            cloudBuildCancelButton,
            progressBar,
            progressLabel,
            releaseInfoContainer,
            targetSpan,
            manufacturerInfoDiv,
            manufacturerSpan,
            releaseNameLink,
            targetMCUSpan,
            releaseDateSpan,
            configFilenameSpan,
            cloudTargetInfoDiv,
            cloudTargetLogLink,
            cloudTargetStatusSpan,
            verifyBoardDialog,
            verifyBoardContent,
            // Functions
            enableFlashButton,
            enableLoadRemoteFileButton,
            enableLoadFileButton,
            enableDfuExitButton,
            flashingMessage,
            flashProgress,
            resetFlashingState,
            validateBuildKey,
            startFlashing,
            setupFlashButton,
            setupLoadRemoteFileButton,
            cleanup,
            onBuildTypeChange,
            onBoardChange,
            onFirmwareVersionChange,
            onRadioProtocolChange,
            onTelemetryProtocolChange,
            onOsdProtocolChange,
            onMotorProtocolChange,
            onOptionsChange,
            onCommitChange,
            handleExpertModeChange,
            handleShowDevelopmentReleasesChange,
            handleNoRebootChange,
            handleEraseChipChange,
            handleFlashManualBaudChange,
            handleFlashManualBaudRateChange,
            handleCoreBuildModeChange,
            handleExitDfu,
            handleFlashFirmware,
            handleLoadRemoteFile,
            handleLoadFile,
            handleDetectBoard,
            handleUnstableFirmwareFlash,
            handleUnstableFirmwareCancel,
            handleUnstableFirmwareDialogClose,
            handleVerifyBoardAbort,
            handleVerifyBoardContinue,
            handleVerifyBoardDialogClose,
            handleProgressLabelClick,
        };
    },
});
</script>

<style scoped lang="less">
.tab-firmware_flasher {
    min-height: 100%;

    .content_wrapper .data-loading {
        min-height: 150px;
        height: 50%;
        p {
            text-align: center;
            margin-top: 100px;
            padding-top: 1rem;
        }
    }
    .grid-box-spacer {
        height: 1rem;
    }
    .build-options-wrapper {
        .select2-container {
            width: calc(100% - 2rem) !important;
        }
        .helpicon {
            margin-top: 8px;
        }

        // Multiselect styling to match native selects
        :deep(.multiselect) {
            width: calc(100% - 2rem) !important;
            min-height: 28px;
            font-size: 12px;
            font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
            position: relative;
            z-index: 1001;

            .multiselect__tags {
                min-height: 28px;
                padding: 4px 40px 4px 4px;
                background: var(--surface-100);
                border: 1px solid var(--border);
                border-radius: 3px;
                font-size: 12px;
                z-index: 1001;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
            }

            .multiselect__single {
                font-size: 12px;
                margin-bottom: 4px;
                padding: 0 0 0 2px;
                background: transparent;
                color: var(--text);
            }

            .multiselect__input {
                font-size: 12px;
                padding: 0 0 0 2px;
                background: transparent;
                color: var(--text);
            }

            .multiselect__placeholder {
                font-size: 12px;
                color: var(--subtitle);
                margin-bottom: 4px;
                padding-left: 2px;
            }

            .multiselect__select {
                height: 28px;
                width: 35px;
                z-index: 1002;

                &:before {
                    border-color: var(--text) transparent transparent;
                    top: 60%;
                }
            }

            .multiselect__content-wrapper {
                background: var(--surface-100);
                border: 1px solid var(--border);
                border-radius: 3px;
                max-height: 200px;
                z-index: 9999;
                position: absolute;
            }

            .multiselect__content {
                background: var(--surface-100);
                z-index: 9999;
            }

            .multiselect__option {
                font-size: 12px;
                padding: 6px 8px;
                min-height: 28px;
                color: var(--text);
                z-index: 1003;

                &--highlight {
                    background: var(--primary-500);
                    color: var(--surface-50);
                }

                &--selected {
                    background: var(--surface-400);
                    color: var(--text);
                    font-weight: normal;

                    &.multiselect__option--highlight {
                        background: var(--surface-600);
                        color: var(--surface-50);
                    }
                }
            }

            .multiselect__tag {
                background: var(--surface-500);
                color: var(--surface-50);
                font-size: 11px;
                padding: 3px 20px 3px 6px;
                border-radius: 3px;
                z-index: 1002;
                display: inline-flex;
                align-items: center;
                gap: 4px;

                .multiselect__tag-icon {
                    &:after {
                        color: var(--surface-50);
                    }

                    &:hover {
                        background: var(--surface-600);
                    }
                }
            }

            &.multiselect--disabled {
                opacity: 0.6;

                .multiselect__tags {
                    background: var(--surface-200);
                }
            }
        }
    }
    .buildProgress {
        border-radius: 4px;
        appearance: none;
        -webkit-appearance: none;
        overflow: hidden;
        &::-webkit-progress-bar {
            background-color: var(--surface-500);
        }
        &::-webkit-progress-value {
            background-color: var(--primary-500);
            border-radius: 0 4px 4px 0;
        }
    }
    ul {
        li {
            list-style: initial;
            list-style-type: circle;
            margin-left: 30px;
        }
    }
    .options {
        position: relative;
        line-height: 18px;
        text-align: left;
        label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            input {
                margin-right: 0;
            }
            .helpicon {
                float: none;
                margin-left: 3px;
                margin-top: 0;
                display: inline-block;
                align-self: center;
            }
        }
        #flash_manual_baud_rate {
            margin-left: 0.5rem;
        }
    }
    /* Generic Vue-native switch styling (Switchery-like) */
    .vue-switch-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }
    .vue-switch-input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
    }
    .vue-switch-slider {
        position: relative;
        width: 30px; /* Switchery small width */
        height: 14px; /* Switchery small height */
        background: var(--switcherysecond);
        border-radius: 20px;
        transition: background-color 200ms ease;
        box-sizing: content-box;
        background-clip: content-box;
    }
    .vue-switch-slider::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 14px;
        height: 14px;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        transition: transform 200ms ease;
    }
    .vue-switch-input:checked + .vue-switch-slider {
        background: var(--primary-500);
    }
    .vue-switch-input:checked + .vue-switch-slider::before {
        transform: translateX(16px);
    }
    .vue-switch-text {
        font-size: 12px;
        line-height: 14px;
    }
    .board-selection-grid {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 0.5rem;
        align-items: start;
    }

    .board-selection-grid .grid-row {
        display: contents;
    }

    .board-selection-grid .grid-row.select-row {
        display: contents;
    }

    .board-selection-grid .grid-row:not(.select-row) {
        display: grid;
        grid-column: 1 / -1;
    }

    .board-selection-grid .build-select,
    .board-selection-grid .board-select,
    .board-selection-grid .firmware-version {
        grid-column: 1;
    }

    .board-selection-grid .help-icon-cell {
        grid-column: 2;
        text-align: center;
        padding-left: 0.5rem;
        padding-right: 0.5rem;
        width: 30px;
    }

    .board-selection-grid .action-button-cell {
        grid-column: 3;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        align-self: center;
    }
    .select-wrapper-simple {
        &.no-board-selected {
            pointer-events: none;
            opacity: 0.5;
        }
    }
    .select-wrapper {
        width: calc(100% - 2rem) !important;
        max-width: 30rem !important;
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 0.5rem;
        box-sizing: border-box;
        &.no-board-selected {
            pointer-events: none;
            opacity: 0.5;
        }
    }
    .detect-board {
        position: relative;
        top: auto;
        height: auto;
        right: auto;
        z-index: auto;
        pointer-events: all;
        display: flex;
        .fa-search::before {
            font-size: 11px;
        }
        span {
            padding: 0 0.5rem;
            background-color: var(--primary-500);
            cursor: pointer;
            color: var(--surface-50);
            font-size: 10px;
            border-radius: 999px;
            transition:
                color 200ms,
                background-color 200ms;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        &.disabled {
            pointer-events: none;
            cursor: default;
            span {
                background-color: var(--surface-500);
                color: var(--text);
                cursor: default;
            }
        }
    }

    .select-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        .select-wrapper {
            width: 100% !important;
            max-width: none !important;
        }
        strong {
            font-size: 12px;
        }
    }
    /* Keep help icons inline with multiselects inside Build Configuration */
    .build_configuration .select-group {
        display: grid;
        grid-template-columns: 1fr auto;
        row-gap: 0.25rem;
        align-items: center;
    }
    .build_configuration .select-group > strong {
        grid-column: 1 / -1;
    }
    .build_configuration .select-group .select-wrapper {
        grid-column: 1;
        /* allow help icon to sit alongside; avoid forcing full-width */
        max-width: none !important;
        width: 100% !important;
    }
    .build_configuration .select-group .helpicon {
        grid-column: 2;
        margin-top: 0; /* keep vertically centered */
    }
    .build_configuration {
        .gui_box_titlebar {
            display: flex;
            flex-direction: row-reverse;
            gap: 1rem;
            flex-wrap: nowrap;
            align-items: center;
        }
        .build_configuration_toggle_wrapper {
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            gap: 0.5rem;
        }
        .spacer_box_title {
            white-space: nowrap;
        }
        #customDefines {
            width: calc(100% - 2rem) !important;
        }
        /* Vue-native switch styling to mimic Switchery */
        #build_configuration_toggle_label.vue-switch-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
        }
        #build_configuration_toggle_label .vue-switch-input {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
        }
        #build_configuration_toggle_label .vue-switch-slider {
            position: relative;
            width: 30px; /* Matches Switchery small width */
            height: 14px; /* Matches Switchery small height */
            background: var(--switcherysecond);
            border-radius: 20px;
            transition: background-color 200ms ease;
            box-sizing: content-box;
            background-clip: content-box;
        }
        #build_configuration_toggle_label .vue-switch-slider::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 14px;
            height: 14px;
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
            transition: transform 200ms ease;
        }
        #build_configuration_toggle_label .vue-switch-input:checked + .vue-switch-slider {
            background: var(--primary-500);
        }
        #build_configuration_toggle_label .vue-switch-input:checked + .vue-switch-slider::before {
            transform: translateX(16px);
        }
        #build_configuration_toggle_label .vue-switch-text {
            font-size: 12px; /* Align with base form font size */
            line-height: 14px;
        }
    }

    /* Style multiselect tags for "Other options" selector */
    #optionsInfo :deep(.multiselect__tags) {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 4px !important;
    }

    #optionsInfo :deep(.multiselect__tag) {
        background: var(--surface-500) !important;
        color: var(--text) !important;
        font-size: 11px;
        padding: 3px 20px 3px 6px;
        border-radius: 3px;
        display: inline-flex !important;
        align-items: center !important;
    }

    #optionsInfo :deep(.multiselect__tag-icon) {
        &:after {
            color: var(--text) !important;
        }
        &:hover {
            background: var(--surface-600) !important;
        }
    }

    .default_btn {
        width: fit-content;
        padding-top: 0.25rem;
        padding-right: 0.25rem;
        a {
            padding: 0.15rem 0.5rem;
        }
    }

    /* Three-column grid layout for release info */
    .release_info_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
    }

    .release_info_grid .info_row {
        display: contents;
    }

    .release_info_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .release_info_grid span,
    .release_info_grid a {
        text-align: left;
    }

    .release_info_grid .board_support {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        justify-self: start;
    }

    .release_info_grid .board_support a#targetSupportInfoUrl {
        padding: 0 0.5rem;
        background-color: var(--primary-500);
        cursor: pointer;
        color: var(--surface-50);
        font-size: 10px;
        border-radius: 999px;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        height: auto;
        line-height: 1.4;
        text-decoration: none;

        &:hover {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }

        &:active {
            background-color: var(--primary-500);
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }
    }

    .release_info_grid .board_support .helpicon {
        margin-top: 0;
        float: none;
        display: inline-block;
        align-self: center;
    }

    /* Waiting overlay shown during flashing */
    .flashing-wait {
        text-align: center;
        padding: 2rem 1rem;
        font-size: 14px;
    }

    /* Cloud build info grid */
    .cloud_build_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border);
    }

    .cloud_build_grid .info_row {
        display: contents;
    }

    .cloud_build_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .cloud_build_grid a {
        text-align: left;
    }

    .cloud_build_grid .status_wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    #cloudTargetStatus {
        padding-left: 0.5rem;
    }

    .release_info_grid .btn {
        justify-self: start;
    }

    .release_info_grid .btn a.cloud_build_cancel {
        padding: 0 0.5rem;
        background-color: var(--primary-500);
        cursor: pointer;
        color: var(--surface-50);
        font-size: 10px;
        border-radius: 999px;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        height: auto;
        line-height: 1.4;
        text-decoration: none;

        &:hover:not(.disabled) {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }

        &:active:not(.disabled) {
            background-color: var(--primary-500);
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }

        &.disabled {
            pointer-events: none;
            cursor: default;
            background-color: var(--surface-500);
            color: var(--text);
        }
    }

    @media all and (max-width: 1455px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr 1fr;
            }
        }
    }
    @media all and (max-width: 991px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr;
            }
        }
    }
    & + .content_toolbar {
        width: calc(100% - 18rem) !important;
    }
    @media all and (max-width: 575px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr;
            }
        }
        .detect-board {
            span {
                height: 18px;
                padding: 0 1rem !important;
                & > div {
                    display: none;
                }
            }
        }
    }
}

:deep(.toolbar_fixed_bottom.content_toolbar) {
    width: calc(100% - 18rem) !important;
    display: flex;
    flex-wrap: wrap;
    position: fixed;
    bottom: 2rem;
    right: 0;
}

:deep(.content_toolbar) {
    width: fit-content;
    background-color: var(--surface-300);
    box-shadow: rgba(0, 0, 0, 0.1) 0 -0.5rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0.75rem 1rem;
    border-top-left-radius: 1.5rem;
    &::before {
        width: 1.5rem;
        aspect-ratio: 1;
        content: "";
        mask: url(../images/corner.svg);
        background-color: var(--surface-300);
        position: absolute;
        left: -1.5rem;
        bottom: 0;
    }
    .info {
        flex: 100;
        position: relative;
        .progress {
            width: 100%;
            height: 30px;
            border-radius: 0.25rem;
            overflow: hidden;
            &::-webkit-progress-bar {
                background-color: var(--surface-400);
            }
        }
        .progressLabel {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            text-align: center;
            font-size: 0.75rem;
            line-height: 1.75rem;
            &.valid {
                background-color: var(--success-600);
                border-radius: 5px;
            }
            &.invalid {
                background-color: var(--error-500);
                border-radius: 5px;
            }
            &.actionRequired {
                background-color: var(--warning-500);
                border-radius: 5px;
            }
        }
    }
    .btn {
        a {
            margin-top: 0;
            margin-bottom: 0;
            background-color: var(--primary-500);
            border-radius: 3px;
            border: 1px solid var(--primary-600);
            color: #000;
            float: right;
            font-weight: bold;
            font-size: 12px;
            display: block;
            cursor: pointer;
            transition: all ease 0.2s;
            padding: 0 0.5rem;
            line-height: 28px;
            user-select: none;
            white-space: nowrap;
            &:hover {
                background-color: var(--primary-400);
                transition: all ease 0.2s;
            }
            &:active {
                background-color: var(--primary-500);
                transition: all ease 0s;
                box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
            }
            .helpicon {
                margin-left: 5px;
            }
        }
        a.disabled {
            cursor: default;
            color: var(--surface-900);
            background-color: var(--surface-500);
            border: 1px solid var(--surface-500);
            pointer-events: none;
            opacity: 1;
        }
    }
}

.btn {
    a {
        margin-top: 0;
        margin-bottom: 0;
        background-color: var(--primary-500);
        border-radius: 3px;
        border: 1px solid var(--primary-600);
        color: #000;
        float: right;
        font-weight: bold;
        font-size: 12px;
        display: block;
        cursor: pointer;
        transition: all ease 0.2s;
        padding: 0 0.5rem;
        line-height: 28px;
        user-select: none;
        white-space: nowrap;
        &:hover {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }
        &:active {
            background-color: var(--primary-500);
            transition: all ease 0s;
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }
        &.disabled {
            background-color: var(--surface-500);
            border: 1px solid var(--surface-400);
            color: var(--surface-900);
            cursor: default;
        }
    }
}

.osd-needs-attention {
    :deep(.multiselect__single),
    :deep(.multiselect__placeholder) {
        color: red !important;
    }
}

/* Container management */
.select-wrapper.fixed-width {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 240px;
    max-width: 440px;
    position: relative;
    z-index: 1002; /* Lower than board select, but active state will be above expert options */
}

:deep(.standard-select) {
    min-height: 28px;
    font-size: 12px;
    flex: 1;
    z-index: 1001 !important;
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
    position: relative;
}

/* Multi Selects */
:deep(.standard-select .multiselect__tags) {
    min-height: 28px;
    padding: 0 30px 0 8px;
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    background: var(--surface-200);
    display: flex;
    align-items: center;
}

:deep(.standard-select .multiselect__single),
:deep(.standard-select .multiselect__input),
:deep(.standard-select .multiselect__placeholder) {
    color: var(--text) !important;
    background: transparent !important;
    line-height: 26px;
    margin-bottom: 0;
}

/* FIX: Hide search text when selection is present */
:deep(.standard-select:not(.multiselect--active) .multiselect__input) {
    opacity: 0 !important;
    position: absolute !important;
}

/* Dropdown list styling */
:deep(.standard-select .multiselect__content-wrapper) {
    position: absolute;
    display: block;
    background: var(--surface-400);
    border: 1px solid var(--surface-600);
    border-top: none;
    z-index: 99999 !important; /* Extremely high to clear all elements including switchery (1000) */
    max-height: 250px;
    overflow-y: auto;
    width: 100%;
    left: 0;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);
}

:deep(.standard-select .multiselect__option) {
    font-size: 12px !important;
    color: var(--text) !important;
    padding: 8px 12px;
    min-height: 30px;
}

:deep(.standard-select .multiselect__option--highlight) {
    background: var(--surface-300) !important; /* Darker blue for better contrast */
    color: var(--text) !important;
}

/* 1. Reset the internal input to remove borders/outlines */
:deep(.standard-select .multiselect__input) {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--text) !important;
    font-size: 12px !important;
}

/* 2. Target the placeholder text specifically */
:deep(.standard-select .multiselect__placeholder) {
    color: var(--text) !important;
    font-size: 12px !important;
    margin-bottom: 0;
    padding-top: 0;
    line-height: 26px; /* Vertical centering */
    border: none !important;
}

/* 3. Target the native placeholder inside the search input */
:deep(.standard-select .multiselect__input::placeholder) {
    color: var(--text) !important;
    font-size: 12px !important;
    border: none !important;
}

/* 4. Ensure the selected single value matches page font size */
:deep(.standard-select .multiselect__single) {
    font-size: 12px !important;
    line-height: 26px;
    padding: 0 0 0 2px;
    margin-bottom: 0;
}

/* Firmware version dropdown should appear above expert options but below board select when both open */
.select-wrapper.fixed-width :deep(.standard-select.multiselect--active) {
    z-index: 1005 !important; /* Below board select active (100000) but above everything else */
}

.select-wrapper.fixed-width :deep(.standard-select .multiselect__content-wrapper) {
    z-index: 1001 !important;
}

.select-wrapper {
    /* When multiselect is open, enable positioning and high z-index */
    :deep(.standard-select.multiselect--active) {
        position: relative;
        z-index: 10000 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
        z-index: 10001 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content) {
        z-index: 10001 !important;
    }
}

.select-wrapper-simple {
    /* When multiselect is open, enable positioning and high z-index */
    :deep(.standard-select.multiselect--active) {
        position: relative;
        z-index: 10000 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
        z-index: 10001 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content) {
        z-index: 10001 !important;
    }
}

/* When multiselect is open, increase z-index to be above everything */
:deep(.standard-select.multiselect--active) {
    position: relative;
    z-index: 10000 !important;
}

:deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
    z-index: 10001 !important;
}

:deep(.standard-select.multiselect--active .multiselect__content) {
    z-index: 10001 !important;
}

:deep(.standard-select .multiselect__option--selected) {
    background: var(--surface-300) !important;
    color: var(--text) !important;
    font-weight: normal;
}

:deep(.standard-select .multiselect__option--selected.multiselect__option--highlight) {
    background: var(--surface-500) !important;
    color: var(--surface-50) !important;
}

/* Group headers (Legacy, Supported, etc.) */
:deep(.standard-select .multiselect__option--group) {
    background: var(--surface-600) !important;
    color: var(--text) !important;
    font-size: 10px !important;
    font-weight: bold;
}

/* List styling for recovery and warning text - using :deep to pierce scoped styles */
:deep(.gui_note .spacer ul),
:deep(.gui_warning .spacer ul) {
    list-style: none !important;
    margin-left: 0.5rem !important;
    margin-top: 0.5rem !important;
    margin-bottom: 0.5rem !important;
    padding-left: 0 !important;
}

:deep(.gui_note .spacer li),
:deep(.gui_warning .spacer li) {
    margin-bottom: 0.25rem !important;
    margin-left: 0 !important;
    padding-left: 1.5em !important; /* space for dash */
    text-indent: -1.5em !important; /* hanging indent so wrapped lines align after dash */
    position: relative;
}

:deep(.gui_note .spacer li::before),
:deep(.gui_warning .spacer li::before) {
    content: "– " !important;
    margin-right: 0.5rem !important;
    color: var(--text) !important;
}

/* Unstable firmware dialog content styling */
#dialogUnstableFirmwareAcknowledgement {
    .content {
        margin-bottom: 1rem;

        ul {
            margin: 0.5rem 0;
            padding-left: 1.5rem;
            list-style-type: disc;
        }

        li {
            margin: 0.25rem 0;
            line-height: 1.5;
        }

        strong {
            font-weight: bold;
            color: var(--warning);
        }
    }
}
</style>
