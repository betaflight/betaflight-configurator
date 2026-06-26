<template>
    <BaseTab tab-name="sensors">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabSensorConfig") }}</div>
            <WikiButton docUrl="sensors" />

            <!-- Top: Left config columns + Right 3D preview -->
            <div class="sensor-top">
                <!-- Left column -->
                <div class="sensor-left">
                    <!-- SENSOR HARDWARE -->
                    <UiBox :title="$t('sensorConfigHardware')" type="neutral" collapsible>
                        <!-- Active Gyro / IMU (API 1.47+) -->
                        <template v-if="showMultiGyro">
                            <SettingRow v-for="gyro in gyroList" :key="gyro.index" fullWidth>
                                <template #label>
                                    {{ $t("sensorConfigGyroLabel", { 1: gyro.index + 1 }) }}
                                    <span v-if="gyro.name" class="text-dimmed font-normal"
                                        >&mdash; {{ gyro.name }}</span
                                    >
                                </template>
                                <USwitch
                                    :model-value="gyro.enabled"
                                    @update:model-value="(checked) => toggleGyro(gyro.index, checked)"
                                />
                            </SettingRow>
                        </template>

                        <!-- Gyro Selection (Legacy, API < 1.47) -->
                        <SettingRow v-if="showGyroToUse" :label="gyroHwName ? '' : $t('configurationSensorGyroToUse')">
                            <template v-if="gyroHwName" #label>
                                {{ $t("configurationSensorGyroToUse") }}
                                <span class="text-dimmed font-normal">&mdash; {{ gyroHwName }}</span>
                            </template>
                            <USelect
                                v-model="sensorAlignment.gyro_to_use"
                                :items="gyroToUseSelectItems"
                                class="min-w-40"
                                size="xs"
                            />
                        </SettingRow>

                        <SettingRow :label="accHwName ? '' : $t('configurationAccHardware')">
                            <template v-if="accHwName" #label>
                                {{ $t("configurationAccHardware") }}
                                <span class="text-dimmed font-normal">&mdash; {{ accHwName }}</span>
                            </template>
                            <USwitch v-model="accHardwareEnabled" />
                        </SettingRow>
                        <SettingRow :label="magHwName ? '' : $t('configurationMagHardware')">
                            <template v-if="magHwName" #label>
                                {{ $t("configurationMagHardware") }}
                                <span class="text-dimmed font-normal">&mdash; {{ magHwName }}</span>
                            </template>
                            <USwitch v-model="magHardwareEnabled" />
                        </SettingRow>
                        <SettingRow :label="baroHwName ? '' : $t('configurationBaroHardware')">
                            <template v-if="baroHwName" #label>
                                {{ $t("configurationBaroHardware") }}
                                <span class="text-dimmed font-normal">&mdash; {{ baroHwName }}</span>
                            </template>
                            <USwitch v-model="baroHardwareEnabled" />
                        </SettingRow>
                        <SettingRow v-if="showRangefinder" :label="$t('configurationRangefinder')" fullWidth>
                            <USwitch v-model="sonarHardwareEnabled" />
                            <USelect
                                v-if="sonarHardwareEnabled"
                                v-model="sensorConfig.sonar_hardware"
                                :items="
                                    sonarTypesList.filter((_, i) => i > 0).map((label, i) => ({ label, value: i + 1 }))
                                "
                                class="min-w-40"
                                size="xs"
                            />
                        </SettingRow>
                        <SettingRow v-if="showOpticalFlow" :label="$t('configurationOpticalflow')" fullWidth>
                            <USwitch v-model="opticalFlowHardwareEnabled" />
                            <USelect
                                v-if="opticalFlowHardwareEnabled"
                                v-model="sensorConfig.opticalflow_hardware"
                                :items="
                                    opticalFlowTypesList
                                        .filter((_, i) => i > 0)
                                        .map((label, i) => ({ label, value: i + 1 }))
                                "
                                class="min-w-40"
                                size="xs"
                            />
                        </SettingRow>
                        <!-- Board Alignment -->
                        <SettingRow :label="$t('configurationBoardAlignment')" fullWidth>
                            <HelpIcon :text="$t('configurationBoardAlignmentHelp')" />
                        </SettingRow>
                        <AlignmentAngles
                            v-model:roll="boardAlignment.roll"
                            v-model:pitch="boardAlignment.pitch"
                            v-model:yaw="boardAlignment.yaw"
                            label-prefix="configurationBoardAlignment"
                            :step="1"
                        />

                        <!-- Gyro alignment dropdowns (Legacy, API < 1.47) -->
                        <template v-if="showSensorAlignment">
                            <SettingRow v-if="showGyro1Align" :label="$t('configurationSensorAlignmentGyro1')">
                                <USelect
                                    v-model="sensorAlignment.gyro_1_align"
                                    :items="gyroAlignSelectItems"
                                    class="min-w-40"
                                    size="xs"
                                />
                            </SettingRow>
                            <!-- Gyro 1 custom angles -->
                            <AlignmentAngles
                                v-if="showGyro1Align && sensorAlignment.gyro_1_align === SENSOR_ALIGN_CUSTOM"
                                v-model:roll="sensorAlignment.gyro_1_align_roll"
                                v-model:pitch="sensorAlignment.gyro_1_align_pitch"
                                v-model:yaw="sensorAlignment.gyro_1_align_yaw"
                                label-prefix="configurationGyro1Alignment"
                                class="w-full"
                            />

                            <SettingRow v-if="showGyro2Align" :label="$t('configurationSensorAlignmentGyro2')">
                                <USelect
                                    v-model="sensorAlignment.gyro_2_align"
                                    :items="gyroAlignSelectItems"
                                    class="min-w-40"
                                    size="xs"
                                />
                            </SettingRow>
                            <!-- Gyro 2 custom angles -->
                            <AlignmentAngles
                                v-if="showGyro2Align && sensorAlignment.gyro_2_align === SENSOR_ALIGN_CUSTOM"
                                v-model:roll="sensorAlignment.gyro_2_align_roll"
                                v-model:pitch="sensorAlignment.gyro_2_align_pitch"
                                v-model:yaw="sensorAlignment.gyro_2_align_yaw"
                                label-prefix="configurationGyro2Alignment"
                                class="w-full"
                            />
                        </template>
                    </UiBox>

                    <!-- ACCELEROMETER -->
                    <UiBox v-if="hasAccSensor" :title="$t('sensorConfigAccelerometer')" type="neutral" collapsible>
                        <div
                            v-if="accNeedsCalibration"
                            class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[var(--warning-500)]/15 text-[var(--warning-700)] mb-2"
                        >
                            <UIcon name="i-lucide-alert-triangle" class="size-4 shrink-0" />
                            <span>{{ $t("sensorConfigAccNeedsCalibration") }}</span>
                        </div>
                        <UButton
                            :label="
                                calibratingAccel ? $t('initialSetupButtonCalibratingText') : $t('sensorConfigCalibrate')
                            "
                            :disabled="calibratingAccel"
                            :loading="calibratingAccel"
                            size="xs"
                            class="w-fit"
                            @click="onCalibrateAccel"
                        >
                            <template #trailing>
                                <HelpIcon :text="$t('sensorConfigAccCalibrateHelp')" />
                            </template>
                        </UButton>
                        <SettingRow :label="$t('configurationAccelTrimRoll')">
                            <UInputNumber
                                v-model="accelTrims.roll"
                                :step="1"
                                :min="-300"
                                :max="300"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('configurationAccelTrimPitch')">
                            <UInputNumber
                                v-model="accelTrims.pitch"
                                :step="1"
                                :min="-300"
                                :max="300"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                    </UiBox>
                </div>

                <!-- Right column: 3D Preview + Instruments -->
                <div class="sensor-right">
                    <UiBox :padding="false" class="sensor-model-box">
                        <div class="model-preview">
                            <div ref="modelWrapper" class="model-canvas-wrapper background_paper">
                                <canvas ref="modelCanvas" :aria-label="$t('sensorConfig3dPreview')"></canvas>
                                <div class="attitude-overlay">
                                    <dl>
                                        <dt>
                                            {{ $t(hasMagSensor ? "initialSetupMagHeading" : "initialSetupHeading") }}
                                        </dt>
                                        <dd>{{ attitudeDisplay.heading }}</dd>
                                        <dt>{{ $t("initialSetupPitch") }}</dt>
                                        <dd>{{ attitudeDisplay.pitch }}</dd>
                                        <dt>{{ $t("initialSetupRoll") }}</dt>
                                        <dd>{{ attitudeDisplay.roll }}</dd>
                                    </dl>
                                </div>
                                <UButton
                                    class="yaw-reset-btn"
                                    :label="$t('initialSetupButtonResetZaxisValue', { 1: yawFix })"
                                    color="neutral"
                                    variant="subtle"
                                    size="xs"
                                    @click="resetYaw"
                                />
                                <div class="instruments-right">
                                    <span ref="instrumentAttitude"></span>
                                    <span ref="instrumentHeading"></span>
                                    <span v-if="hasBaroSensor" ref="instrumentAltimeter"></span>
                                </div>
                            </div>
                        </div>
                    </UiBox>
                </div>
            </div>

            <!-- MAGNETOMETER (all mag items in one box) -->
            <UiBox
                v-if="showMagSection"
                :title="$t('sensorConfigMagnetometer')"
                type="neutral"
                collapsible
                class="mt-4"
            >
                <!-- Alignment -->
                <SettingRow v-if="showMagAlign" :label="$t('configurationMagAlignment')" fullWidth>
                    <USelect
                        v-model="sensorAlignment.align_mag"
                        :items="gyroAlignSelectItems"
                        class="min-w-40"
                        size="xs"
                        :aria-label="$t('configurationMagAlignment')"
                        :ui="{ viewport: 'max-h-none' }"
                    />
                    <UButton
                        v-if="calGuidedAvailable"
                        size="xs"
                        variant="outline"
                        :label="$t('configurationMagDetectAlignment')"
                        :disabled="alignDetectPhase === 'collecting'"
                        @click="startAlignDetection"
                    />
                </SettingRow>

                <!-- Mag alignment custom angles -->
                <AlignmentAngles
                    v-if="showMagAlign && sensorAlignment.align_mag === SENSOR_ALIGN_CUSTOM"
                    v-model:roll="sensorAlignment.mag_align_roll"
                    v-model:pitch="sensorAlignment.mag_align_pitch"
                    v-model:yaw="sensorAlignment.mag_align_yaw"
                    label-prefix="configurationMagAlignment"
                />

                <!-- Inline alignment detection (replaces dialog) -->
                <div v-if="alignDetectPhase !== 'idle'" class="align-detect-inline">
                    <!-- Collecting -->
                    <div v-if="alignDetectPhase === 'collecting'" class="flex items-center gap-3 flex-wrap">
                        <div class="flex-1 min-w-48">
                            <div class="mag-align-progress-bar">
                                <div
                                    class="mag-align-progress-fill"
                                    :style="{ width: alignDetectProgress + '%' }"
                                ></div>
                            </div>
                        </div>
                        <span class="text-xs text-[var(--surface-500)]">{{
                            $t("sensorConfigAlignSamples", { count: alignDetectSampleCount })
                        }}</span>
                        <span
                            v-if="
                                alignDetectTiltPercent < ALIGN_TILT_WARN_PERCENT &&
                                alignDetectSampleCount > ALIGN_TILT_WARN_MIN_SAMPLES
                            "
                            class="text-xs text-[var(--warning-500)]"
                        >
                            {{ $t("sensorConfigAlignTiltMore") }}
                        </span>
                        <UButton size="xs" variant="outline" :label="$t('cancel')" @click="cancelAlignDetection" />
                    </div>
                    <!-- Result -->
                    <div v-else-if="alignDetectPhase === 'result'" class="flex items-center gap-3 flex-wrap">
                        <span class="text-sm font-semibold text-[var(--primary-500)]">{{
                            alignDetectResult.label
                        }}</span>
                        <span :class="'text-xs font-medium confidence-' + alignDetectConfidenceLevel">
                            {{ alignDetectResult.confidence }}x {{ alignDetectConfidenceLevel }}
                        </span>
                        <UButton size="xs" :label="$t('magAlignmentApply')" @click="applyAlignDetection" />
                        <UButton
                            size="xs"
                            variant="outline"
                            :label="$t('magCalibrationRetry')"
                            @click="resetAlignDetection"
                        />
                    </div>
                    <!-- Error -->
                    <div v-else-if="alignDetectPhase === 'error'" class="flex items-center gap-3">
                        <span class="text-xs text-[var(--error-500)] font-medium">{{
                            $t("sensorConfigAlignDetectFailed")
                        }}</span>
                        <UButton
                            size="xs"
                            variant="outline"
                            :label="$t('magCalibrationRetry')"
                            @click="resetAlignDetection"
                        />
                    </div>
                </div>

                <!-- API >= 1.47: full mag cal UI (declination, cal editor, check, guided modes) -->
                <template v-if="calGuidedAvailable">
                    <!-- Declination auto-set note (API >= 1.46) -->
                    <div
                        v-if="isApi146 && declinationNote"
                        class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[var(--primary-500)]/10 text-[var(--primary-700)]"
                    >
                        <UIcon name="i-lucide-info" class="size-4 shrink-0" />
                        <span>{{ declinationNote }}</span>
                        <UButton
                            size="2xs"
                            variant="ghost"
                            icon="i-lucide-x"
                            :aria-label="$t('close')"
                            @click="dismissDeclinationNote"
                        />
                    </div>

                    <!-- Declination warning -->
                    <div
                        v-if="isApi146 && declinationWarning"
                        class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[var(--warning-500)]/15 text-[var(--warning-700)]"
                    >
                        <UIcon name="i-lucide-alert-triangle" class="size-4 shrink-0" />
                        <span>{{ declinationWarning }}</span>
                        <UButton
                            size="2xs"
                            variant="ghost"
                            icon="i-lucide-x"
                            :aria-label="$t('close')"
                            @click="dismissDeclinationWarning"
                        />
                    </div>

                    <!-- Declination + Inclination + Field Strength (API >= 1.46) -->
                    <div v-if="isApi146" class="flex items-end gap-4 flex-wrap">
                        <SettingColumn
                            :label="$t('configurationMagDeclination')"
                            :help="$t('configurationMagDeclinationHelp')"
                        >
                            <div class="flex items-center gap-2">
                                <UInputNumber
                                    v-model="magDeclination"
                                    :step="0.1"
                                    :min="-180"
                                    :max="180"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-20"
                                />
                                <UButton
                                    size="xs"
                                    variant="outline"
                                    :label="
                                        declinationWarning ? $t('sensorConfigMagUpdate') : $t('sensorConfigMagDetect')
                                    "
                                    :disabled="isFetchingDeclination"
                                    :loading="isFetchingDeclination"
                                    @click="autoSetDeclination"
                                />
                            </div>
                        </SettingColumn>
                        <SettingColumn
                            :label="$t('configurationMagInclination')"
                            :help="$t('configurationMagInclinationHelp')"
                        >
                            <UInput
                                :model-value="magInclination !== null ? magInclination + '°' : '—'"
                                disabled
                                size="xs"
                                class="w-20"
                            />
                        </SettingColumn>
                        <SettingColumn
                            :label="$t('configurationMagFieldStrengthLabel')"
                            :help="$t('configurationMagFieldStrengthHelp')"
                        >
                            <UInput
                                :model-value="magFieldStrength !== null ? magFieldStrength + ' nT' : '—'"
                                disabled
                                size="xs"
                                class="w-24"
                            />
                        </SettingColumn>
                    </div>

                    <!-- Mag calibration needed note -->
                    <div
                        v-if="magNeedsCalibration"
                        class="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[var(--warning-500)]/15 text-[var(--warning-700)]"
                    >
                        <UIcon name="i-lucide-alert-triangle" class="size-4 shrink-0" />
                        <span>{{ $t("sensorConfigMagNeedsCalibration") }}</span>
                    </div>

                    <!-- Editable cal offset values -->
                    <MagCalOffsetEditor
                        :offsets="cal.firmwareOffsets"
                        :saving="isSavingCal"
                        show-save
                        @save="saveCalValues"
                    />

                    <!-- Calibrate Magnetometer (inline) -->
                    <div class="mag-cal-section">
                        <!-- Idle: check + calibrate buttons -->
                        <div v-if="cal.phase === 'idle'" class="flex flex-col gap-2">
                            <div class="flex items-center gap-2">
                                <UButton
                                    size="xs"
                                    variant="outline"
                                    icon="i-lucide-eye"
                                    :label="$t('magCalibrationCheck')"
                                    @click="startCheckMode()"
                                />
                                <UFieldGroup size="xs" orientation="horizontal" class="flex!">
                                    <UButton size="xs" :label="$t('sensorConfigCalibrate')" @click="startGuidedCal()">
                                        <template #trailing>
                                            <HelpIcon :text="$t('initialSetupCalibrateMagText')" />
                                        </template>
                                    </UButton>
                                    <UDropdownMenu
                                        v-slot="{ open }"
                                        :items="calModeItems"
                                        :content="{ align: 'start' }"
                                    >
                                        <UButton
                                            size="xs"
                                            :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                                            :aria-label="$t('magCalibrationModeOptions')"
                                            :title="$t('magCalibrationModeOptions')"
                                            square
                                        />
                                    </UDropdownMenu>
                                </UFieldGroup>
                            </div>
                        </div>

                        <!-- Calibrating -->
                        <div v-else-if="calIsCalibrating" class="mag-cal-inline-layout">
                            <div class="mag-cal-inline-steps">
                                <template v-if="calIsGuided">
                                    <div class="mag-cal-step-counter">{{ $t("magCalibrationGuidedFwTitle") }}</div>
                                    <p class="text-sm text-[var(--surface-600)] text-center my-2">
                                        {{ $t(CAL_PROMPTS[calCurrentPrompt].i18n) }}
                                    </p>
                                    <p
                                        v-if="guidedSecondsRemaining > 0"
                                        class="text-lg font-bold text-center tabular-nums"
                                    >
                                        {{ guidedSecondsRemaining }}s
                                    </p>
                                    <p
                                        v-if="guidedSecondsRemaining === 0"
                                        class="text-xs font-semibold quality-good text-center"
                                    >
                                        {{ $t("magCalibrationGuidedDone") }}
                                    </p>
                                </template>
                                <template v-else-if="cal.mode === 'full'">
                                    <div class="mag-cal-step-counter">
                                        {{ $t("magCalibrationFullTitle") }} —
                                        {{
                                            $t("magCalibrationFullStepCounter", {
                                                n: fullCalStep + 1,
                                                total: CAL_FULL_STEPS.length,
                                            })
                                        }}
                                    </div>
                                    <p class="text-sm font-semibold text-center mt-2">
                                        {{ $t(CAL_FULL_STEPS[fullCalStep]) }}
                                    </p>
                                    <p class="text-xs text-[var(--surface-500)] text-center mb-1">
                                        {{ $t("magCalibrationFullInstruction") }}
                                    </p>
                                    <p v-if="cal.coverage" class="text-lg font-bold text-center tabular-nums">
                                        {{
                                            $t("magCalibrationFullZones", {
                                                covered: cal.coverage.covered ?? 0,
                                                total: cal.coverage.totalFaces ?? 20,
                                            })
                                        }}
                                    </p>
                                </template>
                                <template v-else-if="cal.mode === 'check'">
                                    <div class="mag-cal-step-counter">{{ $t("magCalibrationCheckTitle") }}</div>
                                    <p class="text-sm text-[var(--surface-600)] text-center my-2">
                                        {{ $t("magCalibrationCheckInstruction") }}
                                    </p>
                                </template>
                                <template v-else-if="cal.mode === 'guided'">
                                    <div class="mag-cal-step-counter">{{ $t("magCalibrationGuidedTitle") }}</div>
                                    <p class="text-sm text-[var(--surface-600)] text-center my-2">
                                        {{ $t("magCalibrationGuidedInstruction") }}
                                    </p>
                                </template>
                                <template v-else>
                                    <div class="mag-cal-step-counter">{{ $t("magCalibrationUnguidedTitle") }}</div>
                                    <p class="text-sm text-[var(--surface-600)] text-center my-2">
                                        {{ $t("magCalibrationUnguidedInstruction") }}
                                    </p>
                                    <p
                                        v-if="cal.firmwareSecondsRemaining >= 0 && !cal.firmwareDone"
                                        class="text-lg font-bold text-center tabular-nums"
                                    >
                                        {{ cal.firmwareSecondsRemaining }}s
                                    </p>
                                    <p v-if="cal.firmwareDone" class="text-xs font-semibold quality-good text-center">
                                        {{ $t("magCalibrationUnguidedDone") }}
                                    </p>
                                </template>
                                <dl
                                    v-if="cal.mode !== 'check' && cal.mode !== 'full' && cal.sphereFitResult"
                                    class="mag-cal-stats-inline"
                                >
                                    <dt>{{ $t("magCalibrationSphereOffsets") }}</dt>
                                    <dd>{{ calOffsetsText }}</dd>
                                    <dt>{{ $t("magCalibrationResidual") }}</dt>
                                    <dd>{{ calResidualText }}</dd>
                                </dl>
                                <div v-if="cal.mode !== 'check'" class="mag-cal-progress-bar">
                                    <div class="mag-cal-progress-fill" :style="{ width: cal.progress + '%' }"></div>
                                </div>
                                <div v-if="cal.quality" class="text-xs font-semibold text-center">
                                    <span :class="'quality-' + cal.quality"
                                        >{{ $t(CAL_QUALITY_KEY[cal.quality]) }} ({{ cal.qualityScore }}%)</span
                                    >
                                </div>
                                <div class="flex gap-2 justify-center mt-1">
                                    <UButton
                                        size="xs"
                                        variant="outline"
                                        :label="$t('magCalibrationCancel')"
                                        @click="cancelMagCal()"
                                    />
                                    <UButton
                                        size="xs"
                                        variant="ghost"
                                        :label="$t('magCalibrationClear')"
                                        :disabled="cal.sampleCount === 0"
                                        @click="clearMagCalSamples()"
                                    />
                                    <UButton
                                        v-if="cal.mode === 'guided' || cal.mode === 'full'"
                                        size="xs"
                                        :loading="isAcceptingCal"
                                        :disabled="cal.mode === 'full' ? !fullReady : !cal.quality"
                                        :label="
                                            cal.mode === 'full'
                                                ? $t('magCalibrationFullCompute')
                                                : $t('magCalibrationAccept')
                                        "
                                        @click="acceptGuidedMagCal()"
                                    />
                                </div>
                                <div class="mag-cal-live-inline">
                                    <span v-if="cal.mode !== 'check'"
                                        >{{ $t("magCalibrationSamples") }}: {{ cal.sampleCount }}</span
                                    >
                                    <span>X: {{ cal.liveMag.x }}</span>
                                    <span>Y: {{ cal.liveMag.y }}</span>
                                    <span>Z: {{ cal.liveMag.z }}</span>
                                    <span>Field: {{ cal.liveFieldStrength }}</span>
                                </div>
                            </div>
                            <div class="mag-cal-inline-sphere">
                                <div class="mag-viz-mode-selector">
                                    <UButton
                                        v-for="m in MAG_VIZ_MODES"
                                        :key="m.value"
                                        size="xs"
                                        variant="ghost"
                                        :icon="m.icon"
                                        :class="{ 'mag-viz-active': magVizMode === m.value }"
                                        :aria-label="$t(m.label)"
                                        :title="$t(m.label)"
                                        square
                                        @click="magVizMode = m.value"
                                    />
                                </div>
                                <MagSphereView
                                    :samples="cal.samples"
                                    :sample-count="cal.sampleCount"
                                    :sphere-fit="cal.sphereFitResult"
                                    :active="true"
                                    :live-mag="cal.liveMag"
                                    :inclination="magInclination"
                                    :coverage="cal.coverage"
                                    :attitude="attitudeRaw"
                                    :quaternion="attitudeQuaternion"
                                    :viz-mode="magVizMode"
                                    :cal-offsets="cal.firmwareOffsets"
                                />
                            </div>
                        </div>

                        <!-- Complete -->
                        <div v-else-if="cal.phase === 'complete'" class="mag-cal-inline-layout">
                            <div class="mag-cal-inline-steps">
                                <p class="text-sm font-semibold quality-good mb-2">
                                    {{ $t("magCalibrationComplete") }}
                                </p>
                                <dl v-if="!calIsFull" class="mag-cal-stats-inline">
                                    <dt>{{ $t("magCalibrationFirmwareOffsets") }}</dt>
                                    <dd>{{ calFirmwareOffsetsText }}</dd>
                                    <dt>{{ $t("magCalibrationSphereOffsets") }}</dt>
                                    <dd>{{ calOffsetsText }}</dd>
                                    <dt>{{ $t("magCalibrationSamples") }}</dt>
                                    <dd>{{ cal.sampleCount }}</dd>
                                    <dt>{{ $t("magCalibrationResidual") }}</dt>
                                    <dd>{{ calResidualText }}</dd>
                                    <dt>{{ $t("magCalibrationQuality") }}</dt>
                                    <dd>
                                        <span v-if="cal.quality" :class="'quality-' + cal.quality"
                                            >{{ $t(CAL_QUALITY_KEY[cal.quality]) }} ({{ cal.qualityScore }}%)</span
                                        >
                                        <span v-else>&mdash;</span>
                                    </dd>
                                </dl>
                                <template v-if="calIsFull">
                                    <dl
                                        v-if="fullCalResult"
                                        class="mag-cal-stats-inline mt-2 border-t border-[var(--border-default)] pt-2"
                                    >
                                        <dt>{{ $t("magCalibrationFullAlignment") }}</dt>
                                        <dd>
                                            {{ fullCalResult.label }}
                                            <template v-if="fullCalResult.preset === 9">
                                                ({{
                                                    $t("magCalibrationFullCustomAngles", {
                                                        roll: fullCalResult.euler_zyx_deg.roll.toFixed(1),
                                                        pitch: fullCalResult.euler_zyx_deg.pitch.toFixed(1),
                                                        yaw: fullCalResult.euler_zyx_deg.yaw.toFixed(1),
                                                    })
                                                }})
                                            </template>
                                        </dd>
                                        <dt>{{ $t("magCalibrationFullOffsets") }}</dt>
                                        <dd>
                                            {{ fullCalResult.offsets.x }}, {{ fullCalResult.offsets.y }},
                                            {{ fullCalResult.offsets.z }}
                                        </dd>
                                        <dt>{{ $t("magCalibrationFullResidual") }}</dt>
                                        <dd>{{ fullCalResult.quality?.meanResidualDeg?.toFixed(1) ?? "—" }}&deg;</dd>
                                        <dt>{{ $t("magCalibrationFullCoverage") }}</dt>
                                        <dd>
                                            {{
                                                cal.coverage
                                                    ? cal.coverage.covered + "/" + cal.coverage.totalFaces
                                                    : "—"
                                            }}
                                            ({{ cal.sampleCount }} {{ $t("magCalibrationSamples").toLowerCase() }})
                                        </dd>
                                    </dl>
                                    <div class="flex gap-2 justify-center mt-3" v-if="fullCalResult">
                                        <UButton
                                            size="xs"
                                            variant="outline"
                                            :label="$t('magCalibrationFullCopyCli')"
                                            @click="copyFullCalCli"
                                        />
                                        <UButton
                                            size="xs"
                                            :label="$t('magCalibrationFullApply')"
                                            @click="applyFullCal"
                                            :disabled="isSavingCal"
                                            :loading="isSavingCal"
                                        />
                                        <UButton
                                            size="xs"
                                            variant="outline"
                                            :label="$t('magCalibrationFullExport')"
                                            @click="exportFullCalModel"
                                        />
                                    </div>
                                </template>
                                <div class="flex gap-2 justify-center mt-3">
                                    <UButton
                                        size="xs"
                                        variant="outline"
                                        :label="$t('magCalibrationRetry')"
                                        @click="retryAndStartMagCal()"
                                    />
                                    <UButton size="xs" variant="outline" :label="$t('close')" @click="retryMagCal()" />
                                </div>
                            </div>
                            <div class="mag-cal-inline-sphere">
                                <div class="mag-viz-mode-selector">
                                    <UButton
                                        v-for="m in MAG_VIZ_MODES"
                                        :key="m.value"
                                        size="xs"
                                        variant="ghost"
                                        :icon="m.icon"
                                        :class="{ 'mag-viz-active': magVizMode === m.value }"
                                        :aria-label="$t(m.label)"
                                        :title="$t(m.label)"
                                        square
                                        @click="magVizMode = m.value"
                                    />
                                </div>
                                <MagSphereView
                                    :samples="cal.samples"
                                    :sample-count="cal.sampleCount"
                                    :sphere-fit="cal.sphereFitResult"
                                    :active="false"
                                    :inclination="magInclination"
                                    :coverage="cal.coverage"
                                    :attitude="attitudeRaw"
                                    :quaternion="attitudeQuaternion"
                                    :viz-mode="magVizMode"
                                    :cal-offsets="cal.firmwareOffsets"
                                />
                            </div>
                        </div>

                        <!-- Error -->
                        <div v-else-if="cal.phase === 'error'" class="flex items-center gap-3">
                            <span class="text-sm text-[var(--error-500)] font-semibold">{{
                                $t(cal.statusMessage || "magCalibrationError")
                            }}</span>
                            <UButton
                                size="xs"
                                variant="outline"
                                :label="$t('magCalibrationRetry')"
                                @click="retryAndStartMagCal()"
                            />
                            <UButton
                                size="xs"
                                variant="ghost"
                                :label="$t('magCalibrationCancel')"
                                @click="retryMagCal()"
                            />
                        </div>
                    </div>
                </template>

                <!-- API < 1.47: legacy firmware calibrate button only -->
                <template v-else>
                    <UButton
                        size="xs"
                        class="w-fit"
                        :label="$t('sensorConfigCalibrate')"
                        @click="startLegacyFirmwareCal()"
                    >
                        <template #trailing>
                            <HelpIcon :text="$t('initialSetupCalibrateMagText')" />
                        </template>
                    </UButton>
                </template>
            </UiBox>

            <!-- LIVE SENSOR DATA -->
            <UiBox :title="$t('sensorConfigLiveData')" type="neutral" collapsible class="mt-4">
                <template #title>
                    <UButton
                        v-if="showLiveSensors"
                        icon="i-lucide-square"
                        :aria-label="$t('sensorConfigLiveStop')"
                        size="2xs"
                        variant="ghost"
                        color="error"
                        class="ml-1"
                        @click.stop="showLiveSensors = false"
                    />
                </template>
                <LiveSensorPanel v-if="showLiveSensors" />
                <UButton
                    v-else
                    :label="$t('sensorConfigShowLiveData')"
                    size="xs"
                    class="w-fit"
                    @click="showLiveSensors = true"
                />
            </UiBox>

            <div class="content_toolbar toolbar_fixed_bottom">
                <UButton
                    :label="$t('configurationButtonSave')"
                    :disabled="!dirty"
                    :loading="isSaving"
                    @click="saveConfig"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import semver from "semver";
