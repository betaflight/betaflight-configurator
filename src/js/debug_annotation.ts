/**
 * The grammar of the firmware's `//!<` debug field annotations.
 *
 * Firmware records what each `debug[n]` means in a trailing comment on the
 * `DEBUG_SET()` call site; `src/main/build/debug.h` carries the grammar. Two
 * consumers read it and they must agree: `scripts/generate-debug-modes.mjs`
 * parses a firmware checkout to build the static tables, and the blackbox log
 * reader parses the `H debug_field[n]:` headers a log carries about itself.
 * Two implementations of one grammar would drift, which is the failure this
 * module exists to prevent, so there is exactly one and both import it.
 *
 * NOTE: the generator imports this from Node, which strips types rather than
 * compiling them. Erasable syntax only - no `enum`, no `namespace`, no
 * parameter properties, no `export =`.
 */
import { debugUnitSymbols } from "./debug_units.ts";

/** How many `debug[n]` slots a log carries. */
export const DEBUG_VALUE_COUNT = 8;
/** Usable bits of a `debug[n]` slot, and so the longest `[flags:...]` list. */
export const DEBUG_VALUE_BITS = 15;

/** What a shape bracket says the field holds. */
export interface DebugFieldShape {
    /** Unit symbol of the stored value, or null for a count, flag or enumeration. */
    unit: string | null;
    /** What one LSB is worth in `unit`. */
    scale: number;
    /** Names the firmware enum an enumerator field holds; the names are not in the annotation. */
    enumTag?: string;
    /** Bit-flag names, lowest bit first, null for a bit the field does not use. */
    flags?: (string | null)[];
}

/** One annotation as written at a `DEBUG_SET()` call site. */
export interface ParsedDebugAnnotation extends DebugFieldShape {
    /** Indices the `[index:...]` spec named, or null when it gave none. */
    indices: number[] | null;
    /** One label per index when a `{a|b|c}` group expanded, else null. */
    labels: string[] | null;
    /** The label, with any `{a|b|c}` group still in place. */
    label: string;
}

/** One annotation as a log's `H debug_field[n]:` header carries it. */
export interface DebugFieldAnnotation extends DebugFieldShape {
    label: string;
}

/** Why an annotation could not be read. */
export interface DebugAnnotationError {
    error: string;
}

export function isDebugAnnotationError<T extends object>(
    result: T | DebugAnnotationError,
): result is DebugAnnotationError {
    return "error" in result;
}

/*
 * Each of these is greedy and unambiguous, with the trimming and the structure of
 * an index spec left to the code below: a pattern that could match the same input
 * two ways is a pattern that backtracks (SonarCloud javascript:S8786).
 */
const INDEX_SPEC = /^\[index:([\d \t,.]+)\][ \t]*/;
const SHAPE_SPEC = /\[([A-Za-z]+):([^[\]]+)\]$/;
const EXPANSION = /\{([^{}]*)\}/;
const BRACE = /[{}]/g;
const INDEX_BOUND = /^\d+$/;
const UNIT_FACTOR = /^-?\d+(?:\.\d+)?/;
const UNKEYED_BRACKET = /\[[^[\]]+\]$/;

// The accepted vocabulary is the shared unit table's keys, not a second copy of
// it: a firmware unit with no display rule then fails generation here rather than
// reaching the app as a bare number.
const UNIT_SYMBOLS = new Set(debugUnitSymbols());

// "0..2" -> [0, 1, 2], "0,2,4" -> [0, 2, 4], "3" -> [3]
function parseIndexSpec(spec: string): number[] | undefined {
    const indices = [];

    for (const part of spec.split(",")) {
        const bounds = part.split("..").map((bound) => bound.trim());
        if (bounds.length > 2 || !bounds.every((bound) => INDEX_BOUND.test(bound))) {
            return undefined;
        }
        const [from, to] = bounds.length === 2 ? bounds.map(Number) : [Number(bounds[0]), Number(bounds[0])];
        if (to >= DEBUG_VALUE_COUNT || to < from) {
            return undefined;
        }
        for (let index = from; index <= to; index++) {
            indices.push(index);
        }
    }

    return indices.length === 0 ? undefined : [...new Set(indices)];
}

// "0.1deg" -> { unit: "deg", scale: 0.1 }, "%" -> { unit: "%", scale: 1 },
// "0.001" -> { unit: null, scale: 0.001 }, "-1dBm" -> { unit: "dBm", scale: -1 }
/*
 * One shape bracket, dispatched on its key. Every bracket in an annotation names
 * itself, so an unknown key is refused rather than guessed at - a field whose
 * shape the tooling cannot read would be shown as a bare integer, silently.
 */
function parseShapeSpec(key: string, raw: string): DebugFieldShape | undefined {
    switch (key) {
        case "unit":
            return parseUnitShape(raw);
        case "enum":
            return parseEnumShape(raw);
        case "flags":
            return parseFlagsShape(raw);
        default:
            return undefined;
    }
}

function parseEnumShape(raw: string): DebugFieldShape | undefined {
    const type = /^[A-Za-z_]\w*$/.exec(raw.trim());
    // The field holds an enumerator, not a quantity: no unit scales it, and the
    // names come from the firmware's own enum.
    return type === null ? undefined : { unit: null, scale: 1, enumTag: type[0] };
}

function parseFlagsShape(raw: string): DebugFieldShape | undefined {
    // Bit flags, lowest bit first. The names are in the annotation rather than
    // read from the source because flag bits are `#define`s rather than an enum.
    // `-` marks a bit the field does not use.
    const flags = raw.split("|").map((name) => name.trim());
    if (flags.length > DEBUG_VALUE_BITS || flags.includes("")) {
        return undefined;
    }
    return { unit: null, scale: 1, flags: flags.map((name) => (name === "-" ? null : name)) };
}

