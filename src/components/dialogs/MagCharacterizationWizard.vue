<template>
    <dialog ref="dialogRef" class="mag-char-dialog" @cancel.prevent @close="onDialogClose">
        <div class="mag-char-container">
            <div class="mag-char-header">
                <h3 class="mag-char-title">Mag Characterization</h3>
                <button type="button" class="mag-char-close" @click="close">&times;</button>
            </div>

            <!-- Intro -->
            <div v-if="phase === 'intro'" class="mag-char-body">
                <div class="mag-char-setup-image">
                    <img src="../../images/drone_paper.jpg" alt="Drone on paper with compass rose" />
                </div>
                <h4>Compass Setup Wizard</h4>
                <p><strong>We're going to teach your drone which way is North!</strong></p>
                <p>This wizard does two things:</p>
                <ol>
                    <li>
                        <strong>Spin it around</strong> — twirl the drone in every direction so we can learn how your
                        specific hardware reads the Earth's magnetic field.
                    </li>
                    <li>
                        <strong>20 guided poses</strong> — rest the drone at precise angles so we can build a model of
                        how accurate your compass is at every orientation.
                    </li>
                </ol>
                <p>The whole thing takes about 5 minutes and makes your GPS rescue tracks <em>way</em> smoother.</p>
                <p><strong>You'll need:</strong></p>
                <ul>
                    <li>A <strong>flat table</strong> and a big sheet of paper</li>
                    <li>
                        A <strong>compass</strong> (or phone app) — draw
                        N&thinsp;/&thinsp;E&thinsp;/&thinsp;S&thinsp;/&thinsp;W lines
                    </li>
                    <li>A <strong>tissue box, book, or battery</strong> to tilt the drone</li>
                </ul>
                <div class="mag-char-complete-actions" style="margin-top: 16px">
                    <span class="mag-char-debug-link" @click="toggleDebug">Debug &#9660;</span>
                    <div
                        v-if="debugExpanded"
                        style="
                            margin-top: 8px;
                            padding: 8px;
                            background: #12122a;
                            border-radius: 4px;
                            border: 1px solid #2a2a4a;
                        "
                    >
                        <div style="display: flex; gap: 8px; margin-bottom: 8px">
                            <label :class="{ 'mag-char-debug-item': true, loaded: posesFileLoaded }" style="flex: 1">
                                {{ posesFileLoaded ? "&#10003; Poses loaded" : "Load poses JSON" }}
                                <input type="file" accept=".json" style="display: none" @change="onPosesFileSelected" />
                            </label>
                            <label :class="{ 'mag-char-debug-item': true, loaded: calFileLoaded }" style="flex: 1">
                                {{ calFileLoaded ? "&#10003; Cal loaded" : "Load calibration JSON" }}
                                <input type="file" accept=".json" style="display: none" @change="onCalFileSelected" />
                            </label>
                        </div>
                        <button
                            type="button"
                            class="mag-char-btn mag-char-btn-primary"
                            style="width: 100%; font-size: 11px"
                            @click="processDebugLoad"
                            :disabled="!posesFileLoaded && !calFileLoaded"
                        >
                            {{
                                posesFileLoaded && calFileLoaded
                                    ? "Proceed to Final Report"
                                    : posesFileLoaded
                                      ? "Proceed to Solver (no calibration)"
                                      : calFileLoaded
                                        ? "Proceed to 20 Poses (with calibration)"
                                        : "Load files first"
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Calibration tumble phase -->
            <div v-if="phase === 'calibrate'" class="mag-char-body">
                <h4>Calibrate Magnetometer</h4>
                <p>Rotate the drone in all directions to collect calibration data.</p>
                <MagSphereView
                    :samples="calibrationSamples"
                    :sample-count="calibrationSampleCount"
                    :sphere-fit="calibrationSphereFit"
                    :coverage="calibrationCoverage"
                    :attitude="attitudeRaw"
                    :quaternion="attitudeQuaternion"
                    :active="true"
                    :live-mag="calLiveMag"
                    viz-mode="pointcloud"
                />
                <!-- "sphere regions" = the 20 icosahedron faces used to bin sampled
                     field directions (sphereFit.js ICOSA_FACE_DIRS). Unrelated to the
                     20 guided poses — the numeric match is pure coincidence. -->
                <p v-if="calibrationCoverage" style="margin-bottom: 0">
                    sphere coverage {{ (calibrationCoverage.fraction * 100).toFixed(0) }}% ({{
                        calibrationCoverage.covered
                    }}
                    of {{ calibrationCoverage.totalFaces }} regions painted)
                </p>
                <p style="font-size: 13px; color: #7eb8ff; margin-top: 4px">{{ $t(calPromptI18n) }}</p>
                <div class="mag-char-complete-actions" style="margin-top: 12px">
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="completeCalibrationPhase">
                        Done calibrating
                    </button>
                    <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="exportCalibrationSamples">
                        Export samples
                    </button>
                    <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="skipCalibration">
                        Skip
                    </button>
                </div>
            </div>

            <!-- Wizard body -->
            <div
                v-if="phase !== 'intro' && phase !== 'calibrate' && phase !== 'complete' && phase !== 'replay'"
                class="mag-char-wizard-body"
            >
                <div class="mag-char-left">
                    <!-- Pose timeline grouped by direction -->
                    <div class="mag-char-pose-timeline">
                        <template v-for="(dir, di) in directions" :key="di">
                            <div class="mag-char-direction-header" :class="{ dimmed: di !== currentDirectionIndex }">
                                {{ dir.label }}
                            </div>
                            <div
                                v-for="(pose, pi) in dir.poses"
                                :key="di + '-' + pi"
                                class="mag-char-pose-step"
                                :class="{
                                    done: isPoseDone(di, pi),
                                    current: di === currentDirectionIndex && pi === currentSubPoseIndex,
                                    pending:
                                        !isPoseDone(di, pi) &&
                                        !(di === currentDirectionIndex && pi === currentSubPoseIndex),
                                }"
                            >
                                <span class="mag-char-pose-icon">
                                    {{ isPoseDone(di, pi) ? "✓" : "" }}
                                </span>
                                <span class="mag-char-pose-label">{{ pose.label }}</span>
                            </div>
                        </template>
                    </div>

                    <div v-if="currentPoseDef" class="mag-char-instructions">
                        <p class="mag-char-instruction-text">{{ currentPoseDef.instruction }}</p>
                        <p class="mag-char-instruction-hint">{{ currentDirection?.alignHint }}</p>
                    </div>
                </div>

                <div class="mag-char-right">
                    <div class="mag-char-visual">
                        <span class="mag-char-cardinal mag-char-cardinal-n">N</span>
                        <span class="mag-char-cardinal mag-char-cardinal-e">E</span>
                        <span class="mag-char-cardinal mag-char-cardinal-s">S</span>
                        <span class="mag-char-cardinal mag-char-cardinal-w">W</span>
                        <canvas ref="threeCanvas" class="mag-char-three-canvas"></canvas>
                    </div>
                </div>
            </div>

            <!-- Replay phase — 3-way split validation -->
            <div v-if="phase === 'replay'" class="mag-char-replay-section">
                <div class="mag-char-replay-container">
                    <div class="mag-char-replay-controls">
                        <span class="mag-char-replay-pose-label"
                            >Pose {{ replayIndex + 1 }}/{{ replayData.length }} —
                            {{ currentReplayPose?.poseLabel }}</span
                        >
                        <span class="mag-char-replay-dir-label">{{ currentReplayPose?.dirLabel }}</span>
                        <span class="mag-char-replay-spacer"></span>
                        <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="replayPrev">
                            &larr;
                        </button>
                        <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="toggleAutoPlay">
                            {{ isAutoPlaying ? "⏸ Pause" : "▶ Play" }}
                        </button>
                        <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="replayNext">
                            &rarr;
                        </button>
                        <button type="button" class="mag-char-btn mag-char-btn-primary" @click="finishReplay">
                            View Results
                        </button>
                    </div>

                    <div class="mag-char-replay-compare-row">
                        <div class="mag-char-replay-compare-col">
                            <span class="mag-char-replay-view-label">Your Pose</span>
                            <canvas ref="replay3dCanvas" class="mag-char-replay-canvas"></canvas>
                            <div class="mag-char-replay-error" v-if="currentReplayPose" style="margin-top: 4px">
                                Roll {{ currentReplayPose.roll.toFixed(1) }}° &nbsp; Pitch
                                {{ currentReplayPose.pitch.toFixed(1) }}° &nbsp; Expected heading
                                {{ currentReplayPose.expectedHeading.toFixed(0) }}°
                            </div>
                        </div>
                        <div class="mag-char-replay-compare-col">
                            <span class="mag-char-replay-view-label"
                                >Current (align_mag={{ currentAlign || "?" }})</span
                            >
                            <div
                                class="mag-char-replay-heading-now"
                                :class="
                                    currentReplayPose
                                        ? headingClass(
                                              currentReplayPose.currentHeading,
                                              currentReplayPose.expectedHeading,
                                          )
                                        : ''
                                "
                            >
                                {{ currentReplayPose ? formatHeading(currentReplayPose.currentHeading) : "—" }}
                            </div>
                            <div class="mag-char-replay-error" v-if="currentReplayPose">
                                {{
                                    headingErrorText(
                                        currentReplayPose.currentHeading,
                                        currentReplayPose.expectedHeading,
                                    )
                                }}
                            </div>
                            <div
                                v-if="currentReplayPose"
                                class="mag-char-replay-score"
                                :class="scoreClass(currentReplayPose.currentScore)"
                            >
                                {{ currentReplayPose.currentScore || "" }}
                            </div>
                        </div>
                        <div class="mag-char-replay-compare-col">
                            <span class="mag-char-replay-view-label">Proposed</span>
                            <div
                                class="mag-char-replay-heading-new"
                                :class="
                                    currentReplayPose
                                        ? headingClass(currentReplayPose.newHeading, currentReplayPose.expectedHeading)
                                        : ''
                                "
                            >
                                {{ currentReplayPose ? formatHeading(currentReplayPose.newHeading) : "—" }}
                            </div>
                            <div class="mag-char-replay-error" v-if="currentReplayPose">
                                {{ headingErrorText(currentReplayPose.newHeading, currentReplayPose.expectedHeading) }}
                            </div>
                            <div
                                v-if="currentReplayPose"
                                class="mag-char-replay-score"
                                :class="scoreClass(currentReplayPose.score)"
                            >
                                {{ currentReplayPose.score || "" }}
                            </div>
                            <div
                                v-if="
                                    currentReplayPose &&
                                    currentReplayPose.fieldDevPct &&
                                    Math.abs(currentReplayPose.fieldDevPct) > 10
                                "
                                class="mag-char-replay-field-warn"
                            >
                                |B|: {{ currentReplayPose.fieldMean }} ({{ currentReplayPose.fieldDevPct > 0 ? "+" : ""
                                }}{{ currentReplayPose.fieldDevPct }}%)
                            </div>
                        </div>
                        <div class="mag-char-replay-compare-col">
                            <span
                                class="mag-char-replay-view-label"
                                title="Sensor calibration corrected + proposed alignment"
                                >Calibrated</span
                            >
                            <template
                                v-if="
                                    ellipsoidParams &&
                                    currentReplayPose &&
                                    currentReplayPose.fullCorrectedHeading != null
                                "
                            >
                                <div
                                    class="mag-char-replay-heading-new"
                                    :class="
                                        headingClass(
                                            currentReplayPose.fullCorrectedHeading,
                                            currentReplayPose.expectedHeading,
                                        )
                                    "
                                >
                                    {{ formatHeading(currentReplayPose.fullCorrectedHeading) }}
                                </div>
                                <div class="mag-char-replay-error">
                                    {{
                                        headingErrorText(
                                            currentReplayPose.fullCorrectedHeading,
                                            currentReplayPose.expectedHeading,
                                        )
                                    }}
                                </div>
                                <div
                                    class="mag-char-replay-score"
                                    :class="scoreClass(currentReplayPose.fullCorrectedScore)"
                                >
                                    {{ currentReplayPose.fullCorrectedScore || "" }}
                                </div>
                            </template>
                            <div v-else class="mag-char-replay-na">N/A - run calibration tumble</div>
                            <div
                                class="mag-char-replay-gain-note"
                                style="
                                    font-size: 9px;
                                    margin-top: 6px;
                                    color: #999;
                                    border-top: 1px solid #333;
                                    padding-top: 4px;
                                "
                            >
                                — Stored for blackbox replay —
                            </div>
                            <div
                                v-if="ellipsoidParams"
                                class="mag-char-replay-gain-note"
                                style="font-size: 9px; margin-top: 4px; color: #888"
                            >
                                W_inv: {{ ellipsoidParams.W_inv[0][0].toExponential(3) }} /
                                {{ ellipsoidParams.W_inv[1][1].toExponential(3) }} /
                                {{ ellipsoidParams.W_inv[2][2].toExponential(3) }}
                            </div>
                            <div
                                v-if="ellipsoidParams"
                                class="mag-char-replay-gain-note"
                                style="font-size: 9px; color: #888"
                                title="Hard iron offset in ADC counts"
                            >
                                Hard iron: {{ ellipsoidParams.center.x.toFixed(0) }},
                                {{ ellipsoidParams.center.y.toFixed(0) }}, {{ ellipsoidParams.center.z.toFixed(0) }}
                            </div>
                            <div
                                v-if="ellipsoidParams"
                                class="mag-char-replay-gain-note"
                                style="font-size: 8px; color: #666; margin-top: 4px"
                            >
                                Corrects sensor errors during post-flight analysis
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Complete -->
            <div v-if="phase === 'complete'" class="mag-char-body">
                <div class="mag-char-summary-card">
                    <h4>Wizard Complete</h4>

                    <!-- Solver result -->
                    <div v-if="solverResult" class="mag-char-solver-result">
                        <div v-if="solverResult.error" class="mag-char-solver-error">
                            {{ solverResult.error }}
                        </div>
                        <template v-else>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Alignment</span>
                                <span class="mag-char-stat-value" style="color: #4ec97e; font-weight: 700">
                                    {{ solverResult.label }}
                                    <template v-if="solverResult.customAngles">
                                        ({{ solverResult.customAngles.roll.toFixed(0) }}°,
                                        {{ solverResult.customAngles.pitch.toFixed(0) }}°,
                                        {{ solverResult.customAngles.yaw.toFixed(0) }}°)
                                    </template>
                                </span>
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Quality</span>
                                <span class="mag-char-stat-value">{{ solverResult.qualityScore }}%</span>
                            </div>
                            <div v-if="solverResult.qualityScore === 0" class="mag-char-solver-row">
                                <span class="mag-char-stat-value" style="font-size: 11px; color: #888">
                                    Solver could not converge — check field consistency and hardware diagnostics below.
                                </span>
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Residuals</span>
                                <span class="mag-char-stat-value">
                                    Z: {{ (solverResult.residuals.zRms * 100).toFixed(1) }}% | XY:
                                    {{ (solverResult.residuals.xyRms * 100).toFixed(1) }}%
                                </span>
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Field |B|</span>
                                <span class="mag-char-stat-value">
                                    {{ solverResult.fieldConsistency.mean }} counts
                                    <span v-if="solverResult.fieldConsistency.suspect" style="color: #ee4444">
                                        — suspicious (±{{ solverResult.fieldConsistency.maxDevPct }}%)</span
                                    >
                                    <span v-else style="color: #4ec97e">
                                        — consistent (±{{ solverResult.fieldConsistency.maxDevPct }}%)</span
                                    >
                                </span>
                            </div>
                            <div v-if="solverResult.chiralityFlag" class="mag-char-solver-row">
                                <span class="mag-char-stat-label" style="color: #ee4444">Chirality</span>
                                <span class="mag-char-stat-value" style="color: #ee4444"
                                    >Possible axis mirroring detected</span
                                >
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Yaw reference</span>
                                <span class="mag-char-stat-value">{{
                                    solverResult.yawAbsolute ? "Absolute (compass)" : "Relative (consistency only)"
                                }}</span>
                            </div>
                            <div v-if="calibrationOffsets" class="mag-char-solver-row">
                                <span class="mag-char-stat-label" style="color: #eebb44">Suggested Calibration</span>
                                <span class="mag-char-stat-value" style="color: #eebb44">
                                    mag_calibration = {{ calibrationOffsets.x }}, {{ calibrationOffsets.y }},
                                    {{ calibrationOffsets.z }}
                                    <span v-if="geoReference" class="mag-char-cal-note">
                                        ({{ geoReference.inclination.toFixed(0) }}° incl,
                                        {{ geoReference.declination.toFixed(0) }}° decl,
                                        {{ geoReference.fieldStrength }} nT)
                                    </span>
                                </span>
                            </div>
                            <div v-if="ellipsoidDiag" class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Hardware Diagnostics</span>
                                <span class="mag-char-stat-value">
                                    <span v-if="ellipsoidDiag.driverSuspect" style="color: #ee4444"
                                        >DRIVER MISMATCH — field direction stationary during rotation</span
                                    >
                                    <span v-else-if="ellipsoidDiag.chirality === 'left-handed'" style="color: #ee4444"
                                        >DRIVER ERROR — left-handed coordinate system</span
                                    >
                                    <span v-else-if="ellipsoidDiag.conditionNumber > 1.15" style="color: #ee6644"
                                        >Gain asymmetry — κ={{ ellipsoidDiag.conditionNumber.toFixed(1) }}</span
                                    >
                                    <span v-else-if="ellipsoidDiag.offDiagonalRms > 0.05" style="color: #eebb44"
                                        >Mounting skew detected</span
                                    >
                                    <span v-else style="color: #4ec97e">Hardware appears healthy</span>
                                </span>
                            </div>
                        </template>
                    </div>

                    <p style="margin-top: 12px">
                        {{ completedPoseCount }} poses captured across {{ directions.length }} directions.
                    </p>
                </div>

                <div class="mag-char-complete-actions">
                    <button
                        type="button"
                        class="mag-char-btn mag-char-btn-primary"
                        @click="exportCharacterizationPoses"
                    >
                        Export Poses for Replay
                    </button>
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="exportCharacterizationData">
                        Export Characterization Data
                    </button>
                    <button
                        type="button"
                        class="mag-char-btn mag-char-btn-cancel"
                        :disabled="isFetchingGeo"
                        @click="refreshGeoReference"
                    >
                        {{ isFetchingGeo ? "Fetching GPS..." : "Refresh GPS" }}
                    </button>
                    <button
                        v-if="solverResult && !solverResult.error"
                        type="button"
                        class="mag-char-btn mag-char-btn-primary"
                        style="background: #eebb44; border-color: #eebb44"
                        @click="doApplyAndReboot"
                    >
                        Apply Alignment &amp; Reboot
                    </button>
                </div>
                <p v-if="!geoReference" class="mag-char-geo-hint">
                    No GPS reference available. Click "Refresh GPS" for declination + calibration, or set declination
                    manually in the Sensors tab after applying.
                </p>

                <!-- CLI commands block -->
                <div v-if="cliCommands.length" class="mag-char-cli-block">
                    <div class="mag-char-cli-header">
                        <span>CLI Commands</span>
                        <button
                            type="button"
                            class="mag-char-btn mag-char-btn-cancel"
                            style="font-size: 10px; padding: 2px 8px"
                            @click="copyCliCommands"
                        >
                            Copy
                        </button>
                    </div>
                    <pre class="mag-char-cli-pre">{{ cliCommands.join("\n") }}</pre>
                </div>

                <!-- Detailed report (LLM-ready text) -->
                <div v-if="showDetailedReport && detailedReport" class="mag-char-report-text">
                    <pre class="mag-char-report-pre">{{ detailedReport }}</pre>
                </div>
                <div class="mag-char-complete-actions" style="margin-top: 8px">
                    <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="toggleReport">
                        {{ showDetailedReport ? "Hide Detailed Report" : "View Detailed Report" }}
                    </button>
                    <button
                        v-if="showDetailedReport"
                        type="button"
                        class="mag-char-btn mag-char-btn-cancel"
                        @click="copyReport"
                    >
                        Copy to Clipboard
                    </button>
                </div>
            </div>

            <!-- Footer -->
            <div class="mag-char-footer">
                <template v-if="phase === 'intro'">
                    <span class="mag-char-readout-spacer"></span>
                    <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="startWizard">
                        Skip — 20 Poses Only
                    </button>
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="startCalibrationPhase">
                        Start with Full Calibration
                    </button>
                </template>

                <div
                    v-if="phase === 'await' || phase === 'capturing' || phase === 'confirmed'"
                    class="mag-char-readout-lines"
                >
                    <div class="mag-char-readout-row">
                        <span class="mag-char-stability-dot" :class="{ stable: isStable && phase === 'await' }"></span>
                        <span
                            v-if="phase === 'await' && isStable && !poseNeedsRetry"
                            class="mag-char-readout-item mag-char-spacebar-prompt"
                            >Press SPACEBAR to capture</span
                        >
                        <span
                            v-else-if="phase === 'await' && isStable && poseNeedsRetry"
                            class="mag-char-readout-item"
                            style="color: #ee6644"
                            >Movement detected — hold steady and press SPACEBAR to retry</span
                        >
                        <span v-else-if="phase === 'await'" class="mag-char-readout-item mag-char-unstable-text"
                            >Hold steady&hellip;</span
                        >
                        <span v-else-if="phase === 'capturing'" class="mag-char-readout-item mag-char-capturing-text"
                            >Capturing&hellip; {{ captureSamples }} samples</span
                        >
                        <span v-else class="mag-char-readout-item" style="color: #4ec97e"
                            >&#10003; Pose captured &mdash; advancing&hellip;</span
                        >
                        <span class="mag-char-readout-sep">|</span>
                        <span class="mag-char-readout-item">Gyro: {{ gyroRms.toFixed(1) }}&deg;/s</span>
                        <span class="mag-char-readout-item">R: {{ lastRoll.toFixed(1) }}&deg;</span>
                        <span class="mag-char-readout-item">P: {{ lastPitch.toFixed(1) }}&deg;</span>
                        <span class="mag-char-readout-spacer"></span>
                        <button
                            v-if="phase === 'capturing'"
                            type="button"
                            class="mag-char-btn mag-char-btn-cancel"
                            @click="retryPose"
                        >
                            Retry
                        </button>
                        <button
                            v-if="phase === 'await'"
                            type="button"
                            class="mag-char-btn mag-char-btn-cancel"
                            @click="skipPose"
                        >
                            Skip
                        </button>
                        <button
                            v-if="phase === 'await'"
                            type="button"
                            class="mag-char-btn mag-char-btn-cancel"
                            @click="cancelWizard"
                        >
                            Cancel
                        </button>
                    </div>
                    <div class="mag-char-readout-row mag-char-readout-row-secondary">
                        <span class="mag-char-readout-item">Mag X: {{ lastMag[0] }}</span>
                        <span class="mag-char-readout-item">Mag Y: {{ lastMag[1] }}</span>
                        <span class="mag-char-readout-item">Mag Z: {{ lastMag[2] }}</span>
                        <span class="mag-char-readout-sep">|</span>
                        <span class="mag-char-readout-item">|B|: {{ lastFieldStrength }}</span>
                    </div>
                </div>

                <button
                    v-if="phase === 'complete'"
                    type="button"
                    class="mag-char-btn mag-char-btn-primary"
                    @click="close"
                >
                    Close
                </button>

                <!-- Replay footer -->
                <div v-if="phase === 'replay'" class="mag-char-readout-bar">
                    <span class="mag-char-readout-item">Auto-playing {{ replayData.length }} poses</span>
                    <span class="mag-char-readout-spacer"></span>
                    <button
                        type="button"
                        class="mag-char-btn mag-char-btn-primary"
                        style="background: #eebb44; border-color: #eebb44"
                        @click="doApplyAndReboot"
                    >
                        Apply Now via CLI
                    </button>
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="finishReplay">
                        View Results
                    </button>
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
/**
 * MagCharacterizationWizard — Full pose wizard with 3D visual aid.
 *
 * UI shell consuming useMagCharacterization.js composable.
 * The composable owns all state, the dialog owns the template + 3D model.
 *
 * 3D VISUAL: Top-down Three.js camera. headingGroup rotates for cardinal
 * direction, droneModel for pitch/roll. N/E/S/W labels CSS-overlaid.
 */
import { ref, reactive, computed, watch, onScopeDispose, onMounted, nextTick } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useMagCharacterization, CAL_PROMPTS } from "../../composables/useMagCharacterization.js";
import MagSphereView from "./mag-calibration/MagSphereView.vue";
import { useFlightControllerStore } from "../../stores/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { send as cliSend, saveAndReconnect, isMspCliSupported } from "../../composables/useMspCliSession.js";
import semver from "semver";