import { useFlightControllerStore } from "@/stores/fc";
import { useNavigationStore } from "@/stores/navigation";
import { useReboot } from "@/composables/useReboot";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper.js";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "../../js/data_storage";
import { have_sensor } from "../../js/sensor_helpers";
import { bit_check, bit_set, bit_clear } from "../../js/bit";
import { sensorTypes } from "../../js/sensor_types";
import { useMagCalibration, computeDeclination, getGeoReference } from "../../composables/useMagCalibration";
import { isMspCliSupported } from "../../composables/useMspCliSession";
import { detectAlignment } from "../../js/utils/magAlignment";
import {
    characterizeTumble,
    currentMatrixOf,
    isFirmwareCustomMagAlignCapable,
    MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN,
} from "../../js/utils/magCharacterizationCompute";
import { buildCharacterizationModel } from "../../js/utils/magModelExport";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { useTimeout } from "../../composables/useTimeout";
import { useInterval } from "../../composables/useInterval";
import Model from "../../js/model";
import GUI from "../../js/gui";
import { flightIndicator } from "../../../libraries/flightIndicators";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";
import SettingColumn from "../elements/SettingColumn.vue";
import AlignmentAngles from "../elements/AlignmentAngles.vue";
import HelpIcon from "../elements/HelpIcon.vue";
import WikiButton from "../elements/WikiButton.vue";
import MagSphereView from "../dialogs/mag-calibration/MagSphereView.vue";
import MagCalOffsetEditor from "../dialogs/mag-calibration/MagCalOffsetEditor.vue";
import LiveSensorPanel from "./sensors/LiveSensorPanel.vue";

