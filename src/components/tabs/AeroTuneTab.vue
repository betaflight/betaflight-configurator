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
                            1. Fly your quad with the calculated PIDs &nbsp;·&nbsp; 2. Export Blackbox CSV from
                            Betaflight Blackbox Explorer &nbsp;·&nbsp; 3. Load it below &nbsp;·&nbsp; 4. Analyze filter
                            effectiveness at high throttle
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
                                <label class="at-file-label" @click="$refs.fileInput.click()">Select BFL or CSV</label>
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

                    <h3>STEP 2: FLY THE TEST PATTERN</h3>
                    <p>Enable Blackbox before flying:</p>
                    <ul>
                        <li>Configuration tab → Blackbox → Enable, Device = SD Card, Rate = 1/2</li>
                        <li>Set logging rate to minimum 1kHz, ideally 2kHz for best frequency resolution.</li>
                        <li>Enable: Gyro, Gyro (Unfiltered), Motor, PID, RC Commands, RPM, Setpoint, Accelerometer</li>
                        <li><strong>Betaflight 4.5+:</strong> raw gyro is always logged automatically.</li>
                        <li>
                            <strong>Betaflight 4.3/4.4:</strong> set Debug Mode to <code>GYRO_SCALED</code> to capture
                            unfiltered gyro data.
                        </li>
                    </ul>
                    <p>Before flying:</p>
                    <ul>
                        <li>
                            Use fresh propellers — damaged props introduce false noise and will give inaccurate results.
                        </li>
                    </ul>
                    <p>Flight pattern:</p>
                    <ul>
                        <li>
                            Level mode: Full left stick hold 3-5 seconds, pause, full right stick hold 3-5 seconds,
                            pause, full forward hold 3-5 seconds, pause, full back hold 3-5 seconds
                        </li>
                    </ul>

                    <h3>STEP 3: ANALYZE THE LOG</h3>
                    <ul>
                        <li>
                            Pull the SD card, open the <code>.BBL</code> file in
                            <a href="https://blackbox.betaflight.com/" target="_blank"
                                ><strong>Betaflight Blackbox Explorer</strong></a
                            >
                        </li>
                        <li>Export as CSV (File → Export CSV)</li>
                        <li>Come back to AeroTune Analyzer tab, load your CSV and click ANALYZE</li>
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
                    <div class="at-advanced-toggle" @click="advancedOpen = !advancedOpen">
                        ⚙ ADVANCED SETTINGS
                        <span class="at-advanced-chevron" :class="{ open: advancedOpen }">▶</span>
                    </div>
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
                        <ol>
                            <li>Props <strong>OFF</strong> — configure above and hit button</li>
                            <li>Props <strong>ON</strong> — assign <code>CHIRP</code> switch in Modes tab</li>
                            <li>
                                Hover 10m+, flip switch <strong>once</strong> → firmware runs Pitch, Roll, then Yaw
                                automatically
                            </li>
                            <li>Land, plug in USB → drop your BFL file into <strong>STEP 2: LOG ANALYZER</strong></li>
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
    kv = parseFloat(kv);
    if (KV_BASELINE[kv] !== undefined) return KV_BASELINE[kv];
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
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
    for (let i = 0; i < points.length - 1; i++) {
        if (x >= points[i][0] && x <= points[i + 1][0]) {
            const t = (x - points[i][0]) / (points[i + 1][0] - points[i][0]);
            return points[i][1] + t * (points[i + 1][1] - points[i][1]);
        }
    }
    return 1.0;
}

