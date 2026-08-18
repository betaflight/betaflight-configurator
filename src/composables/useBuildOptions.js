import { computed } from "vue";
import semver from "semver";
import { useFlightControllerStore } from "../stores/fc";
import { API_VERSION_1_45 } from "../js/data_storage";
import { FIRMWARE_BUILD_OPTIONS } from "../js/build_options.js";

// Module level so an unknown name is reported once per session, not once per
// component instance that happens to ask for it.
const warnedUnknownOptions = new Set();

function warnUnknownOption(name) {
    if (!import.meta.env.DEV || warnedUnknownOptions.has(name)) {
        return;
    }
    warnedUnknownOptions.add(name);
    console.warn(`useBuildOptions: unknown build option "${name}" — not a key of FIRMWARE_BUILD_OPTIONS`);
}

/**
 * Whether the connected firmware actually reported its build options.
 *
 * A firmware only reports them from MSP API 1.45 onwards, and a build that
 * predates that - or answers with an empty list - tells us nothing about what
 * it contains.
 *
 * @param {object} config an `FC.CONFIG`-shaped object
 * @returns {boolean}
 */
export function buildOptionsReported(config) {
    const apiVersion = config?.apiVersion;
    if (!apiVersion || !semver.valid(apiVersion) || !semver.gte(apiVersion, API_VERSION_1_45)) {
        return false;
    }
    return (config?.buildOptions?.length ?? 0) > 0;
}

/**
 * Build-option gating against a plain config object, for the call sites that
 * cannot use the composable: plain modules and pure functions.
 *
 * When the option list is unavailable every option counts as PRESENT. Unknown is
 * not the same as absent, and hiding UI from a firmware that simply cannot answer
 * the question is always wrong.
 *
 * @param {object} config an `FC.CONFIG`-shaped object
 * @param {string} name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
 * @returns {boolean} true when the option is in the build, or when gating does not apply
 */
export function configHasBuildOption(config, name) {
    if (!Object.hasOwn(FIRMWARE_BUILD_OPTIONS, name)) {
        // A name outside the table can never appear in FC.CONFIG.buildOptions,
        // so answering "absent" would hide UI forever on a typo. Fail open and
        // let the DEV warning surface the mistake.
        warnUnknownOption(name);
        return true;
    }
    if (!buildOptionsReported(config)) {
        return true;
    }
    return config.buildOptions.includes(name);
}

/**
 * Strict form of {@link configHasBuildOption}: an option the firmware did not
 * report counts as ABSENT.
 *
 * Use this only where the answer decides how a payload is interpreted rather than
 * what the user is shown - enum layouts that shift when a compile flag is missing,
 * for instance. Guessing "present" there misreads the data; guessing "absent" only
 * omits an entry. Anything that decides whether UI is shown or enabled wants
 * {@link configHasBuildOption} instead.
 *
 * @param {object} config an `FC.CONFIG`-shaped object
 * @param {string} name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
 * @returns {boolean} true only when the firmware reported this option
 */
export function configReportsBuildOption(config, name) {
    if (!Object.hasOwn(FIRMWARE_BUILD_OPTIONS, name)) {
        warnUnknownOption(name);
        return false;
    }
    return buildOptionsReported(config) && config.buildOptions.includes(name);
}

/**
 * Build-option gating for components and other composables. See
 * {@link configHasBuildOption} for the rule this applies.
 */
export function useBuildOptions() {
    const fcStore = useFlightControllerStore();

    const buildOptions = computed(() => fcStore.config?.buildOptions ?? []);
    const buildOptionsAvailable = computed(() => buildOptionsReported(fcStore.config));

    /**
     * @param {string} name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
     * @returns {boolean} true when the option is in the build, or when gating does not apply
     */
    function hasBuildOption(name) {
        return configHasBuildOption(fcStore.config, name);
    }

    return {
        buildOptions,
        buildOptionsAvailable,
        hasBuildOption,
    };
}