const fcStore = useFlightControllerStore();
const navigationStore = useNavigationStore();
const { reboot } = useReboot();

const isSaving = ref(false);
const isMounted = ref(true);

// --- Constants ---
const SENSOR_ALIGN_CUSTOM = 9;
const GPS_COORD_SCALE = 1e7;
const IP_GEOLOCATION_URL = "https://ipapi.co/json/";
const IP_GEOLOCATION_TIMEOUT_MS = 10000;
const ACC_CALIBRATION_TIMEOUT_MS = 2000;
const ACC_NEEDS_CALIBRATION_BIT = 0;
const ATTITUDE_POLL_MS = 33;
const CONFIDENCE_HIGH = 5;
const CONFIDENCE_MEDIUM = 2;
const ALIGN_TILT_WARN_PERCENT = 30;
const ALIGN_TILT_WARN_MIN_SAMPLES = 20;
const IP_GEOLOCATION_CONSENT_KEY = "preflight_ip_geolocation_consent";

const isApi148 = computed(() => fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_48));
const isApi147 = computed(() => fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_47));
const isApi146 = computed(() => fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_46));

function roundOneDp(val) {
    return Math.round(val * 10) / 10;
}

onUnmounted(() => {
    isMounted.value = false;
    removeAllIntervals();
    disposeModel();
    alignDetectPhase.value = "idle";
    cleanupAlignDetection();
    clearPromptTimer();
    clearGuidedCountdown();
    clearFullStepTimer();
    if (calIsCalibrating.value) {
        cal.cancelCalibration();
    }
});

