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

import semver from "semver";
import { API_VERSION_1_46 } from "@/js/data_storage";
import type { LedColor, LedConfigValues, LedModeColor, LedStripEntry } from "@/stores/fc.types";

export { isEmptyLed } from "./ledStripUtils";
import { isEmptyLed } from "./ledStripUtils";

export const LED_PROFILE_STATUS = 2;

export interface LedWizardModel {
    topology: "serial" | "parallel";
    count: number | undefined;
    layout: "strip" | "two" | "four";
    direction: "outward" | "inward";
    armed: "static" | "thrust";
    armedColor: number;
    disarmed: "off" | "static" | "firmware";
    disarmedColor: number;
    warnings: boolean;
    brightness: number;
}

export interface LedWizardSource {
    apiVersion: string;
    advanced: boolean | null;
    profile: number | null;
    strip: LedStripEntry[];
    colors: LedColor[];
    modeColors: LedModeColor[];
    configValues: LedConfigValues;
    configValuesLoaded?: boolean;
}

export type LedWizardPlan = Pick<LedWizardSource, "strip" | "modeColors" | "configValues">;
export const armCount = (layout: LedWizardModel["layout"]) => ({ strip: 1, two: 2, four: 4 })[layout];
export const supportsLedBrightness = (source: LedWizardSource) =>
    !!semver.valid(source.apiVersion) && semver.gte(source.apiVersion, API_VERSION_1_46);
export const maxWizardLeds = (source: LedWizardSource) => Math.min(source.strip.length, 256);
const letters = (value: string | string[]) =>
    Array.from(value)
        .sort((a, b) => a.localeCompare(b))
        .join("");
const offColor = (source: LedWizardSource) => source.colors.findIndex((color) => color.v === 0);
const specialColor = (source: LedWizardSource, direction: number) =>
    source.modeColors.find((color) => color.mode === 6 && color.direction === direction)?.color;

export const ledsPerArm = (model: LedWizardModel) =>
    model.count === undefined
        ? undefined
        : model.topology === "parallel"
          ? model.count
          : model.count / armCount(model.layout);
export const physicalLedCount = (model: LedWizardModel) => {
    const perArm = ledsPerArm(model);
    return perArm === undefined ? undefined : perArm * armCount(model.layout);
};

/** Native LED indices in center-to-outside display order, shared by all mirrored arms. */
export function previewArmIndices(model: LedWizardModel): number[][] {
    const count = Math.max(0, Math.min(256, Math.floor(ledsPerArm(model) ?? 0) || 0));
    return Array.from({ length: armCount(model.layout) }, (_, arm) =>
        Array.from(
            { length: count },
            (_, position) =>
                (model.topology === "parallel" ? 0 : arm * count) +
                (model.direction === "outward" ? position : count - position - 1),
        ),
    );
}

/** Betaflight src/main/io/ledstrip.c, updateLedRingCounts(): ROTATION_SEQUENCE_LED_COUNT = 6. */
export function ringSeqLen(ring: number): number {
    if (ring % 6 === 0) return 6;
    let seq = ring;
    while (seq > 6 && seq % 2 === 0) seq /= 2;
    return seq;
}

export function defaultLedWizardModel(source: LedWizardSource): LedWizardModel {
    const count = Math.min(16, maxWizardLeds(source));
    return {
        topology: "serial",
        count,
        layout: count > 0 && count % 4 === 0 ? "four" : "strip",
        direction: "outward",
        armed: "static",
        armedColor: Math.min(10, source.colors.length - 1),
        disarmed: "off",
        disarmedColor: offColor(source),
        warnings: false,
        brightness: source.configValues.brightness ?? 50,
    };
}