const fcStore = useFlightControllerStore();
const DEG_TO_RAD = Math.PI / 180;

// First firmware whose CUSTOM mag alignment matches the wizard's math:
// "Fix mag_align_yaw" (betaflight#14849, merged 2025-12-30, first release
// 2026.6.0) negates the angles before buildRotationMatrix so the net applied
// transform is Rz(yaw)·Ry(pitch)·Rx(roll) — the convention eulerToMatrix and
// the solver use. Older firmware applies the INVERSE rotation for the same
// CLI values, which would corrupt the heading instead of fixing it.
const MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN = "2026.6.0";

function isCustomMagAlignSupported() {
    // coerce() strips prerelease tags: dev builds of 2026.6.0 (like
    // 2026.6.0-alpha master) are accepted — their build date cannot be
    // verified from the version string alone.
    const v = semver.coerce(fcStore.config?.flightControllerVersion || "");
    return !!v && semver.gte(v, MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN);
}

// ── Composable (all state + logic) ─────────────────────────────────────
const mag = useMagCharacterization();

// Template helper — checks whether a pose at (dirIdx, poseIdx) has been captured
function isPoseDone(di, pi) {
    return captureData.value[di]?.[pi] !== undefined;
}

const {
    directions,
    phase,
    currentDirectionIndex,
    currentSubPoseIndex,
    isStable,
    lastRoll,
    lastPitch,
    lastMag,
    lastFieldStrength,
    gyroRms,
    captureSamples,
    captureData,
    solverResult,
    currentDirection,
    currentPoseDef,
    completedPoseCount,
    startWizard,
    cancelWizard: cancelWizardInner,
    skipPose,
    onKeyDown,
    reset,
    exportCharacterizationPoses,
    exportCharacterizationData,
    finishReplay,
    refreshReplayData,
    replayData,
    calibrationOffsets,
    calibrationValidation,
    magZeroAtCapture,
    geoReference,
    isFetchingGeo,
    refreshGeoReference,
    applyAndReboot,
    generateDetailedReport,
    detailedReport,
    ellipsoidDiag,
    ellipsoidParams,
    calibrationSamples,
    calibrationSampleCount,
    calibrationCoverage,
    calibrationSphereFit,
    calCurrentPrompt,
    poseNeedsRetry,
    startCalibrationPhase,
    completeCalibrationPhase,
    skipCalibration,
    exportCalibrationSamples,
    retryPose,
} = mag;