// --- Sensor Hardware ---

const sensorConfig = reactive({
    acc_hardware: 0,
    baro_hardware: 0,
    mag_hardware: 0,
    sonar_hardware: 0,
    opticalflow_hardware: 0,
});

const accHardwareEnabled = computed({
    get: () => sensorConfig.acc_hardware !== 1,
    set: (val) => {
        sensorConfig.acc_hardware = val ? 0 : 1;
    },
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

const sonarTypesList = ref([]);
const opticalFlowTypesList = ref([]);

const sonarHardwareEnabled = computed({
    get: () => sensorConfig.sonar_hardware !== 0,
    set: (val) => {
        sensorConfig.sonar_hardware = val ? 1 : 0;
    },
});

const opticalFlowHardwareEnabled = computed({
    get: () => sensorConfig.opticalflow_hardware !== 0,
    set: (val) => {
        sensorConfig.opticalflow_hardware = val ? 1 : 0;
    },
});

const showRangefinder = ref(false);
const showOpticalFlow = ref(false);

// --- Board Alignment ---

const boardAlignment = reactive({
    roll: 0,
    pitch: 0,
    yaw: 0,
});

// --- Accelerometer Trim ---

const accelTrims = reactive({
    roll: 0,
    pitch: 0,
});

// --- Gyro / IMU ---

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
    gyro_align: [],
    gyro_enable_mask: 0,
    gyro_align_roll: [],
    gyro_align_pitch: [],
    gyro_align_yaw: [],
});

const hasSecondGyro = ref(false);
const hasDualGyros = ref(false);
const showMultiGyro = ref(false);
const showGyro1Align = ref(false);
const showGyro2Align = ref(false);
const showMagAlign = ref(false);

const sensorTypesData = ref(null);

const gyroHwName = ref("");
const accHwName = ref("");
const baroHwName = ref("");
const magHwName = ref("");

function resolveSensorNames() {
    const types = sensorTypesData.value;
    const active = fcStore.sensorConfigActive;
    if (!types || !active) {
        return;
    }

    function resolve(sensorKey, typeKey) {
        const hw = active[sensorKey];
        if (hw === undefined || hw === 0xff) {
            return "";
        }
        const name = types[typeKey]?.elements?.[hw];
        if (!name || name === "AUTO" || name === "DEFAULT" || name === "NONE") {
            return "";
        }
        return name;
    }

    if (!isApi147.value) {
        gyroHwName.value = resolve("gyro_hardware", "gyro");
    }
    accHwName.value = resolve("acc_hardware", "acc");
    baroHwName.value = resolve("baro_hardware", "baro");
    magHwName.value = resolve("mag_hardware", "mag");
}

const showGyroToUse = computed(() => {
    return !isApi147.value;
});

const showSensorAlignment = computed(() => {
    return showGyro1Align.value || showGyro2Align.value;
});

const GYRO_DETECTION_FLAGS = {
    DETECTED_GYRO_2: 1 << 1,
    DETECTED_DUAL_GYROS: 1 << 7,
};

const gyroList = computed(() => {
    if (!showMultiGyro.value) {
        return [];
    }

    const types = sensorTypesData.value?.gyro?.elements || [];
    const detectedHardware = fcStore.gyroSensor?.gyro_hardware || [];
    const count = detectedHardware.length;
    if (count === 0) {
        return [];
    }

    const gyros = [];
    for (let i = 0; i < count; i++) {
        const hardwareResult = detectedHardware[i];
        if (
            hardwareResult === undefined ||
            types[hardwareResult] === "AUTO" ||
            types[hardwareResult] === "NONE" ||
            types[hardwareResult] === "DEFAULT"
        ) {
            continue;
        }

        gyros.push({
            index: i,
            name: types[hardwareResult],
            enabled: bit_check(sensorAlignment.gyro_enable_mask, i),
        });
    }
    return gyros;
});

function toggleGyro(index, enabled) {
    if (enabled) {
        sensorAlignment.gyro_enable_mask = bit_set(sensorAlignment.gyro_enable_mask, index);
    } else {
        const nextMask = bit_clear(sensorAlignment.gyro_enable_mask, index);
        if (nextMask === 0 && isApi147.value) {
            gui_log(i18n.getMessage("configurationGyroRequired"));
            return;
        }
        sensorAlignment.gyro_enable_mask = nextMask;
    }
}

const gyroToUseSelectItems = computed(() => {
    const items = [{ label: i18n.getMessage("configurationSensorGyroToUseFirst"), value: 0 }];
    if (hasSecondGyro.value) {
        items.push({ label: i18n.getMessage("configurationSensorGyroToUseSecond"), value: 1 });
    }
    if (hasDualGyros.value) {
        items.push({ label: i18n.getMessage("configurationSensorGyroToUseBoth"), value: 2 });
    }
    return items;
});

const SENSOR_ALIGNMENTS = [
    "CW 0\u00B0",
    "CW 90\u00B0",
    "CW 180\u00B0",
    "CW 270\u00B0",
    "CW 0\u00B0 flip",
    "CW 90\u00B0 flip",
    "CW 180\u00B0 flip",
    "CW 270\u00B0 flip",
    i18n.getMessage("configurationSensorAlignmentCustom"),
];

const gyroAlignSelectItems = computed(() => {
    const items = [{ label: i18n.getMessage("configurationSensorAlignmentDefaultOption"), value: 0 }];
    SENSOR_ALIGNMENTS.forEach((label, idx) => {
        items.push({ label, value: idx + 1 });
    });
    return items;
});

// --- Inline Alignment Detection (replaces dialog) ---

const ALIGN_POLL_MS = 100;
const ALIGN_TARGET_SAMPLES = 150;
const ALIGN_TIMEOUT_MS = 15000;
const ALIGN_MOVEMENT_THRESHOLD = 5;
const ALIGN_TILT_THRESHOLD_DEG = 15;

const alignDetectPhase = ref("idle"); // idle | collecting | result | error
const alignDetectProgress = ref(0);
const alignDetectSampleCount = ref(0);
const alignDetectResult = ref(null);
const alignDetectTiltPercent = ref(0);

let alignSamples = [];
let alignImuTimeout = null;
let alignAttTimeout = null;
let alignMovementInterval = null;
let alignLastMag = null;
let alignLastMovement = 0;
let alignCurrentRoll = 0;
let alignCurrentPitch = 0;
let alignTiltedCount = 0;

const alignDetectConfidenceLevel = computed(() => {
    if (!alignDetectResult.value) {
        return "none";
    }
    if (alignDetectResult.value.confidence >= CONFIDENCE_HIGH) {
        return "high";
    }
    if (alignDetectResult.value.confidence > CONFIDENCE_MEDIUM) {
        return "medium";
    }
    return "low";
});

function startAlignDetection() {
    alignSamples = [];
    alignDetectSampleCount.value = 0;
    alignDetectProgress.value = 0;
    alignDetectResult.value = null;
    alignLastMag = null;
    alignLastMovement = Date.now();
    alignCurrentRoll = fcStore.sensorData.kinematics[0];
    alignCurrentPitch = fcStore.sensorData.kinematics[1];
    alignTiltedCount = 0;
    alignDetectTiltPercent.value = 0;
    alignDetectPhase.value = "collecting";

    function pollAtt() {
        if (!isMounted.value || alignDetectPhase.value !== "collecting") {
            return;
        }
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {
            if (!isMounted.value || alignDetectPhase.value !== "collecting") {
                return;
            }
            alignCurrentRoll = fcStore.sensorData.kinematics[0];
            alignCurrentPitch = fcStore.sensorData.kinematics[1];
            alignAttTimeout = setTimeout(pollAtt, ALIGN_POLL_MS);
        });
    }

    function pollImu() {
        if (!isMounted.value || alignDetectPhase.value !== "collecting") {
            return;
        }
        MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, () => {
            onAlignImuData();
            if (isMounted.value && alignDetectPhase.value === "collecting") {
                alignImuTimeout = setTimeout(pollImu, ALIGN_POLL_MS);
            }
        });
    }

    pollAtt();
    pollImu();

    alignMovementInterval = setInterval(() => {
        if (Date.now() - alignLastMovement > ALIGN_TIMEOUT_MS) {
            cleanupAlignDetection();
            alignDetectPhase.value = "error";
        }
    }, 1000);
}

function onAlignImuData() {
    if (alignDetectPhase.value !== "collecting") {
        return;
    }

    const mx = fcStore.sensorData.magnetometer[0];
    const my = fcStore.sensorData.magnetometer[1];
    const mz = fcStore.sensorData.magnetometer[2];
    if (mx === 0 && my === 0 && mz === 0) {
        return;
    }

    if (
        alignLastMag === null ||
        Math.abs(mx - alignLastMag[0]) > ALIGN_MOVEMENT_THRESHOLD ||
        Math.abs(my - alignLastMag[1]) > ALIGN_MOVEMENT_THRESHOLD ||
        Math.abs(mz - alignLastMag[2]) > ALIGN_MOVEMENT_THRESHOLD
    ) {
        alignLastMovement = Date.now();
    }
    alignLastMag = [mx, my, mz];

    alignSamples.push({ mag: [mx, my, mz], roll: alignCurrentRoll, pitch: alignCurrentPitch });
    alignDetectSampleCount.value = alignSamples.length;

    const tilt = Math.hypot(alignCurrentRoll, alignCurrentPitch);
    if (tilt > ALIGN_TILT_THRESHOLD_DEG) {
        alignTiltedCount++;
    }
    alignDetectTiltPercent.value =
        alignSamples.length > 0 ? Math.round((alignTiltedCount / alignSamples.length) * 100) : 0;

    alignDetectProgress.value = Math.min(100, Math.round((alignSamples.length / ALIGN_TARGET_SAMPLES) * 100));

    if (alignSamples.length >= ALIGN_TARGET_SAMPLES) {
        finishAlignDetection();
    }
}

function finishAlignDetection() {
    cleanupAlignDetection();

    const customAngles =
        sensorAlignment.align_mag === SENSOR_ALIGN_CUSTOM
            ? {
                roll: sensorAlignment.mag_align_roll,
                pitch: sensorAlignment.mag_align_pitch,
                yaw: sensorAlignment.mag_align_yaw,
            }
            : null;

    const detection = detectAlignment(alignSamples, sensorAlignment.align_mag, customAngles);
    if (detection.error) {
        alignDetectPhase.value = "error";
        return;
    }

    alignDetectResult.value = detection;
    alignDetectPhase.value = "result";
}

