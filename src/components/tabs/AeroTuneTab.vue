<template>
    <BaseTab tab-name="aerotune">
        <!-- Header -->
        <div class="aerotune-header">
            <div>
                <p class="aerotune-title">AeroTune™</p>
                <p class="aerotune-subtitle">
                    Intelligent PID Calculator &amp; Blackbox Analyzer &nbsp;·&nbsp; By Simon Jardine –
                    <a href="https://aerobot2.com" target="_blank" rel="noopener noreferrer">aerobot2.com</a>
                </p>
            </div>
        </div>

        <!-- Sub-tab navigation -->
        <div class="aerotune-tabs">
            <button
                class="at-tab-btn"
                :class="{ active: activeView === 'calculator' }"
                @click="activeView = 'calculator'"
            >
                STEP 1: CALCULATOR
            </button>
            <button class="at-tab-btn" :class="{ active: activeView === 'analyzer' }" @click="activeView = 'analyzer'">
                STEP 2: LOG ANALYZER
            </button>
            <button class="at-tab-btn" :class="{ active: activeView === 'autotune' }" @click="activeView = 'autotune'">
                AUTO TUNE
            </button>
            <button
                class="at-tab-btn"
                :class="{ active: activeView === 'instructions' }"
                @click="activeView = 'instructions'"
            >
                INSTRUCTIONS
            </button>
        </div>

        <div class="aerotune-body">
            <!-- ═══════════════ CALCULATOR ═══════════════ -->
            <div v-show="activeView === 'calculator'" class="at-view">
                <div class="at-calculator">
                    <!-- Left: Inputs -->
                    <div class="at-panel">
                        <div class="at-panel-header">⚙ SPECIFICATION INPUT</div>
                        <div class="at-panel-body">
                            <div class="at-form-row">
                                <label>Motor KV (200 – 11500)</label>
                                <input type="number" v-model.number="kv" min="200" max="11500" step="100" />
                            </div>

                            <div class="at-form-row">
                                <label>Battery Voltage</label>
                                <div class="at-voltage-presets">
                                    <button
                                        v-for="preset in voltagePresets"
                                        :key="preset.label"
                                        :class="{ selected: voltage === preset.v }"
                                        @click="selectVoltage(preset.v)"
                                    >
                                        {{ preset.label }}
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    v-model.number="voltage"
                                    min="3.0"
                                    max="60.0"
                                    step="0.1"
                                    @input="voltageSelectedPreset = null"
                                />
                            </div>

                            <div class="at-form-row">
                                <label>Prop Size (inches, 2 – 11)</label>
                                <input type="number" v-model.number="prop" min="2" max="11" step="0.5" />
                            </div>

                            <div class="at-form-row">
                                <label>Total Weight g (80 – 5000)</label>
                                <input type="number" v-model.number="weight" min="80" max="5000" step="10" />
                            </div>

                            <div class="at-form-row">
                                <label>Flying Style</label>
                                <select v-model="style">
                                    <option value="Bando">Bando</option>
                                    <option value="Racing">Racing</option>
                                    <option value="Long Range">Long Range</option>
                                    <option value="Cinematic">Cinematic</option>
                                </select>
                            </div>

                            <button class="at-calc-btn" @click="calculate">🚀 CALCULATE PIDs</button>
                        </div>
                    </div>

                    <!-- Right: Outputs -->
                    <div class="at-panel">
                        <div class="at-panel-header">📊 CALCULATED PID OUTPUT</div>
                        <div class="at-panel-body">
                            <div class="at-no-result" v-if="!showResults">Enter specs and click CALCULATE PIDs</div>

                            <div v-else>
                                <table class="at-pid-table">
                                    <thead>
                                        <tr>
                                            <th class="at-pid-th-axis"></th>
                                            <th>
                                                Proportional
                                                <span
                                                    class="at-tip"
                                                    @mouseenter="
                                                        showTip(
                                                            $event,
                                                            'How far the drone reacts to an input — like how far a seesaw swings. Too low and it feels sluggish, too high and it overshoots.',
                                                        )
                                                    "
                                                    @mouseleave="hideTip"
                                                    >ⓘ</span
                                                >
                                            </th>
                                            <th>
                                                Integral
                                                <span
                                                    class="at-tip"
                                                    @mouseenter="
                                                        showTip(
                                                            $event,
                                                            'How quickly it returns to centre after a disturbance — like the seesaw finding balance. Too low and it drifts, too high and it hunts.',
                                                        )
                                                    "
                                                    @mouseleave="hideTip"
                                                    >ⓘ</span
                                                >
                                            </th>
                                            <th>
                                                Derivative
                                                <span
                                                    class="at-tip"
                                                    @mouseenter="
                                                        showTip(
                                                            $event,
                                                            'The dampening that cushions the movement — like a rubber tyre under the seesaw. Stops it bouncing back and forth after each input.',
                                                        )
                                                    "
                                                    @mouseleave="hideTip"
                                                    >ⓘ</span
                                                >
                                            </th>
                                            <th>
                                                D Max
                                                <span
                                                    class="at-tip"
                                                    @mouseenter="
                                                        showTip(
                                                            $event,
                                                            'The maximum dampening allowed at high throttle — D rises up to this ceiling during fast manoeuvres.',
                                                        )
                                                    "
                                                    @mouseleave="hideTip"
                                                    >ⓘ</span
                                                >
                                            </th>
                                            <th>
                                                Feedforward
                                                <span
                                                    class="at-tip"
                                                    @mouseenter="
                                                        showTip(
                                                            $event,
                                                            'How eagerly it anticipates your stick input — jumps ahead of the move rather than reacting to it.',
                                                        )
                                                    "
                                                    @mouseleave="hideTip"
                                                    >ⓘ</span
                                                >
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr class="at-pid-row at-pid-row--roll">
                                            <td class="at-pid-axis-label">ROLL</td>
                                            <td class="at-pid-num">{{ pids.roll_p }}</td>
                                            <td class="at-pid-num">{{ pids.roll_i }}</td>
                                            <td class="at-pid-num">{{ pids.d_min_roll }}</td>
                                            <td class="at-pid-num">{{ pids.dMax_roll }}</td>
                                            <td class="at-pid-num">{{ pids.roll_f }}</td>
                                        </tr>
                                        <tr class="at-pid-row at-pid-row--pitch">
                                            <td class="at-pid-axis-label">PITCH</td>
                                            <td class="at-pid-num">{{ pids.pitch_p }}</td>
                                            <td class="at-pid-num">{{ pids.pitch_i }}</td>
                                            <td class="at-pid-num">{{ pids.d_min_pitch }}</td>
                                            <td class="at-pid-num">{{ pids.dMax_pitch }}</td>
                                            <td class="at-pid-num">{{ pids.pitch_f }}</td>
                                        </tr>
                                        <tr class="at-pid-row at-pid-row--yaw">
                                            <td class="at-pid-axis-label">YAW</td>
                                            <td class="at-pid-num">{{ pids.yaw_p }}</td>
                                            <td class="at-pid-num">{{ pids.yaw_i }}</td>
                                            <td class="at-pid-num at-pid-num--muted">–</td>
                                            <td class="at-pid-num">{{ pids.yaw_d }}</td>
                                            <td class="at-pid-num">{{ pids.yaw_f }}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div class="at-dmin-row">
                                    D_Min: &nbsp; Roll <span>{{ pids.d_min_roll }}</span> &nbsp;&nbsp; Pitch
                                    <span>{{ pids.d_min_pitch }}</span>
                                </div>

                                <div class="at-filter-rec">
                                    <div style="font-size: 11px; color: var(--subtleText); margin-bottom: 4px">
                                        RECOMMENDED GYRO LOWPASS 2
                                    </div>
                                    <div>
                                        <span class="at-filter-val">{{ filterRec.hz }}</span>
                                        <span style="font-size: 11px; color: var(--subtleText)">
                                            Hz &nbsp;·&nbsp;
                                        </span>
                                        <span style="font-size: 11px; color: var(--subtleText)">{{
                                            filterRec.note
                                        }}</span>
                                    </div>
                                    <div style="font-size: 11px; color: var(--subtleText); margin-top: 4px">
                                        Range: {{ filterRec.low }} – {{ filterRec.high }} Hz
                                    </div>
                                </div>

                                <button class="at-apply-btn" :disabled="!canApply" @click="applyToFC">
                                    ✔ APPLY PIDs TO FC (PID TUNING TAB)
                                </button>
                                <button class="at-copy-btn" @click="copyValues">{{ copyBtnText }}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ═══════════════ ANALYZER ═══════════════ -->
            <div v-show="activeView === 'analyzer'" class="at-view">
                <div class="at-analyzer">
                    <div class="at-panel" style="margin-bottom: 12px">
                        <div class="at-panel-header">WORKFLOW</div>
                        <div class="at-panel-body" style="font-size: 12px; color: var(--subtleText); line-height: 1.8">
                            {{ workflowInstructions }}
                        </div>
                    </div>

                    <div class="at-panel">
                        <div class="at-panel-header">📂 FLIGHT LOG ANALYSIS (HIGH THROTTLE)</div>
                        <div class="at-panel-body">
                            <div class="at-form-row" style="margin-bottom: 10px">
                                <label style="font-size: 12px; color: var(--subtleText)">Motors after flight:</label>
                                <div class="at-voltage-presets">
                                    <button
                                        v-for="t in ['COOL', 'WARM', 'HOT']"
                                        :key="t"
                                        :class="{ selected: motorTemp === t }"
                                        @click="motorTemp = t"
                                    >
                                        {{ t }}
                                    </button>
                                </div>
                            </div>

                            <div class="at-file-row">
                                <button type="button" class="at-file-label" @click="$refs.fileInput.click()">
                                    Select BBL / BFL / CSV
                                </button>
                                <input
                                    type="file"
                                    ref="fileInput"
                                    accept=".bfl,.bbl,.csv"
                                    style="display: none"
                                    @change="onFileChange"
                                />
                                <span class="at-file-name">{{ fileName }}</span>
                                <button id="at-analyze-btn" :disabled="!csvFile" @click="analyzeFile">
                                    🔍 ANALYZE
                                </button>
                            </div>

                            <div v-if="bblSessions.length > 1" class="at-form-row" style="margin-top: 8px">
                                <label style="font-size: 12px; color: var(--subtleText)">Select flight session:</label>
                                <select v-model.number="bblSelectedSession" @change="runBBLSession(bblSelectedSession)">
                                    <option v-for="(_, idx) in bblSessions" :key="idx" :value="idx">
                                        Session {{ idx + 1 }}
                                    </option>
                                </select>
                            </div>

                            <div class="at-results-box">{{ analysisResult }}</div>

                            <!-- ═══ SysID / Chirp frequency-response results ═══ -->
                            <div v-if="sysidResult" class="at-sysid-section">
                                <div class="at-sysid-banner">
                                    ⚡ CHIRP / SYSID LOG DETECTED — running frequency response analysis
                                </div>

                                <!-- Roll Bode plot -->
                                <div
                                    v-if="sysidResult.axes.roll && !sysidResult.axes.roll.error"
                                    class="at-sysid-axis-block"
                                >
                                    <div class="at-sysid-axis-label">ROLL — Frequency Response (Bode Plot)</div>
                                    <canvas ref="bodePlotRoll" class="at-bode-canvas" width="580" height="300"></canvas>
                                </div>
                                <div v-else-if="sysidResult.axes.roll?.error" class="at-sysid-axis-err">
                                    ROLL: {{ sysidResult.axes.roll.error }}
                                </div>

                                <!-- Pitch Bode plot -->
                                <div
                                    v-if="sysidResult.axes.pitch && !sysidResult.axes.pitch.error"
                                    class="at-sysid-axis-block"
                                >
                                    <div class="at-sysid-axis-label">PITCH — Frequency Response (Bode Plot)</div>
                                    <canvas
                                        ref="bodePlotPitch"
                                        class="at-bode-canvas"
                                        width="580"
                                        height="300"
                                    ></canvas>
                                </div>
                                <div v-else-if="sysidResult.axes.pitch?.error" class="at-sysid-axis-err">
                                    PITCH: {{ sysidResult.axes.pitch.error }}
                                </div>

                                <!-- Yaw Bode plot -->
                                <div
                                    v-if="sysidResult.axes.yaw && !sysidResult.axes.yaw.error"
                                    class="at-sysid-axis-block"
                                >
                                    <div class="at-sysid-axis-label">YAW — Frequency Response (Bode Plot)</div>
                                    <canvas ref="bodePlotYaw" class="at-bode-canvas" width="580" height="300"></canvas>
                                </div>
                                <div v-else-if="sysidResult.axes.yaw?.error" class="at-sysid-axis-err">
                                    YAW: {{ sysidResult.axes.yaw.error }}
                                </div>

                                <!-- Stability margins table -->
                                <div class="at-sysid-table-wrap">
                                    <div class="at-sysid-table-title">STABILITY MARGINS</div>
                                    <table class="at-sysid-table">
                                        <thead>
                                            <tr>
                                                <th>Axis</th>
                                                <th>Phase Margin</th>
                                                <th>Gain Margin</th>
                                                <th>GC Freq (Hz)</th>
                                                <th>PC Freq (Hz)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="axisName in ['roll', 'pitch', 'yaw']" :key="axisName">
                                                <td>{{ axisName.toUpperCase() }}</td>
                                                <template
                                                    v-if="
                                                        sysidResult.axes[axisName] && !sysidResult.axes[axisName].error
                                                    "
                                                >
                                                    <td
                                                        :class="
                                                            stabilityClass(sysidResult.axes[axisName].phaseMargin, 'pm')
                                                        "
                                                    >
                                                        {{
                                                            sysidResult.axes[axisName].phaseMargin !== null
                                                                ? sysidResult.axes[axisName].phaseMargin.toFixed(1) +
                                                                  "°"
                                                                : "N/A"
                                                        }}
                                                    </td>
                                                    <td
                                                        :class="
                                                            stabilityClass(sysidResult.axes[axisName].gainMargin, 'gm')
                                                        "
                                                    >
                                                        {{
                                                            sysidResult.axes[axisName].gainMargin !== null
                                                                ? sysidResult.axes[axisName].gainMargin.toFixed(1) +
                                                                  " dB"
                                                                : "N/A"
                                                        }}
                                                    </td>
                                                    <td>
                                                        {{
                                                            sysidResult.axes[axisName].gcFreq !== null
                                                                ? sysidResult.axes[axisName].gcFreq.toFixed(1)
                                                                : "N/A"
                                                        }}
                                                    </td>
                                                    <td>
                                                        {{
                                                            sysidResult.axes[axisName].pcFreq !== null
                                                                ? sysidResult.axes[axisName].pcFreq.toFixed(1)
                                                                : "N/A"
                                                        }}
                                                    </td>
                                                </template>
                                                <template v-else>
                                                    <td colspan="4">
                                                        {{ sysidResult.axes[axisName]?.error || "N/A" }}
                                                    </td>
                                                </template>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <!-- PID suggestions -->
                                <div class="at-sysid-pid-section">
                                    <div class="at-sysid-pid-header">SUGGESTED PID ADJUSTMENTS</div>
                                    <div
                                        v-for="axisName in ['roll', 'pitch', 'yaw']"
                                        :key="axisName"
                                        class="at-sysid-pid-row"
                                    >
                                        <template v-if="sysidResult.axes[axisName]?.pidSuggest">
                                            <span class="at-sysid-pid-axis">{{ axisName.toUpperCase() }}:</span>
                                            <span>
                                                P {{ sysidResult.axes[axisName].currentP }} →
                                                {{ sysidResult.axes[axisName].pidSuggest.suggestP }}
                                            </span>
                                            <span v-if="sysidResult.axes[axisName].currentD !== null">
                                                &nbsp; D {{ sysidResult.axes[axisName].currentD }} →
                                                {{ sysidResult.axes[axisName].pidSuggest.suggestD }}
                                            </span>
                                            <span class="at-sysid-pid-reason">
                                                &nbsp; ({{ sysidResult.axes[axisName].pidSuggest.reason }})
                                            </span>
                                        </template>
                                        <template
                                            v-else-if="sysidResult.axes[axisName] && !sysidResult.axes[axisName].error"
                                        >
                                            <span class="at-sysid-pid-axis">{{ axisName.toUpperCase() }}:</span>
                                            <span>No current PID values found in log header.</span>
                                        </template>
                                    </div>
                                </div>

                                <!-- Warnings -->
                                <div v-if="sysidResult.warnings.length > 0" class="at-sysid-warnings">
                                    <div v-for="(w, i) in sysidResult.warnings" :key="i" class="at-sysid-warning-item">
                                        ⚠ {{ w }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ═══════════════ INSTRUCTIONS ═══════════════ -->
            <div v-show="activeView === 'instructions'" class="at-view">
                <div class="at-instructions">
                    <button class="at-instructions-popup-btn" @click="openInstructionsPopup">
                        ↗ Open in New Window
                    </button>
                    <h3>STEP 1: CALCULATE BASELINE PIDs</h3>
                    <ul>
                        <li>Enter motor KV, battery voltage, prop size, weight and flying style.</li>
                        <li>Click <strong>CALCULATE PIDs</strong> to get conservative baseline values.</li>
                        <li>
                            Click <strong>APPLY PIDs TO FC</strong> to write them directly to the PID Tuning tab, or use
                            <strong>COPY ALL VALUES</strong> to copy them to the clipboard.
                        </li>
                    </ul>

                    <h3>STEP 2: CONFIGURE BLACKBOX</h3>
                    <ul>
                        <li>In Betaflight, go to Configuration → Blackbox → Enable, Device = SD Card.</li>
                        <li>
                            Set Blackbox logging rate to 1/2 or better — higher rates give better frequency resolution
                            for the analyzer.
                        </li>
                        <li>Enable: Gyro, Gyro (Unfiltered), Motor, PID, RC Commands, RPM, Setpoint, Accelerometer.</li>
                        <li><strong>Betaflight 4.5+:</strong> raw gyro is always logged automatically.</li>
                        <li>
                            <strong>Betaflight 4.3/4.4:</strong> set Debug Mode to <code>GYRO_SCALED</code> to capture
                            unfiltered gyro data.
                        </li>
                        <li>
                            Use fresh propellers — damaged props introduce false noise and will give inaccurate results.
                        </li>
                    </ul>

                    <h3>STEP 3: FLY THE TEST PATTERN</h3>
                    <ul>
                        <li>Level mode or Acro mode both work — LOS or FPV.</li>
                        <li>
                            Level mode: full left stick hold 1–1.5 seconds, pause, full right, pause, full forward,
                            pause, full back.
                        </li>
                        <li>Acro mode: sharp direct inputs at 20° and 45°, with brief pauses between each.</li>
                        <li>
                            Aim for a 2 minute flight. Fly through the full throttle range — the Analyzer needs data
                            across all throttle levels to give an accurate result.
                        </li>
                    </ul>

                    <h3>STEP 4: ANALYZE THE LOG</h3>
                    <ul>
                        <li>In Betaflight, go to the Blackbox tab and click USB Storage Mode.</li>
                        <li>Drag your .bfl file from the FC storage to your desktop.</li>
                        <li>Unplug the FC, then plug it back in and open Betaflight.</li>
                        <li>In the AeroTune tab, click Select BBL / BFL, choose your .bfl file and click ANALYZE.</li>
                    </ul>

                    <h3>INTERPRETING RESULTS</h3>
                    <ul>
                        <li>
                            <span class="at-status-ok">EXCELLENT / CLEAN</span> – filters are well-tuned, no changes
                            needed
                        </li>
                        <li><span class="at-status-ok">GOOD</span> – minor adjustments may help</li>
                        <li><span class="at-status-warn">FAIR</span> – lower Gyro Lowpass 2 by ~30 Hz, re-test</li>
                        <li>
                            <span class="at-status-warn">WEAK</span> – lower by ~50 Hz, consider adding a Notch filter
                        </li>
                        <li>
                            <span class="at-status-bad">VERY WEAK</span> – aggressive filter reduction needed; check for
                            mechanical vibration
                        </li>
                    </ul>

                    <h3>FILTER RECOMMENDATION NOTE</h3>
                    <ul>
                        <li>
                            <strong>Gyro Lowpass 2:</strong> The value shown in the Calculator is a
                            <em>starting point</em> based on prop size. Use the Analyzer results to fine-tune after
                            flying.
                        </li>
                        <li>
                            <strong>Dynamic Notch Filter:</strong> Enable and adjust count based on analyzer results to
                            target resonant frequencies.
                        </li>
                        <li>
                            <strong>Gyro RPM Filter:</strong> Enable if using bidirectional DSHOT — the most effective
                            filter available for eliminating motor noise harmonics.
                        </li>
                    </ul>
                </div>
            </div>

            <!-- ═══════════════ AUTO TUNE ═══════════════ -->
            <div v-show="activeView === 'autotune'" class="at-view">
                <!-- Prop size selector -->
                <div class="at-panel at-prop-selector">
                    <div class="at-panel-header">
                        PROP SIZE
                        <span
                            class="at-tip"
                            @mouseenter="
                                showTip(
                                    $event,
                                    'Select your prop diameter. This sets smart defaults for sweep frequency range and shake amplitude. You can still override them in Advanced Settings.',
                                )
                            "
                            @mouseleave="hideTip"
                            >ⓘ</span
                        >
                    </div>
                    <div class="at-panel-body">
                        <div class="at-prop-btns">
                            <button
                                v-for="size in [3, 4, 5, 6, 7, 8, 9, 10]"
                                :key="size"
                                :class="['at-prop-btn', { active: chirpPropInch === size }]"
                                @click="chirpPropInch = size"
                            >
                                {{ size }}"
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Axis amplitude cards -->
                <div class="at-chirp-cards">
                    <div class="at-panel at-chirp-card">
                        <div class="at-panel-header at-chirp-card-header--pitch">PITCH</div>
                        <div class="at-panel-body">
                            <div class="at-intensity-label">
                                SHAKE INTENSITY
                                <span
                                    class="at-tip"
                                    @mouseenter="
                                        showTip(
                                            $event,
                                            'How hard we shake the drone to measure its response. Like a firm handshake — harder means more data but more movement. Start with MEDIUM.',
                                        )
                                    "
                                    @mouseleave="hideTip"
                                    >ⓘ</span
                                >
                            </div>
                            <div class="at-intensity-btns">
                                <button
                                    :class="['at-intensity-btn', { active: chirpPitchLevel === 'EASY' }]"
                                    @click="setChirpLevel('pitch', 'EASY')"
                                >
                                    EASY
                                </button>
                                <button
                                    :class="['at-intensity-btn', { active: chirpPitchLevel === 'MEDIUM' }]"
                                    @click="setChirpLevel('pitch', 'MEDIUM')"
                                >
                                    MEDIUM
                                </button>
                                <button
                                    :class="['at-intensity-btn', { active: chirpPitchLevel === 'HARD' }]"
                                    @click="setChirpLevel('pitch', 'HARD')"
                                >
                                    HARD
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="at-panel at-chirp-card">
                        <div class="at-panel-header at-chirp-card-header--roll">ROLL</div>
                        <div class="at-panel-body">
                            <div class="at-intensity-label">
                                SHAKE INTENSITY
                                <span
                                    class="at-tip"
                                    @mouseenter="
                                        showTip(
                                            $event,
                                            'How hard we shake the drone to measure its response. Like a firm handshake — harder means more data but more movement. Start with MEDIUM.',
                                        )
                                    "
                                    @mouseleave="hideTip"
                                    >ⓘ</span
                                >
                            </div>
                            <div class="at-intensity-btns">
                                <button
                                    :class="['at-intensity-btn', { active: chirpRollLevel === 'EASY' }]"
                                    @click="setChirpLevel('roll', 'EASY')"
                                >
                                    EASY
                                </button>
                                <button
                                    :class="['at-intensity-btn', { active: chirpRollLevel === 'MEDIUM' }]"
                                    @click="setChirpLevel('roll', 'MEDIUM')"
                                >
                                    MEDIUM
                                </button>
                                <button
                                    :class="['at-intensity-btn', { active: chirpRollLevel === 'HARD' }]"
                                    @click="setChirpLevel('roll', 'HARD')"
                                >
                                    HARD
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="at-panel at-chirp-card">
                        <div class="at-panel-header at-chirp-card-header--yaw">YAW</div>
                        <div class="at-panel-body">
                            <div class="at-intensity-label">
                                SHAKE INTENSITY
                                <span
                                    class="at-tip"
                                    @mouseenter="
                                        showTip(
                                            $event,
                                            'How hard we shake the drone to measure its response. Like a firm handshake — harder means more data but more movement. Start with MEDIUM.',
                                        )
                                    "
                                    @mouseleave="hideTip"
                                    >ⓘ</span
                                >
                            </div>
                            <div class="at-intensity-btns">
                                <button
                                    :class="['at-intensity-btn', { active: chirpYawLevel === 'EASY' }]"
                                    @click="setChirpLevel('yaw', 'EASY')"
                                >
                                    EASY
                                </button>
                                <button
                                    :class="['at-intensity-btn', { active: chirpYawLevel === 'MEDIUM' }]"
                                    @click="setChirpLevel('yaw', 'MEDIUM')"
                                >
                                    MEDIUM
                                </button>
                                <button
                                    :class="['at-intensity-btn', { active: chirpYawLevel === 'HARD' }]"
                                    @click="setChirpLevel('yaw', 'HARD')"
                                >
                                    HARD
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Configure button -->
                <button class="at-chirp-configure-btn" @click="configureFc">⚙ CONFIGURE ALL AXES ON FC</button>

                <!-- Confirmation box -->
                <div v-if="chirpConfigured" class="at-chirp-confirm">
                    <div class="at-chirp-confirm-title">✓ Commands sent to FC:</div>
                    <pre>{{ chirpConfirmText }}</pre>
                </div>

                <!-- Advanced settings (collapsed by default) -->
                <div class="at-advanced-section">
                    <button
                        type="button"
                        class="at-advanced-toggle"
                        @click="advancedOpen = !advancedOpen"
                        :aria-expanded="advancedOpen"
                    >
                        ⚙ ADVANCED SETTINGS
                        <span class="at-advanced-chevron" :class="{ open: advancedOpen }">▶</span>
                    </button>
                    <div v-if="advancedOpen" class="at-advanced-body">
                        <div class="at-form-row">
                            <label
                                >Sweep Start Hz
                                <span
                                    class="at-tip"
                                    @mouseenter="
                                        showTip(
                                            $event,
                                            'The lowest frequency in the sweep. Leave at default unless you know your problem frequency.',
                                        )
                                    "
                                    @mouseleave="hideTip"
                                    >ⓘ</span
                                ></label
                            >
                            <input type="number" v-model.number="chirpStartHz" min="0.1" max="100" step="0.1" />
                        </div>
                        <div class="at-form-row">
                            <label
                                >Sweep End Hz
                                <span
                                    class="at-tip"
                                    @mouseenter="
                                        showTip(
                                            $event,
                                            'The highest frequency in the sweep. 600Hz covers all relevant drone frequencies.',
                                        )
                                    "
                                    @mouseleave="hideTip"
                                    >ⓘ</span
                                ></label
                            >
                            <input type="number" v-model.number="chirpEndHz" min="1" max="1000" step="1" />
                        </div>
                        <div class="at-form-row">
                            <label
                                >Duration seconds (1 – 60)
                                <span
                                    class="at-tip"
                                    @mouseenter="
                                        showTip(
                                            $event,
                                            'How long the chirp runs per axis. Longer means more accurate data. 20 seconds is ideal.',
                                        )
                                    "
                                    @mouseleave="hideTip"
                                    >ⓘ</span
                                ></label
                            >
                            <input type="number" v-model.number="chirpDuration" min="1" max="60" step="1" />
                        </div>
                    </div>
                </div>

                <!-- Flight procedure instructions -->
                <div class="at-panel at-chirp-instructions">
                    <div class="at-panel-header">📋 FLIGHT PROCEDURE</div>
                    <div class="at-panel-body">
                        <p style="color: #ffe66d; font-weight: bold; margin-bottom: 8px">
                            ⚠️ CAUTION: CHIRP IS EXPERIMENTAL
                        </p>
                        <p style="font-size: 12px; margin-bottom: 10px">
                            The chirp sweep feature is currently untested in real-world conditions. Fly in a large open
                            area, maintain visual line of sight or fly FPV, be prepared to disarm immediately, and fly
                            at your own risk.
                        </p>
                        <ol>
                            <li>
                                Connected via USB — configure chirp settings above, hit button, then assign a dedicated
                                <code>CHIRP</code> switch in the Modes tab.
                            </li>
                            <li>Unplug USB and fly.</li>
                            <li>Hover to 5m or more — switch to Level mode if desired, or fly FPV.</li>
                            <li>
                                Flip the <code>CHIRP</code> switch once — firmware runs Pitch, Roll, then Yaw
                                automatically (~20 seconds per axis).
                            </li>
                            <li>To abort: disarm immediately.</li>
                            <li>
                                Land, plug in USB → drop your .bfl file into
                                <strong>STEP 4: LOG ANALYZER</strong>
                            </li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
        <!-- /.aerotune-body --> </BaseTab
    ><!-- /.tab-aerotune -->

    <Teleport to="body">
        <div
            v-if="tooltip.visible"
            class="at-tooltip-bubble"
            :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
            {{ tooltip.text }}
        </div>
    </Teleport>
</template>

<script>
import FC from "@/js/fc";
import CONFIGURATOR from "@/js/data_storage";
import BaseTab from "./BaseTab.vue";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { usePidTuningStore } from "@/stores/pidTuning";
import { serial } from "@/js/serial";
import { BBLHeaderParser } from "@/js/aerotune/bbl-header-parser.js";
import { FrameDecoder } from "@/js/aerotune/frame-decoder.js";

// ─────────────────────────────────────────────────────────────────────────────
// AeroTune V5.6 Calculator
// Ported from AeroTune_V5_6_FIXED.py by Simon Jardine – aerobot2.com
// ─────────────────────────────────────────────────────────────────────────────

const KV_BASELINE = {
    200: 38,
    1300: 54,
    1400: 61,
    1600: 73,
    1700: 75,
    1800: 77,
    2000: 82,
    2100: 88,
    2400: 84,
    3000: 77,
    3800: 73,
    4200: 78,
    5000: 67,
    7000: 54,
    11500: 90,
};

// Normalises KV_BASELINE so that 5"/4S 2000KV Racing at 500g → rollP ≈ 51
// (matches Betaflight 4.x defaults)
const BASE_NORM = 0.576;

const FLYING_STYLES = {
    Racing: 1.08,
    Bando: 1.0,
    "Long Range": 0.65,
    Cinematic: 0.75,
};

// FF baselines at 5"/4S (both scalars = 1.0); half-correction is applied on top
const FF_BY_STYLE = {
    Cinematic: { roll_f: 75, pitch_f: 80, yaw_f: 75 },
    "Long Range": { roll_f: 75, pitch_f: 80, yaw_f: 75 },
    Bando: { roll_f: 100, pitch_f: 105, yaw_f: 100 },
    Racing: { roll_f: 125, pitch_f: 131, yaw_f: 125 },
};

function interpolateKV(kv) {
    kv = Number.parseFloat(kv);
    const kvKeys = Object.keys(KV_BASELINE).map(Number);
    const minKey = Math.min(...kvKeys);
    const maxKey = Math.max(...kvKeys);
    kv = Math.max(minKey, Math.min(maxKey, kv));
    if (KV_BASELINE[kv] !== undefined) {
        return KV_BASELINE[kv];
    }
    const sorted = Object.keys(KV_BASELINE)
        .map(Number)
        .sort((a, b) => b - a);
    for (let i = 0; i < sorted.length - 1; i++) {
        const kv1 = sorted[i],
            kv2 = sorted[i + 1];
        if (kv <= kv1 && kv >= kv2) {
            const p1 = KV_BASELINE[kv1],
                p2 = KV_BASELINE[kv2];
            const ratio = kv1 !== kv2 ? (kv - kv2) / (kv1 - kv2) : 0;
            return p1 + (p2 - p1) * ratio;
        }
    }
    return KV_BASELINE[
        Object.keys(KV_BASELINE)
            .map(Number)
            .sort((a, b) => a - b)[0]
    ];
}

// Linear interpolation through a sorted [x, y] point table.
function interpolatePoints(x, points) {
    if (x <= points[0][0]) {
        return points[0][1];
    }
    if (x >= points[points.length - 1][0]) {
        return points[points.length - 1][1];
    }
    for (let i = 0; i < points.length - 1; i++) {
        if (x >= points[i][0] && x <= points[i + 1][0]) {
            const t = (x - points[i][0]) / (points[i + 1][0] - points[i][0]);
            return points[i][1] + t * (points[i + 1][1] - points[i][1]);
        }
    }
    return 1;
}

// Prop-size defaults for chirp sweep parameters.
// Each entry: [propInches, { startHz, endHz, easy, medium, hard }]
const CHIRP_PROP_DEFAULTS = [
    [3, { startHz: 100, endHz: 800, easy: 150, medium: 250, hard: 400 }],
    [5, { startHz: 80, endHz: 600, easy: 120, medium: 230, hard: 350 }],
    [7, { startHz: 50, endHz: 400, easy: 80, medium: 150, hard: 250 }],
    [10, { startHz: 30, endHz: 300, easy: 50, medium: 100, hard: 180 }],
];

function chirpDefaultsForProp(propInch) {
    const pts = CHIRP_PROP_DEFAULTS;
    if (propInch <= pts[0][0]) {
        return { ...pts[0][1] };
    }
    if (propInch >= pts[pts.length - 1][0]) {
        return { ...pts[pts.length - 1][1] };
    }
    for (let i = 0; i < pts.length - 1; i++) {
        const [x0, d0] = pts[i];
        const [x1, d1] = pts[i + 1];
        if (propInch >= x0 && propInch <= x1) {
            const t = (propInch - x0) / (x1 - x0);
            return {
                startHz: Math.round(d0.startHz + t * (d1.startHz - d0.startHz)),
                endHz: Math.round(d0.endHz + t * (d1.endHz - d0.endHz)),
                easy: Math.round(d0.easy + t * (d1.easy - d0.easy)),
                medium: Math.round(d0.medium + t * (d1.medium - d0.medium)),
                hard: Math.round(d0.hard + t * (d1.hard - d0.hard)),
            };
        }
    }
    return { ...pts[pts.length - 1][1] };
}

// Voltage scalar — 4S (14.8 V) is the baseline (1.00).
// Applied FULLY to P and D; HALF correction applied to I and FF.
function voltageScalar(voltage) {
    return interpolatePoints(Number.parseFloat(voltage), [
        [3.7, 1.1], // 1S
        [7.4, 1.1], // 2S
        [11.1, 1.1], // 3S
        [14.8, 1.0], // 4S  ← baseline
        [18.5, 0.95], // 5S
        [22.2, 0.87], // 6S
        [29.6, 0.77], // 8S
    ]);
}

// Prop size scalar — 5" is the baseline (1.00).
// Applied FULLY to P; HALF correction applied to I.
function propScalar(prop) {
    return interpolatePoints(Number.parseFloat(prop), [
        [2, 0.65],
        [3, 0.88],
        [3.5, 0.89],
        [4, 0.9],
        [5, 1.0], // ← baseline
        [6, 1.1],
        [7, 1.18],
        [8, 1.25],
    ]);
}

// D-term ratio — prop-size-aware. Smaller props need relatively higher D
// to damp faster oscillation modes. Calibrated: 3"/4S/Bando → D=35,
// 5" baseline → 0.61. d_min uses 0.887× this ratio.
function dRatio(prop) {
    return interpolatePoints(Number.parseFloat(prop), [
        [2, 0.95],
        [3, 0.84], // → D=35 at 3"/4S/Bando/2000KV anchor
        [3.5, 0.8],
        [4, 0.76], // → D=35 at 4"/4S/Racing/2000KV anchor
        [5, 0.61], // ← baseline
        [6, 0.55],
        [7, 0.5],
        [8, 0.46],
    ]);
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function calculatePIDs(kv, voltage, prop, weight, style) {
    kv = Number.parseFloat(kv);
    voltage = Number.parseFloat(voltage);
    prop = Number.parseFloat(prop);
    weight = Number.parseFloat(weight);
    if (Number.isNaN(kv) || Number.isNaN(voltage) || Number.isNaN(prop) || Number.isNaN(weight)) {
        return null;
    }

    // Base P at 5"/4S scale — only KV, style, and weight contribute here.
    const rawBase = interpolateKV(kv) * (FLYING_STYLES[style] || 1) * (1 + ((weight - 500) / 2000) * 0.15);
    const base = rawBase * BASE_NORM; // normalised roll base

    // Voltage × prop correction
    const vScal = voltageScalar(voltage);
    const pScal = propScalar(prop);
    const dr = dRatio(prop);

    const fullMult = vScal * pScal; // P — full voltage+prop correction
    const halfMult = 1 + (fullMult - 1) * 0.5; // I — half voltage+prop correction
    const dMult = vScal * pScal; // D uses same scalars but prop-aware ratio
    const ffMult = 1 + (vScal - 1) * 0.5; // FF — voltage-only half correction (prop size doesn't shift FF)

    const rollBase = base;
    const pitchBase = base + 3;
    const yawBase = base * 0.945;

    const ff = FF_BY_STYLE[style] || FF_BY_STYLE.Bando;

    return {
        roll_p: clamp(Math.round(rollBase * fullMult), 20, 90),
        roll_i: Math.round(rollBase * 1.902 * halfMult),
        roll_d: Math.round(rollBase * dr * dMult),
        dMax_roll: Math.round(rollBase * dr * dMult),
        roll_f: Math.round(ff.roll_f * ffMult),
        pitch_p: clamp(Math.round(pitchBase * fullMult), 20, 90),
        pitch_i: Math.round(pitchBase * 1.902 * halfMult),
        pitch_d: Math.round(pitchBase * dr * dMult),
        dMax_pitch: Math.round(pitchBase * dr * dMult),
        pitch_f: Math.round(ff.pitch_f * ffMult),
        yaw_p: clamp(Math.round(yawBase * fullMult), 15, 70),
        yaw_i: Math.round(yawBase * 1.902 * halfMult),
        yaw_d: 0,
        yaw_f: Math.round(ff.yaw_f * ffMult),
        d_min_roll: Math.round(rollBase * dr * 0.887 * dMult),
        d_min_pitch: Math.round(pitchBase * dr * 0.887 * dMult),
    };
}

function filterRecommendation(prop) {
    prop = Number.parseFloat(prop);
    if (prop <= 3) {
        return { hz: 450, low: 400, high: 500, note: "Small / Micro" };
    }
    if (prop <= 4) {
        return { hz: 380, low: 350, high: 420, note: "4-inch" };
    }
    if (prop <= 5.5) {
        return { hz: 300, low: 280, high: 350, note: "5-inch (most common)" };
    }
    if (prop <= 7) {
        return { hz: 250, low: 220, high: 280, note: "6–7 inch" };
    }
    if (prop <= 10) {
        return { hz: 180, low: 150, high: 220, note: "8–10 inch" };
    }
    return { hz: 120, low: 100, high: 150, note: '10"+ Large' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Analyzer (ported from V5.4 JS implementation with V5.6 analysis logic)
// ─────────────────────────────────────────────────────────────────────────────

function parseBlackboxCSV(text) {
    const lines = text.split(/\r?\n/);
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("loopIteration")) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx === -1) {
        return null;
    }

    const headers = lines[headerIdx].split(",").map((h) => h.trim().replaceAll(/^"|"$/g, ""));
    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length < 2) {
            continue;
        }
        const row = {};
        headers.forEach((h, idx) => {
            const raw = (parts[idx] || "").trim();
            const n = Number(raw);
            row[h] = Number.isNaN(n) ? raw : n;
        });
        rows.push(row);
    }
    return rows;
}