// Attitude data for MagSphereView calibration phase (reactive, updated by MSP polling)
const attitudeRaw = reactive({ roll: 0, pitch: 0, heading: 0 });
const attitudeQuaternion = ref(null);

const calLiveMag = computed(() => {
    const m = fcStore.sensorData.magnetometer;
    return m && m.length === 3 ? { x: m[0], y: m[1], z: m[2] } : null;
});

const calPromptI18n = computed(() => {
    // Coverage complete → tell the user to stop tumbling, regardless of step
    if (calibrationCoverage.value && calibrationCoverage.value.fraction >= 1) {
        return "magCalibrationPromptAllPainted";
    }
    return CAL_PROMPTS[calCurrentPrompt.value] || CAL_PROMPTS[0];
});

// ── Replay controls ───────────────────────────────────────────────────
const replayIndex = ref(0);
const isAutoPlaying = ref(true);
let autoPlayTimer = null;

const currentAlign = computed(() => fcStore.sensorAlignment.align_mag || 0);

const currentReplayPose = computed(() => replayData.value[replayIndex.value] || null);

// ── Report toggle ────────────────────────────────────────────────────
const showDetailedReport = ref(false);

// ── CLI commands for the user ──────────────────────────────────────────
const cliCommands = computed(() => {
    const lines = [];
    const r = solverResult.value;
    if (!r || r.error) {
        return lines;
    }

    if (r.alignment === 9 && r.customAngles) {
        if (!isCustomMagAlignSupported()) {
            lines.push(
                `# WARNING: firmware ${fcStore.config?.flightControllerVersion || "?"} predates ` +
                    `betaflight#14849 (${MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN}+): it would apply the ` +
                    "INVERSE of these angles. Update the firmware before using CUSTOM alignment.",
            );
        }
        // CLI uses decidegrees (tenths of a degree), our solver outputs degrees
        lines.push("set align_mag = CUSTOM");
        lines.push(`set mag_align_roll = ${Math.round(r.customAngles.roll * 10)}`);
        lines.push(`set mag_align_pitch = ${Math.round(r.customAngles.pitch * 10)}`);
        lines.push(`set mag_align_yaw = ${Math.round(r.customAngles.yaw * 10)}`);
    } else if (r.alignment >= 1 && r.alignment <= 8) {
        const names = ["", "CW0", "CW90", "CW180", "CW270", "CW0FLIP", "CW90FLIP", "CW180FLIP", "CW270FLIP"];
        lines.push(`set align_mag = ${names[r.alignment]}`);
    }

    if (calibrationOffsets.value) {
        if (!calibrationValidation.value || calibrationValidation.value.recommended) {
            lines.push(
                `set mag_calibration = ${calibrationOffsets.value.x},${calibrationOffsets.value.y},${calibrationOffsets.value.z}`,
            );
        } else {
            lines.push(
                `# mag_calibration deferred to per-flight self-calibration: bench interference ` +
                    `contaminated the tumble bias (${calibrationValidation.value.fullCorrectedMeanErr.toFixed(1)}° vs ` +
                    `${calibrationValidation.value.proposedMeanErr.toFixed(1)}° alignment-only on the 20 poses)`,
            );
        }
    }

    if (geoReference.value) {
        lines.push(`set mag_declination = ${Math.round(geoReference.value.declination * 10)}`);
    }

    lines.push("save");
    return lines;
});