function cancelAlignDetection() {
    cleanupAlignDetection();
    alignDetectPhase.value = "idle";
}

function applyAlignDetection() {
    if (alignDetectResult.value) {
        sensorAlignment.align_mag = alignDetectResult.value.alignment;
    }
    resetAlignDetection();
}

function resetAlignDetection() {
    alignDetectPhase.value = "idle";
    alignDetectResult.value = null;
    alignDetectProgress.value = 0;
    alignDetectSampleCount.value = 0;
}

function cleanupAlignDetection() {
    if (alignImuTimeout !== null) {
        clearTimeout(alignImuTimeout);
        alignImuTimeout = null;
    }
    if (alignAttTimeout !== null) {
        clearTimeout(alignAttTimeout);
        alignAttTimeout = null;
    }
    if (alignMovementInterval !== null) {
        clearInterval(alignMovementInterval);
        alignMovementInterval = null;
    }
}

// --- Magnetometer ---

const magDeclination = ref(0);
const magInclination = ref(null);
const magFieldStrength = ref(null);
const showMagSection = ref(false);
const hasMagSensor = ref(false);
const magNeedsCalibration = ref(false);
const isFetchingDeclination = ref(false);
const declinationWarning = ref("");
const declinationNote = ref("");

function dismissDeclinationWarning() {
    declinationWarning.value = "";
}

function dismissDeclinationNote() {
    declinationNote.value = "";
}