// Display labels for tracking ratios (not used in scoring)
function trackingLabel(ratio) {
    if (ratio === null) {
        return "NO DATA";
    }
    if (ratio >= 0.98 && ratio <= 1.02) {
        return "EXCELLENT";
    }
    if (ratio >= 0.92 && ratio <= 1.08) {
        return "GOOD";
    }
    if (ratio >= 0.8 && ratio <= 1.2) {
        return "FAIR";
    }
    return "POOR";
}

// Analyse P-gain quality from step input events.
function analyzePGain(rows, axis, isLevelMode) {
    const spKey = `setpoint[${axis}]`,
        gyroKey = `gyroADC[${axis}]`;
    const overshootPcts = [],
        lagFrames = [],
        zeroCrossingCounts = [];

    for (let i = 1; i + 30 < rows.length; i++) {
        const spPrev = Number(rows[i - 1][spKey] ?? 0);
        const spCurr = Number(rows[i][spKey] ?? 0);
        if (Math.abs(spCurr - spPrev) <= 20) {
            continue;
        }
        const absSP = Math.abs(spCurr);
        if (absSP < 5) {
            continue;
        }

        let peakGyro = Math.abs(Number(rows[i][gyroKey] ?? 0)),
            peakFrame = i;
        for (let j = 1; j <= 30 && i + j < rows.length; j++) {
            const g = Math.abs(Number(rows[i + j][gyroKey] ?? 0));
            if (g > peakGyro) {
                peakGyro = g;
                peakFrame = i + j;
            }
        }
        overshootPcts.push(((peakGyro - absSP) / absSP) * 100);

        let lagFound = false;
        for (let j = 1; j <= 30 && i + j < rows.length; j++) {
            if (Math.abs(Number(rows[i + j][gyroKey] ?? 0)) >= absSP * 0.9) {
                lagFrames.push(j);
                lagFound = true;
                break;
            }
        }
        if (!lagFound) {
            lagFrames.push(30);
        }

        if (isLevelMode) {
            let crossings = 0;
            for (let j = 1; j <= 20 && peakFrame + j < rows.length; j++) {
                const e1 = Number(rows[peakFrame + j - 1][gyroKey] ?? 0) - Number(rows[peakFrame + j - 1][spKey] ?? 0);
                const e2 = Number(rows[peakFrame + j][gyroKey] ?? 0) - Number(rows[peakFrame + j][spKey] ?? 0);
                if (e1 * e2 < 0) {
                    crossings++;
                }
            }
            zeroCrossingCounts.push(crossings);
        }
    }
    return { overshootPcts, lagFrames, zeroCrossingCounts };
}