function replayPrev() {
    isAutoPlaying.value = false;
    if (replayIndex.value > 0) {
        replayIndex.value--;
    }
}
function replayNext() {
    isAutoPlaying.value = false;
    if (replayIndex.value < replayData.value.length - 1) {
        replayIndex.value++;
    }
}
function toggleAutoPlay() {
    isAutoPlaying.value = !isAutoPlaying.value;
    if (isAutoPlaying.value) {
        startAutoPlay();
    } else {
        stopAutoPlay();
    }
}
function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
        if (!isAutoPlaying.value || replayData.value.length === 0) {
            return;
        }
        if (replayIndex.value >= replayData.value.length - 1) {
            replayIndex.value = 0;
        } else {
            replayIndex.value++;
        }
    }, 1200);
}
function stopAutoPlay() {
    if (autoPlayTimer !== null) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
    }
}

function formatHeading(deg) {
    const d = ((deg % 360) + 360) % 360;
    return `${d.toFixed(0)}\u00B0`;
}
function headingError(actual, expected) {
    if (expected === null || expected === undefined) {
        return 0;
    }
    let diff = actual - expected;
    while (diff > 180) {
        diff -= 360;
    }
    while (diff < -180) {
        diff += 360;
    }
    return Math.abs(diff);
}
function headingClass(actual, expected) {
    const e = headingError(actual, expected);
    if (e < 5) {
        return "good";
    }
    if (e < 15) {
        return "warn";
    }
    return "bad";
}
function headingErrorText(actual, expected) {
    if (expected === null || expected === undefined) {
        return "";
    }
    let diff = actual - expected;
    while (diff > 180) {
        diff -= 360;
    }
    while (diff < -180) {
        diff += 360;
    }
    const e = Math.abs(diff);
    const dir = diff > 0 ? "right" : "left";
    return `off by ${e.toFixed(0)}\u00B0 ${dir}${e < 10 ? " \u2713" : " \u2717"}`;
}

