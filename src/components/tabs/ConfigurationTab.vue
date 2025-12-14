<template>
    <div class="tab-configuration">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabConfiguration") }}</div>
            <div class="cf_doc_version_bt">
                <a
                    id="button-documentation"
                    href="https://betaflight.com/docs/wiki/configurator/configuration-tab"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="$t('betaflightSupportButton')"
                >
                    {{ $t("betaflightSupportButton") }}
                </a>
            </div>
            <div class="note">
                <p v-text="$t('configurationFeaturesHelp')"></p>
            </div>

            <div class="grid-row grid-box col2">
                <div class="col-span-1">
                    <!-- SYSTEM CONFIGURATION -->
                    <div class="systemconfig">
                        <div class="gui_box grey">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("configurationSystem") }}</div>
                            </div>
                            <div class="spacer_box">
                                <div class="note">
                                    <p class="systemconfigNote" v-html="$t('configurationLoopTimeHelp')"></p>
                                </div>
                                <div class="select">
                                    <input type="text" class="gyroFrequency" readonly :value="gyroFrequencyDisplay" />

                                    <span>{{ $t("configurationGyroFrequency") }}</span>
                                </div>
                                <div class="select">
                                    <select
                                        class="pidProcessDenom"
                                        v-model.number="pidAdvancedConfig.pid_process_denom"
                                    >
                                        <option v-for="opt in pidDenomOptions" :key="opt.value" :value="opt.value">
                                            {{ opt.text }}
                                        </option>
                                    </select>
                                    <span>{{ $t("configurationPidProcessDenom") }}</span>
                                    <div class="helpicon cf_tip" :title="$t('configurationPidProcessDenomHelp')"></div>
                                </div>
                                <div class="select">
                                    <div>
                                        <input
                                            type="checkbox"
                                            id="accHardwareSwitch"
                                            class="toggle"
                                            v-model="accHardwareEnabled"
                                            :aria-label="$t('configurationAccHardware')"
                                        />
                                    </div>
                                    <span class="freelabel">{{ $t("configurationAccHardware") }}</span>
                                </div>
                                <div class="select">
                                    <div>
                                        <input
                                            type="checkbox"
                                            id="baroHardwareSwitch"
                                            class="toggle"
                                            v-model="baroHardwareEnabled"
                                            :aria-label="$t('configurationBaroHardware')"
                                        />
                                    </div>
                                    <span class="freelabel">{{ $t("configurationBaroHardware") }}</span>
                                </div>
                                <div class="select">
                                    <div>
                                        <input
                                            type="checkbox"
                                            id="magHardwareSwitch"
                                            class="toggle"
                                            v-model="magHardwareEnabled"
                                            :aria-label="$t('configurationMagHardware')"
                                        />
                                    </div>
                                    <span class="freelabel">{{ $t("configurationMagHardware") }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- PERSONALIZATION -->
                    <div class="gui_box grey miscSettings">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationPersonalization") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="number">
                                <label>
                                    <input
                                        type="text"
                                        v-model="craftName"
                                        maxlength="16"
                                        style="width: 100px"
                                        :aria-label="$t('craftName')"
                                    />
                                    <span>{{ $t("craftName") }}</span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('configurationCraftNameHelp')"></div>
                            </div>
                            <div class="number pilotName" v-if="showPilotName">
                                <label>
                                    <input
                                        type="text"
                                        v-model="pilotName"
                                        maxlength="16"
                                        style="width: 100px"
                                        :aria-label="$t('configurationPilotName')"
                                    />
                                    <span>{{ $t("configurationPilotName") }}</span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('configurationPilotNameHelp')"></div>
                            </div>
                        </div>
                    </div>

                    <!-- CAMERA -->
                    <div class="gui_box grey miscSettings" v-if="accHardwareEnabled">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationCamera") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="number fpvCamAngleDegrees">
                                <label>
                                    <input
                                        type="number"
                                        name="fpvCamAngleDegrees"
                                        v-model.number="fpvCamAngleDegrees"
                                        step="1"
                                        min="0"
                                        max="90"
                                    />
                                    <span>{{ $t("configurationFpvCamAngleDegrees") }}</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- ARMING -->
                    <div class="gui_box grey arming" v-if="accHardwareEnabled">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationArming") }}</div>
                            <div class="helpicon cf_tip" :title="$t('configurationArmingHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="number">
                                <label>
                                    <input
                                        type="number"
                                        name="small_angle"
                                        v-model.number="armingConfig.small_angle"
                                        min="0"
                                        max="180"
                                    />
                                    <span>{{ $t("configurationSmallAngle") }}</span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('configurationSmallAngleHelp')"></div>
                            </div>

                            <div class="select" v-if="showGyroCalOnFirstArm">
                                <div>
                                    <input
                                        type="checkbox"
                                        class="toggle"
                                        id="gyroCalOnFirstArm"
                                        v-model="armingConfig.gyro_cal_on_first_arm_bool"
                                    />
                                </div>
                                <span class="freelabel">{{ $t("configurationGyroCalOnFirstArm") }}</span>
                                <div class="helpicon cf_tip" :title="$t('configurationGyroCalOnFirstArmHelp')"></div>
                            </div>

                            <div class="number" v-if="showAutoDisarmDelay">
                                <label>
                                    <input
                                        type="number"
                                        name="auto_disarm_delay"
                                        v-model.number="armingConfig.auto_disarm_delay"
                                        min="0"
                                        max="60"
                                    />
                                    <span>{{ $t("configurationAutoDisarmDelay") }}</span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('configurationAutoDisarmDelayHelp')"></div>
                            </div>
                        </div>
                    </div>

                    <!-- FEATURES -->
                    <div class="gui_box grey features">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationFeatures") }}</div>
                        </div>
                        <div class="spacer_box">
                            <table class="features-table">
                                <thead class="visually-hidden">
                                    <tr>
                                        <th scope="col">{{ $t("configurationFeatureEnabled") }}</th>
                                        <th scope="col">{{ $t("configurationFeatureName") }}</th>
                                        <th scope="col">{{ $t("configurationFeatureDescription") }}</th>
                                        <th scope="col">{{ $t("configurationFeatureHelp") }}</th>
                                    </tr>
                                </thead>
                                <tbody :key="featureMask">
                                    <template v-for="feature in featuresList" :key="feature.bit">
                                        <tr v-if="feature.mode !== 'select'">
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    class="feature toggle"
                                                    :id="'feature' + feature.bit"
                                                    :name="feature.name"
                                                    :checked="isFeatureEnabled(feature)"
                                                    @change="toggleFeature(feature, $event.target.checked)"
                                                />
                                            </td>
                                            <td>
                                                <div v-if="!feature.hideName">{{ feature.name }}</div>
                                            </td>
                                            <td>
                                                <span class="xs" v-html="$t('feature' + feature.name)"></span>
                                            </td>
                                            <td>
                                                <span class="sm-min" v-html="$t('feature' + feature.name)"></span>
                                                <div
                                                    v-if="feature.haveTip"
                                                    class="helpicon cf_tip"
                                                    :title="$t('feature' + feature.name + 'Tip')"
                                                ></div>
                                            </td>
                                        </tr>
                                    </template>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="col-span-1">
                    <!-- BOARD ALIGNMENT -->
                    <div class="board acc">
                        <div class="gui_box grey">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("configurationBoardAlignment") }}</div>
                                <div class="helpicon cf_tip" :title="$t('configurationBoardAlignmentHelp')"></div>
                            </div>
                            <div class="spacer_box">
                                <div class="sensor_align_content">
                                    <div class="sensor_align_inputs">
                                        <div class="alignicon roll"></div>
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="boardAlignment.roll"
                                                step="1"
                                                min="-180"
                                                max="360"
                                                :aria-label="$t('configurationBoardAlignmentRoll')"
                                            />
                                            <span>{{ $t("configurationBoardAlignmentRoll") }}</span>
                                        </label>
                                    </div>
                                    <div class="sensor_align_inputs">
                                        <div class="alignicon pitch"></div>
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="boardAlignment.pitch"
                                                step="1"
                                                min="-180"
                                                max="360"
                                                :aria-label="$t('configurationBoardAlignmentPitch')"
                                            />
                                            <span>{{ $t("configurationBoardAlignmentPitch") }}</span>
                                        </label>
                                    </div>
                                    <div class="sensor_align_inputs">
                                        <div class="alignicon yaw"></div>
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="boardAlignment.yaw"
                                                step="1"
                                                min="-180"
                                                max="360"
                                                :aria-label="$t('configurationBoardAlignmentYaw')"
                                            />
                                            <span>{{ $t("configurationBoardAlignmentYaw") }}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- GYRO ALIGNMENT (Complex) -->
                    <div class="gui_box grey" v-if="showSensorAlignment">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationGyroAlignment") }}</div>
                            <div class="helpicon cf_tip" :title="$t('configurationGyroAlignmentHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="grid-row col2">
                                <div class="col-span-1">
                                    <!-- GYRO ALIGNMENT -->
                                    <div class="select" v-if="showGyroToUse">
                                        <select v-model.number="sensorAlignment.gyro_to_use">
                                            <option value="0">{{ $t("configurationSensorGyroToUseFirst") }}</option>
                                            <option value="1" v-if="hasSecondGyro">
                                                {{ $t("configurationSensorGyroToUseSecond") }}
                                            </option>
                                            <option value="2" v-if="hasDualGyros">
                                                {{ $t("configurationSensorGyroToUseBoth") }}
                                            </option>
                                        </select>
                                        <span>{{ $t("configurationSensorGyroToUse") }}</span>
                                    </div>
                                </div>
                                <div class="col-span-1">
                                    <div class="select" v-if="showGyro1Align">
                                        <select v-model.number="sensorAlignment.gyro_1_align">
                                            <option :value="0">
                                                {{ $t("configurationSensorAlignmentDefaultOption") }}
                                            </option>
                                            <option
                                                v-for="(align, idx) in sensorAlignments"
                                                :key="idx"
                                                :value="idx + 1"
                                            >
                                                {{ align }}
                                            </option>
                                        </select>
                                        <span>{{ $t("configurationSensorAlignmentGyro1") }}</span>
                                    </div>

                                    <div class="sensor_align_content" v-if="sensorAlignment.gyro_1_align === 9">
                                        <div class="sensor_align_inputs">
                                            <div class="alignicon roll"></div>
                                            <label>
                                                <input
                                                    type="number"
                                                    v-model.number="sensorAlignment.gyro_1_align_roll"
                                                    step="0.1"
                                                    min="-180"
                                                    max="360"
                                                    :aria-label="$t('configurationGyro1AlignmentRoll')"
                                                />
                                                <span>{{ $t("configurationGyro1AlignmentRoll") }}</span>
                                            </label>
                                        </div>
                                        <div class="sensor_align_inputs">
                                            <div class="alignicon pitch"></div>
                                            <label>
                                                <input
                                                    type="number"
                                                    v-model.number="sensorAlignment.gyro_1_align_pitch"
                                                    step="0.1"
                                                    min="-180"
                                                    max="360"
                                                    :aria-label="$t('configurationGyro1AlignmentPitch')"
                                                />
                                                <span>{{ $t("configurationGyro1AlignmentPitch") }}</span>
                                            </label>
                                        </div>
                                        <div class="sensor_align_inputs">
                                            <div class="alignicon yaw"></div>
                                            <label>
                                                <input
                                                    type="number"
                                                    v-model.number="sensorAlignment.gyro_1_align_yaw"
                                                    step="0.1"
                                                    min="-180"
                                                    max="360"
                                                    :aria-label="$t('configurationGyro1AlignmentYaw')"
                                                />
                                                <span>{{ $t("configurationGyro1AlignmentYaw") }}</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div class="select" v-if="showGyro2Align">
                                        <select v-model.number="sensorAlignment.gyro_2_align">
                                            <option :value="0">
                                                {{ $t("configurationSensorAlignmentDefaultOption") }}
                                            </option>
                                            <option
                                                v-for="(align, idx) in sensorAlignments"
                                                :key="idx"
                                                :value="idx + 1"
                                            >
                                                {{ align }}
                                            </option>
                                        </select>
                                        <span>{{ $t("configurationSensorAlignmentGyro2") }}</span>
                                    </div>

                                    <div class="sensor_align_content" v-if="sensorAlignment.gyro_2_align === 9">
                                        <div class="sensor_align_inputs">
                                            <div class="alignicon roll"></div>
                                            <label>
                                                <input
                                                    type="number"
                                                    v-model.number="sensorAlignment.gyro_2_align_roll"
                                                    step="0.1"
                                                    min="-180"
                                                    max="360"
                                                    :aria-label="$t('configurationGyro2AlignmentRoll')"
                                                />
                                                <span>{{ $t("configurationGyro2AlignmentRoll") }}</span>
                                            </label>
                                        </div>
                                        <div class="sensor_align_inputs">
                                            <div class="alignicon pitch"></div>
                                            <label>
                                                <input
                                                    type="number"
                                                    v-model.number="sensorAlignment.gyro_2_align_pitch"
                                                    step="0.1"
                                                    min="-180"
                                                    max="360"
                                                    :aria-label="$t('configurationGyro2AlignmentPitch')"
                                                />
                                                <span>{{ $t("configurationGyro2AlignmentPitch") }}</span>
                                            </label>
                                        </div>
                                        <div class="sensor_align_inputs">
                                            <div class="alignicon yaw"></div>
                                            <label>
                                                <input
                                                    type="number"
                                                    v-model.number="sensorAlignment.gyro_2_align_yaw"
                                                    step="0.1"
                                                    min="-180"
                                                    max="360"
                                                    :aria-label="$t('configurationGyro2AlignmentYaw')"
                                                />
                                                <span>{{ $t("configurationGyro2AlignmentYaw") }}</span>
                                            </label>
                                        </div>
                                    </div>

                                    <!-- MAG ALIGNMENT -->
                                    <template v-if="showMagAlign">
                                        <div class="select">
                                            <select v-model.number="sensorAlignment.align_mag">
                                                <option :value="0">
                                                    {{ $t("configurationSensorAlignmentDefaultOption") }}
                                                </option>
                                                <option
                                                    v-for="(align, idx) in sensorAlignments"
                                                    :key="idx"
                                                    :value="idx + 1"
                                                >
                                                    {{ align }}
                                                </option>
                                            </select>
                                            <span>{{ $t("configurationMagAlignment") }}</span>
                                        </div>

                                        <div class="sensor_align_content" v-if="sensorAlignment.align_mag === 9">
                                            <div class="sensor_align_inputs">
                                                <div class="alignicon roll"></div>
                                                <label>
                                                    <input
                                                        type="number"
                                                        v-model.number="sensorAlignment.mag_align_roll"
                                                        step="0.1"
                                                        min="-180"
                                                        max="360"
                                                        :aria-label="$t('configurationMagAlignmentRoll')"
                                                    />
                                                    <span>{{ $t("configurationMagAlignmentRoll") }}</span>
                                                </label>
                                            </div>
                                            <div class="sensor_align_inputs">
                                                <div class="alignicon pitch"></div>
                                                <label>
                                                    <input
                                                        type="number"
                                                        v-model.number="sensorAlignment.mag_align_pitch"
                                                        step="0.1"
                                                        min="-180"
                                                        max="360"
                                                        :aria-label="$t('configurationMagAlignmentPitch')"
                                                    />
                                                    <span>{{ $t("configurationMagAlignmentPitch") }}</span>
                                                </label>
                                            </div>
                                            <div class="sensor_align_inputs">
                                                <div class="alignicon yaw"></div>
                                                <label>
                                                    <input
                                                        type="number"
                                                        v-model.number="sensorAlignment.mag_align_yaw"
                                                        step="0.1"
                                                        min="-180"
                                                        max="360"
                                                        :aria-label="$t('configurationMagAlignmentYaw')"
                                                    />
                                                    <span>{{ $t("configurationMagAlignmentYaw") }}</span>
                                                </label>
                                            </div>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- OTHER SENSORS -->
                    <div class="gui_box grey" v-if="showOtherSensors">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationSensors") }}</div>
                            <div class="helpicon cf_tip" :title="$t('configurationSensorsHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <!-- MAG DECLINATION -->
                            <div class="number" v-if="showMagDeclination">
                                <label>
                                    <input type="number" step="0.1" v-model.number="magDeclination" />
                                    <span>{{ $t("configurationMagDeclination") }}</span>
                                </label>
                            </div>

                            <!-- RANGEFINDER -->
                            <div class="select" v-if="showRangefinder">
                                <select v-model.number="sensorConfig.sonar_hardware">
                                    <option v-for="(type, idx) in sonarTypesList" :key="idx" :value="idx">
                                        {{ type }}
                                    </option>
                                </select>
                                <span>{{ $t("configurationRangefinder") }}</span>
                            </div>

                            <!-- OPTICAL FLOW -->
                            <div class="select" v-if="showOpticalFlow">
                                <select v-model.number="sensorConfig.opticalflow_hardware">
                                    <option v-for="(type, idx) in opticalFlowTypesList" :key="idx" :value="idx">
                                        {{ type }}
                                    </option>
                                </select>
                                <span>{{ $t("configurationOpticalflow") }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- ACCELEROMETER TRIM -->
                    <div class="gui_box grey" v-if="accHardwareEnabled">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("initialSetupAccelTrimsHead") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="number">
                                <label>
                                    <input type="number" name="acc_trim_roll" v-model.number="accelTrims.roll" />
                                    <span>{{ $t("configurationAccelTrimRoll") }}</span>
                                </label>
                            </div>
                            <div class="number">
                                <label>
                                    <input type="number" name="acc_trim_pitch" v-model.number="accelTrims.pitch" />
                                    <span>{{ $t("configurationAccelTrimPitch") }}</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- DSHOT BEACON -->
                    <div class="gui_box grey dshotbeeper">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationDshotBeeper") }}</div>
                            <div class="helpicon cf_tip" :title="$t('configurationDshotBeaconHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="select">
                                <select class="dshotBeeperBeaconTone" v-model.number="dshotBeaconTone">
                                    <option value="0">{{ $t("portsTelemetryDisabled") }}</option>
                                    <option v-for="i in 5" :key="i" :value="i">{{ i }}</option>
                                </select>
                                <span>{{ $t("configurationDshotBeaconTone") }}</span>
                            </div>

                            <div class="beeper-controls">
                                <button type="button" class="btn beeper-enable-all" @click="enableAllDshot">
                                    {{ $t("configurationBeeperEnableAll") }}
                                </button>
                                <button type="button" class="btn beeper-disable-all" @click="disableAllDshot">
                                    {{ $t("configurationBeeperDisableAll") }}
                                </button>
                            </div>

                            <table class="dshot-beacon-table">
                                <thead>
                                    <tr>
                                        <th scope="col" class="col-enable">
                                            {{ $t("configurationFeatureEnabled") }}
                                        </th>
                                        <th scope="col" class="col-name">{{ $t("configurationFeatureName") }}</th>
                                        <th scope="col" class="col-description">
                                            {{ $t("configurationFeatureDescription") }}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody :key="dshotDisabledMask">
                                    <tr v-for="cond in dshotBeaconConditionsList" :key="cond.bit">
                                        <td>
                                            <input
                                                type="checkbox"
                                                class="condition toggle"
                                                :id="'dshot-cond-' + cond.bit"
                                                :checked="isDshotConditionEnabled(cond)"
                                                @change="toggleDshotCondition(cond, $event.target.checked)"
                                            />
                                        </td>
                                        <td>
                                            <div>{{ cond.name }}</div>
                                        </td>
                                        <td>
                                            <span :title="$t('beeper' + cond.name)">{{
                                                $t("beeper" + cond.name)
                                            }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- BEEPER CONFIGURATION -->
                    <div class="gui_box grey beepers">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("configurationBeeper") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="beeper-controls">
                                <button type="button" class="btn beeper-enable-all" @click="enableAllBeepers">
                                    {{ $t("configurationBeeperEnableAll") }}
                                </button>
                                <button type="button" class="btn beeper-disable-all" @click="disableAllBeepers">
                                    {{ $t("configurationBeeperDisableAll") }}
                                </button>
                            </div>
                            <table class="beeper-configuration-table">
                                <thead>
                                    <tr>
                                        <th scope="col">{{ $t("configurationFeatureEnabled") }}</th>
                                        <th scope="col">{{ $t("configurationFeatureName") }}</th>
                                        <th scope="col">{{ $t("configurationFeatureDescription") }}</th>
                                    </tr>
                                </thead>
                                <tbody class="beeper-configuration" :key="beeperDisabledMask">
                                    <tr
                                        v-for="beeper in beepersList"
                                        :key="beeper.bit"
                                        v-show="beeper.visible !== false"
                                    >
                                        <td>
                                            <input
                                                type="checkbox"
                                                class="condition toggle"
                                                :id="'beeper-' + beeper.bit"
                                                :checked="isBeeperEnabled(beeper)"
                                                @change="toggleBeeper(beeper, $event.target.checked)"
                                            />
                                        </td>
                                        <td>
                                            <div>{{ beeper.name }}</div>
                                        </td>
                                        <td>
                                            <span :title="$t('beeper' + beeper.name)">{{
                                                $t("beeper" + beeper.name)
                                            }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="content_toolbar toolbar_fixed_bottom" style="position: fixed">
            <div class="btn save_btn">
                <a class="save" href="#" @click.prevent="saveConfig">{{ $t("configurationButtonSave") }}</a>
            </div>
        </div>
    </div>
</template>

<script>
import { defineComponent, ref, reactive, onMounted, computed, nextTick, watch } from "vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper.js";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { sensorTypes } from "../../js/sensor_types"; // Import for dropdown lists
import { have_sensor } from "../../js/sensor_helpers";
import semver from "semver-min";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../../js/data_storage";
import { bit_check, bit_set, bit_clear } from "../../js/bit";
import { updateTabList } from "../../js/utils/updateTabList";

export default defineComponent({
    name: "ConfigurationTab",
    setup() {
        // Reactive State
        const pidAdvancedConfig = reactive({
            pid_process_denom: 1,
        });

        const sensorConfig = reactive({
            acc_hardware: 0,
            baro_hardware: 0,
            mag_hardware: 0,
            sonar_hardware: 0,
            opticalflow_hardware: 0,
        });

        const boardAlignment = reactive({
            roll: 0,
            pitch: 0,
            yaw: 0,
        });

        const fpvCamAngleDegrees = ref(0);

        const craftName = ref("");
        const pilotName = ref("");
        const showPilotName = ref(false);

        const armingConfig = reactive({
            small_angle: 25,
            gyro_cal_on_first_arm_bool: false,
            auto_disarm_delay: 0,
        });

        const accelTrims = reactive({
            roll: 0,
            pitch: 0,
        });

        const sensorAlignment = reactive({
            gyro_to_use: 0,
            gyro_1_align: 0,
            gyro_2_align: 0,
            align_mag: 0,
            mag_align_roll: 0,
            mag_align_pitch: 0,
            mag_align_yaw: 0,
            gyro_1_align_roll: 0,
            gyro_1_align_pitch: 0,
            gyro_1_align_yaw: 0,
            gyro_2_align_roll: 0,
            gyro_2_align_pitch: 0,
            gyro_2_align_yaw: 0,
        });

        const magDeclination = ref(0);
        const showGyroCalOnFirstArm = ref(false);
        const showAutoDisarmDelay = ref(false);
        const hasSecondGyro = ref(false);
        const hasDualGyros = ref(false);
        const showGyroToUse = computed(() => {
            return semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_47);
        });
        const showGyro1Align = ref(false);
        const showGyro2Align = ref(false);
        const showMagAlign = ref(false);
        const showMagDeclination = ref(false);
        const showRangefinder = ref(false);
        const showOpticalFlow = ref(false);

        // This section contains gyro alignment dropdowns (API < 1.47) and mag alignment (API >= 1.47)
        const showSensorAlignment = computed(() => {
            // For API < 1.47: show if any gyro alignment options are available
            // For API >= 1.47: show if mag alignment is available
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                return showMagAlign.value;
            }
            return showGyroToUse.value || showGyro1Align.value || showGyro2Align.value;
        });
        const showOtherSensors = computed(() => {
            return showMagDeclination.value || showRangefinder.value || showOpticalFlow.value;
        });
        const sonarTypesList = ref([]);
        const opticalFlowTypesList = ref([]);
        const sensorAlignments = ref([
            "CW 0°",
            "CW 90°",
            "CW 180°",
            "CW 270°",
            "CW 0° flip",
            "CW 90° flip",
            "CW 180° flip",
            "CW 270° flip",
            i18n.getMessage("configurationSensorAlignmentCustom"),
        ]);

        // Features & Beepers State wrapper
        const featuresList = computed(() => {
            if (!FC.FEATURE_CONFIG?.features?._features) {
                return [];
            }
            return FC.FEATURE_CONFIG.features._features;
        });

        const beepersList = computed(() => {
            if (!FC.BEEPER_CONFIG?.beepers?._beepers) {
                return [];
            }
            return FC.BEEPER_CONFIG.beepers._beepers;
        });

        const dshotBeaconConditionsList = computed(() => {
            if (!FC.BEEPER_CONFIG?.dshotBeaconConditions?._beepers) {
                return [];
            }
            return FC.BEEPER_CONFIG.dshotBeaconConditions._beepers;
        });

        const dshotBeaconTone = ref(0); // 0 = disabled
        const beeperDisabledMask = ref(0);
        const dshotDisabledMask = ref(0);

        const featureMask = computed(() => {
            if (!FC?.FEATURE_CONFIG?.features) {
                return 0;
            }
            return FC.FEATURE_CONFIG.features._featureMask;
        });

        // Methods for toggling bits
        const isFeatureEnabled = (feature) => {
            if (!FC.FEATURE_CONFIG?.features) {
                return false;
            }
            return bit_check(FC.FEATURE_CONFIG.features._featureMask, feature.bit);
        };

        const toggleFeature = (feature, checked) => {
            if (!FC.FEATURE_CONFIG?.features) {
                return;
            }
            if (checked) {
                FC.FEATURE_CONFIG.features._featureMask = bit_set(FC.FEATURE_CONFIG.features._featureMask, feature.bit);
            } else {
                FC.FEATURE_CONFIG.features._featureMask = bit_clear(
                    FC.FEATURE_CONFIG.features._featureMask,
                    feature.bit,
                );
            }
            updateTabList(FC.FEATURE_CONFIG.features);
        };

        const isBeeperEnabled = (beeper) => {
            if (!FC.BEEPER_CONFIG?.beepers) {
                return false;
            }
            // Note: Beeper logic uses DisabledMask, so checked means NOT disabled
            return !bit_check(beeperDisabledMask.value, beeper.bit);
        };

        const toggleBeeper = (beeper, checked) => {
            if (!FC.BEEPER_CONFIG?.beepers) {
                return;
            }
            if (checked) {
                // To enable, we CLEAR the disabled bit
                beeperDisabledMask.value = bit_clear(beeperDisabledMask.value, beeper.bit);
            } else {
                // To disable, we SET the disabled bit
                beeperDisabledMask.value = bit_set(beeperDisabledMask.value, beeper.bit);
            }
            FC.BEEPER_CONFIG.beepers._beeperDisabledMask = beeperDisabledMask.value;
        };

        const enableAllBeepers = () => {
            if (!FC.BEEPER_CONFIG?.beepers) {
                return;
            }
            let mask = beeperDisabledMask.value;
            beepersList.value.forEach((beeper) => {
                if (beeper.visible !== false) {
                    mask = bit_clear(mask, beeper.bit);
                }
            });
            beeperDisabledMask.value = mask;
            FC.BEEPER_CONFIG.beepers._beeperDisabledMask = mask;
        };

        const disableAllBeepers = () => {
            if (!FC.BEEPER_CONFIG?.beepers) {
                return;
            }
            let mask = beeperDisabledMask.value;
            beepersList.value.forEach((beeper) => {
                if (beeper.visible !== false) {
                    mask = bit_set(mask, beeper.bit);
                }
            });
            beeperDisabledMask.value = mask;
            FC.BEEPER_CONFIG.beepers._beeperDisabledMask = mask;
        };

        const isDshotConditionEnabled = (cond) => {
            if (!FC.BEEPER_CONFIG?.dshotBeaconConditions) {
                return false;
            }
            // Same logic as beepers (DisabledMask)
            return !bit_check(dshotDisabledMask.value, cond.bit);
        };

        const toggleDshotCondition = (cond, checked) => {
            if (!FC.BEEPER_CONFIG?.dshotBeaconConditions) {
                return;
            }
            if (checked) {
                dshotDisabledMask.value = bit_clear(dshotDisabledMask.value, cond.bit);
            } else {
                dshotDisabledMask.value = bit_set(dshotDisabledMask.value, cond.bit);
            }
            FC.BEEPER_CONFIG.dshotBeaconConditions._beeperDisabledMask = dshotDisabledMask.value;
        };

        const enableAllDshot = () => {
            if (!FC.BEEPER_CONFIG?.dshotBeaconConditions) {
                return;
            }
            let mask = dshotDisabledMask.value;
            dshotBeaconConditionsList.value.forEach((cond) => {
                mask = bit_clear(mask, cond.bit);
            });
            dshotDisabledMask.value = mask;
            FC.BEEPER_CONFIG.dshotBeaconConditions._beeperDisabledMask = mask;
        };

        const disableAllDshot = () => {
            if (!FC.BEEPER_CONFIG?.dshotBeaconConditions) {
                return;
            }
            let mask = dshotDisabledMask.value;
            dshotBeaconConditionsList.value.forEach((cond) => {
                mask = bit_set(mask, cond.bit);
            });
            dshotDisabledMask.value = mask;
            FC.BEEPER_CONFIG.dshotBeaconConditions._beeperDisabledMask = mask;
        };

        // Computed Wrappers for Hardware Switches (logic inverted: 1 = disabled usually? legacy says: !== 1)
        // Legacy: accHardwareSwitch.prop("checked", FC.SENSOR_CONFIG.acc_hardware !== 1);
        // So 1 is None/Disabled?
        const accHardwareEnabled = computed({
            get: () => sensorConfig.acc_hardware !== 1,
            set: (val) => {
                sensorConfig.acc_hardware = val ? 0 : 1;
            }, // Assuming 0 is Default/Auto
        });

        const baroHardwareEnabled = computed({
            get: () => sensorConfig.baro_hardware !== 1,
            set: (val) => {
                sensorConfig.baro_hardware = val ? 0 : 1;
            },
        });

        const magHardwareEnabled = computed({
            get: () => sensorConfig.mag_hardware !== 1,
            set: (val) => {
                sensorConfig.mag_hardware = val ? 0 : 1;
            },
        });

        const gyroFrequencyDisplay = ref("");
        const pidDenomOptions = ref([]);

        // Loading Logic
        const loadConfig = async () => {
            try {
                await Promise.resolve(); // Start chain
                await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
                await MSP.promise(MSPCodes.MSP_BEEPER_CONFIG);
                await MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG);
                await MSP.promise(MSPCodes.MSP_ACC_TRIM);
                await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
                await MSP.promise(MSPCodes.MSP_RC_DEADBAND);
                await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);
                await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT);

                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(MSPCodes.MSP_NAME);
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(
                        MSPCodes.MSP2_GET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME),
                    );
                }

                await MSP.promise(MSPCodes.MSP_RX_CONFIG);

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(
                        MSPCodes.MSP2_GET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME),
                    );
                }

                await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    await MSP.promise(MSPCodes.MSP_COMPASS_CONFIG);
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    await MSP.promise(MSPCodes.MSP2_GYRO_SENSOR);
                }

                initializeUI();
                await nextTick();
                GUI.switchery();
                GUI.content_ready();
            } catch (e) {
                console.error("Failed to load configuration", e);
                GUI.content_ready();
            }
        };

        const initializeUI = () => {
            // Populate Reactive State
            pidAdvancedConfig.pid_process_denom = FC.PID_ADVANCED_CONFIG.pid_process_denom;

            sensorConfig.acc_hardware = FC.SENSOR_CONFIG.acc_hardware;
            sensorConfig.baro_hardware = FC.SENSOR_CONFIG.baro_hardware;
            sensorConfig.mag_hardware = FC.SENSOR_CONFIG.mag_hardware;
            sensorConfig.sonar_hardware = FC.SENSOR_CONFIG.sonar_hardware;
            sensorConfig.opticalflow_hardware = FC.SENSOR_CONFIG.opticalflow_hardware;

            boardAlignment.roll = FC.BOARD_ALIGNMENT_CONFIG.roll;
            boardAlignment.pitch = FC.BOARD_ALIGNMENT_CONFIG.pitch;
            boardAlignment.yaw = FC.BOARD_ALIGNMENT_CONFIG.yaw;

            fpvCamAngleDegrees.value = FC.RX_CONFIG.fpvCamAngleDegrees;

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                craftName.value = FC.CONFIG.craftName;
                pilotName.value = FC.CONFIG.pilotName;
                showPilotName.value = true;
            } else {
                craftName.value = FC.CONFIG.name;
                showPilotName.value = false;
            }

            // Gyro Frequency Logic
            updateGyroDenom(FC.CONFIG.sampleRateHz);

            updatePidDenomOptions();

            // Load DShot Tone
            if (FC.BEEPER_CONFIG) {
                dshotBeaconTone.value = FC.BEEPER_CONFIG.dshotBeaconTone;
                if (FC.BEEPER_CONFIG.beepers) {
                    beeperDisabledMask.value = FC.BEEPER_CONFIG.beepers._beeperDisabledMask;
                }
                if (FC.BEEPER_CONFIG.dshotBeaconConditions) {
                    dshotDisabledMask.value = FC.BEEPER_CONFIG.dshotBeaconConditions._beeperDisabledMask;
                }
            }

            // Arming Config
            armingConfig.small_angle = FC.ARMING_CONFIG.small_angle;

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                showGyroCalOnFirstArm.value = true;
                armingConfig.gyro_cal_on_first_arm_bool = FC.ARMING_CONFIG.gyro_cal_on_first_arm === 1;
                armingConfig.auto_disarm_delay = FC.ARMING_CONFIG.auto_disarm_delay;

                if (isFeatureEnabled({ name: "MOTOR_STOP", bit: 4 })) {
                    // Check manually or reuse logic
                    showAutoDisarmDelay.value = true;
                }
            }

            // Accel Trims
            accelTrims.pitch = FC.CONFIG.accelerometerTrims[0];
            accelTrims.roll = FC.CONFIG.accelerometerTrims[1];

            // Sensor Alignment
            sensorAlignment.gyro_to_use = FC.SENSOR_ALIGNMENT.gyro_to_use;
            sensorAlignment.gyro_1_align = FC.SENSOR_ALIGNMENT.gyro_1_align;
            sensorAlignment.gyro_2_align = FC.SENSOR_ALIGNMENT.gyro_2_align;
            sensorAlignment.align_mag = FC.SENSOR_ALIGNMENT.align_mag;

            sensorAlignment.gyro_1_align_roll = FC.SENSOR_ALIGNMENT.gyro_1_align_roll;
            sensorAlignment.gyro_1_align_pitch = FC.SENSOR_ALIGNMENT.gyro_1_align_pitch;
            sensorAlignment.gyro_1_align_yaw = FC.SENSOR_ALIGNMENT.gyro_1_align_yaw;
            sensorAlignment.gyro_2_align_roll = FC.SENSOR_ALIGNMENT.gyro_2_align_roll;
            sensorAlignment.gyro_2_align_pitch = FC.SENSOR_ALIGNMENT.gyro_2_align_pitch;
            sensorAlignment.gyro_2_align_yaw = FC.SENSOR_ALIGNMENT.gyro_2_align_yaw;

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                sensorAlignment.mag_align_roll = FC.SENSOR_ALIGNMENT.mag_align_roll || 0;
                sensorAlignment.mag_align_pitch = FC.SENSOR_ALIGNMENT.mag_align_pitch || 0;
                sensorAlignment.mag_align_yaw = FC.SENSOR_ALIGNMENT.mag_align_yaw || 0;
            }

            // Detect Gyros
            // Simplified detection logic compared to legacy for now, assume 1 unless flags say otherwise
            const GYRO_DETECTION_FLAGS = {
                DETECTED_GYRO_1: 1 << 0,
                DETECTED_GYRO_2: 1 << 1,
                DETECTED_DUAL_GYROS: 1 << 7,
            };
            const flags = FC.SENSOR_ALIGNMENT.gyro_detection_flags || 0;
            hasSecondGyro.value = (flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) !== 0;
            hasDualGyros.value = (flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) !== 0;

            // Gyro alignment dropdowns are only available for API < 1.47
            // In API 1.47+, the firmware uses gyro_enable_mask instead of individual gyro alignments
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                showGyro1Align.value = true;
                showGyro2Align.value = hasSecondGyro.value;
            } else {
                showGyro1Align.value = false;
                showGyro2Align.value = false;
            }

            // Mag Declination & Alignment
            if (have_sensor(FC.CONFIG.activeSensors, "mag")) {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    showMagDeclination.value = true;
                    magDeclination.value = FC.COMPASS_CONFIG.mag_declination;
                }
                // Show mag alignment for API >= 1.47
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    showMagAlign.value = true;
                }
            } else {
                showMagDeclination.value = false;
                showMagAlign.value = false;
            }

            // Rangefinder / Optical Flow (API 1.47+)
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                const types = sensorTypes();
                sonarTypesList.value = types.sonar.elements;
                showRangefinder.value = sonarTypesList.value?.length > 0;

                opticalFlowTypesList.value = types.opticalflow.elements;
                showOpticalFlow.value = opticalFlowTypesList.value?.length > 0;
            }
        };

        const updateGyroDenom = (gyroFrequency) => {
            // Mirror legacy updateGyroDenomReadOnly
            if (gyroFrequency === 0) {
                gyroFrequencyDisplay.value = i18n.getMessage("configurationSpeedGyroNoGyro");
            } else {
                gyroFrequencyDisplay.value = i18n.getMessage("configurationKHzUnitLabel", {
                    value: (gyroFrequency / 1000).toFixed(2),
                });
            }
        };

        const updatePidDenomOptions = () => {
            // Mirror legacy logic
            const pidBaseFreq = FC.CONFIG.sampleRateHz / 1000;
            const MAX_DENOM = 8;
            const options = [];

            for (let denom = 1; denom <= MAX_DENOM; denom++) {
                let text;
                if (pidBaseFreq === 0) {
                    text = i18n.getMessage("configurationSpeedPidNoGyro", { value: denom });
                } else {
                    text = i18n.getMessage("configurationKHzUnitLabel", {
                        value: (pidBaseFreq / denom).toFixed(2),
                    });
                }
                options.push({ value: denom, text });
            }
            pidDenomOptions.value = options;
        };

        const saveConfig = async () => {
            try {
                console.log("Saving configuration...");
                gui_log("Saving...");

                FC.PID_ADVANCED_CONFIG.pid_process_denom = pidAdvancedConfig.pid_process_denom;

                FC.SENSOR_CONFIG.acc_hardware = sensorConfig.acc_hardware;
                FC.SENSOR_CONFIG.baro_hardware = sensorConfig.baro_hardware;
                FC.SENSOR_CONFIG.mag_hardware = sensorConfig.mag_hardware;

                FC.BOARD_ALIGNMENT_CONFIG.roll = boardAlignment.roll;
                FC.BOARD_ALIGNMENT_CONFIG.pitch = boardAlignment.pitch;
                FC.BOARD_ALIGNMENT_CONFIG.yaw = boardAlignment.yaw;

                FC.RX_CONFIG.fpvCamAngleDegrees = fpvCamAngleDegrees.value;

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    FC.CONFIG.craftName = craftName.value;
                    FC.CONFIG.pilotName = pilotName.value;
                } else {
                    FC.CONFIG.name = craftName.value;
                }

                if (FC.BEEPER_CONFIG) {
                    FC.BEEPER_CONFIG.dshotBeaconTone = dshotBeaconTone.value;
                }

                FC.ARMING_CONFIG.small_angle = armingConfig.small_angle;
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    FC.ARMING_CONFIG.gyro_cal_on_first_arm = armingConfig.gyro_cal_on_first_arm_bool ? 1 : 0;
                    FC.ARMING_CONFIG.auto_disarm_delay = armingConfig.auto_disarm_delay;
                }

                FC.CONFIG.accelerometerTrims[0] = accelTrims.pitch;
                FC.CONFIG.accelerometerTrims[1] = accelTrims.roll;

                FC.SENSOR_ALIGNMENT.gyro_to_use = sensorAlignment.gyro_to_use;
                FC.SENSOR_ALIGNMENT.gyro_1_align = sensorAlignment.gyro_1_align;
                FC.SENSOR_ALIGNMENT.gyro_2_align = sensorAlignment.gyro_2_align;
                FC.SENSOR_ALIGNMENT.align_mag = sensorAlignment.align_mag;

                FC.SENSOR_ALIGNMENT.gyro_1_align_roll = sensorAlignment.gyro_1_align_roll;
                FC.SENSOR_ALIGNMENT.gyro_1_align_pitch = sensorAlignment.gyro_1_align_pitch;
                FC.SENSOR_ALIGNMENT.gyro_1_align_yaw = sensorAlignment.gyro_1_align_yaw;
                FC.SENSOR_ALIGNMENT.gyro_2_align_roll = sensorAlignment.gyro_2_align_roll;
                FC.SENSOR_ALIGNMENT.gyro_2_align_pitch = sensorAlignment.gyro_2_align_pitch;
                FC.SENSOR_ALIGNMENT.gyro_2_align_yaw = sensorAlignment.gyro_2_align_yaw;

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    FC.SENSOR_ALIGNMENT.mag_align_roll = sensorAlignment.mag_align_roll;
                    FC.SENSOR_ALIGNMENT.mag_align_pitch = sensorAlignment.mag_align_pitch;
                    FC.SENSOR_ALIGNMENT.mag_align_yaw = sensorAlignment.mag_align_yaw;
                }

                if (showMagDeclination.value) {
                    FC.COMPASS_CONFIG.mag_declination = magDeclination.value;
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    FC.SENSOR_CONFIG.sonar_hardware = sensorConfig.sonar_hardware;
                    FC.SENSOR_CONFIG.opticalflow_hardware = sensorConfig.opticalflow_hardware;
                }

                // Send MSP commands
                await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

                if (FC.BEEPER_CONFIG) {
                    await MSP.promise(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG));
                }

                await MSP.promise(
                    MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG,
                    mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG),
                );
                await MSP.promise(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM));
                await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));
                await MSP.promise(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG));
                await MSP.promise(
                    MSPCodes.MSP_SET_SENSOR_ALIGNMENT,
                    mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT),
                );

                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME));
                } else {
                    await MSP.promise(
                        MSPCodes.MSP2_SET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.CRAFT_NAME),
                    );
                    await MSP.promise(
                        MSPCodes.MSP2_SET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.PILOT_NAME),
                    );
                }

                await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
                await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    await MSP.promise(
                        MSPCodes.MSP_SET_COMPASS_CONFIG,
                        mspHelper.crunch(MSPCodes.MSP_SET_COMPASS_CONFIG),
                    );
                }

                gui_log(i18n.getMessage("configurationSaved"));

                // Save to EEPROM and Reboot
                mspHelper.writeConfiguration(false, () => {
                    GUI.tab_switch_cleanup(() => {
                        GUI.reinitializeConnection();
                    });
                });
            } catch (e) {
                console.error("Failed to save configuration", e);
                gui_log(i18n.getMessage("configurationSaveFailed"));
            }
        };

        onMounted(() => {
            loadConfig();
        });

        // Watch for beeper mask changes to reinitialize Switchery
        watch([beeperDisabledMask, dshotDisabledMask, featureMask], async () => {
            await nextTick();
            GUI.switchery();
        });

        return {
            pidAdvancedConfig,
            sensorConfig,
            accHardwareEnabled,
            enableAllDshot,
            disableAllDshot,
            baroHardwareEnabled,
            magHardwareEnabled,
            gyroFrequencyDisplay,
            pidDenomOptions,
            boardAlignment,
            fpvCamAngleDegrees,
            craftName,
            pilotName,
            showPilotName,
            featuresList,
            beepersList,
            dshotBeaconConditionsList,
            dshotBeaconTone,
            beeperDisabledMask,
            dshotDisabledMask,
            featureMask,
            isFeatureEnabled,
            toggleFeature,
            isBeeperEnabled,
            toggleBeeper,
            enableAllBeepers,
            disableAllBeepers,
            isDshotConditionEnabled,
            toggleDshotCondition,
            armingConfig,
            accelTrims,
            sensorAlignment,
            magDeclination,
            showGyroCalOnFirstArm,
            showAutoDisarmDelay,
            hasSecondGyro,
            hasDualGyros,
            showGyro1Align,
            showGyro2Align,
            showMagAlign,
            showSensorAlignment,
            showOtherSensors,
            showMagDeclination,
            showRangefinder,
            showOpticalFlow,
            sonarTypesList,
            showGyroToUse,
            opticalFlowTypesList,
            sensorAlignments,
            saveConfig,
        };
    },
});
</script>

<style lang="less" scoped>
@import "../../css/tabs/configuration.less";
</style>