// Analyse D-gain quality from step input events and high-throttle noise.
function analyzeDGain(rows, axis) {
    const spKey = `setpoint[${axis}]`,
        gyroKey = `gyroADC[${axis}]`;
    const gyroUnfKey = `gyroUnfilt[${axis}]`,
        axisDKey = `axisD[${axis}]`,
        axisPKey = `axisP[${axis}]`;
    const zeroCrossingCounts = [],
        dToPRatios = [];
    let hiThrDOscCount = 0,
        hiThrCount = 0;

    for (let i = 1; i + 21 < rows.length; i++) {
        const spPrev = Number(rows[i - 1][spKey] ?? 0);
        const spCurr = Number(rows[i][spKey] ?? 0);
        if (Math.abs(spCurr - spPrev) <= 20 || Math.abs(spCurr) < 5) {
            continue;
        }

        let peakFrame = i,
            peakGyro = Math.abs(Number(rows[i][gyroKey] ?? 0));
        for (let j = 1; j <= 30 && i + j < rows.length; j++) {
            const g = Math.abs(Number(rows[i + j][gyroKey] ?? 0));
            if (g > peakGyro) {
                peakGyro = g;
                peakFrame = i + j;
            }
        }

        let crossings = 0;
        for (let j = 1; j <= 20 && peakFrame + j < rows.length; j++) {
            const e1 = Number(rows[peakFrame + j - 1][gyroKey] ?? 0) - Number(rows[peakFrame + j - 1][spKey] ?? 0);
            const e2 = Number(rows[peakFrame + j][gyroKey] ?? 0) - Number(rows[peakFrame + j][spKey] ?? 0);
            if (e1 * e2 < 0) {
                crossings++;
            }
        }
        zeroCrossingCounts.push(crossings);

        const dVal = Math.abs(Number(rows[peakFrame][axisDKey] ?? 0));
        const pVal = Math.abs(Number(rows[peakFrame][axisPKey] ?? 0));
        if (pVal > 1) {
            dToPRatios.push(dVal / pVal);
        }
    }

    for (const row of rows) {
        if (Number(row["rcCommand[3]"] ?? 1000) > 1400) {
            hiThrCount++;
            const unfilt = Math.abs(Number(row[gyroUnfKey] ?? 0));
            const filt = Math.abs(Number(row[gyroKey] ?? 0));
            if (unfilt > filt * 2 && Math.abs(Number(row[axisDKey] ?? 0)) > 20) {
                hiThrDOscCount++;
            }
        }
    }

    return {
        avgCrossings:
            zeroCrossingCounts.length > 0
                ? zeroCrossingCounts.reduce((a, b) => a + b, 0) / zeroCrossingCounts.length
                : 0,
        avgDtoP: dToPRatios.length > 0 ? dToPRatios.reduce((a, b) => a + b, 0) / dToPRatios.length : 0,
        filterNoiseDOsc: hiThrCount > 0 && hiThrDOscCount / hiThrCount > 0.3,
        stepCount: zeroCrossingCounts.length,
    };
}