function scoreClass(score) {
    if (!score) {
        return "";
    }
    if (score === "EXCELLENT") {
        return "score-excellent";
    }
    if (score === "GOOD") {
        return "score-good";
    }
    if (score === "POOR") {
        return "score-poor";
    }
    if (score === "BAD") {
        return "score-bad";
    }
    return "score-fatal";
}
function toggleReport() {
    showDetailedReport.value = !showDetailedReport.value;
    if (showDetailedReport.value && !detailedReport.value) {
        generateDetailedReport();
    }
}
function copyReport() {
    if (!detailedReport.value) {
        generateDetailedReport();
    }
    navigator.clipboard.writeText(detailedReport.value || "").catch(() => {});
}
function copyCliCommands() {
    navigator.clipboard.writeText(cliCommands.value.join("\n")).catch(() => {});
}

// Watch for replay phase entry — start auto-play
let _calAttitudeTimer = null;
watch(
    () => mag.phase.value,
    (p) => {
        if (p === "replay") {
            replayIndex.value = 0;
            isAutoPlaying.value = true;
            startAutoPlay();
            nextTick(() => {
                initReplayScene();
            });
        } else if (p === "complete") {
            disposeThreeScene();
            disposeReplayScene();
            stopAutoPlay();
        } else {
            stopAutoPlay();
        }
        if (p === "calibrate" || p === "await" || p === "capturing" || p === "confirmed") {
            if (!_calAttitudeTimer) {
                _calAttitudeTimer = setInterval(() => {
                    MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {
                        const k = fcStore.sensorData.kinematics;
                        attitudeRaw.roll = k[0] || 0;
                        attitudeRaw.pitch = k[1] || 0;
                        attitudeRaw.heading = k[2] || 0;
                    });
                    MSP.send_message(MSPCodes.MSP_ATTITUDE_QUATERNION, false, false, () => {
                        const q = fcStore.sensorData.quaternion;
                        if (q && q.w !== undefined) {
                            attitudeQuaternion.value = q;
                        }
                    });
                }, 80);
            }
        } else if (_calAttitudeTimer) {
            clearInterval(_calAttitudeTimer);
            _calAttitudeTimer = null;
        }
    },
);

// Update replay mini 3D model for each pose
watch(replayIndex, () => {
    const pose = currentReplayPose.value;
    if (pose) {
        updateReplayModel(-(pose.expectedHeading || 0), pose.roll, pose.pitch);
    }
});

// ── Dialog refs ────────────────────────────────────────────────────────
const dialogRef = ref(null);
const threeCanvas = ref(null);
const replay3dCanvas = ref(null);
let resizeObserver = null;

// ── Three.js ───────────────────────────────────────────────────────────
let renderer = null;
let scene = null;
let camera = null;
let headingGroup = null;
let droneModel = null;
let animFrameId = null;
let targetRotX = 0;
let targetRotZ = 0;
let targetHeading = 0;

function initThreeScene() {
    if (!threeCanvas.value) {
        return;
    }
    const parent = threeCanvas.value.parentElement;
    const w = parent.clientWidth || 300;
    const h = parent.clientHeight || 300;

    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas.value, alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, w / Math.max(h, 1), 1, 500);
    camera.position.set(0, 120, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x808080));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.0);
    d1.position.set(0.5, 1, 0.5);
    scene.add(d1);

    headingGroup = new THREE.Object3D();
    scene.add(headingGroup);

    const loader = new GLTFLoader();
    loader.load(
        "./resources/models/quad_x.gltf",
        (gltf) => {
            droneModel = gltf.scene;
            droneModel.scale.set(7, 7, 7);
            headingGroup.add(droneModel);
        },
        undefined,
        (err) => {
            console.warn("MagCharacterization: model load failed", err);
        },
    );

    function animate() {
        animFrameId = requestAnimationFrame(animate);
        if (!renderer || !scene || !camera) {
            return;
        }
        if (droneModel) {
            const lf = 0.1;
            droneModel.rotation.x += (targetRotX * DEG_TO_RAD - droneModel.rotation.x) * lf;
            droneModel.rotation.z += (targetRotZ * DEG_TO_RAD - droneModel.rotation.z) * lf;
        }
        if (headingGroup) {
            const lf = 0.08;
            headingGroup.rotation.y += (targetHeading - headingGroup.rotation.y) * lf;
        }
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
    animate();
}

function updateModelTarget(dirHeading, poseRotX, poseRotZ) {
    targetHeading = dirHeading;
    targetRotX = poseRotX;
    targetRotZ = poseRotZ;
}

function refreshModelTarget() {
    const dir = directions[currentDirectionIndex.value];
    const pose = dir?.poses[currentSubPoseIndex.value];
    if (dir && pose) {
        updateModelTarget(-dir.heading, pose.rotX, pose.rotZ);
    }
}

function disposeThreeScene() {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    scene = null;
    camera = null;
    headingGroup = null;
    droneModel = null;
}

