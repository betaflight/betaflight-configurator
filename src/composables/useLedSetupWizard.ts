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

import { computed, ref, shallowRef, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import {
    armCount,
    buildLedWizardPlan,
    defaultLedWizardModel,
    isEmptyLed,
    maxWizardLeds,
    reconstructLedWizard,
    sameLedWizardConfig,
    validateLedWizard,
    type LedWizardModel,
    type LedWizardPlan,
    type LedWizardSource,
} from "./ledWizard";

export function useLedSetupWizard() {
    const fc = useFlightControllerStore();
    const source = computed<LedWizardSource>(() => ({
        apiVersion: fc.config.apiVersion,
        advanced: fc.ledStripAdvanced,
        profile: fc.ledStripProfile,
        strip: fc.ledStrip,
        colors: fc.ledColors,
        modeColors: fc.ledModeColors,
        configValues: fc.ledConfigValues,
        configValuesLoaded: fc.ledConfigValuesLoaded,
    }));
    const recognized = computed(() => reconstructLedWizard(source.value));
    const custom = computed(() => source.value.strip.some((led) => !isEmptyLed(led)) && !recognized.value);
    const model = ref(recognized.value ?? defaultLedWizardModel(source.value));
    const recognizedStripCount = ref(
        recognized.value?.topology === "serial" && recognized.value.layout === "strip"
            ? recognized.value.count
            : undefined,
    );
    watch(
        [() => model.value.topology, () => model.value.layout],
        () => {
            recognizedStripCount.value = undefined;
        },
        { flush: "sync" },
    );
    const countIssue = shallowRef<{
        key: "ledWizardCountSplit" | "ledWizardCountCapacity";
        params: { count: number; arms: number; capacity: number };
    } | null>(null);
    const count = computed({
        get: () => model.value.count,
        set: (value: number | null | undefined) => {
            model.value.count = typeof value === "number" && Number.isFinite(value) ? value : undefined;
            if (model.value.count !== undefined) countIssue.value = null;
        },
    });
    const topology = computed({
        get: () => model.value.topology,
        set: (value: LedWizardModel["topology"]) => {
            if (value === model.value.topology) return;
            const previous = model.value.count;
            const arms = armCount(model.value.layout);
            const capacity = maxWizardLeds(source.value);
            let converted: number | undefined;
            countIssue.value = null;
            if (arms === 1) converted = previous;
            else if (previous !== undefined && Number.isInteger(previous) && previous > 0) {
                if (value === "parallel") {
                    if (previous % arms === 0) converted = previous / arms;
                    else countIssue.value = { key: "ledWizardCountSplit", params: { count: previous, arms, capacity } };
                } else {
                    const total = previous * arms;
                    if (total <= capacity) converted = total;
                    else countIssue.value = { key: "ledWizardCountCapacity", params: { count: total, arms, capacity } };
                }
            }
            model.value = { ...model.value, topology: value, count: converted };
            reviewed.value = null;
        },
    });
    let staticDisarmed: { disarmed: "off" | "static"; disarmedColor: number } = {
        disarmed: model.value.disarmed === "static" ? "static" : "off",
        disarmedColor: model.value.disarmedColor,
    };
    const armed = computed({
        get: () => model.value.armed,
        set: (value: LedWizardModel["armed"]) => {
            if (value === model.value.armed) return;
            if (value === "thrust") {
                staticDisarmed = {
                    disarmed: model.value.disarmed === "static" ? "static" : "off",
                    disarmedColor: model.value.disarmedColor,
                };
                model.value = { ...model.value, armed: value, disarmed: "firmware" };
            } else {
                model.value = { ...model.value, armed: value, ...staticDisarmed };
            }
        },
    });
    const errors = computed(() => validateLedWizard(model.value, source.value));
    const fingerprint = computed(() => JSON.stringify({ source: source.value, model: model.value }));
    const reviewed = shallowRef<{ fingerprint: string; plan: LedWizardPlan } | null>(null);
    const review = computed(() => (reviewed.value?.fingerprint === fingerprint.value ? reviewed.value.plan : null));
    const noChanges = computed(() => !!review.value && sameLedWizardConfig(review.value, source.value));

    function reviewChanges() {
        if (errors.value.length) return;
        reviewed.value = { fingerprint: fingerprint.value, plan: buildLedWizardPlan(model.value, source.value) };
    }

    function apply() {
        const plan = review.value;
        if (!plan || errors.value.length || noChanges.value) return false;
        fc.$patch({ ledStrip: plan.strip, ledModeColors: plan.modeColors, ledConfigValues: plan.configValues });
        reviewed.value = null;
        return true;
    }

    return {
        source,
        model,
        topology,
        count,
        countIssue,
        armed,
        errors,
        custom,
        recognizedStripCount,
        review,
        noChanges,
        reviewChanges,
        apply,
    };
}