function analyzeLog(rows, motorTemp = "WARM", config = null) {
    if (!rows || rows.length === 0) {
        return { error: "No valid data found in log." };
    }

    const totalFrames = rows.length;
    const hasRpmFilter = Object.keys(rows[0]).some((k) => /erpm/i.test(k) || /rpm\[/i.test(k));

    // PASS 1: display stats (throttle > 1400 = >40%)
    const rawValsDisp = [],
        filtValsDisp = [];
    let highThrottleCount = 0;

    // PASS 2: filter score (throttle > 1500 = >50%)
    const hiRaw = [],
        hiFilt = [];
    let hiThrottleFrames = 0;

    // TRACKING (all frames where setpoint > 50)
    // Per-frame ratios: mean of abs(gyro)/abs(sp) per frame
    const rollTrackingArr = [],
        pitchTrackingArr = [];
    const activeGyroRoll = []; // gyroADC[0] when setpoint[0] > 50, used for ZC

    for (const row of rows) {
        const throttle = Number(row["rcCommand[3]"] ?? 1000);

        // Pass 1: display (>1400)
        if (throttle > 1400) {
            highThrottleCount++;
            rawValsDisp.push(Math.abs(Number(row["gyroUnfilt[0]"] ?? 0)) + Math.abs(Number(row["gyroUnfilt[1]"] ?? 0)));
            filtValsDisp.push(Math.abs(Number(row["gyroADC[0]"] ?? 0)) + Math.abs(Number(row["gyroADC[1]"] ?? 0)));
        }

        // Pass 2: filter scoring (>1500)
        if (throttle > 1500) {
            hiThrottleFrames++;
            hiRaw.push(Math.abs(Number(row["gyroUnfilt[0]"] ?? 0)) + Math.abs(Number(row["gyroUnfilt[1]"] ?? 0)));
            hiFilt.push(Math.abs(Number(row["gyroADC[0]"] ?? 0)) + Math.abs(Number(row["gyroADC[1]"] ?? 0)));
        }

        // Tracking ratios (all frames, active input only)
        const spRoll = Math.abs(Number(row["setpoint[0]"] ?? 0));
        const spPitch = Math.abs(Number(row["setpoint[1]"] ?? 0));
        const gyroRoll = Number(row["gyroADC[0]"] ?? 0);
        const gyroPitch = Number(row["gyroADC[1]"] ?? 0);
        if (spRoll > 50) {
            rollTrackingArr.push(Math.abs(gyroRoll) / spRoll);
            activeGyroRoll.push(gyroRoll);
        }
        if (spPitch > 50) {
            pitchTrackingArr.push(Math.abs(gyroPitch) / spPitch);
        }
    }

    // Display stats (pass 1 - >1400)
    const avgRaw = rawValsDisp.length > 0 ? rawValsDisp.reduce((a, b) => a + b, 0) / rawValsDisp.length : 0;
    const avgFiltered = filtValsDisp.length > 0 ? filtValsDisp.reduce((a, b) => a + b, 0) / filtValsDisp.length : 0;
    const effectiveness = avgRaw > 0 ? clamp(((avgRaw - avgFiltered) / avgRaw) * 100, 0, 100) : 0;
    const throttlePct = (highThrottleCount / totalFrames) * 100;

    // Insufficient data check (>1500 = >50% throttle)
    const hiThrottlePct = (hiThrottleFrames / totalFrames) * 100;
    const insufficientHiThrottle = hiThrottlePct < 5;

    // Filter score (pass 2 - >1500)
    const avgHiRaw = hiRaw.length > 0 ? hiRaw.reduce((a, b) => a + b, 0) / hiRaw.length : 0;
    const avgHiFilt = hiFilt.length > 0 ? hiFilt.reduce((a, b) => a + b, 0) / hiFilt.length : 0;
    const hiFilterEff = avgHiRaw > 0 ? clamp(((avgHiRaw - avgHiFilt) / avgHiRaw) * 100, 0, 100) : 0;
    const filterSufficient = hiThrottleFrames > 500;
    const filterScore = filterSufficient ? Math.min(100, hiFilterEff * 2) : 50;

    // Tracking score: mean of per-frame ratios, continuous formula
    const rollTrackingRatio =
        rollTrackingArr.length > 0 ? rollTrackingArr.reduce((a, b) => a + b, 0) / rollTrackingArr.length : null;
    const pitchTrackingRatio =
        pitchTrackingArr.length > 0 ? pitchTrackingArr.reduce((a, b) => a + b, 0) / pitchTrackingArr.length : null;
    const rollRatio = rollTrackingRatio ?? 1;
    const pitchRatio = pitchTrackingRatio ?? 1;
    const avgDeviation = (Math.abs(rollRatio - 1) + Math.abs(pitchRatio - 1)) / 2;
    const trackingScore = Math.max(0, 100 - avgDeviation * 500);

    const rollTracking = { label: trackingLabel(rollTrackingRatio) };
    const pitchTracking = { label: trackingLabel(pitchTrackingRatio) };

    // Zero crossing score: sign changes in gyroADC[0] during active roll input
    let zeroCrossings = 0;
    for (let j = 1; j < activeGyroRoll.length; j++) {
        if (activeGyroRoll[j - 1] >= 0 !== activeGyroRoll[j] >= 0) {
            zeroCrossings++;
        }
    }
    const zeroCrossingRate = activeGyroRoll.length > 0 ? (zeroCrossings / activeGyroRoll.length) * 100 : 0;
    const zcScore = Math.max(0, 100 - zeroCrossingRate * 10);
    let zcLabel;
    if (zeroCrossingRate < 1) {
        zcLabel = "EXCELLENT";
    } else if (zeroCrossingRate < 3) {
        zcLabel = "GOOD";
    } else if (zeroCrossingRate < 10) {
        zcLabel = "FAIR";
    } else {
        zcLabel = "POOR";
    }

    // Propwash detection (kept for D gain notes only, not in weighted score)
    let propwashDetected = false;
    for (let i = 1; i < rows.length && !propwashDetected; i++) {
        const tPrev = Number(rows[i - 1]["rcCommand[3]"] ?? 1000);
        const tCurr = Number(rows[i]["rcCommand[3]"] ?? 1000);
        if (tPrev - tCurr > 200) {
            let osc = 0;
            for (let j = 1; j <= 30 && i + j < rows.length; j++) {
                const g1 = Number(rows[i + j - 1]["gyroADC[0]"] ?? 0);
                const g2 = Number(rows[i + j]["gyroADC[0]"] ?? 0);
                if (g1 * g2 < 0) {
                    osc++;
                }
            }
            if (osc >= 3) {
                propwashDetected = true;
            }
        }
    }

    // Weighted overall score (matches Python V5.6 formula exactly)
    const overallScore = trackingScore * 0.7 + filterScore * 0.15 + zcScore * 0.1 + 5;

    let overallLabel;
    if (overallScore >= 85) {
        overallLabel = "EXCELLENT ✅";
    } else if (overallScore >= 70) {
        overallLabel = "GOOD ✅";
    } else if (overallScore >= 55) {
        overallLabel = "FAIR ⚠️";
    } else if (overallScore >= 40) {
        overallLabel = "WEAK ⚠️";
    } else {
        overallLabel = "VERY WEAK 🔴";
    }
    if (insufficientHiThrottle && overallScore >= 70) {
        overallLabel += " (unconfirmed — insufficient hi-throttle data)";
    }

    // Vibration level: score >= 70 overrides to ADEQUATE, else from avg_raw (>1400)
    let vibLevel;
    if (overallScore >= 70) {
        vibLevel = "ADEQUATE ✓";
    } else if (avgRaw < 15) {
        vibLevel = "CLEAN ✓";
    } else if (avgRaw < 20) {
        vibLevel = "GOOD ✓";
    } else if (avgRaw < 30) {
        vibLevel = "FAIR";
    } else if (avgRaw < 50) {
        vibLevel = "WEAK ⚠";
    } else {
        vibLevel = "VERY WEAK 🔴";
    }

    // Filter action text
    let filterAction;
    if (overallScore >= 70) {
        filterAction = "Filters are adequate for this tune. No changes recommended.";
    } else if (avgRaw < 20) {
        filterAction = "Gyro Lowpass 2: Keep current setting.\nD-term Lowpass: Slightly increase (less aggressive).";
    } else if (avgRaw < 30) {
        filterAction = "Gyro Lowpass 2: Lower by ~30 Hz.\nD-term Lowpass: Lower by ~20 Hz.\nTest and re-analyze.";
    } else if (avgRaw < 50) {
        filterAction =
            "Gyro Lowpass 2: Lower by ~50 Hz.\nD-term Lowpass: Lower by ~30 Hz.\nConsider enabling Notch filter.";
    } else {
        filterAction =
            "Gyro Lowpass 2: Lower aggressively (~100 Hz reduction).\nD-term: Lower significantly.\nEnable all available filters.\nCheck for mechanical issues.";
    }
    filterAction += "\nFresh props recommended before tuning — damaged props create false noise in logs.";
    filterAction += hasRpmFilter
        ? "\nRPM filter detected (eRPM data present) — it is active and helping suppress motor harmonics."
        : "\nEnable RPM filter — most effective filter available, requires bidirectional DSHOT.";

    // ── P GAIN ANALYSIS ───────────────────────────────────────────────────────
    const ANGLE_MODE_FLAG = 2;
    let levelModeFrames = 0;
    for (const row of rows) {
        if (Number(row["flightModeFlags"] ?? 0) & ANGLE_MODE_FLAG) {
            levelModeFrames++;
        }
    }
    const isLevelMode = rows.length > 0 && levelModeFrames / rows.length > 0.5;

    const rollPData = analyzePGain(rows, 0, isLevelMode);
    const pitchPData = analyzePGain(rows, 1, isLevelMode);

    const allOvershoots = [...rollPData.overshootPcts, ...pitchPData.overshootPcts];
    const allLags = [...rollPData.lagFrames, ...pitchPData.lagFrames];
    const allCrossings = [...rollPData.zeroCrossingCounts, ...pitchPData.zeroCrossingCounts];

    let pVerdict, pAction;
    if (allOvershoots.length === 0) {
        pVerdict = "NO STEP INPUTS DETECTED";
        pAction = "No rapid stick inputs found. Fly with sharp, deliberate inputs to enable P analysis.";
    } else if (isLevelMode) {
        const modeNote =
            "Level mode detected — single overshoots ignored (auto-leveler), watching for oscillations only\n";
        const avgOsc = allCrossings.length > 0 ? allCrossings.reduce((a, b) => a + b, 0) / allCrossings.length : 0;
        const avgOvershoot = allOvershoots.reduce((a, b) => a + b, 0) / allOvershoots.length;
        const lowRespCount = allOvershoots.filter((o) => o < -70).length;
        const lowRespRatio = lowRespCount / allOvershoots.length;
        if (avgOsc >= 3) {
            pVerdict = "P TOO HIGH ⚠";
            pAction = `${modeNote}Average oscillations after step: ${avgOsc.toFixed(1)} zero-crossings.\nP too high — reduce by 5–10. Symptom: bounce-back after flips/rolls.`;
        } else if (lowRespRatio > 0.5) {
            pVerdict = "P TOO LOW";
            pAction = `${modeNote}Gyro response below 30% of setpoint in ${Math.round(lowRespRatio * 100)}% of step inputs.\nP too low — increase by 5–10. Symptom: slow/sloppy response.`;
        } else {
            pVerdict = "P GAINS LOOK GOOD ✓";
            pAction = `${modeNote}Average oscillations: ${avgOsc.toFixed(1)}, overshoot: ${avgOvershoot.toFixed(1)}%. P tracking well in level mode.`;
        }
    } else {
        const avgOvershoot = allOvershoots.reduce((a, b) => a + b, 0) / allOvershoots.length;
        const avgLag = allLags.reduce((a, b) => a + b, 0) / allLags.length;
        if (avgOvershoot > 15) {
            pVerdict = "P TOO HIGH ⚠";
            pAction = `Average overshoot: ${avgOvershoot.toFixed(1)}%.\nP too high — reduce by 5–10. Symptom: bounce-back after flips/rolls.`;
        } else if (avgLag > 3 && avgOvershoot < 5) {
            pVerdict = "P TOO LOW";
            pAction = `Average response lag: ${avgLag.toFixed(1)} frames.\nP too low — increase by 5–10. Symptom: slow/sloppy response.`;
        } else {
            pVerdict = "P GAINS LOOK GOOD ✓";
            pAction = `Average overshoot: ${avgOvershoot.toFixed(1)}%, lag: ${avgLag.toFixed(1)} frames. P tracking well.`;
        }
    }

    if (pVerdict === "P TOO HIGH ⚠") {
        const avgTracking = ((rollTrackingRatio ?? 1) + (pitchTrackingRatio ?? 1)) / 2;
        if (zeroCrossingRate <= 5 || avgTracking <= 1.15) {
            pVerdict = "P LOOKS ACCEPTABLE";
            pAction =
                "Overshoot pattern detected in step inputs, but zero-crossing rate and tracking ratio do not both confirm P is too high.\nMonitor during flight — no P reduction recommended based on available evidence.";
        }
    }

    // ── D GAIN ANALYSIS ───────────────────────────────────────────────────────
    const rollDData = analyzeDGain(rows, 0);
    const pitchDData = analyzeDGain(rows, 1);
    const avgCrossings = (rollDData.avgCrossings + pitchDData.avgCrossings) / 2;
    const avgDtoP = (rollDData.avgDtoP + pitchDData.avgDtoP) / 2;
    const filterNoiseDOsc = rollDData.filterNoiseDOsc || pitchDData.filterNoiseDOsc;
    const hasSteps = rollDData.stepCount > 0 || pitchDData.stepCount > 0;

    let dVerdict, dAction;
    if (!hasSteps) {
        dVerdict = "NO STEP INPUTS DETECTED";
        dAction = "No rapid stick inputs found. Fly with sharp, deliberate inputs to enable D analysis.";
    } else if (filterNoiseDOsc) {
        dVerdict = "FILTER NOISE LIMITING D ⚠";
        dAction =
            "Unfiltered gyro is much noisier than filtered at high throttle, and D is still active.\nFix filters before increasing D — see FILTERS section.";
    } else if (avgCrossings > 3) {
        dVerdict = "D TOO LOW ⚠";
        dAction = `Average zero-crossings after peak: ${avgCrossings.toFixed(1)}.\nD too low — increase by 3–5. Symptom: propwash oscillations after throttle cuts.`;
    } else if (avgDtoP > 1.5 && motorTemp === "HOT") {
        dVerdict = "D TOO HIGH ⚠";
        dAction = `D/P ratio is ${avgDtoP.toFixed(2)} and motors are running HOT.\nD too high — reduce by 3–5. Check motor temps after flying.`;
    } else if (avgDtoP > 1.5) {
        if (propwashDetected) {
            dVerdict = "D MAY BE TOO HIGH ⚠";
            dAction = `D/P ratio is ${avgDtoP.toFixed(2)} and propwash was detected.\nCheck motor temps and consider reducing D by 3–5.`;
        } else {
            dVerdict = "D WITHIN RANGE";
            dAction = `D/P ratio is ${avgDtoP.toFixed(2)}. Without confirmed propwash or HOT motors, no D reduction recommended at this time.`;
        }
    } else {
        dVerdict = "D GAINS LOOK GOOD ✓";
        dAction = `Average zero-crossings: ${avgCrossings.toFixed(1)}, D/P ratio: ${avgDtoP.toFixed(2)}. D gains look good.`;
    }

    if (motorTemp === "HOT" && dVerdict === "D GAINS LOOK GOOD ✓") {
        dAction += "\nD gain too high or insufficient filtering — reduce D by 5–10 or increase filtering (motors HOT).";
    } else if (motorTemp === "COOL") {
        dAction += "\nD gain may have headroom — could increase slightly (motors COOL after flight).";
    }
    if (propwashDetected) {
        dAction += "\nPropwash detected — increase D by 3–5 or check filtering.";
    }

    // ── POST-PROCESS FILTER DISPLAY FOR GOOD/EXCELLENT OVERALL ───────────────
    if (overallScore >= 70 && filterSufficient) {
        const rpmLine = hasRpmFilter
            ? "RPM filter detected (eRPM data present) — it is active and helping suppress motor harmonics."
            : "Enable RPM filter — most effective filter available, requires bidirectional DSHOT.";
        filterAction = `Filters are adequate for this tune. No changes recommended.\nFresh props recommended before tuning — damaged props create false noise in logs.\n${rpmLine}`;
        if (vibLevel === "VERY WEAK 🔴") {
            vibLevel = "ADEQUATE ✓";
        }
    }

    // ── D_MAX FLIGHT 2 REFINEMENT ─────────────────────────────────────────────
    // Detect when D_Max is at Betaflight defaults and overshoot is moderate —
    // the D-term ceiling may be too permissive, causing unnecessary D amplification.
    const avgOvershootAll =
        allOvershoots.length > 0 ? allOvershoots.reduce((a, b) => a + b, 0) / allOvershoots.length : null;

    let dMaxRefinement = null;
    if (config && avgOvershootAll !== null && avgOvershootAll >= 25 && avgOvershootAll <= 35) {
        const dMaxRoll = config.pids?.roll?.[3] ?? null;
        const dMaxPitch = config.pids?.pitch?.[3] ?? null;
        const dMaxAdvance = config.pids?.dMaxAdvance ?? null;
        // BF 4.x defaults: d_max roll=40, pitch=46, d_max_advance=20
        if (dMaxRoll !== null && dMaxPitch !== null && Math.abs(dMaxRoll - 40) <= 3 && Math.abs(dMaxPitch - 46) <= 3) {
            dMaxRefinement = {
                dMaxRoll,
                dMaxPitch,
                dMaxAdvance: dMaxAdvance ?? 20,
                suggestRoll: 35,
                suggestPitch: 38,
                suggestAdvance: 10,
                avgOvershoot: avgOvershootAll,
            };
        }
    }

    return {
        totalFrames,
        highThrottleCount,
        throttlePct: throttlePct.toFixed(1),
        hiThrottleFrames,
        hiThrottlePct: hiThrottlePct.toFixed(1),
        insufficientHiThrottle,
        avgRaw: avgRaw.toFixed(2),
        avgFiltered: avgFiltered.toFixed(2),
        effectiveness: effectiveness.toFixed(1),
        filterSufficient,
        vibLevel,
        filterAction,
        rollTrackingRatio,
        pitchTrackingRatio,
        rollTracking,
        pitchTracking,
        trackingScore: trackingScore.toFixed(1),
        zeroCrossingRate: zeroCrossingRate.toFixed(2),
        zcLabel,
        propwashDetected,
        overallScore: overallScore.toFixed(1),
        overallLabel,
        pVerdict,
        pAction,
        dVerdict,
        dAction,
        motorTemp,
        config,
        dMaxRefinement,
    };
}

function formatAnalysisResult(r) {
    if (r.error) {
        return `ERROR: ${r.error}`;
    }
    const SEP = "════════════════════════════════════════════════════";
    const lines = [];

    if (r.insufficientHiThrottle) {
        lines.push(
            `⚠️ INSUFFICIENT HIGH-THROTTLE DATA — Only ${r.hiThrottlePct}% of this flight was above 50% throttle.`,
            `Results may not be reliable. For accurate filter analysis, fly a pack with sustained throttle inputs above 50% stick.`,
            ``,
        );
    }

    const rRatio = r.rollTrackingRatio !== null ? r.rollTrackingRatio.toFixed(3) : "N/A";
    const pRatio = r.pitchTrackingRatio !== null ? r.pitchTrackingRatio.toFixed(3) : "N/A";
    const effDisplay = r.filterSufficient ? `${r.effectiveness}%` : "N/A";
    lines.push(
        `Frames analysed : ${r.totalFrames}  |  Hi-throttle (>50%): ${r.hiThrottleFrames} (${r.hiThrottlePct}%)`,
        ``,
        SEP,
        `  OVERALL RATING : ${r.overallLabel}  (score: ${r.overallScore}/100)`,
        SEP,
        ``,
        SEP,
        `  SETPOINT TRACKING`,
        SEP,
        `Roll:  ${rRatio} (target: 1.000) — ${r.rollTracking.label}`,
        `Pitch: ${pRatio} (target: 1.000) — ${r.pitchTracking.label}`,
        `Zero-crossing rate (P oscillation): ${r.zeroCrossingRate}% — ${r.zcLabel}`,
        ``,
    );
    lines.push(SEP, `  FILTERS : ${r.vibLevel}  |  Effectiveness: ${effDisplay}`, SEP);
    if (r.filterSufficient) {
        lines.push(`Avg raw gyro (hi-thr): ${r.avgRaw}  |  Avg filtered: ${r.avgFiltered}`);
    }
    lines.push(r.filterAction, ``);

    lines.push(SEP, `  ROLL/PITCH P : ${r.pVerdict}`, SEP);
    if (Number.parseFloat(r.overallScore) >= 70) {
        lines.push(`P tracking well — no changes recommended.`, ``);
    } else {
        lines.push(
            r.pAction,
            `Tip: level mode and acro mode are both valid for tuning. Level mode gives clean repeatable step inputs.`,
            ``,
        );
    }

    lines.push(SEP, `  ROLL/PITCH D : ${r.dVerdict}`, SEP, r.dAction);

    // ── Flight 2 refinement — D_Max headroom ──────────────────────────────────
    if (r.dMaxRefinement) {
        const ref = r.dMaxRefinement;
        lines.push(
            ``,
            SEP,
            `  FLIGHT 2 REFINEMENT — D_MAX HEADROOM`,
            SEP,
            `D_Max is at Betaflight defaults (Roll: ${ref.dMaxRoll}, Pitch: ${ref.dMaxPitch}).`,
            `With ${ref.avgOvershoot.toFixed(1)}% average overshoot the D-term ceiling may be too permissive during fast moves.`,
            ``,
            `Suggested CLI changes:`,
            `  set d_max = ${ref.suggestRoll},${ref.suggestPitch},0  # was ${ref.dMaxRoll},${ref.dMaxPitch},0`,
            `  set d_max_advance = ${ref.suggestAdvance}  # was ${ref.dMaxAdvance}`,
            ``,
            `Re-fly the test pattern and re-analyze. If overshoot drops below 15% these values are correct.`,
        );
    }

    // ── Suggested CLI commands (populated from BBL header values) ─────────────
    if (r.config) {
        const cfg = r.config;
        const cliLines = [];
        const needsFilterWork = r.vibLevel === "WEAK ⚠" || r.vibLevel === "FAIR" || r.vibLevel === "VERY WEAK 🔴";

        if (needsFilterWork) {
            // Gyro LPF2 — only suggest when it is active (0 = disabled, ≥500 = effectively off)
            const lpf2Hz = cfg.gyroFilters?.lowpass2Hz;
            if (lpf2Hz !== null && lpf2Hz !== undefined && lpf2Hz > 0 && lpf2Hz < 500) {
                let reduction = 0;
                if (r.vibLevel === "VERY WEAK 🔴") {
                    reduction = 100;
                } else if (r.vibLevel === "WEAK ⚠") {
                    reduction = 50;
                } else if (r.vibLevel === "FAIR") {
                    reduction = 30;
                }
                if (reduction > 0) {
                    const suggested = Math.max(80, lpf2Hz - reduction);
                    cliLines.push(`  set gyro_lpf2_static_hz = ${suggested}  # was ${lpf2Hz}`);
                }
            }

            // Dynamic notch max Hz — only when notch is active (count > 0)
            const dynCount = cfg.dynamicNotch?.count;
            const dynMaxHz = cfg.dynamicNotch?.maxHz;
            const dynMinHz = cfg.dynamicNotch?.minHz;
            if (
                dynCount !== null &&
                dynCount !== undefined &&
                dynCount > 0 &&
                dynMaxHz !== null &&
                dynMaxHz !== undefined &&
                dynMaxHz > 0
            ) {
                const suggestedMax = Math.max((dynMinHz ?? 100) + 100, dynMaxHz - 100);
                cliLines.push(`  set dyn_notch_max_hz = ${suggestedMax}  # was ${dynMaxHz}`);
            }
        }

        if (cliLines.length > 0) {
            lines.push(``, SEP, `  SUGGESTED CLI COMMANDS`, SEP, ...cliLines, ``);
        }
    }

    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SysID: chirp detection, FFT, frequency response, Bode data, PID synthesis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Radix-2 Cooley-Tukey FFT, in-place.
 * re[] and im[] must both have length equal to a power of 2.
 * On return, re[k]/im[k] contain real/imaginary parts of bin k.
 */
function fftInPlace(re, im) {
    const N = re.length;
    // Bit-reversal permutation
    let j = 0;
    for (let i = 1; i < N; i++) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            let t = re[i];
            re[i] = re[j];
            re[j] = t;
            t = im[i];
            im[i] = im[j];
            im[j] = t;
        }
    }
    // Butterfly stages
    for (let len = 2; len <= N; len <<= 1) {
        const half = len >> 1;
        const ang = (-2 * Math.PI) / len;
        const wBaseRe = Math.cos(ang);
        const wBaseIm = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
            let wRe = 1,
                wIm = 0;
            for (let k = 0; k < half; k++) {
                const uRe = re[i + k];
                const uIm = im[i + k];
                const vRe = re[i + k + half] * wRe - im[i + k + half] * wIm;
                const vIm = re[i + k + half] * wIm + im[i + k + half] * wRe;
                re[i + k] = uRe + vRe;
                im[i + k] = uIm + vIm;
                re[i + k + half] = uRe - vRe;
                im[i + k + half] = uIm - vIm;
                const nextWRe = wRe * wBaseRe - wIm * wBaseIm;
                wIm = wRe * wBaseIm + wIm * wBaseRe;
                wRe = nextWRe;
            }
        }
    }
}