// ── Mini 3D scene for replay View 1 ─────────────────────────────────
let replayRenderer = null;
let replayScene = null;
let replayCamera = null;
let replayDroneGroup = null;
let replayDroneModel = null;
let replayAnimId = null;
let replayTargetRotX = 0;
let replayTargetRotZ = 0;
let replayTargetHeading = 0;

function initReplayScene() {
    if (!replay3dCanvas.value) {
        return;
    }
    const canvas = replay3dCanvas.value;
    const w = canvas.parentElement?.clientWidth || 180;
    const h = w;

    replayRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    replayRenderer.setSize(w, h);
    replayRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    replayRenderer.setClearColor(0x000000, 0);

    replayScene = new THREE.Scene();
    replayCamera = new THREE.PerspectiveCamera(40, w / Math.max(h, 1), 1, 500);
    replayCamera.position.set(0, 140, 0);
    replayCamera.up.set(0, 0, -1);
    replayCamera.lookAt(0, 0, 0);

    replayScene.add(new THREE.AmbientLight(0x808080));
    const d = new THREE.DirectionalLight(0xffffff, 1.0);
    d.position.set(0.5, 1, 0.5);
    replayScene.add(d);

    replayDroneGroup = new THREE.Object3D();
    replayScene.add(replayDroneGroup);

    const loader = new GLTFLoader();
    loader.load("./resources/models/quad_x.gltf", (gltf) => {
        replayDroneModel = gltf.scene;
        replayDroneModel.scale.set(6, 6, 6);
        replayDroneGroup.add(replayDroneModel);
    });

    function animateReplay() {
        replayAnimId = requestAnimationFrame(animateReplay);
        if (!replayRenderer || !replayScene || !replayCamera) {
            return;
        }
        if (replayDroneModel) {
            const lf = 0.1;
            replayDroneModel.rotation.x += (replayTargetRotX * DEG_TO_RAD - replayDroneModel.rotation.x) * lf;
            replayDroneModel.rotation.z += (replayTargetRotZ * DEG_TO_RAD - replayDroneModel.rotation.z) * lf;
        }
        if (replayDroneGroup) {
            const lf = 0.08;
            replayDroneGroup.rotation.y += (replayTargetHeading - replayDroneGroup.rotation.y) * lf;
        }
        if (replayRenderer && replayScene && replayCamera) {
            replayRenderer.render(replayScene, replayCamera);
        }
    }
    animateReplay();
}

function updateReplayModel(headingDeg, rollDeg, pitchDeg) {
    replayTargetHeading = headingDeg * DEG_TO_RAD;
    replayTargetRotX = pitchDeg;
    replayTargetRotZ = rollDeg;
}

function disposeReplayScene() {
    if (replayAnimId) {
        cancelAnimationFrame(replayAnimId);
        replayAnimId = null;
    }
    if (replayRenderer) {
        replayRenderer.dispose();
        replayRenderer = null;
    }
    replayScene = null;
    replayCamera = null;
    replayDroneGroup = null;
    replayDroneModel = null;
}

// ── Wire composable callbacks ──────────────────────────────────────────
mag.setCallbacks({
    onWizardStarted: () => {
        initThreeScene();
        refreshModelTarget();
    },
    onPoseAdvanced: refreshModelTarget,
    onSolverAboutToRun: () => {}, // keep 3D model alive for replay — dispose on "View Results" or close
});

// ── Dialog controls ────────────────────────────────────────────────────
let spacebarHandler = null;

/**
 * Read the mag_calibration active on the FC before any samples are captured.
 * MSP_RAW_IMU streams post-magZero data, so the ellipsoid center fit on the
 * capture is the RESIDUAL bias; computeCalFromEllipsoid composes these values
 * back into the total (magZero_new = newCombined · (center + magZero_capture)).
 * On failure the values are assumed zero — correct unless the user previously
 * ran a mag calibration on this FC.
 */
async function readMagZeroAtCapture() {
    magZeroAtCapture.value = null;
    if (!isMspCliSupported()) {
        console.warn("MSP CLI unsupported (FC < 4.5.4) — assuming mag_calibration = 0,0,0 during capture");
        return;
    }
    try {
        const lines = await cliSend("get mag_calibration", { timeoutMs: 3000 });
        for (const line of lines) {
            const m = /mag_calibration\s*=\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/.exec(line);
            if (m) {
                magZeroAtCapture.value = { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
                console.log("mag_calibration active during capture:", magZeroAtCapture.value);
                return;
            }
        }
        console.warn("Could not parse 'get mag_calibration' response — assuming 0,0,0:", lines);
    } catch (e) {
        console.warn("Failed to read mag_calibration — assuming 0,0,0:", e);
    }
}

function show() {
    reset();
    readMagZeroAtCapture();
    nextTick(() => {
        dialogRef.value?.showModal();
        if (threeCanvas.value?.parentElement && !resizeObserver) {
            resizeObserver = new ResizeObserver(() => {
                if (renderer && threeCanvas.value?.parentElement) {
                    const { clientWidth: w, clientHeight: h } = threeCanvas.value.parentElement;
                    renderer.setSize(w, h);
                    if (camera) {
                        camera.aspect = w / Math.max(h, 1);
                        camera.updateProjectionMatrix();
                    }
                }
            });
            resizeObserver.observe(threeCanvas.value.parentElement);
        }
    });
}

function cancelWizard() {
    cancelWizardInner();
    close();
}

function close() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    dialogRef.value?.close();
}

async function doApplyAndReboot() {
    if (!applyAndReboot()) {
        return;
    }

    if (solverResult.value?.alignment === 9 && !isCustomMagAlignSupported()) {
        alert(
            `CUSTOM mag alignment requires firmware ${MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN} or newer ` +
                `(detected: ${fcStore.config?.flightControllerVersion || "unknown"}).\n\n` +
                "Older firmware builds the custom rotation matrix without the angle negation " +
                "added in betaflight#14849 and would apply the INVERSE of the solved rotation. " +
                "Update the firmware, or use the nearest 90° preset instead.",
        );
        return;
    }

    if (
        !confirm(
            "Apply alignment and reboot the flight controller?\n\nThe FC will disconnect and you'll need to reconnect.",
        )
    ) {
        return;
    }

    try {
        const r = solverResult.value;
        if (r.alignment === 9 && r.customAngles) {
            await cliSend("set align_mag = CUSTOM", { timeoutMs: 5000 });
            await cliSend(`set mag_align_roll = ${Math.round(r.customAngles.roll * 10)}`, { timeoutMs: 5000 });
            await cliSend(`set mag_align_pitch = ${Math.round(r.customAngles.pitch * 10)}`, { timeoutMs: 5000 });
            await cliSend(`set mag_align_yaw = ${Math.round(r.customAngles.yaw * 10)}`, { timeoutMs: 5000 });
        } else if (r.alignment >= 1 && r.alignment <= 8) {
            const names = ["", "CW0", "CW90", "CW180", "CW270", "CW0FLIP", "CW90FLIP", "CW180FLIP", "CW270FLIP"];
            await cliSend(`set align_mag = ${names[r.alignment]}`, { timeoutMs: 5000 });
        }

        if (calibrationOffsets.value && (!calibrationValidation.value || calibrationValidation.value.recommended)) {
            await cliSend(
                `set mag_calibration = ${calibrationOffsets.value.x},${calibrationOffsets.value.y},${calibrationOffsets.value.z}`,
                { timeoutMs: 5000 },
            );
        }

        if (geoReference.value) {
            await cliSend(`set mag_declination = ${Math.round(geoReference.value.declination * 10)}`, {
                timeoutMs: 5000,
            });
        }

        await saveAndReconnect();
        close();
    } catch (e) {
        console.error("Failed to apply alignment", e);
        alert(`Failed to apply: ${e.message || e}`);
    }
}