/**
 * Acquire GPS coordinates from flight controller or IP geolocation.
 * @param {boolean} promptConsent - If true, prompt user for IP geolocation consent when no GPS fix.
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
async function acquireCoordinates(promptConsent) {
    const gps = await gpsCoordinates();
    return gps ?? ipCoordinates(promptConsent);
}

// A live GPS fix from the flight controller, or null if there's no fix.
async function gpsCoordinates() {
    try {
        await MSP.promise(MSPCodes.MSP_RAW_GPS);
        if (fcStore.gpsData?.fix) {
            return {
                lat: fcStore.gpsData.latitude / GPS_COORD_SCALE,
                lon: fcStore.gpsData.longitude / GPS_COORD_SCALE,
            };
        }
    } catch {
        // GPS not available
    }
    return null;
}

// IP geolocation (consent-gated), or null. The caller decides when to attempt it,
// so the consent prompt only appears when there is genuinely no GPS fix.
async function ipCoordinates(promptConsent) {
    const hasConsent = !!getConfig(IP_GEOLOCATION_CONSENT_KEY)[IP_GEOLOCATION_CONSENT_KEY];
    if (!hasConsent) {
        if (!promptConsent) {
            return null;
        }
        const allowed = confirm(i18n.getMessage("preflightIpConsentMessage"));
        if (!allowed) {
            return null;
        }
        setConfig({ [IP_GEOLOCATION_CONSENT_KEY]: true });
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), IP_GEOLOCATION_TIMEOUT_MS);
        const response = await fetch(IP_GEOLOCATION_URL, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        const lat = Number.parseFloat(data.latitude);
        const lon = Number.parseFloat(data.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }
        return { lat, lon };
    } catch {
        return null;
    }
}

function applyDetectedDeclination(detected) {
    if (magDeclination.value === 0 && detected !== 0) {
        magDeclination.value = detected;
        declinationNote.value = i18n.getMessage("sensorConfigDeclinationAutoSet", { value: detected });
    } else if (magDeclination.value !== 0 && Math.abs(magDeclination.value - detected) > 1) {
        declinationWarning.value = i18n.getMessage("sensorConfigDeclinationDrift", {
            saved: magDeclination.value,
            detected,
        });
    }
}

async function tryAutoGeoReference() {
    const coords = await acquireCoordinates(false);
    if (!coords) {
        return;
    }

    const result = computeDeclination(coords.lat, coords.lon);
    if (!result) {
        return;
    }
    magInclination.value = roundOneDp(result.inclination);
    magFieldStrength.value = result.fieldStrength;
    applyDetectedDeclination(roundOneDp(result.declination));
}

// Resolve the best geomagnetic reference (cached, else GPS, else IP) and reflect its
// inclination + field strength in the reactive panel state. The magSphere field-
// direction arrow binds to magInclination, so this makes the arrow appear for BOTH
// GPS and IP sources, consistently and live. Returns the reference or null.
async function resolveGeoReference(promptConsent) {
    // No movement during capture, so a single fix suffices. Prefer a live GPS fix:
    // it overwrites any earlier IP snapshot. Otherwise reuse the cached reference
    // (last good value); fall back to IP geolocation only when there's nothing
    // better — so IP is never fetched or prompted while GPS is available.
    const gps = await gpsCoordinates();
    let geo = gps ? computeDeclination(gps.lat, gps.lon) : getGeoReference();
    if (!geo) {
        const ip = await ipCoordinates(promptConsent);
        if (ip) {
            geo = computeDeclination(ip.lat, ip.lon);
        }
    }
    if (geo) {
        magInclination.value = roundOneDp(geo.inclination);
        magFieldStrength.value = geo.fieldStrength;
    }
    return geo;
}

async function autoSetDeclination() {
    if (isFetchingDeclination.value) {
        return;
    }
    isFetchingDeclination.value = true;
    try {
        const coords = await acquireCoordinates(true);
        if (!coords) {
            gui_log(i18n.getMessage("configurationMagDeclinationNoGps"));
            return;
        }

        const result = computeDeclination(coords.lat, coords.lon);
        if (!result) {
            gui_log(i18n.getMessage("configurationMagDeclinationNoGps"));
            return;
        }
        magDeclination.value = roundOneDp(result.declination);
        magInclination.value = roundOneDp(result.inclination);
        magFieldStrength.value = result.fieldStrength;
        declinationWarning.value = "";
        gui_log(i18n.getMessage("configurationMagDeclinationSet", { declination: magDeclination.value }));
    } finally {
        isFetchingDeclination.value = false;
    }
}

// --- Inline Mag Calibration (replaces dialog) ---

const cal = reactive(useMagCalibration());
const calIsGuided = ref(false);
const calIsFull = ref(false);
const fullCalResult = ref(null);

// Guided choreography for the full tumble — each step is one full rotation about a
// different axis, which together light up all 20 coverage zones.
const CAL_FULL_STEPS = [
    "magCalibrationFullStep1",
    "magCalibrationFullStep2",
    "magCalibrationFullStep3",
    "magCalibrationFullStep4",
    "magCalibrationFullStep5",
    "magCalibrationFullStep6",
    "magCalibrationFullStep7",
    "magCalibrationFullStep8",
];
const FULL_STEP_DURATION_MS = 9000;
const FULL_READY_FRACTION = 0.8; // 16 of 20 zones before "Compute" is allowed
const fullCalStep = ref(0);
let fullStepTimer = null;

// "Compute" is enabled only once enough zones are covered — clicking earlier would
// just be refused by the planar/coverage gate, so the button stays disabled until then.
const FULL_MIN_SAMPLES = 40;
const fullReady = computed(
    () => cal.sampleCount >= FULL_MIN_SAMPLES && (cal.coverage?.fraction ?? 0) >= FULL_READY_FRACTION,
);

function startFullStepTimer() {
    clearFullStepTimer();
    fullCalStep.value = 0;
    fullStepTimer = setInterval(() => {
        if (fullCalStep.value < CAL_FULL_STEPS.length - 1) {
            fullCalStep.value++;
        } else {
            clearFullStepTimer();
        }
    }, FULL_STEP_DURATION_MS);
}

function clearFullStepTimer() {
    if (fullStepTimer !== null) {
        clearInterval(fullStepTimer);
        fullStepTimer = null;
    }
}
const calCurrentPrompt = ref(0);
const guidedSecondsRemaining = ref(-1);
let promptTimer = null;
let guidedCountdownTimer = null;
const calGeoRef = ref(null);
let lastCalStarter = null;

const GUIDED_DURATION_S = 60;
const PROMPT_INTERVAL_S = 10;
const CAL_PROMPTS = [
    { i18n: "magCalibrationPrompt1" },
    { i18n: "magCalibrationPrompt2" },
    { i18n: "magCalibrationPrompt3" },
    { i18n: "magCalibrationPrompt4" },
    { i18n: "magCalibrationPrompt5" },
    { i18n: "magCalibrationPrompt6" },
];

const CAL_QUALITY_KEY = {
    good: "magCalibrationQualityGood",
    fair: "magCalibrationQualityFair",
    poor: "magCalibrationQualityPoor",
};

const calIsCalibrating = computed(() => cal.phase === "waiting" || cal.phase === "collecting");

const calOffsetsText = computed(() => {
    const fit = cal.sphereFitResult;
    if (!fit) {
        return "\u2014";
    }
    return `${fit.center.x.toFixed(0)}, ${fit.center.y.toFixed(0)}, ${fit.center.z.toFixed(0)}`;
});

const calResidualText = computed(() => {
    const fit = cal.sphereFitResult;
    if (!fit) {
        return "\u2014";
    }
    return fit.residual.toFixed(1);
});

const calFirmwareOffsetsText = computed(() => {
    const fw = cal.firmwareOffsets;
    if (!fw) {
        return "\u2014";
    }
    return `${fw.x}, ${fw.y}, ${fw.z}`;
});

async function startGuidedCal() {
    if (!calGuidedAvailable.value) {
        await startLegacyFirmwareCal();
        return;
    }
    lastCalStarter = startGuidedCal;
    calIsGuided.value = true;
    calCurrentPrompt.value = 0;
    calGeoRef.value = getGeoReference();
    await cal.startCalibration("guided");
    startPromptTimer();
    startGuidedCountdown();
}

async function startLegacyFirmwareCal() {
    lastCalStarter = startLegacyFirmwareCal;
    calGeoRef.value = getGeoReference();
    await cal.startCalibration();
}

function cancelMagCal() {
    clearPromptTimer();
    clearGuidedCountdown();
    clearFullStepTimer();
    calIsGuided.value = false;
    calIsFull.value = false;
    fullCalResult.value = null;
    cal.cancelCalibration();
}

const MAG_VIZ_MODES = [
    { value: "pointcloud", label: "magVizPointCloud", icon: "i-lucide-scatter-chart" },
    { value: "heatmap", label: "magVizHeatmap", icon: "i-lucide-globe" },
    { value: "projection", label: "magVizProjection", icon: "i-lucide-circle-dot" },
    { value: "polar", label: "magVizPolar", icon: "i-lucide-radar" },
];
const magVizMode = ref("pointcloud");

const calGuidedAvailable = computed(() => isApi147.value && isMspCliSupported());

const calModeItems = computed(() => {
    const items = [];
    if (calGuidedAvailable.value) {
        items.push({
            label: i18n.getMessage("magCalibrationGuidedFw"),
            description: i18n.getMessage("magCalibrationGuidedFwDesc"),
            icon: "i-lucide-compass",
            onSelect: () => startGuidedCal(),
        });
        items.push({
            label: i18n.getMessage("magCalibrationGuided"),
            description: i18n.getMessage("magCalibrationGuidedDesc"),
            icon: "i-lucide-crosshair",
            onSelect: () => startClientCal(),
        });
        items.push({
            label: i18n.getMessage("magCalibrationFull"),
            description: i18n.getMessage("magCalibrationFullDesc"),
            icon: "i-lucide-sparkles",
            onSelect: () => startFullCal(),
        });
    }
    items.push({
        label: i18n.getMessage("magCalibrationUnguided"),
        description: i18n.getMessage("magCalibrationUnguidedDesc"),
        icon: "i-lucide-shuffle",
        onSelect: () => startLegacyFirmwareCal(),
    });
    return [items];
});

async function startCheckMode() {
    lastCalStarter = startCheckMode;
    calGeoRef.value = getGeoReference();
    await cal.startCalibration("check");
}

async function startClientCal() {
    lastCalStarter = startClientCal;
    calGeoRef.value = getGeoReference();
    await cal.startCalibration("guided");
}

async function startFullCal() {
    if (!calGuidedAvailable.value) {
        return;
    }
    lastCalStarter = startFullCal;
    calIsFull.value = true;
    calIsGuided.value = false;
    fullCalResult.value = null;
    calCurrentPrompt.value = 0;

    // The dip-angle alignment solve needs the WMM inclination. Resolve it up front
    // (best effort, no consent prompt) and reflect it in the panel + field arrow.
    calGeoRef.value = await resolveGeoReference(false);

    await cal.startCalibration("full");
    startFullStepTimer();
}

const isAcceptingCal = ref(false);

async function acceptGuidedMagCal() {
    isAcceptingCal.value = true;
    try {
        if (calIsFull.value) {
            await acceptFullCal();
            return;
        }
        const result = await cal.acceptCalibration();
        if (result?.ok) {
            magNeedsCalibration.value = false;
        } else {
            gui_log(i18n.getMessage("magCalibrationError"));
        }
    } finally {
        isAcceptingCal.value = false;
    }
}

async function acceptFullCal() {
    clearFullStepTimer();
    const samples = cal.samples;
    if (samples.length < 40) {
        gui_log(i18n.getMessage("magCalibrationFullInsufficientSamples"));
        return;
    }

    // Resolve the reference (cached, else GPS, else IP — prompting for consent now
    // rather than discarding the tumble). Also refreshes the panel + arrow inclination.
    const geoRef = await resolveGeoReference(true);
    if (!geoRef) {
        gui_log(i18n.getMessage("magCalibrationFullNoGeo"));
        return;
    }
    calGeoRef.value = geoRef;

    const align_mag = fcStore.sensorAlignment.align_mag || 0;
    const customAngles =
        align_mag === 9
            ? {
                roll: fcStore.sensorAlignment.mag_align_roll || 0,
                pitch: fcStore.sensorAlignment.mag_align_pitch || 0,
                yaw: fcStore.sensorAlignment.mag_align_yaw || 0,
            }
            : null;
    const R_cur = currentMatrixOf(align_mag, customAngles);

    const result = characterizeTumble({
        samples,
        currentMatrix: R_cur,
        inclinationRad: (geoRef.inclination * Math.PI) / 180,
    });

    if (!result.ok) {
        gui_log(result.error || i18n.getMessage("magCalibrationError"));
        return;
    }

    fullCalResult.value = result;
    cal.completeCalibration();
}

const isSavingCal = ref(false);

async function saveCalValues({ x, y, z }) {
    isSavingCal.value = true;
    try {
        const result = await cal.writeCalValues(x, y, z);
        if (result?.ok) {
            gui_log(i18n.getMessage("magCalibrationSaveSuccess"));
            magNeedsCalibration.value = x === 0 && y === 0 && z === 0;
        } else {
            gui_log(i18n.getMessage("magCalibrationSaveError"));
        }
    } finally {
        isSavingCal.value = false;
    }
}

function buildFullCalCliLines() {
    const r = fullCalResult.value;
    if (!r) {
        return [];
    }
    const lines = [];

    if (r.preset === 9) {
        if (!isFirmwareCustomMagAlignCapable(fcStore.config?.flightControllerVersion)) {
            lines.push(
                `# WARNING: firmware ${fcStore.config?.flightControllerVersion || "?"} predates betaflight#14849 (${MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN}+): it would apply the INVERSE of these angles. Update the firmware before using CUSTOM alignment.`,
            );
        }
        lines.push("set align_mag = CUSTOM");
        lines.push(`set mag_align_roll = ${Math.round(r.euler_zyx_deg.roll * 10)}`);
        lines.push(`set mag_align_pitch = ${Math.round(r.euler_zyx_deg.pitch * 10)}`);
        lines.push(`set mag_align_yaw = ${Math.round(r.euler_zyx_deg.yaw * 10)}`);
    } else if (r.preset >= 1 && r.preset <= 8) {
        const names = ["", "CW0", "CW90", "CW180", "CW270", "CW0FLIP", "CW90FLIP", "CW180FLIP", "CW270FLIP"];
        lines.push(`set align_mag = ${names[r.preset]}`);
    }

    lines.push(`set mag_calibration = ${r.offsets.x},${r.offsets.y},${r.offsets.z}`);

    const geoRef = calGeoRef.value || getGeoReference();
    if (geoRef) {
        lines.push(`set mag_declination = ${Math.round(geoRef.declination * 10)}`);
    }

    lines.push("save");
    return lines;
}

function copyFullCalCli() {
    const lines = buildFullCalCliLines();
    if (!lines.length) {
        return;
    }
    navigator.clipboard
        .writeText(lines.join("\n"))
        .then(() => gui_log(i18n.getMessage("magCalibrationFullCliCopied")))
        .catch(() => gui_log(i18n.getMessage("magCalibrationFullCliCopyFailed")));
}

async function applyFullCal() {
    const r = fullCalResult.value;
    if (!r) {
        return;
    }
    if (r.preset === 9 && !isFirmwareCustomMagAlignCapable(fcStore.config?.flightControllerVersion)) {
        gui_log(
            i18n.getMessage("magCalibrationFullCustomUnsupported", {
                version: fcStore.config?.flightControllerVersion || "?",
                min: MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN,
            }),
        );
        return;
    }
    isSavingCal.value = true;
    try {
        // Reflect the proposed alignment into the form. This makes it visible in the
        // alignment dropdown and persists it through the standard sensor-config save
        // (MSP_SET_SENSOR_ALIGNMENT + EEPROM), which is the proven path — not raw CLI.
        sensorAlignment.align_mag = r.preset;
        if (r.preset === 9 && r.euler_zyx_deg) {
            sensorAlignment.mag_align_roll = roundOneDp(r.euler_zyx_deg.roll);
            sensorAlignment.mag_align_pitch = roundOneDp(r.euler_zyx_deg.pitch);
            sensorAlignment.mag_align_yaw = roundOneDp(r.euler_zyx_deg.yaw);
        }
        const geoRef = calGeoRef.value || getGeoReference();
        if (geoRef) {
            magDeclination.value = roundOneDp(geoRef.declination);
        }

        // Write the new hard-iron offsets via the same path the offset editor uses.
        const offsetResult = await cal.writeCalValues(r.offsets.x, r.offsets.y, r.offsets.z);
        if (!offsetResult?.ok) {
            gui_log(i18n.getMessage("magCalibrationSaveError"));
            return;
        }
        magNeedsCalibration.value = false;

        // Persist alignment + declination to EEPROM and reboot (standard save flow).
        await saveConfig();
        gui_log(i18n.getMessage("magCalibrationFullApplied"));
    } catch (e) {
        gui_log(i18n.getMessage("magCalibrationSaveError"));
        console.error(e);
    } finally {
        isSavingCal.value = false;
    }
}

function exportFullCalModel() {
    const r = fullCalResult.value;
    if (!r) {
        return;
    }
    const geoRef = calGeoRef.value || getGeoReference();
    const align_mag = fcStore.sensorAlignment.align_mag || 0;
    const customAngles =
        align_mag === 9
            ? {
                roll: fcStore.sensorAlignment.mag_align_roll || 0,
                pitch: fcStore.sensorAlignment.mag_align_pitch || 0,
                yaw: fcStore.sensorAlignment.mag_align_yaw || 0,
            }
            : null;

    const model = buildCharacterizationModel({
        solverResult: {
            preset: r.preset,
            label: r.label,
            euler_zyx_deg: r.euler_zyx_deg,
            quality: r.quality,
        },
        capturedUnder: {
            alignment: align_mag,
            custom_angles: align_mag === 9 && customAngles ? { ...customAngles } : null,
            mag_zero: cal.firmwareOffsets ? { ...cal.firmwareOffsets } : null,
            mag_zero_known: cal.firmwareOffsets !== null,
        },
        ellipsoidParams: r.ellipsoid,
        calibrationOffsets: r.offsets,
        geoReference: geoRef,
        gpsFix: !!fcStore.gpsData.fix,
        gpsLat: fcStore.gpsData.latitude,
        gpsLon: fcStore.gpsData.longitude,
    });

    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `characterization_model_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function retryAndStartMagCal() {
    const starter = lastCalStarter ?? startGuidedCal;
    retryMagCal();
    starter();
}

function clearMagCalSamples() {
    clearPromptTimer();
    calCurrentPrompt.value = 0;
    if (calIsGuided.value) {
        startPromptTimer();
        restartGuidedCountdown();
    }
    cal.clearSamples();
}

function retryMagCal() {
    clearPromptTimer();
    clearGuidedCountdown();
    clearFullStepTimer();
    calIsGuided.value = false;
    calIsFull.value = false;
    fullCalResult.value = null;
    cal.retry();
}

function startPromptTimer() {
    clearPromptTimer();
    calCurrentPrompt.value = 0;
    promptTimer = setInterval(() => {
        if (cal.phase === "error" || cal.phase === "complete") {
            clearPromptTimer();
            return;
        }
        if (calCurrentPrompt.value < CAL_PROMPTS.length - 1) {
            calCurrentPrompt.value++;
        }
    }, PROMPT_INTERVAL_S * 1000);
}

function clearPromptTimer() {
    if (promptTimer !== null) {
        clearInterval(promptTimer);
        promptTimer = null;
    }
}

function startGuidedCountdown() {
    clearGuidedCountdown();
    const startTime = Date.now();
    guidedSecondsRemaining.value = GUIDED_DURATION_S;
    guidedCountdownTimer = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, Math.ceil(GUIDED_DURATION_S - elapsed));
        guidedSecondsRemaining.value = remaining;
        if (remaining <= 0) {
            clearGuidedCountdown();
            playCalCompletionBeep();
        }
    }, 1000);
}

function restartGuidedCountdown() {
    startGuidedCountdown();
}

function clearGuidedCountdown() {
    if (guidedCountdownTimer !== null) {
        clearInterval(guidedCountdownTimer);
        guidedCountdownTimer = null;
    }
    guidedSecondsRemaining.value = -1;
}

const BEEP_NOTES = [
    { freq: 660, start: 0, end: 0.1 },
    { freq: 880, start: 0.12, end: 0.25 },
];

function playCalCompletionBeep() {
    try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.value = 0.1;
        for (const { freq, start, end } of BEEP_NOTES) {
            const osc = ctx.createOscillator();
            osc.connect(gain);
            osc.frequency.value = freq;
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + end);
        }
        gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        setTimeout(() => ctx.close(), 500);
    } catch {
        // Audio not available
    }
}

// Auto-complete firmware calibration when firmware signals done
watch(
    () => cal.firmwareDone,
    (done) => {
        if (done && cal.mode === "quick") {
            clearPromptTimer();
            calIsGuided.value = false;
            cal.completeCalibration();
            magNeedsCalibration.value = false;
            playCalCompletionBeep();
        }
    },
);

watch(
    () => cal.phase,
    (phase) => {
        if (phase === "error" || phase === "complete") {
            clearPromptTimer();
            clearGuidedCountdown();
            calIsGuided.value = false;
        }
    },
);

// --- Accelerometer Calibration ---

const hasAccSensor = computed(() => have_sensor(fcStore.config?.activeSensors, "acc"));
const hasBaroSensor = computed(() => have_sensor(fcStore.config?.activeSensors, "baro"));
const accNeedsCalibration = computed(() => {
    const flags = fcStore.config?.configurationProblems;
    if (flags === undefined) {
        return false;
    }
    return bit_check(flags, ACC_NEEDS_CALIBRATION_BIT);
});
const calibratingAccel = ref(false);
const { addTimeout } = useTimeout();

// React to the firmware clearing the flag after calibration completes
watch(accNeedsCalibration, (needsCal, wasNeeded) => {
    if (wasNeeded && !needsCal && calibratingAccel.value) {
        resumeInterval("sensors_attitude");
        gui_log(i18n.getMessage("initialSetupAccelCalibEnded"));
        calibratingAccel.value = false;
    }
});

function onCalibrateAccel() {
    if (calibratingAccel.value) {
        return;
    }
    calibratingAccel.value = true;

    // The MCU is locked in a busy loop during calibration and cannot process
    // serial commands; pause the attitude poll to avoid flooding the buffer.
    pauseInterval("sensors_attitude");

    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, function () {
        if (!isMounted.value) {
            return;
        }
        gui_log(i18n.getMessage("initialSetupAccelCalibStarted"));
    });

    addTimeout(
        "acc_calib_reset",
        function () {
            if (!isMounted.value) {
                return;
            }
            resumeInterval("sensors_attitude");
            // Re-fetch board info to refresh configurationProblems; the watcher above
            // handles cleanup when the flag clears. The callback acts as a fallback for
            // firmware that does not report configurationProblems.
            MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, function () {
                if (calibratingAccel.value) {
                    gui_log(i18n.getMessage("initialSetupAccelCalibEnded"));
                    calibratingAccel.value = false;
                }
            });
        },
        ACC_CALIBRATION_TIMEOUT_MS,
    );
}

// --- Live Sensor Data ---

const showLiveSensors = ref(false);

// --- 3D Model Preview ---

const modelWrapper = ref(null);
const modelCanvas = ref(null);
const instrumentAttitude = ref(null);
const instrumentHeading = ref(null);
const instrumentAltimeter = ref(null);
let modelInstance = null;
let boundModelResize = null;
let attitudeIndicator = null;
let headingIndicator = null;
let altimeterIndicator = null;

const { addInterval, pauseInterval, resumeInterval, removeAllIntervals } = useInterval();

const DEG_TO_RAD = Math.PI / 180;

const CARDINAL_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function toCardinal(deg) {
    return CARDINAL_DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const yawFix = ref(0);

const attitudeDisplay = reactive({
    heading: "0.0",
    pitch: "0.0",
    roll: "0.0",
});
const attitudeRaw = reactive({ roll: 0, pitch: 0, heading: 0 });
const attitudeQuaternion = ref(null);

function resetYaw() {
    yawFix.value = fcStore.sensorData.kinematics[2] * -1;
}

function formatAttitude(val) {
    return val.toFixed(1);
}

function initModel() {
    if (!modelWrapper.value || !modelCanvas.value) {
        return;
    }
    modelInstance = new Model(modelWrapper.value, modelCanvas.value);
    boundModelResize = modelInstance.resize.bind(modelInstance);
    window.addEventListener("resize", boundModelResize);
}

function initInstruments() {
    const options = { size: 90, showBox: false, img_directory: "images/flightindicators/" };
    if (instrumentAttitude.value) {
        attitudeIndicator = flightIndicator(instrumentAttitude.value, "attitude", options);
    }
    if (instrumentHeading.value) {
        headingIndicator = flightIndicator(instrumentHeading.value, "heading", options);
    }
    if (instrumentAltimeter.value) {
        altimeterIndicator = flightIndicator(instrumentAltimeter.value, "altimeter", options);
    }
}

function renderModel() {
    if (!modelInstance) {
        return;
    }
    const k = fcStore.sensorData.kinematics;
    const x = k[1] * -DEG_TO_RAD;
    const y = (k[2] * -1 - yawFix.value) * DEG_TO_RAD;
    const z = k[0] * -DEG_TO_RAD;
    modelInstance.rotateTo(x, y, z);
}

function pollAttitude() {
    MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, function () {
        if (!isMounted.value) {
            return;
        }
        const k = fcStore.sensorData.kinematics;
        attitudeDisplay.roll = formatAttitude(k[0]);
        attitudeDisplay.pitch = formatAttitude(k[1]);
        const headingDeg = k[2];
        let headingText = formatAttitude(headingDeg);
        if (hasMagSensor.value) {
            headingText += ` ${toCardinal(headingDeg)}`;
        }
        attitudeDisplay.heading = headingText;
        attitudeRaw.roll = k[0];
        attitudeRaw.pitch = k[1];
        attitudeRaw.heading = headingDeg;
        if (attitudeIndicator) {
            attitudeIndicator.setRoll(k[0]);
            attitudeIndicator.setPitch(k[1]);
        }
        if (headingIndicator) {
            headingIndicator.setHeading(headingDeg);
        }
        if (altimeterIndicator) {
            MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, () => {
                altimeterIndicator.setAltitude(fcStore.sensorData.altitude * 100);
            });
        }
        renderModel();
    });

    // Poll quaternion alongside Euler for gimbal-lock-free sphere view rotation
    if (isApi148.value) {
        MSP.send_message(MSPCodes.MSP_ATTITUDE_QUATERNION, false, false, function () {
            attitudeQuaternion.value = fcStore.sensorData.quaternion;
        });
    }
}

function disposeModel() {
    if (modelInstance) {
        if (boundModelResize) {
            window.removeEventListener("resize", boundModelResize);
            boundModelResize = null;
        }
        if (typeof modelInstance.dispose === "function") {
            modelInstance.dispose();
        }
        modelInstance = null;
    }
}

// --- Dirty Tracking ---

const baseline = ref("");

const snapshotSensorAlignment = () => ({
    gyro_to_use: sensorAlignment.gyro_to_use,
    gyro_1_align: sensorAlignment.gyro_1_align,
    gyro_2_align: sensorAlignment.gyro_2_align,
    align_mag: sensorAlignment.align_mag,
    gyro_1_align_roll: sensorAlignment.gyro_1_align_roll,
    gyro_1_align_pitch: sensorAlignment.gyro_1_align_pitch,
    gyro_1_align_yaw: sensorAlignment.gyro_1_align_yaw,
    gyro_2_align_roll: sensorAlignment.gyro_2_align_roll,
    gyro_2_align_pitch: sensorAlignment.gyro_2_align_pitch,
    gyro_2_align_yaw: sensorAlignment.gyro_2_align_yaw,
    gyro_align: [...(sensorAlignment.gyro_align || [])],
    gyro_enable_mask: sensorAlignment.gyro_enable_mask,
    gyro_align_roll: [...(sensorAlignment.gyro_align_roll || [])],
    gyro_align_pitch: [...(sensorAlignment.gyro_align_pitch || [])],
    gyro_align_yaw: [...(sensorAlignment.gyro_align_yaw || [])],
    mag_align_roll: sensorAlignment.mag_align_roll,
    mag_align_pitch: sensorAlignment.mag_align_pitch,
    mag_align_yaw: sensorAlignment.mag_align_yaw,
});

const serializeState = () =>
    JSON.stringify({
        sensorConfig: { ...sensorConfig },
        boardAlignment: { ...boardAlignment },
        accelTrims: { ...accelTrims },
        sensorAlignment: snapshotSensorAlignment(),
        magDeclination: magDeclination.value,
    });

const dirty = computed(() => {
    if (!baseline.value) {
        return false;
    }
    return baseline.value !== serializeState();
});

// --- Load helpers ---

function hydrateSensorConfig() {
    sensorConfig.acc_hardware = fcStore.sensorConfig.acc_hardware;
    sensorConfig.baro_hardware = fcStore.sensorConfig.baro_hardware;
    sensorConfig.mag_hardware = fcStore.sensorConfig.mag_hardware;
    sensorConfig.sonar_hardware = fcStore.sensorConfig.sonar_hardware;
    sensorConfig.opticalflow_hardware = fcStore.sensorConfig.opticalflow_hardware;

    boardAlignment.roll = fcStore.boardAlignment.roll;
    boardAlignment.pitch = fcStore.boardAlignment.pitch;
    boardAlignment.yaw = fcStore.boardAlignment.yaw;

    accelTrims.pitch = fcStore.config.accelerometerTrims[0];
    accelTrims.roll = fcStore.config.accelerometerTrims[1];
}

function hydrateAlignment() {
    sensorAlignment.gyro_to_use = fcStore.sensorAlignment.gyro_to_use;
    sensorAlignment.gyro_1_align = fcStore.sensorAlignment.gyro_1_align;
    sensorAlignment.gyro_2_align = fcStore.sensorAlignment.gyro_2_align;
    sensorAlignment.align_mag = fcStore.sensorAlignment.align_mag;
    sensorAlignment.gyro_1_align_roll = fcStore.sensorAlignment.gyro_1_align_roll;
    sensorAlignment.gyro_1_align_pitch = fcStore.sensorAlignment.gyro_1_align_pitch;
    sensorAlignment.gyro_1_align_yaw = fcStore.sensorAlignment.gyro_1_align_yaw;
    sensorAlignment.gyro_2_align_roll = fcStore.sensorAlignment.gyro_2_align_roll;
    sensorAlignment.gyro_2_align_pitch = fcStore.sensorAlignment.gyro_2_align_pitch;
    sensorAlignment.gyro_2_align_yaw = fcStore.sensorAlignment.gyro_2_align_yaw;
    sensorAlignment.gyro_align = fcStore.sensorAlignment.gyro_align || [];
    sensorAlignment.gyro_enable_mask = fcStore.sensorAlignment.gyro_enable_mask || 0;
    sensorAlignment.gyro_align_roll = fcStore.sensorAlignment.gyro_align_roll || [];
    sensorAlignment.gyro_align_pitch = fcStore.sensorAlignment.gyro_align_pitch || [];
    sensorAlignment.gyro_align_yaw = fcStore.sensorAlignment.gyro_align_yaw || [];

    if (isApi147.value) {
        sensorAlignment.mag_align_roll = fcStore.sensorAlignment.mag_align_roll || 0;
        sensorAlignment.mag_align_pitch = fcStore.sensorAlignment.mag_align_pitch || 0;
        sensorAlignment.mag_align_yaw = fcStore.sensorAlignment.mag_align_yaw || 0;
    }

    const flags = fcStore.sensorAlignment.gyro_detection_flags || 0;
    hasSecondGyro.value = (flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) !== 0;
    hasDualGyros.value = (flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) !== 0;

    if (isApi147.value) {
        showGyro1Align.value = false;
        showGyro2Align.value = false;
        showMultiGyro.value = true;
    } else {
        showGyro1Align.value = true;
        showGyro2Align.value = hasSecondGyro.value;
        showMultiGyro.value = false;
    }
}

function setupMagSection() {
    hasMagSensor.value = have_sensor(fcStore.config?.activeSensors, "mag");
    if (!hasMagSensor.value) {
        showMagSection.value = false;
        showMagAlign.value = false;
        return;
    }

    showMagSection.value = true;
    showMagAlign.value = true;

    if (isApi146.value) {
        magDeclination.value = fcStore.compassConfig.mag_declination;

        const cached = getGeoReference();
        if (cached) {
            magInclination.value = roundOneDp(cached.inclination);
            magFieldStrength.value = cached.fieldStrength;
            applyDetectedDeclination(roundOneDp(cached.declination));
        } else {
            tryAutoGeoReference().catch(() => {});
        }
    }

    cal.refreshFirmwareOffsets()
        .then((offsets) => {
            if (offsets && offsets.x === 0 && offsets.y === 0 && offsets.z === 0) {
                magNeedsCalibration.value = true;
            }
        })
        .catch(() => {});
}

function setupPeripherals() {
    if (isApi147.value) {
        sonarTypesList.value = sensorTypesData.value?.sonar?.elements || [];
        showRangefinder.value = sonarTypesList.value.length > 0;
        opticalFlowTypesList.value = sensorTypesData.value?.opticalflow?.elements || [];
        showOpticalFlow.value = opticalFlowTypesList.value.length > 0;
    }
}

// --- Load ---

const loadConfig = async () => {
    try {
        if (!isMounted.value) {
            return;
        }

        await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);
        await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT);
        await MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG);
        await MSP.promise(MSPCodes.MSP_ACC_TRIM);
        await MSP.promise(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE);

        if (isApi146.value) {
            await MSP.promise(MSPCodes.MSP_COMPASS_CONFIG);
        }

        if (isApi147.value) {
            await MSP.promise(MSPCodes.MSP2_GYRO_SENSOR);
        }

        if (!isMounted.value) {
            return;
        }

        try {
            sensorTypesData.value = await sensorTypes();
        } catch (error) {
            sensorTypesData.value = null;
            console.warn("Failed to load sensor types", error);
        }

        hydrateSensorConfig();
        hydrateAlignment();
        resolveSensorNames();
        setupMagSection();
        setupPeripherals();

        baseline.value = serializeState();

        await nextTick();

        if (!isMounted.value) {
            return;
        }

        // Initialize 3D model, instruments, and start attitude polling
        initModel();
        initInstruments();
        addInterval("sensors_attitude", pollAttitude, ATTITUDE_POLL_MS, true);

        GUI.content_ready();
    } catch (e) {
        console.error("Failed to load sensor config", e);
        GUI.content_ready();
    }
};

// --- Save ---

const saveConfig = async () => {
    if (isSaving.value) {
        return;
    }
    isSaving.value = true;

    try {
        // Push sensor hardware to store
        fcStore.sensorConfig.acc_hardware = sensorConfig.acc_hardware;
        fcStore.sensorConfig.baro_hardware = sensorConfig.baro_hardware;
        fcStore.sensorConfig.mag_hardware = sensorConfig.mag_hardware;

        if (isApi147.value) {
            fcStore.sensorConfig.sonar_hardware = sensorConfig.sonar_hardware;
            fcStore.sensorConfig.opticalflow_hardware = sensorConfig.opticalflow_hardware;
        }

        // Push board alignment to store
        fcStore.boardAlignment.roll = boardAlignment.roll;
        fcStore.boardAlignment.pitch = boardAlignment.pitch;
        fcStore.boardAlignment.yaw = boardAlignment.yaw;

        // Push accel trims to store
        fcStore.config.accelerometerTrims[0] = accelTrims.pitch;
        fcStore.config.accelerometerTrims[1] = accelTrims.roll;

        // Push sensor alignment to store
        fcStore.sensorAlignment.gyro_to_use = sensorAlignment.gyro_to_use;
        fcStore.sensorAlignment.gyro_1_align = sensorAlignment.gyro_1_align;
        fcStore.sensorAlignment.gyro_2_align = sensorAlignment.gyro_2_align;
        fcStore.sensorAlignment.align_mag = sensorAlignment.align_mag;

        if (isApi147.value) {
            fcStore.sensorAlignment.gyro_enable_mask = sensorAlignment.gyro_enable_mask;
            fcStore.sensorAlignment.gyro_align = sensorAlignment.gyro_align;
            fcStore.sensorAlignment.gyro_align_roll = sensorAlignment.gyro_align_roll;
            fcStore.sensorAlignment.gyro_align_pitch = sensorAlignment.gyro_align_pitch;
            fcStore.sensorAlignment.gyro_align_yaw = sensorAlignment.gyro_align_yaw;
        } else {
            fcStore.sensorAlignment.gyro_1_align_roll = sensorAlignment.gyro_1_align_roll;
            fcStore.sensorAlignment.gyro_1_align_pitch = sensorAlignment.gyro_1_align_pitch;
            fcStore.sensorAlignment.gyro_1_align_yaw = sensorAlignment.gyro_1_align_yaw;
            fcStore.sensorAlignment.gyro_2_align_roll = sensorAlignment.gyro_2_align_roll;
            fcStore.sensorAlignment.gyro_2_align_pitch = sensorAlignment.gyro_2_align_pitch;
            fcStore.sensorAlignment.gyro_2_align_yaw = sensorAlignment.gyro_2_align_yaw;
        }

        if (isApi147.value) {
            fcStore.sensorAlignment.mag_align_roll = sensorAlignment.mag_align_roll;
            fcStore.sensorAlignment.mag_align_pitch = sensorAlignment.mag_align_pitch;
            fcStore.sensorAlignment.mag_align_yaw = sensorAlignment.mag_align_yaw;
        }

        if (showMagSection.value) {
            fcStore.compassConfig.mag_declination = magDeclination.value;
        }

        // Send MSP commands
        await MSP.promise(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT));
        await MSP.promise(
            MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG,
            mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG),
        );
        await MSP.promise(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM));

        if (isApi146.value) {
            await MSP.promise(MSPCodes.MSP_SET_COMPASS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_COMPASS_CONFIG));
        }

        gui_log(i18n.getMessage("sensorConfigSaved"));

        baseline.value = serializeState();

        // Save to EEPROM and reboot
        await new Promise((resolve) => {
            mspHelper.writeConfiguration(false, () => {
                navigationStore.cleanup(() => {
                    reboot();
                    resolve();
                });
            });
        });
    } catch (e) {
        console.error("Failed to save sensor config", e);
        gui_log(i18n.getMessage("sensorConfigSaveFailed"));
    } finally {
        isSaving.value = false;
    }
};

// --- Lifecycle ---

onMounted(() => {
    loadConfig();
});
</script>

<style lang="less">
.tab-sensors {
    .sensor-top {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 0.75rem;
        align-items: start;
    }

    .sensor-left,
    .sensor-right {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .sensor-model-box :deep(> div:last-child) {
        height: 100%;
        min-height: 0;
    }

    .model-preview {
        position: relative;
        height: 100%;
    }

    .model-canvas-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 32rem;
        max-height: 500px;
        border-radius: 0.5rem;

        canvas {
            width: 100% !important;
            height: 100% !important;
        }

        .instruments-right {
            position: absolute;
            bottom: 1rem;
            right: 1rem;
            display: flex;
            flex-direction: row;
            gap: 0.5rem;
            pointer-events: none;
        }
    }

    .attitude-overlay {
        position: absolute;
        top: 0.75rem;
        left: 0.75rem;
        font-size: 0.8rem;
        color: var(--surface-950);

        dl {
            display: grid;
            grid-template-columns: auto auto;
            gap: 0 0.5rem;
        }

        dd {
            white-space: pre;
            margin: 0;
        }
    }

    .yaw-reset-btn {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
    }

    .align-detect-inline {
        padding: 0.5rem 0;
    }

    .mag-align-progress-bar {
        width: 100%;
        height: 4px;
        background: var(--surface-300);
        border-radius: 2px;
        overflow: hidden;
    }

    .mag-align-progress-fill {
        height: 100%;
        background: var(--primary-500);
        border-radius: 2px;
        transition: width 0.3s ease;
    }

    .confidence-high {
        color: var(--success-500);
    }
    .confidence-medium {
        color: var(--warning-500);
    }
    .confidence-low {
        color: var(--error-500);
    }

    .mag-cal-section {
        padding-top: 0.25rem;
    }

    .mag-cal-inline-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        align-items: start;
        margin-top: 0.5rem;
    }

    .mag-cal-inline-steps {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: center;
    }

    .mag-cal-step-counter {
        font-size: 0.8em;
        font-weight: 600;
        color: var(--surface-500);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .mag-cal-inline-sphere {
        position: relative;
        aspect-ratio: 1;
        border-radius: 0.5rem;
        background: #1a1a2e;
        min-height: 200px;
        max-height: 350px;
    }

    .mag-viz-mode-selector {
        position: absolute;
        top: 6px;
        left: 6px;
        z-index: 10;
        display: flex;
        gap: 2px;
        border-radius: 6px;
        padding: 2px;
    }

    .mag-viz-mode-selector button {
        color: #c6c6cb; /* rgba(255,255,255,0.75) over #1a1a2e — contrast 10:1 */
    }

    .mag-viz-mode-selector button:hover {
        color: #fff;
        background: #313143; /* rgba(255,255,255,0.1) over #1a1a2e */
    }

    .mag-viz-mode-selector .mag-viz-active {
        color: #fff;
        background: #5f5f6d; /* rgba(255,255,255,0.3) over #1a1a2e — contrast 5.5:1 */
    }

    .mag-cal-progress-bar {
        width: 100%;
        height: 5px;
        background: var(--surface-300);
        border-radius: 3px;
        overflow: hidden;
    }

    .mag-cal-progress-fill {
        height: 100%;
        background: var(--primary-500);
        border-radius: 3px;
        transition: width 0.3s ease;
    }

    .mag-cal-live-inline {
        display: flex;
        gap: 0.75rem;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--surface-900);
        padding: 4px 8px;
        background: var(--surface-200);
        border-radius: 4px;
    }

    .mag-cal-stats-inline {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
        font-size: 0.82em;
        width: 100%;
    }

    .mag-cal-stats-inline dt {
        color: var(--surface-500);
        font-weight: 500;
    }

    .mag-cal-stats-inline dd {
        margin: 0;
        font-weight: 600;
        text-align: right;
    }

    .quality-good {
        color: var(--success-500);
    }
    .quality-fair {
        color: var(--warning-500);
    }
    .quality-poor {
        color: var(--error-500);
    }

    @media only screen and (max-width: 900px) {
        .sensor-top {
            grid-template-columns: 1fr;
        }

        .model-canvas-wrapper {
            min-height: 20rem;
        }

        .mag-cal-inline-layout {
            grid-template-columns: 1fr;
        }

        .mag-cal-inline-sphere {
            max-height: 300px;
        }
    }
}
</style>
