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
            <button
                class="at-tab-btn"
                :class="{ active: activeView === 'instructions' }"
                @click="activeView = 'instructions'"
            >
                INSTRUCTIONS
            </button>
            <button
                class="at-tab-btn at-tab-btn--popup"
                @click="openInstructionsPopup"
                title="Open instructions in a new window"
            >
                ↗ Open in New Window
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
                                    <option value="Freestyle">Freestyle</option>
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
                                <div class="at-pid-grid">
                                    <div class="at-pid-axis">
                                        <div class="at-axis-label roll">ROLL</div>
                                        <div class="at-pid-values">
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">P</div>
                                                <div class="at-pid-val">{{ pids.roll_p }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">I</div>
                                                <div class="at-pid-val">{{ pids.roll_i }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">D</div>
                                                <div class="at-pid-val">{{ pids.roll_d }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">F</div>
                                                <div class="at-pid-val">{{ pids.roll_f }}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="at-pid-axis">
                                        <div class="at-axis-label pitch">PITCH</div>
                                        <div class="at-pid-values">
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">P</div>
                                                <div class="at-pid-val">{{ pids.pitch_p }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">I</div>
                                                <div class="at-pid-val">{{ pids.pitch_i }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">D</div>
                                                <div class="at-pid-val">{{ pids.pitch_d }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">F</div>
                                                <div class="at-pid-val">{{ pids.pitch_f }}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="at-pid-axis">
                                        <div class="at-axis-label yaw">YAW</div>
                                        <div class="at-pid-values">
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">P</div>
                                                <div class="at-pid-val">{{ pids.yaw_p }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">I</div>
                                                <div class="at-pid-val">{{ pids.yaw_i }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">D</div>
                                                <div class="at-pid-val">{{ pids.yaw_d }}</div>
                                            </div>
                                            <div class="at-pid-cell">
                                                <div class="at-pid-name">F</div>
                                                <div class="at-pid-val">{{ pids.yaw_f }}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

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
                                <label class="at-file-label" @click="$refs.fileInput.click()">Select CSV File</label>
                                <input
                                    type="file"
                                    ref="fileInput"
                                    accept=".csv"
                                    style="display: none"
                                    @change="onFileChange"
                                />
                                <span class="at-file-name">{{ fileName }}</span>
                                <button id="at-analyze-btn" :disabled="!csvFile" @click="analyzeFile">
                                    🔍 ANALYZE
                                </button>
                            </div>

                            <div class="at-results-box">{{ analysisResult }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ═══════════════ INSTRUCTIONS ═══════════════ -->
            <div v-show="activeView === 'instructions'" class="at-view">
                <div class="at-instructions">
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
        </div>
        <!-- /.aerotune-body --> </BaseTab
    ><!-- /.tab-aerotune -->
</template>

<script>
import FC from "@/js/fc";
import CONFIGURATOR from "@/js/data_storage";
import BaseTab from "./BaseTab.vue";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { usePidTuningStore } from "@/stores/pidTuning";

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

const FLYING_STYLES = {
    Racing: 1.08,
    Freestyle: 1.0,
    "Long Range": 0.65,
    Cinematic: 0.75,
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

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function calculatePIDs(kv, voltage, prop, weight, style) {
    kv = parseFloat(kv);
    voltage = parseFloat(voltage);
    prop = parseFloat(prop);
    weight = parseFloat(weight);
    if (isNaN(kv) || isNaN(voltage) || isNaN(prop) || isNaN(weight)) return null;

    let pBase = interpolateKV(kv);
    pBase *= FLYING_STYLES[style] || 1.0;
    pBase *= 1.0 - ((voltage - 22.2) / 22.2) * 0.2; // voltage adj (6S baseline)
    pBase *= 1.0 + ((weight - 500) / 2000) * 0.15; // weight adj
    pBase *= 1.0 + ((prop - 5) / 6) * 0.12; // prop adj

    const rollP = clamp(Math.round(pBase), 20, 90);
    const pitchP = clamp(Math.round(pBase + 2), 20, 90);
    const yawP = clamp(Math.round(pBase * 0.945), 15, 70);

    const FF_BY_STYLE = {
        Cinematic: { roll_f: 90, pitch_f: 95, yaw_f: 90 },
        LongRange: { roll_f: 90, pitch_f: 95, yaw_f: 90 },
        Freestyle: { roll_f: 120, pitch_f: 125, yaw_f: 120 },
        Racing: { roll_f: 135, pitch_f: 143, yaw_f: 135 },
    };
    const ff = FF_BY_STYLE[style] || FF_BY_STYLE.Freestyle;

    return {
        roll_p: rollP,
        roll_i: Math.round(rollP * 1.39),
        roll_d: Math.round(rollP * 0.649),
        roll_f: ff.roll_f,
        pitch_p: pitchP,
        pitch_i: Math.round(pitchP * 1.39),
        pitch_d: Math.round(pitchP * 0.649),
        pitch_f: ff.pitch_f,
        yaw_p: yawP,
        yaw_i: Math.round(yawP * 1.39),
        yaw_d: 0,
        yaw_f: ff.yaw_f,
        d_min_roll: Math.round(rollP * 0.541),
        d_min_pitch: Math.round(pitchP * 0.541),
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
            style: stored?.style ?? "Freestyle",
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
            analysisResult: "Select a Betaflight blackbox CSV file and click ANALYZE.",
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
            const popup = window.open("", "aerotune_instructions", "width=620,height=800,resizable=yes,scrollbars=yes");
            if (!popup) return;
            popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AeroTune – Instructions</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #1a1a2e;
    color: #c8d0e0;
    font-family: 'Open Sans', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    padding: 24px 28px 40px;
  }
  h1 { font-size: 16px; color: #fff; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #7a8a9a; margin-bottom: 20px; }
  h3 {
    color: #fff;
    font-size: 13px;
    margin: 20px 0 6px;
    border-bottom: 1px solid #2e4060;
    padding-bottom: 4px;
  }
  p, li { font-size: 12px; color: #8899aa; line-height: 1.7; margin: 4px 0; }
  ul { padding-left: 20px; }
  code {
    background: #0d1117;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 11px;
    color: #8899aa;
  }
  a { color: #4da6ff; }
  strong { color: #c8d0e0; }
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
</html>`);
            popup.document.close();
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

            // Now patch only the feedforward and D_min fields.
            if (FC.ADVANCED_TUNING) {
                FC.ADVANCED_TUNING.feedforwardRoll = p.roll_f;
                FC.ADVANCED_TUNING.feedforwardPitch = p.pitch_f;
                FC.ADVANCED_TUNING.feedforwardYaw = p.yaw_f;
                FC.ADVANCED_TUNING.dMaxRoll = p.d_min_roll;
                FC.ADVANCED_TUNING.dMaxPitch = p.d_min_pitch;
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
                `Roll   P=${p.roll_p}  I=${p.roll_i}  D=${p.roll_d}  F=${p.roll_f}  D_min=${p.d_min_roll}`,
                `Pitch  P=${p.pitch_p}  I=${p.pitch_i}  D=${p.pitch_d}  F=${p.pitch_f}  D_min=${p.d_min_pitch}`,
                `Yaw    P=${p.yaw_p}  I=${p.yaw_i}  D=${p.yaw_d}  F=${p.yaw_f}`,
                `Gyro Lowpass 2 recommendation: ${fr.hz} Hz (${fr.low}–${fr.high} Hz) – ${fr.note}`,
            ].join("\n");
            navigator.clipboard.writeText(text).then(() => {
                this.copyBtnText = "✔ Copied!";
                setTimeout(() => {
                    this.copyBtnText = "📋 COPY ALL VALUES";
                }, 2000);
            });
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
            const reader = new FileReader();
            reader.onload = (e) => {
                const rows = parseBlackboxCSV(e.target.result);
                if (!rows) {
                    this.analysisResult =
                        "ERROR: Could not find a valid Betaflight blackbox header.\nMake sure you exported a CSV from Blackbox Explorer (not the raw .BBL file).";
                    return;
                }
                this.analysisResult = formatAnalysisResult(analyzeLog(rows, motorTemp));
            };
            reader.onerror = () => {
                this.analysisResult = "ERROR: Could not read file.";
            };
            reader.readAsText(this.csvFile);
        },
    },
};
</script>
