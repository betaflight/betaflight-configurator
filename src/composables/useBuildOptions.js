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
 * Build-option gating.
 *
 * A firmware only reports its build options from MSP API 1.45 onwards, and only
 * cloud builds report them at all. When the list is unavailable we must treat
 * every option as PRESENT: unknown is not the same as absent, and hiding UI from
 * a firmware that simply cannot answer the question is always wrong.
 */
export function useBuildOptions() {
    const fcStore = useFlightControllerStore();

    const buildOptions = computed(() => fcStore.config?.buildOptions ?? []);

    const buildOptionsAvailable = computed(() => {
        const apiVersion = fcStore.config?.apiVersion;
        if (!apiVersion || !semver.valid(apiVersion) || !semver.gte(apiVersion, API_VERSION_1_45)) {
            return false;
        }
        return buildOptions.value.length > 0;
    });

    /**
     * @param {string} name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
     * @returns {boolean} true when the option is in the build, or when gating does not apply
     */
    function hasBuildOption(name) {
        if (!Object.hasOwn(FIRMWARE_BUILD_OPTIONS, name)) {
            // A name outside the table can never appear in FC.CONFIG.buildOptions,
            // so answering "absent" would hide UI forever on a typo. Fail open and
            // let the DEV warning surface the mistake.
            warnUnknownOption(name);
            return true;
        }
        if (!buildOptionsAvailable.value) {
            return true;
        }
        return buildOptions.value.includes(name);
    }

    return {
        buildOptions,
        buildOptionsAvailable,
        hasBuildOption,
    };
}
