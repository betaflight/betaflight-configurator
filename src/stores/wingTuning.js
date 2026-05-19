import { defineStore } from "pinia";
import { reactive, ref } from "vue";

/**
 * Field definitions for the Wing Tuning tab. Type "int" defaults to 0,
 * "string" to "" (enum types collapse to "string" since their JS default
 * is an empty string). Mirrors the wire schema in `wingTuningSchema.js`
 * at JS-default granularity.
 *
 * Exported so the tab can iterate the same field set when copying values
 * between `wingTuningStore.fields` and the legacy `FC.WING_TUNING` global
 * during MSP load / save.
 */
export const FIELD_DEFS = [
    // S-term
    { name: "s_pitch", type: "int" },
    { name: "s_roll", type: "int" },
    { name: "s_yaw", type: "int" },
    // Yaw type
    { name: "yaw_type", type: "string" },
    // Angle mode
    { name: "angle_pitch_offset", type: "int" },
    { name: "angle_earth_ref", type: "int" },
    // TPA mode + airspeed
    { name: "tpa_mode", type: "string" },
    { name: "tpa_speed_type", type: "string" },
    { name: "tpa_speed_basic_delay", type: "int" },
    { name: "tpa_speed_basic_gravity", type: "int" },
    { name: "tpa_speed_max_voltage", type: "int" },
    { name: "tpa_speed_pitch_offset", type: "int" },
    // TPA curve
    { name: "tpa_curve_type", type: "string" },
    { name: "tpa_curve_stall_throttle", type: "int" },
    { name: "tpa_curve_pid_thr0", type: "int" },
    { name: "tpa_curve_pid_thr100", type: "int" },
    { name: "tpa_curve_expo", type: "int" },
    // SPA
    { name: "spa_roll_center", type: "int" },
    { name: "spa_roll_width", type: "int" },
    { name: "spa_roll_mode", type: "string" },
    { name: "spa_pitch_center", type: "int" },
    { name: "spa_pitch_width", type: "int" },
    { name: "spa_pitch_mode", type: "string" },
    { name: "spa_yaw_center", type: "int" },
    { name: "spa_yaw_width", type: "int" },
    { name: "spa_yaw_mode", type: "string" },
];

function defaultFields() {
    const f = {};
    for (const def of FIELD_DEFS) {
        f[def.name] = def.type === "string" ? "" : 0;
    }
    return f;
}

/**
 * Pinia store for the Wing Tuning tab.
 *
 * Owns the 26-field reactive (`fields`) bound by the tab's USelect /
 * UInputNumber / USlider inputs, plus a plain-object snapshot of those
 * values at load time so `hasChanges` can be computed without a deep
 * watcher tree across the form. MSP I/O remains in the tab — the store
 * is a pure state holder, mirroring the pattern in
 * betaflight/blackbox-log-viewer#913 (`src/stores/log.js`).
 */
export const useWingTuningStore = defineStore("wingTuning", () => {
    const fields = reactive(defaultFields());
    const hasChanges = ref(false);
    const originalsReady = ref(false);
    const originalWingTuning = ref({});

    /**
     * Snapshot the current `fields` values. Call after every successful
     * MSP load (reload) and after every successful save.
     */
    function storeOriginals() {
        // structuredClone over a toRaw'd snapshot — bypasses the reactive
        // proxy and avoids the JSON.parse(JSON.stringify(...)) Sonar smell
        // (javascript:S7784). All fields are primitives so structuredClone
        // is a strict superset of the prior behavior.
        originalWingTuning.value = structuredClone(toRaw(fields));
        originalsReady.value = true;
        hasChanges.value = false;
    }

    /**
     * Compare current `fields` against the stored originals and update
     * `hasChanges`.
     */
    function checkForChanges() {
        if (!originalsReady.value) {
            hasChanges.value = false;
            return;
        }
        hasChanges.value = JSON.stringify(fields) !== JSON.stringify(originalWingTuning.value);
    }

    return {
        fields,
        hasChanges,
        storeOriginals,
        checkForChanges,
    };
});