export function validateLedWizard(model: LedWizardModel, source: LedWizardSource): string[] {
    const errors: string[] = [];
    if (source.advanced !== true || source.profile !== LED_PROFILE_STATUS) errors.push("ledWizardErrorProfile");
    if (
        model.count === undefined ||
        !Number.isInteger(model.count) ||
        model.count < 1 ||
        model.count > maxWizardLeds(source)
    ) {
        errors.push("ledWizardErrorCount");
    }
    if (!["serial", "parallel"].includes(model.topology)) errors.push("ledWizardErrorTopology");
    if (
        !armCount(model.layout) ||
        (model.topology === "serial" && model.count !== undefined && model.count % armCount(model.layout) !== 0)
    )
        errors.push("ledWizardErrorArms");
    if (!["outward", "inward"].includes(model.direction)) errors.push("ledWizardErrorDirection");
    const validColor = (index: number) =>
        Number.isInteger(index) && index >= 0 && index < Math.min(16, source.colors.length);
    if (!validColor(model.armedColor) || (model.disarmed === "static" && !validColor(model.disarmedColor))) {
        errors.push("ledWizardErrorColor");
    }
    if ((model.disarmed === "off" || model.armed === "thrust") && (offColor(source) < 0 || offColor(source) > 15)) {
        errors.push("ledWizardErrorOffColor");
    }
    if (model.armed === "thrust") {
        if (model.disarmed !== "firmware") errors.push("ledWizardErrorThrust");
        if (model.count !== undefined && Number.isInteger(model.count) && model.count > 0) {
            const segment = ringSeqLen(model.count);
            if (segment <= 2) errors.push("ledWizardErrorThrustChase");
            else if ((ledsPerArm(model) ?? 0) % segment !== 0) errors.push("ledWizardErrorRingSegment");
        }
    } else if (model.armed !== "static" || !["off", "static"].includes(model.disarmed)) {
        errors.push("ledWizardErrorState");
    }
    const requiredSpecials = model.armed === "thrust" ? [3] : [0, 1];
    if (requiredSpecials.some((direction) => specialColor(source, direction) === undefined)) {
        errors.push("ledWizardErrorModeColors");
    }
    if (
        supportsLedBrightness(source) &&
        (!Number.isInteger(model.brightness) || model.brightness < 5 || model.brightness > 100)
    ) {
        errors.push("ledWizardErrorBrightness");
    }
    if (supportsLedBrightness(source) && source.configValuesLoaded === false) errors.push("ledWizardErrorConfigValues");
    return errors;
}

/** Coordinates describe wiring; firmware thrust animation always follows physical indices. */
export function wizardPositions(model: LedWizardModel): { x: number; y: number }[] {
    // Mirrored outputs use exactly the same native configuration as a single strip.
    if (model.topology === "parallel") return wizardPositions({ ...model, topology: "serial", layout: "strip" });
    const arms = armCount(model.layout);
    const perArm = (model.count ?? 0) / arms;
    return Array.from({ length: arms }, (_, arm) => {
        const positions: { x: number; y: number }[] = [];
        if (model.layout === "strip") {
            for (let i = 0; i < perArm; i++) {
                const row = Math.floor(i / 16);
                positions.push({ x: row % 2 ? 15 - (i % 16) : i % 16, y: row });
            }
        } else {
            const width = 8;
            const height = model.layout === "four" ? 8 : 16;
            const cells = Array.from({ length: width * height }, (_, index) => ({
                x: index % width,
                y: Math.floor(index / width),
            }));
            // Longer strips occupy the remaining cells after the schematic arm line.
            cells.sort(
                (a, b) =>
                    Number(model.layout === "four" ? b.x === b.y : b.y === 0) -
                        Number(model.layout === "four" ? a.x === a.y : a.y === 0) ||
                    Math.max(a.x, a.y) - Math.max(b.x, b.y) ||
                    a.y - b.y ||
                    a.x - b.x,
            );
            for (const cell of cells.slice(0, perArm)) {
                const right = arm % 2 === 1;
                const bottom = model.layout === "four" && arm >= 2;
                positions.push({
                    x: right ? 8 + cell.x : 7 - cell.x,
                    y: model.layout === "two" ? (8 + cell.y) % 16 : bottom ? 8 + cell.y : 7 - cell.y,
                });
            }
        }
        return model.direction === "inward" ? positions.reverse() : positions;
    }).flat();
}