const debugExpanded = ref(false);
function toggleDebug() {
    debugExpanded.value = !debugExpanded.value;
}
const posesFileLoaded = ref(false);
const calFileLoaded = ref(false);
let _loadedPosesData = null;
let _loadedCalData = null;

/**
 * Debug replay loader — accepts characterization poses and/or calibration tumble JSON.
 *
 * Three workflows, each serving a distinct use case:
 *
 *   BOTH FILES: Full replay. Ellipsoid correction (W_inv, hard iron center) from the
 *   calibration tumble is restored, then the 20-pose solver runs on raw mag samples
 *   (idempotent — same result as the original live capture). After the solver,
 *   ellipsoidParams are restored so the Full Corrected column (4th pane) shows
 *   ellipsoid+alignment heading. Skip to replay → complete.
 *
 *   POSES ONLY: Solver-only replay. No ellipsoid correction available. The 4th pane
 *   shows "N/A — run calibration tumble." Run solver on raw data, skip to replay.
 *
 *   CALIBRATION ONLY: Restore ellipsoid params + geo reference + gains + offsets,
 *   then transition to the live 20-pose wizard (phase "await"). The user performs
 *   poses manually. After completion, the report includes all 4 columns.
 *
 *   IMPORTANT: startWizard() resets ellipsoidParams to null (line 259 of the
 *   composable). Ellipsoid must be saved before calling startWizard() and restored
 *   after. For the BOTH-FILES path, ellipsoid is cleared before runSolver() (solver
 *   sees raw data = idempotent) then restored + refreshReplayData() is called to
 *   populate the 4th column. Changing the order of these operations will silently
 *   break the Full Corrected heading display.
 */
function processDebugLoad() {
    const havePoses = _loadedPosesData !== null;
    const haveCal = _loadedCalData !== null;

    if (havePoses && haveCal) {
        // Restore geo reference + calibration offsets from poses metadata
        if (_loadedPosesData.metadata?.geoReference) {
            mag.geoReference.value = _loadedPosesData.metadata.geoReference;
        }
        if (_loadedPosesData.metadata?.calibrationOffsets) {
            mag.calibrationOffsets.value = _loadedPosesData.metadata.calibrationOffsets;
        }
        // Populate captureData from poses JSON
        mag.captureData.value = _loadedPosesData.directions.map((dir) =>
            dir.poses.map((pose) =>
                pose.samples?.length ? { headingRef: pose.samples[0]?.headingRef || 0, samples: pose.samples } : null,
            ),
        );
        // Clear ellipsoid so solver runs on raw data (idempotent with live run)
        mag.ellipsoidParams.value = null;
        mag.runSolver(
            _loadedPosesData.metadata.currentAlignment,
            _loadedPosesData.metadata.customAngles,
            undefined,
            true,
        );
        // Now restore ellipsoid so Full Corrected column has data
        const ec = _loadedCalData.ellipsoidParams ?? _loadedPosesData.metadata?.ellipsoidCorrection;
        if (ec) {
            mag.ellipsoidParams.value = ec;
            refreshReplayData();
        }
        disposeThreeScene();
        _loadedPosesData = null;
        _loadedCalData = null;
    } else if (havePoses) {
        // Only poses: populate captureData, run solver without ellipsoid
        mag.captureData.value = _loadedPosesData.directions.map((dir) =>
            dir.poses.map((pose) =>
                pose.samples?.length ? { headingRef: pose.samples[0]?.headingRef || 0, samples: pose.samples } : null,
            ),
        );
        mag.runSolver(_loadedPosesData.metadata.currentAlignment, _loadedPosesData.metadata.customAngles, null, false);
        disposeThreeScene();
        _loadedPosesData = null;
    } else if (haveCal) {
        // Only calibration: restore state, skip to await for 20 poses
        const ec = _loadedCalData.ellipsoidParams ?? _loadedCalData.metadata?.ellipsoidCorrection;
        if (ec) {
            mag.ellipsoidParams.value = ec;
        }
        if (_loadedCalData.metadata?.geoReference) {
            mag.geoReference.value = _loadedCalData.metadata.geoReference;
        } else if (_loadedCalData.geoReference) {
            mag.geoReference.value = _loadedCalData.geoReference;
        }
        if (_loadedCalData.metadata?.calibrationOffsets) {
            mag.calibrationOffsets.value = _loadedCalData.metadata.calibrationOffsets;
        } else if (_loadedCalData.calibrationOffsets) {
            mag.calibrationOffsets.value = _loadedCalData.calibrationOffsets;
        }
        // Skip to 20 poses (same as clicking "Skip — 20 Poses Only")
        // Save ellipsoid — startWizard() clears it
        const savedEc = mag.ellipsoidParams.value;
        startWizard();
        mag.ellipsoidParams.value = savedEc;
        _loadedCalData = null;
    }
}

function onPosesFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.directions || data.metadata?.currentAlignment == null) {
                alert(
                    "This doesn't look like a characterization poses file (missing directions/metadata). Did you select the calibration samples file by mistake?",
                );
                return;
            }
            _loadedPosesData = data;
            posesFileLoaded.value = true;
        } catch (err) {
            console.error("Invalid poses JSON", err);
            alert("Invalid poses JSON file");
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

function onCalFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.samples || data.type !== "calibration_tumble") {
                alert(
                    "This doesn't look like a calibration samples file (missing samples/type). Did you select the poses file by mistake?",
                );
                return;
            }
            _loadedCalData = data;
            calFileLoaded.value = true;
        } catch (err) {
            console.error("Invalid calibration JSON", err);
            alert("Invalid calibration JSON file");
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

onMounted(() => {
    spacebarHandler = onKeyDown;
    window.addEventListener("keydown", spacebarHandler);
});

onScopeDispose(() => {
    mag.cleanupTimer();
    disposeThreeScene();
    stopAutoPlay();
    if (spacebarHandler) {
        window.removeEventListener("keydown", spacebarHandler);
    }
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
});

defineExpose({ show, close });
</script>

<style scoped>
.mag-char-dialog {
    border: 1px solid #333;
    border-radius: 8px;
    padding: 0;
    width: 740px;
    max-width: 97vw;
    background: #1a1a2e;
    color: #e0e0e0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.mag-char-dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
}
.mag-char-dialog:not([open]) {
    display: none;
}
.mag-char-container {
    display: flex;
    flex-direction: column;
    max-height: 88vh;
}

.mag-char-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid #2a2a4a;
    background: #16162a;
    border-radius: 8px 8px 0 0;
    flex-shrink: 0;
}
.mag-char-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #c0c0e0;
}
.mag-char-close {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: #888;
    padding: 0 4px;
    line-height: 1;
}
.mag-char-close:hover {
    color: #e0e0e0;
}

.mag-char-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
}
.mag-char-setup-image {
    text-align: center;
    margin-bottom: 16px;
}
.mag-char-setup-image img {
    max-width: 100%;
    max-height: 170px;
    border-radius: 6px;
    border: 1px solid #333;
}
.mag-char-body h4 {
    margin: 0 0 10px;
    font-size: 15px;
    color: #7eb8ff;
}
.mag-char-body p {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.55;
}
.mag-char-body ul,
.mag-char-body ol {
    margin: 0 0 10px;
    padding-left: 22px;
    font-size: 13px;
    line-height: 1.55;
}
.mag-char-body li {
    margin-bottom: 3px;
}

