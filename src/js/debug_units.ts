/**
 * The unit vocabulary of the firmware's `//!<` debug field annotations, and what
 * each unit means to a consumer.
 *
 * This is the only place a unit exists. `scripts/generate-debug-modes.mjs` takes
 * its accepted vocabulary from these keys, so an annotation naming a unit with no
 * entry here fails generation instead of reaching the app as a bare number; and
 * `src/js/utils/debugModes.js` and the blackbox viewer's graph config read the
 * same entries, so a unit cannot be displayed one way and graphed another.
 *
 * The grammar that produces these units is documented above the `DEBUG_SET` macro
 * in the firmware's `src/main/build/debug.h`. Adding a unit there means adding it
 * here in the same change.
 *
 * Each entry carries:
 *
 *   suffix   - what to print after the value.
 *   factor   - multiplies the stored value to reach `suffix`, when the two differ:
 *              `cm` is shown in metres, so 0.01. Defaults to 1.
 *   ctx      - names a hardware conversion in `DebugScaleContext` for a unit the
 *              firmware stores device-native, which only the flight controller's
 *              own configuration can convert.
 *   decimals - fixed decimal places, where the default derived from the scaling
 *              reads badly.
 *   range    - the graph axis a field in this unit deserves: `{min, max}` for a
 *              unit that is bounded by definition, one of the `ctx` names for an
 *              axis that follows the craft's configuration, and absent when the
 *              logged data should decide. Measured: a unit almost never implies a
 *              range - `us` covers both a 500 us loop and a 2000 us cycle - so
 *              absent is the common and correct case.
 */
/** How one annotated unit is displayed, and what axis it implies. */
export interface DebugUnit {
    /** What to print after the value. */
    suffix: string;
    /** Multiplies the stored value to reach `suffix`, when the two differ. */
    factor?: number;
    /** A hardware conversion in `DebugScaleContext`, for a device-native unit. */
    ctx?: "gyro" | "acc" | "throttle" | "erpm";
    /** Fixed decimal places, where the one derived from the scaling reads badly. */
    decimals?: number;
    /** A bounded axis, or the name of one that follows the craft's configuration. */
    range?: { min: number; max: number } | "gyro" | "acc" | "throttle";
}

export const DEBUG_UNITS: Readonly<Record<string, DebugUnit>> = Object.freeze({
    s: { suffix: "s" },
    ms: { suffix: "ms" },
    us: { suffix: "μs" },
    Hz: { suffix: "Hz" },
    kHz: { suffix: "kHz" },
    MHz: { suffix: "MHz" },
    "kbit/s": { suffix: "kbit/s" },
    rad: { suffix: "rad" },
    "rad/s": { suffix: "rad/s" },
    deg: { suffix: "°" },
    dps: { suffix: "°/s" },
    dps2: { suffix: "°/s²" },
    m: { suffix: "m" },
    cm: { suffix: "m", factor: 0.01 },
    "m/s": { suffix: "m/s" },
    "cm/s": { suffix: "m/s", factor: 0.01 },
    g: { suffix: "g" },
    "g/s": { suffix: "g/s" },
    V: { suffix: "V" },
    A: { suffix: "A" },
    mAh: { suffix: "mAh" },
    degC: { suffix: "°C" },
    Pa: { suffix: "Pa" },
    hPa: { suffix: "hPa" },
    rpm: { suffix: "rpm" },
    "%": { suffix: "%", range: { min: 0, max: 100 } },
    dB: { suffix: "dB" },
    dBm: { suffix: "dBm" },
    bytes: { suffix: "bytes" },
    ticks: { suffix: "ticks" },
    gyroADC: { suffix: "°/s", ctx: "gyro", decimals: 0, range: "gyro" },
    accADC: { suffix: "g", ctx: "acc", decimals: 2, range: "acc" },
    "accADC/s": { suffix: "g/s", ctx: "acc", decimals: 2 },
    rcCommand: { suffix: "%", ctx: "throttle", decimals: 0, range: { min: 0, max: 100 } },
    eRPM: { suffix: "rpm", ctx: "erpm", decimals: 0 },
});

/** Every unit symbol an annotation may name. */
export function debugUnitSymbols(): string[] {
    return Object.keys(DEBUG_UNITS);
}