function parseUnitShape(raw: string): DebugFieldShape | undefined {
    const trimmed = raw.trim();
    const factor = UNIT_FACTOR.exec(trimmed)?.[0];
    const symbol = trimmed.slice(factor?.length ?? 0).trim();
    const unit = symbol === "" ? null : symbol;

    if (unit !== null && !UNIT_SYMBOLS.has(unit)) {
        return undefined;
    }
    if (factor === undefined && unit === null) {
        return undefined;
    }
    const scale = factor === undefined ? 1 : Number(factor);
    if (scale === 0 || !Number.isFinite(scale)) {
        // Zero would read every sample as zero and its inverse would diverge;
        // a factor with enough digits to overflow a double converts to Infinity,
        // which would carry through to every value the app displays.
        return undefined;
    }

    return { unit, scale };
}

/*
 * The `{a|b|c}` group of a label expanded into one label per index, or an error
 * when the group and the indices do not describe the same thing.
 */
function expandLabel(label: string, indices: number[] | null): { labels: string[] | null } | DebugAnnotationError {
    const expansion = EXPANSION.exec(label);
    // Every brace has to belong to that one group, or the expansion would leave
    // some of them in the label it produces.
    const braces = label.match(BRACE)?.length ?? 0;
    if (braces !== (expansion ? 2 : 0)) {
        return { error: `label "${label}" needs exactly one {a|b|c} group or none, with both braces` };
    }
    if (!expansion) {
        return { labels: null };
    }

    const alternatives = expansion[1].split("|");
    if (alternatives.some((alternative) => alternative.trim() === "")) {
        return { error: `"{${expansion[1]}}" has an empty alternative` };
    }
    if (alternatives.length !== indices?.length) {
        const covered = indices === null ? "one implicit index" : `${indices.length} indices`;
        return {
            error: `"{${expansion[1]}}" spells out ${alternatives.length} labels, but the annotation covers ${covered}`,
        };
    }

    return {
        labels: alternatives.map((alternative) =>
            label
                .replace(EXPANSION, alternative)
                .replaceAll(/[ \t]+/g, " ")
                .trim(),
        ),
    };
}

/* The index spec, if the annotation opens with one, and the text after it. */
function takeIndexSpec(raw: string): { indices: number[] | null; rest: string } | DebugAnnotationError {
    const match = INDEX_SPEC.exec(raw);
    if (!match) {
        return { indices: null, rest: raw };
    }
    const indices = parseIndexSpec(match[1]);
    if (indices === undefined) {
        return { error: `index spec "${match[1]}" is not 0..${DEBUG_VALUE_COUNT - 1}` };
    }
    return { indices, rest: raw.slice(match[0].length) };
}

/* The shape bracket, if the annotation ends with one, and the text before it. */
function takeShapeSpec(raw: string): { shape: DebugFieldShape; rest: string } | DebugAnnotationError {
    const match = SHAPE_SPEC.exec(raw);
    if (!match) {
        // Before the shapes were keyed, a bare `[us]` meant a unit. Refusing it
        // keeps one way to write an annotation, rather than two that drift.
        const unkeyed = UNKEYED_BRACKET.exec(raw);
        return unkeyed
            ? { error: `bracket "${unkeyed[0]}" needs a key: unit:, enum: or flags:` }
            : { shape: { unit: null, scale: 1 }, rest: raw };
    }

    const shape = parseShapeSpec(match[1], match[2]);
    if (shape === undefined) {
        return { error: `"[${match[1]}:${match[2]}]" is not a unit, enum or flags shape` };
    }
    return { shape, rest: raw.slice(0, raw.length - match[0].length) };
}

/*
 * One annotation as {indices, labels, unit, scale}, with the `{a|b|c}` group
 * expanded into one label per index. `indices` is null when the annotation gave
 * no index spec, in which case the caller uses the index from the call itself.
 */
export function parseDebugAnnotation(raw: string): ParsedDebugAnnotation | DebugAnnotationError {
    const index = takeIndexSpec(raw);
    if ("error" in index) {
        return index;
    }
    const shape = takeShapeSpec(index.rest);
    if ("error" in shape) {
        return shape;
    }

    const label = shape.rest.trim();
    if (label === "") {
        return { error: "no label" };
    }
    if (/[[\]]/.test(label)) {
        return { error: `label "${label}" contains a bracket, which delimits the index spec and the shape` };
    }

    const expanded = expandLabel(label, index.indices);
    if ("error" in expanded) {
        return expanded;
    }

    return { indices: index.indices, labels: expanded.labels, label, ...shape.shape };
}

/**
 * One `H debug_field[n]:<annotation>` value from a blackbox log header.
 *
 * The header key already names the slot and the firmware expands `{a|b|c}`
 * before it logs, so an index spec or a group here is a firmware bug. Reading
 * one leniently would mean applying slot 0's label to slot 3 without saying so,
 * which is the mislabelling this whole mechanism exists to remove.
 */
export function parseDebugFieldHeader(raw: string): DebugFieldAnnotation | DebugAnnotationError {
    const parsed = parseDebugAnnotation(raw);
    if (isDebugAnnotationError(parsed)) {
        return parsed;
    }
    if (parsed.indices !== null) {
        return { error: "a logged annotation must not carry an [index:...] spec" };
    }
    if (parsed.labels !== null) {
        return { error: "a logged annotation must not carry a {a|b|c} group" };
    }

    const { indices: _indices, labels: _labels, ...field } = parsed;
    return field;
}