export function buildLedWizardPlan(model: LedWizardModel, source: LedWizardSource): LedWizardPlan {
    const errors = validateLedWizard(model, source);
    if (errors.length) throw new Error(errors.join(", "));
    const strip: LedStripEntry[] = wizardPositions(model).map(({ x, y }) => ({
        x,
        y,
        directions: "",
        functions: `${model.armed === "thrust" ? "r" : "a"}${model.warnings ? "w" : ""}`,
        color: model.armed === "thrust" ? model.armedColor : 0,
    }));
    while (strip.length < source.strip.length) strip.push({ x: 0, y: 0, directions: "", functions: "c", color: 0 });
    const modeColors = source.modeColors.map((color) => ({ ...color }));
    const setSpecial = (direction: number, index: number) => {
        const entry = modeColors.find((color) => color.mode === 6 && color.direction === direction);
        if (entry) entry.color = index;
    };
    if (model.armed === "thrust") {
        const background = specialColor(source, 3) ?? -1;
        setSpecial(3, source.colors[background]?.v === 0 ? background : offColor(source));
    } else {
        const disarmed = source.colors[model.disarmedColor]?.v === 0 ? model.disarmedColor : offColor(source);
        setSpecial(0, model.disarmed === "off" ? disarmed : model.disarmedColor);
        setSpecial(1, model.armedColor);
    }
    return {
        strip,
        modeColors,
        configValues: {
            ...source.configValues,
            ...(supportsLedBrightness(source) ? { brightness: model.brightness } : {}),
        },
    };
}

const sameLed = (a: LedStripEntry, b: LedStripEntry) =>
    (isEmptyLed(a) && isEmptyLed(b)) ||
    (a.x === b.x &&
        a.y === b.y &&
        a.color === b.color &&
        letters(a.functions) === letters(b.functions) &&
        letters(a.directions) === letters(b.directions) &&
        (a.parameters ?? 0) === (b.parameters ?? 0));

export function sameLedWizardConfig(a: LedWizardPlan, b: LedWizardPlan): boolean {
    return (
        a.strip.length === b.strip.length &&
        a.strip.every((led, index) => sameLed(led, b.strip[index])) &&
        a.modeColors.length === b.modeColors.length &&
        a.modeColors.every((color, index) => {
            const other = b.modeColors[index];
            return color.mode === other.mode && color.direction === other.direction && color.color === other.color;
        }) &&
        (Object.keys({ ...a.configValues, ...b.configValues }) as (keyof LedConfigValues)[]).every(
            (key) => a.configValues[key] === b.configValues[key],
        )
    );
}

/** Recognize only configurations whose complete strip and affected special colors round-trip. */
export function reconstructLedWizard(source: LedWizardSource): LedWizardModel | null {
    let count = source.strip.length;
    while (count && isEmptyLed(source.strip[count - 1])) count--;
    if (!count) return null;
    const first = source.strip[0];
    const thrust = first.functions.includes("r");
    const disarmedColor = specialColor(source, 0) ?? -1;
    const base: LedWizardModel = {
        ...defaultLedWizardModel(source),
        count,
        armed: thrust ? "thrust" : "static",
        armedColor: thrust ? first.color : (specialColor(source, 1) ?? -1),
        disarmed: thrust ? "firmware" : source.colors[disarmedColor]?.v === 0 ? "off" : "static",
        disarmedColor,
        warnings: first.functions.includes("w"),
    };
    for (const layout of ["four", "two", "strip"] as const) {
        for (const direction of ["outward", "inward"] as const) {
            const model = { ...base, layout, direction };
            if (validateLedWizard(model, source).length) continue;
            const plan = buildLedWizardPlan(model, source);
            if (
                plan.strip.every((led, index) => sameLed(led, source.strip[index])) &&
                JSON.stringify(plan.modeColors) === JSON.stringify(source.modeColors)
            )
                return model;
        }
    }
    return null;
}