function _nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

function _hannWindow(N) {
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    return w;
}

/**
 * Unwrap a phase array (radians) in-place.
 */
function _unwrapPhase(phase) {
    for (let i = 1; i < phase.length; i++) {
        let d = phase[i] - phase[i - 1];
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        phase[i] = phase[i - 1] + d;
    }
}

/**
 * Detect chirp data in a BBL session.
 * Criteria: chirp_amplitude_* header present with value > 0
 *           AND setpoint std dev > 30 in any 5-second window on any axis.
 */
function detectChirp(frames, config) {
    const raw = config._raw || {};
    const hasChirpHeader = ["chirp_amplitude_roll", "chirp_amplitude_pitch", "chirp_amplitude_yaw"].some(
        (k) => raw[k] !== undefined && parseInt(raw[k], 10) > 0,
    );
    if (!hasChirpHeader) return false;

    const looptime = config.misc?.looptime;
    if (!looptime || looptime <= 0) return false;
    const sampleRate = 1e6 / looptime;
    const winSize = Math.max(100, Math.round(5 * sampleRate));

    for (const spKey of ["setpoint[0]", "setpoint[1]", "setpoint[2]"]) {
        for (let start = 0; start + winSize <= frames.length; start += winSize) {
            let sum = 0,
                sum2 = 0;
            for (let i = start; i < start + winSize; i++) {
                const v = Number(frames[i][spKey] ?? 0);
                sum += v;
                sum2 += v * v;
            }
            const mean = sum / winSize;
            const std = Math.sqrt(Math.max(0, sum2 / winSize - mean * mean));
            if (std > 30) return true;
        }
    }
    return false;
}

/**
 * Find the longest continuous segment where the std dev of a signal over a
 * rolling windowSize-sample window exceeds `threshold`.
 * Returns { start, end } byte indices.
 */