/* Wizard left/right */
.mag-char-wizard-body {
    display: flex;
    flex: 1;
    min-height: 320px;
}
.mag-char-left {
    flex: 1;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-right: 1px solid #2a2a4a;
    min-width: 0;
    overflow-y: auto;
}
.mag-char-right {
    flex: 1;
    padding: 0;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    min-width: 0;
    background: #12122a;
}

/* Pose timeline */
.mag-char-pose-timeline {
    display: flex;
    flex-direction: column;
}
.mag-char-direction-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #7eb8ff;
    padding: 6px 8px 2px;
    margin-top: 2px;
    border-bottom: 1px solid #2a2a4a;
}
.mag-char-direction-header.dimmed {
    color: #444;
}
.mag-char-pose-step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 16px;
    border-radius: 4px;
    font-size: 12px;
    transition: background 0.2s;
}
.mag-char-pose-step.current {
    background: #2a2a5a;
    color: #fff;
}
.mag-char-pose-step.done {
    color: #4ec97e;
}
.mag-char-pose-step.pending {
    color: #444;
}
.mag-char-pose-icon {
    width: 16px;
    height: 16px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
}
.mag-char-pose-step.current .mag-char-pose-icon {
    background: #4a6cf7;
    color: #fff;
}
.mag-char-pose-step.done .mag-char-pose-icon {
    color: #4ec97e;
}

.mag-char-instruction-text {
    font-size: 12px;
    line-height: 1.45;
    margin: 0 0 4px;
}
.mag-char-instruction-hint {
    color: #777;
    font-size: 11px;
    font-style: italic;
    margin: 0;
}

/* 3D visual */
.mag-char-visual {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 280px;
    overflow: hidden;
}
.mag-char-three-canvas {
    width: 100%;
    height: 100%;
    display: block;
}
.mag-char-cardinal {
    position: absolute;
    font-size: 14px;
    font-weight: 700;
    color: #ccc;
    z-index: 2;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    pointer-events: none;
}
.mag-char-cardinal-n {
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    color: #ff6666;
    font-size: 16px;
}
.mag-char-cardinal-s {
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 16px;
}
.mag-char-cardinal-e {
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
}
.mag-char-cardinal-w {
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
}

/* Complete */
.mag-char-summary-card {
    padding: 16px;
    background: #222240;
    border-radius: 6px;
}
.mag-char-summary-card h4 {
    margin: 0 0 8px;
    color: #4a6cf7;
    font-size: 15px;
}
.mag-char-summary-card p {
    margin: 0 0 6px;
    font-size: 13px;
}
.mag-char-stats {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.mag-char-stat-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.mag-char-stat-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #777;
    letter-spacing: 0.5px;
}
.mag-char-stat-value {
    font-size: 12px;
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    color: #c0c0c0;
}

/* Footer */
.mag-char-footer {
    padding: 8px 14px;
    border-top: 1px solid #2a2a4a;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: #16162a;
    border-radius: 0 0 8px 8px;
    flex-shrink: 0;
    align-items: center;
    min-height: 52px;
}
.mag-char-readout-lines {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
}
.mag-char-readout-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    color: #7eb8ff;
    flex-wrap: wrap;
}
.mag-char-readout-row-secondary {
    color: #6699cc;
    font-size: 10px;
}
.mag-char-readout-item {
    white-space: nowrap;
}
.mag-char-readout-sep {
    color: #444;
    margin: 0 2px;
}
.mag-char-readout-spacer {
    flex: 1;
}
.mag-char-stability-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ee4444;
    flex-shrink: 0;
    transition: background 0.3s;
}
.mag-char-stability-dot.stable {
    background: #4ec97e;
    box-shadow: 0 0 6px #4ec97e;
}
.mag-char-spacebar-prompt {
    color: #4ec97e;
    font-weight: 600;
}
.mag-char-unstable-text {
    color: #ee4444;
}
.mag-char-capturing-text {
    color: #ffaa44;
}

.mag-char-btn {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid #3a3a5a;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
}
.mag-char-btn-cancel {
    background: #2a2a3e;
    color: #c0c0c0;
}
.mag-char-btn-cancel:hover {
    background: #3a3a5a;
}
.mag-char-btn-primary {
    background: #4a6cf7;
    color: #fff;
    border-color: #4a6cf7;
}
.mag-char-btn-primary:hover {
    background: #5a7cff;
}

/* Replay phase */
.mag-char-replay-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    border-top: 1px solid #2a2a4a;
}
.mag-char-replay-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 12px;
}
.mag-char-replay-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    font-size: 12px;
    border-bottom: 1px solid #2a2a4a;
    margin-bottom: 10px;
    flex-shrink: 0;
}
.mag-char-replay-pose-label {
    color: #c0c0c0;
    font-weight: 600;
}
.mag-char-replay-dir-label {
    color: #7eb8ff;
}
.mag-char-replay-spacer {
    flex: 1;
}
.mag-char-replay-pose-context {
    text-align: center;
    font-size: 12px;
    color: #888;
    padding: 8px 0;
    border-bottom: 1px solid #2a2a4a;
    margin-bottom: 12px;
}
.mag-char-replay-compare-row {
    display: flex;
    gap: 12px;
    flex: 1;
    min-height: 140px;
}
.mag-char-replay-compare-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0d0d1a;
    border-radius: 8px;
    padding: 12px;
    gap: 8px;
    min-width: 0;
}
.mag-char-replay-canvas {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
}
.mag-char-replay-score {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 1px 6px;
    border-radius: 3px;
}
.mag-char-replay-score.score-excellent {
    color: #4ec97e;
    background: rgba(30, 80, 30, 0.4);
}
.mag-char-replay-score.score-good {
    color: #88cc44;
    background: rgba(40, 60, 20, 0.4);
}
.mag-char-replay-score.score-poor {
    color: #eebb44;
    background: rgba(80, 60, 20, 0.4);
}
.mag-char-replay-score.score-bad {
    color: #ee6644;
    background: rgba(80, 30, 20, 0.4);
}
.mag-char-replay-score.score-fatal {
    color: #ee4444;
    background: rgba(80, 20, 20, 0.4);
}
.mag-char-replay-field-warn {
    font-size: 10px;
    color: #eebb44;
    margin-top: 2px;
}
.mag-char-replay-gain-line {
    font-size: 12px;
    color: #888;
    margin-top: 2px;
}
.mag-char-replay-gain-note {
    font-size: 9px;
    color: #666;
}
.mag-char-report-text {
    margin-top: 12px;
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
}
.mag-char-report-pre {
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    font-size: 11px;
    color: #c0c0c0;
    padding: 12px;
    margin: 0;
    white-space: pre-wrap;
    background: #0d0d1a;
}
.mag-char-cli-block {
    margin-top: 12px;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    overflow: hidden;
}
.mag-char-cli-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: #1a1a30;
    font-size: 11px;
    color: #888;
    border-bottom: 1px solid #2a2a4a;
}
.mag-char-cli-pre {
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    font-size: 12px;
    color: #4ec97e;
    padding: 10px;
    margin: 0;
    white-space: pre-wrap;
    background: #0d0d1a;
}
.mag-char-debug-item {
    display: block;
    padding: 6px 12px;
    font-size: 11px;
    color: #888;
    cursor: pointer;
    white-space: nowrap;
}
.mag-char-debug-item:hover {
    color: #ccc;
    background: #2a2a4e;
}
.mag-char-debug-item.loaded {
    color: #4ec97e;
}
.mag-char-replay-na {
    font-size: 10px;
    color: #666;
    font-style: italic;
    padding: 8px 0;
}
</style>