// Voltage scalar — 4S (14.8 V) is the baseline (1.00).
// Applied FULLY to P and D; HALF correction applied to I and FF.
function voltageScalar(voltage) {
    return interpolatePoints(parseFloat(voltage), [
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
    return interpolatePoints(parseFloat(prop), [
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
    return interpolatePoints(parseFloat(prop), [
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
    kv = parseFloat(kv);
    voltage = parseFloat(voltage);
    prop = parseFloat(prop);
    weight = parseFloat(weight);
    if (isNaN(kv) || isNaN(voltage) || isNaN(prop) || isNaN(weight)) return null;

    // Base P at 5"/4S scale — only KV, style, and weight contribute here.
    const rawBase = interpolateKV(kv) * (FLYING_STYLES[style] || 1.0) * (1.0 + ((weight - 500) / 2000) * 0.15);
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
        dMax_roll: Math.round(rollBase * dr * dMult),
        roll_f: Math.round(ff.roll_f * ffMult),
        pitch_p: clamp(Math.round(pitchBase * fullMult), 20, 90),
        pitch_i: Math.round(pitchBase * 1.902 * halfMult),
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
    prop = parseFloat(prop);
    if (prop <= 3) return { hz: 450, low: 400, high: 500, note: "Small / Micro" };
    if (prop <= 4) return { hz: 380, low: 350, high: 420, note: "4-inch" };
    if (prop <= 5.5) return { hz: 300, low: 280, high: 350, note: "5-inch (most common)" };
    if (prop <= 7) return { hz: 250, low: 220, high: 280, note: "6–7 inch" };
    if (prop <= 10) return { hz: 180, low: 150, high: 220, note: "8–10 inch" };
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
    if (headerIdx === -1) return null;

    const headers = lines[headerIdx].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length < 2) continue;
        const row = {};
        headers.forEach((h, idx) => {
            const raw = (parts[idx] || "").trim();
            const n = Number(raw);
            row[h] = isNaN(n) ? raw : n;
        });
        rows.push(row);
    }
    return rows;
}

function analyzeLog(rows, motorTemp = "WARM") {
    if (!rows || rows.length === 0) return { error: "No valid data found in log." };

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
    const rollRatio = rollTrackingRatio ?? 1.0;
    const pitchRatio = pitchTrackingRatio ?? 1.0;
    const avgDeviation = (Math.abs(rollRatio - 1.0) + Math.abs(pitchRatio - 1.0)) / 2;
    const trackingScore = Math.max(0, 100 - avgDeviation * 500);

    // Display labels for tracking (not used in scoring)
    function trackingLabel(ratio) {
        if (ratio === null) return "NO DATA";
        if (ratio >= 0.98 && ratio <= 1.02) return "EXCELLENT";
        if (ratio >= 0.92 && ratio <= 1.08) return "GOOD";
        if (ratio >= 0.8 && ratio <= 1.2) return "FAIR";
        return "POOR";
    }
    const rollTracking = { label: trackingLabel(rollTrackingRatio) };
    const pitchTracking = { label: trackingLabel(pitchTrackingRatio) };

    // Zero crossing score: sign changes in gyroADC[0] during active roll input
    let zeroCrossings = 0;
    for (let j = 1; j < activeGyroRoll.length; j++) {
        if (activeGyroRoll[j - 1] >= 0 !== activeGyroRoll[j] >= 0) zeroCrossings++;
    }
    const zeroCrossingRate = activeGyroRoll.length > 0 ? (zeroCrossings / activeGyroRoll.length) * 100 : 0;
    const zcScore = Math.max(0, 100 - zeroCrossingRate * 10);
    let zcLabel;
    if (zeroCrossingRate < 1) zcLabel = "EXCELLENT";
    else if (zeroCrossingRate < 3) zcLabel = "GOOD";
    else if (zeroCrossingRate < 10) zcLabel = "FAIR";
    else zcLabel = "POOR";

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
                if (g1 * g2 < 0) osc++;
            }
            if (osc >= 3) propwashDetected = true;
        }
    }

    // Weighted overall score (matches Python V5.6 formula exactly)
    const overallScore = trackingScore * 0.7 + filterScore * 0.15 + zcScore * 0.1 + 5.0;

    let overallLabel;
    if (overallScore >= 85) overallLabel = "EXCELLENT ✅";
    else if (overallScore >= 70) overallLabel = "GOOD ✅";
    else if (overallScore >= 55) overallLabel = "FAIR ⚠️";
    else if (overallScore >= 40) overallLabel = "WEAK ⚠️";
    else overallLabel = "VERY WEAK 🔴";
    if (insufficientHiThrottle && overallScore >= 70) {
        overallLabel += " (unconfirmed — insufficient hi-throttle data)";
    }

    // Vibration level: score >= 70 overrides to ADEQUATE, else from avg_raw (>1400)
    let vibLevel;
    if (overallScore >= 70) vibLevel = "ADEQUATE ✓";
    else if (avgRaw < 15) vibLevel = "CLEAN ✓";
    else if (avgRaw < 20) vibLevel = "GOOD ✓";
    else if (avgRaw < 30) vibLevel = "FAIR";
    else if (avgRaw < 50) vibLevel = "WEAK ⚠";
    else vibLevel = "VERY WEAK 🔴";

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
    function analyzePGain(axis, isLevelMode) {
        const spKey = `setpoint[${axis}]`,
            gyroKey = `gyroADC[${axis}]`;
        const overshootPcts = [],
            lagFrames = [],
            zeroCrossingCounts = [];

        for (let i = 1; i + 30 < rows.length; i++) {
            const spPrev = Number(rows[i - 1][spKey] ?? 0);
            const spCurr = Number(rows[i][spKey] ?? 0);
            if (Math.abs(spCurr - spPrev) <= 20) continue;
            const absSP = Math.abs(spCurr);
            if (absSP < 5) continue;

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
            if (!lagFound) lagFrames.push(30);

            if (isLevelMode) {
                let crossings = 0;
                for (let j = 1; j <= 20 && peakFrame + j < rows.length; j++) {
                    const e1 =
                        Number(rows[peakFrame + j - 1][gyroKey] ?? 0) - Number(rows[peakFrame + j - 1][spKey] ?? 0);
                    const e2 = Number(rows[peakFrame + j][gyroKey] ?? 0) - Number(rows[peakFrame + j][spKey] ?? 0);
                    if (e1 * e2 < 0) crossings++;
                }
                zeroCrossingCounts.push(crossings);
            }
        }
        return { overshootPcts, lagFrames, zeroCrossingCounts };
    }

    const ANGLE_MODE_FLAG = 2;
    let levelModeFrames = 0;
    for (const row of rows) {
        if (Number(row["flightModeFlags"] ?? 0) & ANGLE_MODE_FLAG) levelModeFrames++;
    }
    const isLevelMode = rows.length > 0 && levelModeFrames / rows.length > 0.5;

    const rollPData = analyzePGain(0, isLevelMode);
    const pitchPData = analyzePGain(1, isLevelMode);

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
        const avgTracking = ((rollTrackingRatio ?? 1.0) + (pitchTrackingRatio ?? 1.0)) / 2;
        if (!(zeroCrossingRate > 5 && avgTracking > 1.15)) {
            pVerdict = "P LOOKS ACCEPTABLE";
            pAction =
                "Overshoot pattern detected in step inputs, but zero-crossing rate and tracking ratio do not both confirm P is too high.\nMonitor during flight — no P reduction recommended based on available evidence.";
        }
    }

    // ── D GAIN ANALYSIS ───────────────────────────────────────────────────────
    function analyzeDGain(axis) {
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
            if (Math.abs(spCurr - spPrev) <= 20 || Math.abs(spCurr) < 5) continue;

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
                if (e1 * e2 < 0) crossings++;
            }
            zeroCrossingCounts.push(crossings);

            const dVal = Math.abs(Number(rows[peakFrame][axisDKey] ?? 0));
            const pVal = Math.abs(Number(rows[peakFrame][axisPKey] ?? 0));
            if (pVal > 1) dToPRatios.push(dVal / pVal);
        }

        for (const row of rows) {
            if (Number(row["rcCommand[3]"] ?? 1000) > 1400) {
                hiThrCount++;
                const unfilt = Math.abs(Number(row[gyroUnfKey] ?? 0));
                const filt = Math.abs(Number(row[gyroKey] ?? 0));
                if (unfilt > filt * 2 && Math.abs(Number(row[axisDKey] ?? 0)) > 20) hiThrDOscCount++;
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

    const rollDData = analyzeDGain(0);
    const pitchDData = analyzeDGain(1);
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
    if (propwashDetected) dAction += "\nPropwash detected — increase D by 3–5 or check filtering.";

    // ── POST-PROCESS FILTER DISPLAY FOR GOOD/EXCELLENT OVERALL ───────────────
    if (overallScore >= 70 && filterSufficient) {
        const rpmLine = hasRpmFilter
            ? "RPM filter detected (eRPM data present) — it is active and helping suppress motor harmonics."
            : "Enable RPM filter — most effective filter available, requires bidirectional DSHOT.";
        filterAction = `Filters are adequate for this tune. No changes recommended.\nFresh props recommended before tuning — damaged props create false noise in logs.\n${rpmLine}`;
        if (vibLevel === "VERY WEAK 🔴") vibLevel = "ADEQUATE ✓";
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
    };
}

function formatAnalysisResult(r) {
    if (r.error) return `ERROR: ${r.error}`;
    const SEP = "════════════════════════════════════════════════════";
    const lines = [];

    if (r.insufficientHiThrottle) {
        lines.push(
            `⚠️ INSUFFICIENT HIGH-THROTTLE DATA — Only ${r.hiThrottlePct}% of this flight was above 50% throttle.`,
            `Results may not be reliable. For accurate filter analysis, fly a pack with sustained throttle inputs above 50% stick.`,
            ``,
        );
    }

    lines.push(
        `Frames analysed : ${r.totalFrames}  |  Hi-throttle (>50%): ${r.hiThrottleFrames} (${r.hiThrottlePct}%)`,
        ``,
        SEP,
        `  OVERALL RATING : ${r.overallLabel}  (score: ${r.overallScore}/100)`,
        SEP,
        ``,
    );

    const rRatio = r.rollTrackingRatio !== null ? r.rollTrackingRatio.toFixed(3) : "N/A";
    const pRatio = r.pitchTrackingRatio !== null ? r.pitchTrackingRatio.toFixed(3) : "N/A";
    lines.push(
        SEP,
        `  SETPOINT TRACKING`,
        SEP,
        `Roll:  ${rRatio} (target: 1.000) — ${r.rollTracking.label}`,
        `Pitch: ${pRatio} (target: 1.000) — ${r.pitchTracking.label}`,
        `Zero-crossing rate (P oscillation): ${r.zeroCrossingRate}% — ${r.zcLabel}`,
        ``,
    );

    const effDisplay = r.filterSufficient ? `${r.effectiveness}%` : "N/A";
    lines.push(SEP, `  FILTERS : ${r.vibLevel}  |  Effectiveness: ${effDisplay}`, SEP);
    if (r.filterSufficient) {
        lines.push(`Avg raw gyro (hi-thr): ${r.avgRaw}  |  Avg filtered: ${r.avgFiltered}`);
    }
    lines.push(r.filterAction, ``);

    lines.push(SEP, `  ROLL/PITCH P : ${r.pVerdict}`, SEP);
    if (parseFloat(r.overallScore) >= 70) {
        lines.push(`P tracking well — no changes recommended.`, ``);
    } else {
        lines.push(
            r.pAction,
            `Tip: level mode and acro mode are both valid for tuning. Level mode gives clean repeatable step inputs.`,
            ``,
        );
    }

    lines.push(SEP, `  ROLL/PITCH D : ${r.dVerdict}`, SEP, r.dAction);
    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// BBL Binary Start Finder
// Returns the byte offset where binary frame data begins for a given session,
// i.e. the position immediately after the last 'H ...' header line of that
// session.  sessionIndex 0 = first session, 1 = second, etc.
// ─────────────────────────────────────────────────────────────────────────────
function findBBLBinaryStart(buf, sessionIndex = 0) {
    const MARKER = "H Product:Blackbox flight data recorder by Nicholas Sherlock";
    const markerBytes = Array.from(MARKER).map((c) => c.charCodeAt(0));
    const len = buf.length;

    // Phase 1: locate the start of the target session's header by finding
    // the Nth occurrence of the product marker.
    let pos = 0;
    let sessionsFound = -1;
    let sessionHeaderStart = -1;

    while (pos < len) {
        if (buf[pos] === markerBytes[0]) {
            let isMarker = markerBytes.length + pos <= len;
            for (let j = 1; isMarker && j < markerBytes.length; j++) {
                if (buf[pos + j] !== markerBytes[j]) isMarker = false;
            }
            if (isMarker) {
                sessionsFound++;
                if (sessionsFound === sessionIndex) {
                    sessionHeaderStart = pos;
                    break;
                }
            }
        }
        pos++;
    }

    if (sessionHeaderStart === -1) return 0; // session not found

    // Phase 2: scan forward from the session marker, collecting 'H ' lines.
    // The first non-'H ' line marks the start of binary data.
    pos = sessionHeaderStart;
    let lastHeaderEnd = 0;

    while (pos < len) {
        const lineStart = pos;
        while (pos < len && buf[pos] !== 0x0a) pos++; // find \n
        if (pos < len) pos++; // skip \n

        if (pos - lineStart < 2) continue;

        if (buf[lineStart] === 0x48 && buf[lineStart + 1] === 0x20) {
            // 'H ' line — still in header
            lastHeaderEnd = pos;
        } else {
            break; // binary data starts here
        }
    }

    return lastHeaderEnd;
}

// Returns the byte offset of the Nth session's product-marker line,
// i.e. the very first byte of that session's header block.
// Used to compute where session N's binary data must end.
function findBBLSessionHeaderStart(buf, sessionIndex) {
    const MARKER = "H Product:Blackbox flight data recorder by Nicholas Sherlock";
    const markerBytes = Array.from(MARKER).map((c) => c.charCodeAt(0));
    const len = buf.length;
    let pos = 0;
    let sessionsFound = -1;

    while (pos < len) {
        if (buf[pos] === markerBytes[0]) {
            let isMarker = markerBytes.length + pos <= len;
            for (let j = 1; isMarker && j < markerBytes.length; j++) {
                if (buf[pos + j] !== markerBytes[j]) {
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
            prop: stored?.prop ?? 5.0,
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
            tooltip: { visible: false, text: "", x: 0, y: 0 },
            // Auto Tune (chirp sweep)
            chirpPitch: 230,
            chirpRoll: 230,
            chirpYaw: 230,
            chirpPitchLevel: "MEDIUM",
            chirpRollLevel: "MEDIUM",
            chirpYawLevel: "MEDIUM",
            chirpStartHz: 0.2,
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
    },

    watch: {
        kv(v) {
            this._persistInputs();
        },
        voltage(v) {
            this._persistInputs();
        },
        prop(v) {
            this._persistInputs();
        },
        weight(v) {
            this._persistInputs();
        },
        style(v) {
            this._persistInputs();
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

<h3>STEP 2: FLY THE TEST PATTERN</h3>
<p>Enable Blackbox before flying:</p>
<ul>
  <li>Configuration tab → Blackbox → Enable, Device = SD Card, Rate = 1/2</li>
  <li>Set logging rate to minimum 1kHz, ideally 2kHz for best frequency resolution.</li>
  <li>Enable: Gyro, Gyro (Unfiltered), Motor, PID, RC Commands, RPM, Setpoint, Accelerometer</li>
  <li><strong>Betaflight 4.5+:</strong> raw gyro is always logged automatically.</li>
  <li><strong>Betaflight 4.3/4.4:</strong> set Debug Mode to <code>GYRO_SCALED</code> to capture unfiltered gyro data.</li>
</ul>
<p>Before flying:</p>
<ul>
  <li>Use fresh propellers — damaged props introduce false noise and will give inaccurate results.</li>
</ul>
<p>Flight pattern:</p>
<ul>
  <li>Level mode: Full left stick hold 3-5 seconds, pause, full right stick hold 3-5 seconds, pause, full forward hold 3-5 seconds, pause, full back hold 3-5 seconds</li>
</ul>

<h3>STEP 3: ANALYZE THE LOG</h3>
<ul>
  <li>Pull the SD card, open the <code>.BBL</code> file in <a href="https://blackbox.betaflight.com/" target="_blank" rel="noopener"><strong>Betaflight Blackbox Explorer</strong></a></li>
  <li>Export as CSV (File → Export CSV)</li>
  <li>Come back to AeroTune Analyzer tab, load your CSV and click ANALYZE</li>
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
            window.open(url, "aerotune_instructions", "width=620,height=800,resizable=yes,scrollbars=yes");
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
                FC.PIDS[0][2] = p.d_min_roll;
                FC.PIDS[1][0] = p.pitch_p;
                FC.PIDS[1][1] = p.pitch_i;
                FC.PIDS[1][2] = p.d_min_pitch;
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
            if (!this.showResults) return;
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

            const prefix = sessions.length > 1 ? `Session ${sessionIdx + 1}: ` : "";
            this.analysisResult = prefix + formatAnalysisResult(analyzeLog(frames, this.motorTemp));
        },

        /** Called by the session dropdown — re-analyzes the selected session. */
        runBBLSession(sessionIdx) {
            if (!this.bblBuffer || !this.bblSessions.length) return;
            try {
                this._decodeBBLSession(sessionIdx, this.bblBuffer, this.bblSessions);
            } catch (err) {
                this.analysisResult = `ERROR: Failed to decode session ${sessionIdx + 1}: ${err.message}`;
            }
        },

        onFileChange(e) {
            const file = e.target.files[0];
            if (!file) return;
            this.csvFile = file;
            this.fileName = file.name;
        },

        analyzeFile() {
            if (!this.csvFile) return;
            this.analysisResult = "Parsing file…";
            const motorTemp = this.motorTemp;
            const file = this.csvFile;
            const ext = file.name.split(".").pop().toLowerCase();

            if (ext === "bfl" || ext === "bbl") {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const buffer = new Uint8Array(e.target.result);

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
                    } catch (err) {
                        this.analysisResult = `ERROR: Failed to parse blackbox file: ${err.message}`;
                    }
                };
                reader.onerror = () => {
                    this.analysisResult = "ERROR: Could not read file.";
                };
                reader.readAsArrayBuffer(file);
            } else {
                // CSV pipeline — unchanged
                const reader = new FileReader();
                reader.onload = (e) => {
                    const rows = parseBlackboxCSV(e.target.result);
                    if (!rows) {
                        this.analysisResult =
                            "ERROR: Could not find a valid Betaflight blackbox header.\nMake sure you exported a CSV from Blackbox Explorer (not the raw .BFL/.BBL file).";
                        return;
                    }
                    this.analysisResult = formatAnalysisResult(analyzeLog(rows, motorTemp));
                };
                reader.onerror = () => {
                    this.analysisResult = "ERROR: Could not read file.";
                };
                reader.readAsText(file);
            }
        },

        setChirpLevel(axis, level) {
            const AMPLITUDES = { EASY: 150, MEDIUM: 230, HARD: 350 };
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

            this.chirpConfigured = false;

            const startDeciHz = Math.round(this.chirpStartHz * 10);
            const endDeciHz = Math.round(this.chirpEndHz * 10);

            const commands = [
                `set chirp_amplitude_pitch = ${this.chirpPitch}`,
                `set chirp_amplitude_roll = ${this.chirpRoll}`,
                `set chirp_amplitude_yaw = ${this.chirpYaw}`,
                `set chirp_frequency_start_deci_hz = ${startDeciHz}`,
                `set chirp_frequency_end_deci_hz = ${endDeciHz}`,
                `set chirp_time_seconds = ${this.chirpDuration}`,
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

            // Send each command with staggered delays
            let delay = 300;
            for (const cmd of commands) {
                setTimeout(() => sendRaw(`${cmd}\n`), delay);
                delay += 60;
            }

            // Show confirmation after all commands dispatched
            setTimeout(() => {
                this.chirpConfirmText = commands.join("\n");
                this.chirpConfigured = true;
            }, delay + 100);
        },
    },
};
</script>