function _findLongestActiveSegment(signal, windowSize, threshold) {
    const N = signal.length;
    if (N < windowSize) return { start: 0, end: N };

    // Initialise rolling sum / sum-of-squares for first window
    let sum = 0,
        sum2 = 0;
    for (let i = 0; i < windowSize; i++) {
        sum += signal[i];
        sum2 += signal[i] * signal[i];
    }

    let bestStart = 0,
        bestLen = 0;
    let curStart = -1;

    for (let i = windowSize; i <= N; i++) {
        const mean = sum / windowSize;
        const std = Math.sqrt(Math.max(0, sum2 / windowSize - mean * mean));
        const winStart = i - windowSize;

        if (std > threshold) {
            if (curStart < 0) curStart = winStart;
            const curLen = i - curStart;
            if (curLen > bestLen) {
                bestLen = curLen;
                bestStart = curStart;
            }
        } else {
            curStart = -1;
        }

        if (i < N) {
            sum += signal[i];
            sum2 += signal[i] * signal[i];
            sum -= signal[winStart];
            sum2 -= signal[winStart] * signal[winStart];
        }
    }

    if (bestLen < windowSize) return { start: 0, end: Math.min(N, windowSize * 4) };
    return { start: bestStart, end: bestStart + bestLen };
}

/**
 * Welch's method coherence estimate.
 * Returns Float64Array of length segLen/2 + 1 with coherence values in [0, 1].
 * Bin k corresponds to frequency k * sampleRate / segLen.
 */
function _welchCoherence(x, y, segLen) {
    const half = segLen >> 1;
    const win = _hannWindow(segLen);
    const Sxx = new Float64Array(half + 1);
    const Syy = new Float64Array(half + 1);
    const SxyRe = new Float64Array(half + 1);
    const SxyIm = new Float64Array(half + 1);

    for (let start = 0; start + segLen <= x.length; start += half) {
        // 50 % overlap
        const xRe = new Float64Array(segLen),
            xIm = new Float64Array(segLen);
        const yRe = new Float64Array(segLen),
            yIm = new Float64Array(segLen);
        for (let k = 0; k < segLen; k++) {
            xRe[k] = x[start + k] * win[k];
            yRe[k] = y[start + k] * win[k];
        }
        fftInPlace(xRe, xIm);
        fftInPlace(yRe, yIm);
        for (let k = 0; k <= half; k++) {
            Sxx[k] += xRe[k] * xRe[k] + xIm[k] * xIm[k];
            Syy[k] += yRe[k] * yRe[k] + yIm[k] * yIm[k];
            // Sxy = X * conj(Y)
            SxyRe[k] += xRe[k] * yRe[k] + xIm[k] * yIm[k];
            SxyIm[k] += xIm[k] * yRe[k] - xRe[k] * yIm[k];
        }
    }

    const coh = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) {
        const denom = Sxx[k] * Syy[k];
        if (denom > 0) coh[k] = (SxyRe[k] * SxyRe[k] + SxyIm[k] * SxyIm[k]) / denom;
    }
    return coh;
}

/**
 * Compute stability margins from arrays of frequencies, magnitudes and phases.
 * freqAxis: Hz,  magDB: dB,  phaseDeg: degrees (unwrapped).
 * Returns { phaseMargin, gainMargin, gcFreq, pcFreq } — any may be null.
 */
function _computeStabilityMargins(freqAxis, magDB, phaseDeg) {
    let gcFreq = null,
        phaseMargin = null;
    let pcFreq = null,
        gainMargin = null;

    // Gain crossover: first downward 0 dB crossing
    for (let i = 1; i < magDB.length; i++) {
        if (magDB[i - 1] >= 0 && magDB[i] < 0) {
            const t = magDB[i - 1] / (magDB[i - 1] - magDB[i]);
            gcFreq = freqAxis[i - 1] + t * (freqAxis[i] - freqAxis[i - 1]);
            phaseMargin = phaseDeg[i - 1] + t * (phaseDeg[i] - phaseDeg[i - 1]) + 180;
            break;
        }
    }

    // Phase crossover: first downward -180° crossing
    for (let i = 1; i < phaseDeg.length; i++) {
        if (phaseDeg[i - 1] >= -180 && phaseDeg[i] < -180) {
            const t = (phaseDeg[i - 1] + 180) / (phaseDeg[i - 1] - phaseDeg[i]);
            pcFreq = freqAxis[i - 1] + t * (freqAxis[i] - freqAxis[i - 1]);
            gainMargin = -(magDB[i - 1] + t * (magDB[i] - magDB[i - 1]));
            break;
        }
    }

    return { phaseMargin, gainMargin, gcFreq, pcFreq };
}

/**
 * Synthesise PID adjustments from stability margins and current gains.
 * Returns { suggestP, suggestD, reason }.
 */
function _synthesizePID(currentP, currentD, margins) {
    const TARGET_PM = 45;
    let suggestP = currentP;
    let suggestD = currentD;
    const parts = [];

    if (margins.phaseMargin !== null && margins.phaseMargin > 0) {
        const factor = clamp(TARGET_PM / margins.phaseMargin, 0.7, 1.3);
        suggestP = Math.round(currentP * factor);
        parts.push(`PM ${margins.phaseMargin.toFixed(1)}°→45° (×${factor.toFixed(2)})`);
    }

    if (margins.gcFreq !== null && currentD !== null && currentD > 0) {
        const gcHz = margins.gcFreq;
        if (gcHz < 80) {
            const dFactor = clamp(1 + (80 - gcHz) / 160, 1.0, 1.3);
            suggestD = Math.round(currentD * dFactor);
            parts.push(`low GC ${gcHz.toFixed(0)}Hz → increase D ×${dFactor.toFixed(2)}`);
        } else if (gcHz > 200) {
            const dFactor = clamp(1 - (gcHz - 200) / 400, 0.7, 1.0);
            suggestD = Math.round(currentD * dFactor);
            parts.push(`high GC ${gcHz.toFixed(0)}Hz → decrease D ×${dFactor.toFixed(2)}`);
        }
    }

    return { suggestP, suggestD, reason: parts.join("; ") || "within target margins" };
}

/**
 * Run the full SysID pipeline on decoded frames for one BBL session.
 * Returns a sysidResult object or null on fatal error.
 */
