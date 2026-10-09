/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { computed, type ComputedRef } from "vue";
import semver from "semver";
import { useFlightControllerStore } from "../stores/fc";
import type { FcConfig } from "../stores/fc.types";
import { API_VERSION_1_45 } from "../js/data_storage";
import { FIRMWARE_BUILD_OPTIONS } from "../js/build_options.js";

/**
 * The part of `fcStore.config` build-option gating reads. Partial, since a firmware that
 * predates the build-option list leaves `buildOptions` unset.
 */
export type BuildOptionsConfig = Partial<Pick<FcConfig, "apiVersion" | "buildOptions">>;

type ReportedBuildOptionsConfig = BuildOptionsConfig & Pick<FcConfig, "apiVersion" | "buildOptions">;

export interface BuildOptions {
    buildOptions: ComputedRef<string[]>;
    buildOptionsAvailable: ComputedRef<boolean>;
    /**
     * @param name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
     * @returns true when the option is in the build, or when gating does not apply
     */
    hasBuildOption: (name: string) => boolean;
}

// Module level so an unknown name is reported once per session, not once per
// component instance that happens to ask for it.
const warnedUnknownOptions = new Set<string>();

function warnUnknownOption(name: string) {
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
 * @param config an `fcStore.config`-shaped object
 */
export function buildOptionsReported(
    config: BuildOptionsConfig | null | undefined,
): config is ReportedBuildOptionsConfig {
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
 * @param config an `fcStore.config`-shaped object
 * @param name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
 * @returns true when the option is in the build, or when gating does not apply
 */
export function configHasBuildOption(config: BuildOptionsConfig | null | undefined, name: string): boolean {
    if (!Object.hasOwn(FIRMWARE_BUILD_OPTIONS, name)) {
        // A name outside the table can never appear in fcStore.config.buildOptions,
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
 * @param config an `fcStore.config`-shaped object
 * @param name a `USE_*` key of FIRMWARE_BUILD_OPTIONS
 * @returns true only when the firmware reported this option
 */
export function configReportsBuildOption(config: BuildOptionsConfig | null | undefined, name: string): boolean {
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
export function useBuildOptions(): BuildOptions {
    const fcStore = useFlightControllerStore();

    const buildOptions = computed(() => fcStore.config?.buildOptions ?? []);
    const buildOptionsAvailable = computed(() => buildOptionsReported(fcStore.config));

    function hasBuildOption(name: string) {
        return configHasBuildOption(fcStore.config, name);
    }

    return {
        buildOptions,
        buildOptionsAvailable,
        hasBuildOption,
    };
}