function runSysID(frames, config) {
    const looptime = config.misc?.looptime;
    if (!looptime || looptime <= 0) return null;
    const sampleRate = 1e6 / looptime;

    const AXES = [
        { name: "roll", spKey: "setpoint[0]", gyroKey: "gyroADC[0]", pidKey: "roll" },
        { name: "pitch", spKey: "setpoint[1]", gyroKey: "gyroADC[1]", pidKey: "pitch" },
        { name: "yaw", spKey: "setpoint[2]", gyroKey: "gyroADC[2]", pidKey: "yaw" },
    ];

    const result = { axes: {}, warnings: [] };

    for (const ax of AXES) {
        // Extract raw signal arrays
        const sp = new Float64Array(frames.length);
        const gy = new Float64Array(frames.length);
        for (let i = 0; i < frames.length; i++) {
            sp[i] = Number(frames[i][ax.spKey] ?? 0);
            gy[i] = Number(frames[i][ax.gyroKey] ?? 0);
        }

        // Find the longest active chirp segment (rolling 500-sample window, std > 30)
        const { start, end } = _findLongestActiveSegment(sp, 500, 30);
        const N = end - start;

        if (N < 512) {
            result.axes[ax.name] = { error: "Insufficient chirp data on this axis (< 512 samples active)" };
            continue;
        }

        const spSeg = sp.slice(start, end);
        const gySeg = gy.slice(start, end);

        // Pad to next power of 2 and apply Hann window
        const Np = _nextPow2(N);
        const spRe = new Float64Array(Np),
            spIm = new Float64Array(Np);
        const gyRe = new Float64Array(Np),
            gyIm = new Float64Array(Np);
        const win = _hannWindow(N);
        for (let i = 0; i < N; i++) {
            spRe[i] = spSeg[i] * win[i];
            gyRe[i] = gySeg[i] * win[i];
        }

        fftInPlace(spRe, spIm);
        fftInPlace(gyRe, gyIm);

        // Frequency axis: bin k → k * sampleRate / Np Hz
        const nBins = Np / 2 + 1;
        const binHz = sampleRate / Np;

        // H(f) = FFT(gyro) / FFT(setpoint)
        const magDB = new Float64Array(nBins);
        const phaseRad = new Float64Array(nBins);
        for (let k = 0; k < nBins; k++) {
            const spMag2 = spRe[k] * spRe[k] + spIm[k] * spIm[k];
            if (spMag2 < 1e-10) {
                magDB[k] = -60;
                continue;
            }
            const hRe = (gyRe[k] * spRe[k] + gyIm[k] * spIm[k]) / spMag2;
            const hIm = (gyIm[k] * spRe[k] - gyRe[k] * spIm[k]) / spMag2;
            const hMag = Math.sqrt(hRe * hRe + hIm * hIm);
            magDB[k] = hMag > 0 ? 20 * Math.log10(hMag) : -60;
            phaseRad[k] = Math.atan2(hIm, hRe);
        }

        _unwrapPhase(phaseRad);

        // Coherence via Welch (512-sample segments, 50% overlap)
        const SEG = 512;
        const cohRaw = _welchCoherence(Array.from(spSeg), Array.from(gySeg), SEG);
        const cohBinHz = sampleRate / SEG;

        // Build filtered arrays: 1–500 Hz range only
        const FREQ_MIN = 1,
            FREQ_MAX = 500;
        const freqAxis = [],
            filtMag = [],
            filtPhase = [],
            filtCoh = [];
        for (let k = 0; k < nBins; k++) {
            const f = k * binHz;
            if (f < FREQ_MIN || f > FREQ_MAX) continue;
            freqAxis.push(f);
            filtMag.push(magDB[k]);
            filtPhase.push((phaseRad[k] * 180) / Math.PI);
            // Map coherence bin: interpolate from Welch resolution
            const ck = f / cohBinHz;
            const ci = Math.floor(ck);
            const cf = ck - ci;
            const c =
                ci + 1 < cohRaw.length
                    ? cohRaw[ci] * (1 - cf) + cohRaw[ci + 1] * cf
                    : ci < cohRaw.length
                        ? cohRaw[ci]
                        : 0;
            filtCoh.push(Math.min(1, Math.max(0, c)));
        }

        // Stability margins (computed on all bins, coherence shown visually)
        const { phaseMargin, gainMargin, gcFreq, pcFreq } = _computeStabilityMargins(freqAxis, filtMag, filtPhase);

        // Current PID values from BBL header
        const currentP = config.pids?.[ax.pidKey]?.[0] ?? null;
        const currentD = config.pids?.[ax.pidKey]?.[2] ?? null;

        const pidSuggest =
            currentP !== null ? _synthesizePID(currentP, currentD, { phaseMargin, gainMargin, gcFreq, pcFreq }) : null;

        result.axes[ax.name] = {
            freqAxis,
            magDB: filtMag,
            phaseDeg: filtPhase,
            coherence: filtCoh,
            phaseMargin,
            gainMargin,
            gcFreq,
            pcFreq,
            currentP,
            currentD,
            pidSuggest,
        };

        // Safety warnings
        if (phaseMargin !== null) {
            if (phaseMargin < 30) {
                result.warnings.push(
                    `${ax.name.toUpperCase()}: Phase margin ${phaseMargin.toFixed(1)}° is dangerously close to instability (<30°) — reduce P gain immediately.`,
                );
            } else if (phaseMargin > 70) {
                result.warnings.push(
                    `${ax.name.toUpperCase()}: Phase margin ${phaseMargin.toFixed(1)}° is high (>70°) — tune may be over-filtered or sluggish.`,
                );
            }
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// BBL helpers
// ─────────────────────────────────────────────────────────────────────────────

const BBL_MARKER_BYTES = Array.from("H Product:Blackbox flight data recorder by Nicholas Sherlock").map((c) =>
    c.codePointAt(0),
);

// Returns the byte offset of the Nth session's product-marker line (-1 if not found).
function findSessionMarkerPos(buf, sessionIndex) {
    const len = buf.length;
    let pos = 0;
    let sessionsFound = -1;

    while (pos < len) {
        if (buf[pos] === BBL_MARKER_BYTES[0]) {
            let isMarker = BBL_MARKER_BYTES.length + pos <= len;
            for (let j = 1; isMarker && j < BBL_MARKER_BYTES.length; j++) {
                if (buf[pos + j] !== BBL_MARKER_BYTES[j]) {
                    isMarker = false;
                }
            }
            if (isMarker) {
                sessionsFound++;
                if (sessionsFound === sessionIndex) {
                    return pos;
                }
            }
        }
        pos++;
    }
    return -1;
}

// Returns the byte offset where binary frame data begins for a given session,
// i.e. the position immediately after the last 'H ...' header line of that session.
function findBBLBinaryStart(buf, sessionIndex = 0) {
    const sessionHeaderStart = findSessionMarkerPos(buf, sessionIndex);
    if (sessionHeaderStart === -1) {
        return 0;
    } // session not found

    // Phase 2: scan forward from the session marker, collecting 'H ' lines.
    // The first non-'H ' line marks the start of binary data.
    const len = buf.length;
    let pos = sessionHeaderStart;
    let lastHeaderEnd = 0;

    while (pos < len) {
        const lineStart = pos;
        while (pos < len && buf[pos] !== 0x0a) {
            pos++;
        } // find \n
        if (pos < len) {
            pos++;
        } // skip \n

        if (pos - lineStart < 2) {
            continue;
        }

        if (buf[lineStart] === 0x48 && buf[lineStart + 1] === 0x20) {
            // 'H ' line — still in header
            lastHeaderEnd = pos;
        } else {
            break; // binary data starts here
        }
    }

    return lastHeaderEnd;
}

// Returns the byte offset of the Nth session's product-marker line.
// Used to compute where session N's binary data must end.
function findBBLSessionHeaderStart(buf, sessionIndex) {
    return findSessionMarkerPos(buf, sessionIndex);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vue Component
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "aerotune_inputs";

function loadStoredInputs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export default {
    name: "AeroTuneTab",
    components: { BaseTab },

    setup() {
        return { pidTuningStore: usePidTuningStore() };
    },

    data() {
        const stored = loadStoredInputs();
        return {
            activeView: "calculator",
            // Calculator inputs — restored from localStorage if available
            kv: stored?.kv ?? 2400,
            voltage: stored?.voltage ?? 22.2,
            prop: stored?.prop ?? 5,
            weight: stored?.weight ?? 500,
            style: stored?.style ?? "Bando",
            voltagePresets: [
                { label: "1S", v: 3.7 },
                { label: "2S", v: 7.4 },
                { label: "3S", v: 11.1 },
                { label: "4S", v: 14.8 },
                { label: "5S", v: 18.5 },
                { label: "6S", v: 22.2 },
                { label: "8S", v: 29.6 },
            ],
            // Calculator outputs
            showResults: false,
            pids: {},
            filterRec: { hz: "--", low: "--", high: "--", note: "" },
            copyBtnText: "📋 COPY ALL VALUES",
            // Analyzer
            motorTemp: "WARM",
            csvFile: null,
            fileName: "No file selected",
            analysisResult: "Select a Betaflight blackbox file (.bfl, .bbl, or .csv) and click ANALYZE.",
            // Multi-session BBL support
            bblSessions: [],
            bblSelectedSession: 0,
            bblBuffer: null,
            sysidResult: null,
            tooltip: { visible: false, text: "", x: 0, y: 0 },
            // Auto Tune (chirp sweep)
            chirpPropInch: 5,
            chirpPitch: 230,
            chirpRoll: 230,
            chirpYaw: 230,
            chirpPitchLevel: "MEDIUM",
            chirpRollLevel: "MEDIUM",
            chirpYawLevel: "MEDIUM",
            chirpStartHz: 80,
            chirpEndHz: 600,
            chirpDuration: 20,
            chirpConfigured: false,
            chirpConfirmText: "",
            advancedOpen: false,
        };
    },

    computed: {
        canApply() {
            return this.showResults && CONFIGURATOR.connectionValid;
        },
        workflowInstructions() {
            return "1. Calculate baseline PIDs · 2. Configure Blackbox · 3. Fly the test pattern · 4. Load your .bfl file and Analyze";
        },
    },

    watch: {
        kv(v) {
            this._persistInputs();
            this.showResults = false;
            this.pids = {};
        },
        voltage(v) {
            this._persistInputs();
            this.showResults = false;
            this.pids = {};
        },
        prop(v) {
            this._persistInputs();
            this.showResults = false;
            this.pids = {};
        },
        weight(v) {
            this._persistInputs();
            this.showResults = false;
            this.pids = {};
        },
        style(v) {
            this._persistInputs();
            this.showResults = false;
            this.pids = {};
        },
        chirpPropInch(v) {
            this.applyChirpPropDefaults(v);
        },
        sysidResult(val) {
            if (val) this.$nextTick(() => this.renderBodePlots());
        },
    },

    methods: {
        showTip(event, text) {
            const rect = event.currentTarget.getBoundingClientRect();
            this.tooltip.text = text;
            this.tooltip.x = rect.left + rect.width / 2;
            this.tooltip.y = rect.top - 8;
            this.tooltip.visible = true;
        },
        hideTip() {
            this.tooltip.visible = false;
        },
        _persistInputs() {
            try {
                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({
                        kv: this.kv,
                        voltage: this.voltage,
                        prop: this.prop,
                        weight: this.weight,
                        style: this.style,
                    }),
                );
            } catch {
                /* storage unavailable — silently ignore */
            }
        },
        openInstructionsPopup() {
            // Build the HTML as a Blob and open via object URL to avoid
            // document.write() (flagged as a security hotspot by static analysis).
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AeroTune – Instructions</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #2e2e2e;
    color: #cccccc;
    font-family: 'Open Sans', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    padding: 24px 28px 40px;
  }
  h1 { font-size: 16px; color: #ffffff; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #888888; margin-bottom: 20px; }
  .subtitle a { color: #ffbb00; }
  h3 {
    color: #ffbb00;
    font-size: 13px;
    margin: 20px 0 6px;
    border-bottom: 1px solid #444444;
    padding-bottom: 4px;
  }
  p, li { font-size: 12px; color: #aaaaaa; line-height: 1.7; margin: 4px 0; }
  ul { padding-left: 20px; }
  code {
    background: #1a1a1a;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 11px;
    color: #cccccc;
  }
  a { color: #ffbb00; }
  strong { color: #dddddd; }
  .ok   { color: #00d966; }
  .warn { color: #ffe66d; }
  .bad  { color: #ff6b6b; }
</style>
</head>
<body>
<h1>AeroTune™ Instructions</h1>
<p class="subtitle">By Simon Jardine – <a href="https://aerobot2.com" target="_blank" rel="noopener">aerobot2.com</a></p>

<h3>STEP 1: CALCULATE BASELINE PIDs</h3>
<ul>
  <li>Enter motor KV, battery voltage, prop size, weight and flying style.</li>
  <li>Click <strong>CALCULATE PIDs</strong> to get conservative baseline values.</li>
  <li>Click <strong>APPLY PIDs TO FC</strong> to write them directly to the PID Tuning tab, or use <strong>COPY ALL VALUES</strong> to copy them to the clipboard.</li>
</ul>

<h3>STEP 2: CONFIGURE BLACKBOX</h3>
<ul>
  <li>In Betaflight, go to Configuration → Blackbox → Enable, Device = SD Card.</li>
  <li>Set Blackbox logging rate to 1/2 or better — higher rates give better frequency resolution for the analyzer.</li>
  <li>Enable: Gyro, Gyro (Unfiltered), Motor, PID, RC Commands, RPM, Setpoint, Accelerometer.</li>
  <li><strong>Betaflight 4.5+:</strong> raw gyro is always logged automatically.</li>
  <li><strong>Betaflight 4.3/4.4:</strong> set Debug Mode to <code>GYRO_SCALED</code> to capture unfiltered gyro data.</li>
  <li>Use fresh propellers — damaged props introduce false noise and will give inaccurate results.</li>
</ul>

<h3>STEP 3: FLY THE TEST PATTERN</h3>
<ul>
  <li>Level mode or Acro mode both work — LOS or FPV.</li>
  <li>Level mode: full left stick hold 1–1.5 seconds, pause, full right, pause, full forward, pause, full back.</li>
  <li>Acro mode: sharp direct inputs at 20° and 45°, with brief pauses between each.</li>
  <li>Aim for a 2 minute flight. Fly through the full throttle range — the Analyzer needs data across all throttle levels to give an accurate result.</li>
</ul>

<h3>STEP 4: ANALYZE THE LOG</h3>
<ul>
  <li>In Betaflight, go to the Blackbox tab and click USB Storage Mode.</li>
  <li>Drag your .bfl file from the FC storage to your desktop.</li>
  <li>Unplug the FC, then plug it back in and open Betaflight.</li>
  <li>In the AeroTune tab, click Select BBL / BFL, choose your .bfl file and click ANALYZE.</li>
</ul>

<h3>INTERPRETING RESULTS</h3>
<ul>
  <li><span class="ok">EXCELLENT / CLEAN</span> – filters are well-tuned, no changes needed</li>
  <li><span class="ok">GOOD</span> – minor adjustments may help</li>
  <li><span class="warn">FAIR</span> – lower Gyro Lowpass 2 by ~30 Hz, re-test</li>
  <li><span class="warn">WEAK</span> – lower by ~50 Hz, consider adding a Notch filter</li>
  <li><span class="bad">VERY WEAK</span> – aggressive filter reduction needed; check for mechanical vibration</li>
</ul>

<h3>FILTER RECOMMENDATION NOTE</h3>
<ul>
  <li><strong>Gyro Lowpass 2:</strong> The value shown in the Calculator is a <em>starting point</em> based on prop size. Use the Analyzer results to fine-tune after flying.</li>
  <li><strong>Dynamic Notch Filter:</strong> Enable and adjust count based on analyzer results to target resonant frequencies.</li>
  <li><strong>Gyro RPM Filter:</strong> Enable if using bidirectional DSHOT — the most effective filter available for eliminating motor noise harmonics.</li>
</ul>
</body>
</html>`;
            const blob = new Blob([html], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            globalThis.open(url, "aerotune_instructions", "width=620,height=800,resizable=yes,scrollbars=yes");
        },

        selectVoltage(v) {
            this.voltage = v;
        },

        calculate() {
            const pids = calculatePIDs(this.kv, this.voltage, this.prop, this.weight, this.style);
            if (!pids) {
                alert("Invalid input values. Please check all fields.");
                return;
            }
            this.pids = pids;
            this.filterRec = filterRecommendation(this.prop);
            this.showResults = true;
        },

        async applyToFC() {
            if (!this.showResults || !CONFIGURATOR.connectionValid) {
                alert("No flight controller connected. Connect to FC before applying PIDs.");
                return;
            }

            const p = this.pids;

            // Read current PID values from FC before patching so we write
            // against the live FC state, not stale defaults.
            try {
                await MSP.promise(MSPCodes.MSP_PID);
            } catch (e) {
                console.error("[AeroTune] Failed to read MSP_PID before applying:", e);
                alert("Failed to read PID values from FC. Check connection and try again.");
                return;
            }

            // Write into FC reactive state
            if (FC.PIDS && FC.PIDS.length >= 3) {
                FC.PIDS[0][0] = p.roll_p;
                FC.PIDS[0][1] = p.roll_i;
                FC.PIDS[0][2] = p.roll_d;
                FC.PIDS[1][0] = p.pitch_p;
                FC.PIDS[1][1] = p.pitch_i;
                FC.PIDS[1][2] = p.pitch_d;
                FC.PIDS[2][0] = p.yaw_p;
                FC.PIDS[2][1] = p.yaw_i;
                FC.PIDS[2][2] = p.yaw_d;
            }

            // Read current advanced tuning values from FC before modifying so
            // we preserve ALL fields (idleMinRpm, TPA, iterm relax, anti-gravity,
            // etc.) that AeroTune doesn't touch.  Without this read, FC.ADVANCED_TUNING
            // may still be at its all-zero defaults (if the user hasn't visited
            // the PID tab yet), which would zero out those settings on the FC.
            try {
                await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
            } catch (e) {
                console.error("[AeroTune] Failed to read MSP_PID_ADVANCED before applying:", e);
                alert("Failed to read advanced tuning from FC. Check connection and try again.");
                return;
            }

            // Now patch only the feedforward and D Max fields.
            if (FC.ADVANCED_TUNING) {
                FC.ADVANCED_TUNING.feedforwardRoll = p.roll_f;
                FC.ADVANCED_TUNING.feedforwardPitch = p.pitch_f;
                FC.ADVANCED_TUNING.feedforwardYaw = p.yaw_f;
                FC.ADVANCED_TUNING.dMaxRoll = p.dMax_roll;
                FC.ADVANCED_TUNING.dMaxPitch = p.dMax_pitch;
            }

            // Push to FC hardware RAM so PID tab reads back the new values on mount
            try {
                await MSP.promise(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID));
                await MSP.promise(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED));
            } catch (e) {
                console.error("[AeroTune] Failed to send PID values to FC:", e);
                alert("Failed to send PID values to FC. Check connection and try again.");
                return;
            }

            // Tell the PID Tuning store that values were written externally so
            // the Save button is enabled when the tab loads the data.
            this.pidTuningStore.markExternalChange();

            // Navigate to PID tuning tab
            const pidTabLink = document.querySelector("li.tab_pid_tuning a");
            if (pidTabLink) {
                pidTabLink.click();
            } else {
                alert("PID Tuning tab not available. Make sure a flight controller is connected.");
            }
        },

        copyValues() {
            if (!this.showResults) {
                return;
            }
            const p = this.pids,
                fr = this.filterRec;
            const text = [
                `# AeroTune V5.6 PID Values`,
                `Roll   P=${p.roll_p}  I=${p.roll_i}  D_Max=${p.dMax_roll}  F=${p.roll_f}  D_min=${p.d_min_roll}`,
                `Pitch  P=${p.pitch_p}  I=${p.pitch_i}  D_Max=${p.dMax_pitch}  F=${p.pitch_f}  D_min=${p.d_min_pitch}`,
                `Yaw    P=${p.yaw_p}  I=${p.yaw_i}  D=${p.yaw_d}  F=${p.yaw_f}`,
                `Gyro Lowpass 2 recommendation: ${fr.hz} Hz (${fr.low}–${fr.high} Hz) – ${fr.note}`,
            ].join("\n");
            navigator.clipboard
                .writeText(text)
                .then(() => {
                    this.copyBtnText = "✔ Copied!";
                    setTimeout(() => {
                        this.copyBtnText = "📋 COPY ALL VALUES";
                    }, 2000);
                })
                .catch((err) => {
                    console.error("[AeroTune] Failed to copy to clipboard:", err);
                });
        },

        /** Decode and analyze a specific BBL session from the already-loaded buffer. */
        _decodeBBLSession(sessionIdx, buffer, sessions) {
            const config = sessions[sessionIdx];
            const headerEnd = findBBLBinaryStart(buffer, sessionIdx);
            if (headerEnd === 0) {
                this.analysisResult = "ERROR: Could not locate frame data in blackbox file.";
                return;
            }

            // Bound the decode to this session's byte range so multi-session
            // logs don't bleed into the next session's header bytes.
            const nextHeaderStart =
                sessionIdx + 1 < sessions.length ? findBBLSessionHeaderStart(buffer, sessionIdx + 1) : -1;
            const sessionEnd = nextHeaderStart >= 0 ? nextHeaderStart : buffer.length;

            const decoder = new FrameDecoder(config);
            const { frames } = decoder.decodeFrames(buffer, headerEnd, 0, sessionEnd);
            if (!frames || frames.length === 0) {
                this.analysisResult =
                    "ERROR: No frames decoded from blackbox file. The file may be corrupt or use an unsupported format.";
                return;
            }

            // Detect chirp / SysID log — if found, run frequency response analysis
            // and skip the normal filter effectiveness scoring.
            this.sysidResult = null;
            if (detectChirp(frames, config)) {
                const prefix = sessions.length > 1 ? `Session ${sessionIdx + 1} — ` : "";
                this.analysisResult = `${prefix}CHIRP / SYSID log detected — see frequency response analysis below.`;
                try {
                    this.sysidResult = runSysID(frames, config);
                } catch (sysidErr) {
                    this.analysisResult += `\nSysID analysis error: ${sysidErr.message}`;
                }
                return;
            }

            const prefix = sessions.length > 1 ? `Session ${sessionIdx + 1}: ` : "";
            this.analysisResult = prefix + formatAnalysisResult(analyzeLog(frames, this.motorTemp, config));
        },

        /** Called by the session dropdown — re-analyzes the selected session. */
        runBBLSession(sessionIdx) {
            if (!this.bblBuffer || !this.bblSessions.length) {
                return;
            }
            try {
                this._decodeBBLSession(sessionIdx, this.bblBuffer, this.bblSessions);
            } catch (err) {
                this.analysisResult = `ERROR: Failed to decode session ${sessionIdx + 1}: ${err.message}`;
            }
        },

        onFileChange(e) {
            const file = e.target.files[0];
            if (!file) {
                return;
            }
            this.bblBuffer = null;
            this.bblSessions = [];
            this.bblSelectedSession = 0;
            this.sysidResult = null;
            this.csvFile = file;
            this.fileName = file.name;
        },

        async analyzeFile() {
            if (!this.csvFile) {
                return;
            }
            this.analysisResult = "Parsing file…";
            const motorTemp = this.motorTemp;
            const file = this.csvFile;
            const ext = file.name.split(".").pop().toLowerCase();

            try {
                if (ext === "bfl" || ext === "bbl") {
                    const arrayBuf = await file.arrayBuffer();
                    const buffer = new Uint8Array(arrayBuf);

                    // Parse ASCII header section — may contain multiple sessions
                    const headerParser = new BBLHeaderParser();
                    const sessions = headerParser.parseFile(buffer);
                    if (!sessions || sessions.length === 0) {
                        this.analysisResult =
                            "ERROR: Could not parse blackbox header. Make sure this is a valid Betaflight blackbox file.";
                        return;
                    }

                    // Store for re-use when the user switches sessions
                    this.bblBuffer = buffer;
                    this.bblSessions = sessions;
                    this.bblSelectedSession = 0;

                    if (sessions.length > 1) {
                        this.analysisResult = `Found ${sessions.length} flight sessions. Showing Session 1 — use the dropdown above to select another.`;
                    }

                    this._decodeBBLSession(0, buffer, sessions);
                } else {
                    // CSV pipeline
                    const text = await file.text();
                    const rows = parseBlackboxCSV(text);
                    if (!rows) {
                        this.analysisResult =
                            "ERROR: Could not find a valid Betaflight blackbox header.\nMake sure you exported a CSV from Blackbox Explorer (not the raw .BFL/.BBL file).";
                        return;
                    }
                    this.analysisResult = formatAnalysisResult(analyzeLog(rows, motorTemp));
                }
            } catch (err) {
                this.analysisResult = `ERROR: Failed to read file: ${err.message}`;
            }
        },

        applyChirpPropDefaults(propInch) {
            const d = chirpDefaultsForProp(propInch);
            this.chirpStartHz = d.startHz;
            this.chirpEndHz = d.endHz;
            // Re-apply current intensity level with prop-appropriate amplitudes
            this.setChirpLevel("pitch", this.chirpPitchLevel);
            this.setChirpLevel("roll", this.chirpRollLevel);
            this.setChirpLevel("yaw", this.chirpYawLevel);
        },

        setChirpLevel(axis, level) {
            const d = chirpDefaultsForProp(this.chirpPropInch);
            const AMPLITUDES = { EASY: d.easy, MEDIUM: d.medium, HARD: d.hard };
            const amp = AMPLITUDES[level];
            if (axis === "pitch") {
                this.chirpPitchLevel = level;
                this.chirpPitch = amp;
            } else if (axis === "roll") {
                this.chirpRollLevel = level;
                this.chirpRoll = amp;
            } else if (axis === "yaw") {
                this.chirpYawLevel = level;
                this.chirpYaw = amp;
            }
        },

        configureFc() {
            if (!CONFIGURATOR.connectionValid) {
                this.chirpConfirmText = "ERROR: Not connected to flight controller.";
                this.chirpConfigured = true;
                return;
            }

            const { chirpStartHz, chirpEndHz, chirpDuration } = this;
            if (
                !Number.isFinite(chirpStartHz) ||
                !Number.isFinite(chirpEndHz) ||
                chirpStartHz >= chirpEndHz ||
                !Number.isFinite(chirpDuration) ||
                chirpDuration < 1 ||
                chirpDuration > 60
            ) {
                this.chirpConfirmText = "ERROR: Invalid chirp sweep settings.";
                this.chirpConfigured = true;
                return;
            }

            this.chirpConfigured = false;

            const startDeciHz = Math.round(chirpStartHz * 10);
            const endDeciHz = Math.round(chirpEndHz * 10);

            const commands = [
                `set chirp_amplitude_pitch = ${this.chirpPitch}`,
                `set chirp_amplitude_roll = ${this.chirpRoll}`,
                `set chirp_amplitude_yaw = ${this.chirpYaw}`,
                `set chirp_frequency_start_deci_hz = ${startDeciHz}`,
                `set chirp_frequency_end_deci_hz = ${endDeciHz}`,
                `set chirp_time_seconds = ${chirpDuration}`,
                `save`,
            ];

            const sendRaw = (str) => {
                const buf = new ArrayBuffer(str.length);
                const view = new Uint8Array(buf);
                for (let i = 0; i < str.length; i++) view[i] = str.codePointAt(i);
                serial.send(buf);
            };

            // Enter CLI mode
            const enterBuf = new ArrayBuffer(1);
            new Uint8Array(enterBuf)[0] = 0x23; // '#'
            serial.send(enterBuf);

            // Wait for CLI to become active before dispatching commands
            const MAX_WAIT_MS = 3000;
            const POLL_INTERVAL_MS = 50;
            let elapsed = 0;
            const poll = setInterval(() => {
                elapsed += POLL_INTERVAL_MS;
                if (CONFIGURATOR.cliActive || CONFIGURATOR.cliValid) {
                    clearInterval(poll);
                    let delay = 0;
                    for (const cmd of commands) {
                        setTimeout(() => sendRaw(`${cmd}\n`), delay);
                        delay += 60;
                    }
                    setTimeout(() => {
                        this.chirpConfirmText = commands.join("\n");
                        this.chirpConfigured = true;
                    }, delay + 100);
                } else if (elapsed >= MAX_WAIT_MS) {
                    clearInterval(poll);
                    this.chirpConfirmText = "ERROR: CLI did not become active. Check connection and try again.";
                }
            }, POLL_INTERVAL_MS);
        },

        /**
         * Return a CSS class name for stability margin table cells.
         * type: 'pm' (phase margin) or 'gm' (gain margin)
         */
        stabilityClass(value, type) {
            if (value === null || value === undefined) return "";
            if (type === "pm") {
                if (value < 30) return "at-sysid-bad";
                if (value > 70) return "at-sysid-warn";
                return "at-sysid-ok";
            }
            if (type === "gm") {
                if (value < 3) return "at-sysid-bad";
                if (value < 6) return "at-sysid-warn";
                return "at-sysid-ok";
            }
            return "";
        },

        /** Draw all three Bode-plot canvases from this.sysidResult. */
        renderBodePlots() {
            const refMap = { roll: "bodePlotRoll", pitch: "bodePlotPitch", yaw: "bodePlotYaw" };
            for (const [axName, refName] of Object.entries(refMap)) {
                const canvas = this.$refs[refName];
                const axData = this.sysidResult?.axes?.[axName];
                if (!canvas || !axData || axData.error) continue;
                this._drawBode(canvas, axData, axName);
            }
        },

        /**
         * Draw a Bode plot (magnitude top, phase bottom) onto a canvas element.
         * Frequency x-axis is log scale 1–500 Hz.
         * Low-coherence regions (< 0.6) are rendered at reduced opacity.
         */
        _drawBode(canvas, axData, axName) {
            const W = canvas.width;
            const H = canvas.height;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, W, H);

            const PAD_L = 52,
                PAD_R = 16,
                PAD_T = 18,
                PAD_B = 22;
            const plotW = W - PAD_L - PAD_R;
            const halfH = (H - PAD_T - PAD_B) / 2;

            const MAG_TOP = PAD_T;
            const MAG_BOT = PAD_T + halfH;
            const PH_TOP = MAG_BOT + 4;
            const PH_BOT = H - PAD_B;

            const FREQ_LO = 1,
                FREQ_HI = 500;
            const MAG_MIN = -40,
                MAG_MAX = 40;
            const PH_MIN = -360,
                PH_MAX = 180;

            const logLo = Math.log10(FREQ_LO);
            const logHi = Math.log10(FREQ_HI);

            const xForFreq = (f) => PAD_L + ((Math.log10(Math.max(f, FREQ_LO)) - logLo) / (logHi - logLo)) * plotW;
            const yForMag = (m) => MAG_BOT - ((clamp(m, MAG_MIN, MAG_MAX) - MAG_MIN) / (MAG_MAX - MAG_MIN)) * halfH;
            const yForPh = (p) =>
                PH_BOT - ((clamp(p, PH_MIN, PH_MAX) - PH_MIN) / (PH_MAX - PH_MIN)) * (PH_BOT - PH_TOP);

            // ── Background ───────────────────────────────────────────────────
            ctx.fillStyle = "#1a1a1a";
            ctx.fillRect(0, 0, W, H);

            // ── Grid lines ───────────────────────────────────────────────────
            ctx.strokeStyle = "#333333";
            ctx.lineWidth = 1;

            // Magnitude: 0 dB reference line
            const y0dB = yForMag(0);
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(PAD_L, y0dB);
            ctx.lineTo(W - PAD_R, y0dB);
            ctx.stroke();
            ctx.setLineDash([]);

            // Horizontal grid for magnitude panel (±20, ±40 dB)
            for (const m of [-40, -20, 20, 40]) {
                const y = yForMag(m);
                ctx.beginPath();
                ctx.moveTo(PAD_L, y);
                ctx.lineTo(W - PAD_R, y);
                ctx.stroke();
            }

            // Phase: -180° reference line
            const yNeg180 = yForPh(-180);
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(PAD_L, yNeg180);
            ctx.lineTo(W - PAD_R, yNeg180);
            ctx.stroke();
            ctx.setLineDash([]);

            // Horizontal grid for phase panel (0, -90, -270)
            for (const p of [0, -90, -270]) {
                if (p < PH_MIN || p > PH_MAX) continue;
                const y = yForPh(p);
                ctx.beginPath();
                ctx.moveTo(PAD_L, y);
                ctx.lineTo(W - PAD_R, y);
                ctx.stroke();
            }

            // Vertical grid lines at each decade and notable sub-decades
            const freqGridLines = [1, 2, 5, 10, 20, 50, 100, 200, 500];
            ctx.strokeStyle = "#2a2a2a";
            for (const f of freqGridLines) {
                const x = xForFreq(f);
                ctx.beginPath();
                ctx.moveTo(x, MAG_TOP);
                ctx.lineTo(x, PH_BOT);
                ctx.stroke();
            }

            // ── Data curves ──────────────────────────────────────────────────
            const { freqAxis, magDB, phaseDeg, coherence, gcFreq, pcFreq } = axData;
            const n = freqAxis.length;
            const COH_THRESH = 0.6;

            // Draw filled coherence shading under magnitude curve
            // (grey fill for low-coherence regions)
            for (let i = 0; i < n; i++) {
                const coh = coherence[i] ?? 0;
                if (coh >= COH_THRESH) continue;
                const x = xForFreq(freqAxis[i]);
                const alpha = (1 - coh / COH_THRESH) * 0.35;
                ctx.fillStyle = `rgba(80,80,80,${alpha.toFixed(2)})`;
                ctx.fillRect(x, MAG_TOP, Math.max(1, xForFreq(freqAxis[i + 1] ?? freqAxis[i] * 1.01) - x), halfH);
                ctx.fillRect(
                    x,
                    PH_TOP,
                    Math.max(1, xForFreq(freqAxis[i + 1] ?? freqAxis[i] * 1.01) - x),
                    PH_BOT - PH_TOP,
                );
            }

            // Magnitude curve
            ctx.lineWidth = 1.5;
            let drawing = false;
            for (let i = 0; i < n; i++) {
                const coh = coherence[i] ?? 0;
                const alpha = coh < COH_THRESH ? 0.35 : 1.0;
                const color = `rgba(255,187,0,${alpha})`;
                const x = xForFreq(freqAxis[i]);
                const y = yForMag(magDB[i]);
                if (!drawing) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.strokeStyle = color;
                    drawing = true;
                } else {
                    // If opacity changes, flush segment
                    const prevCoh = coherence[i - 1] ?? 0;
                    const prevAlpha = prevCoh < COH_THRESH ? 0.35 : 1.0;
                    if (Math.abs(alpha - prevAlpha) > 0.01) {
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.strokeStyle = color;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            if (drawing) ctx.stroke();

            // Phase curve
            drawing = false;
            for (let i = 0; i < n; i++) {
                const coh = coherence[i] ?? 0;
                const alpha = coh < COH_THRESH ? 0.35 : 1.0;
                const color = `rgba(100,180,255,${alpha})`;
                const x = xForFreq(freqAxis[i]);
                const y = yForPh(phaseDeg[i]);
                if (!drawing) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.strokeStyle = color;
                    drawing = true;
                } else {
                    const prevCoh = coherence[i - 1] ?? 0;
                    const prevAlpha = prevCoh < COH_THRESH ? 0.35 : 1.0;
                    if (Math.abs(alpha - prevAlpha) > 0.01) {
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.strokeStyle = color;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            if (drawing) ctx.stroke();

            // Gain-crossover frequency marker
            if (gcFreq !== null && gcFreq >= FREQ_LO && gcFreq <= FREQ_HI) {
                const xgc = xForFreq(gcFreq);
                ctx.strokeStyle = "rgba(255,100,100,0.8)";
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(xgc, MAG_TOP);
                ctx.lineTo(xgc, MAG_BOT);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Phase-crossover frequency marker
            if (pcFreq !== null && pcFreq >= FREQ_LO && pcFreq <= FREQ_HI) {
                const xpc = xForFreq(pcFreq);
                ctx.strokeStyle = "rgba(180,100,255,0.8)";
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(xpc, PH_TOP);
                ctx.lineTo(xpc, PH_BOT);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // ── Axis labels ──────────────────────────────────────────────────
            ctx.fillStyle = "#888888";
            ctx.font = "10px monospace";
            ctx.textAlign = "right";

            // Magnitude y-axis labels
            for (const m of [-40, -20, 0, 20, 40]) {
                const y = yForMag(m);
                if (y < MAG_TOP || y > MAG_BOT + 2) continue;
                ctx.fillText(`${m}`, PAD_L - 3, y + 3);
            }
            ctx.fillStyle = "#aaaaaa";
            ctx.font = "9px monospace";
            ctx.textAlign = "left";
            ctx.fillText("dB", 2, MAG_TOP + 8);

            // Phase y-axis labels
            ctx.fillStyle = "#888888";
            ctx.font = "10px monospace";
            ctx.textAlign = "right";
            for (const p of [-270, -180, -90, 0, 90, 180]) {
                if (p < PH_MIN || p > PH_MAX) continue;
                const y = yForPh(p);
                if (y < PH_TOP || y > PH_BOT + 2) continue;
                ctx.fillText(`${p}°`, PAD_L - 3, y + 3);
            }
            ctx.fillStyle = "#aaaaaa";
            ctx.font = "9px monospace";
            ctx.textAlign = "left";
            ctx.fillText("deg", 2, PH_TOP + 8);

            // Frequency axis labels
            ctx.fillStyle = "#888888";
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            for (const f of [1, 5, 10, 20, 50, 100, 200, 500]) {
                const x = xForFreq(f);
                ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 4);
            }
            ctx.fillStyle = "#aaaaaa";
            ctx.font = "9px monospace";
            ctx.textAlign = "right";
            ctx.fillText("Hz", W - PAD_R, H - 4);

            // Panel divider
            ctx.strokeStyle = "#444444";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD_L, MAG_BOT + 2);
            ctx.lineTo(W - PAD_R, MAG_BOT + 2);
            ctx.stroke();

            // Border
            ctx.strokeStyle = "#444444";
            ctx.strokeRect(PAD_L, MAG_TOP, plotW, PH_BOT - MAG_TOP);
        },
    },
};
</script>
