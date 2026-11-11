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

// Types for the parts of generate-debug-modes.mjs the unit tests import. The script stays plain
// JavaScript run by Node; tsconfig.json has `allowJs: false`, so TypeScript reads this instead.

import type { DebugFieldAnnotation } from "../src/js/debug_annotation.ts";

/** One meaning of a debug field, with the call sites that write it. */
export interface FieldVariant extends DebugFieldAnnotation {
    /** The enumerators of `enumTag`, in index order. */
    values?: (string | null)[];
    /** Where the firmware writes it, as `file:line`. */
    sites: string[];
}

/** A mode's fields: each debug[n] index with every meaning written to it. */
export type ModeFields = Record<number | string, FieldVariant[]>;

/** One firmware version's annotated fields, by mode. */
export interface AnnotatedVersion {
    apiVersion: string;
    commit: string;
    date: string;
    ref: string;
    fields: Record<string, ModeFields>;
}

/** A field two subsystems write with different meanings in the same build. */
export interface FieldConflict {
    apiVersion: string;
    mode: string;
    index: number;
    variants: FieldVariant[];
}

/** A conflict as renderModeFields() reports it, for variants of type `V`. */
export type ModeFieldConflict<V = Omit<FieldVariant, "sites">> = Omit<FieldConflict, "variants"> & { variants: V[] };

/** Comments blanked out of C source, string literals stepped over, offsets kept. */
export function maskNonCode(source: string): string;

/** `debugModeNames[]` from debug.c, designated or positional. */
export function parseDebugModeNames(
    source: string,
    ref: string,
): {
    byIdentifier: Map<string, string>;
    byPosition: string[];
};

/** One `enum { ... }` body as a name -> value map, or undefined for an initialiser it cannot evaluate. */
export function parseEnumBlock(body: string): Map<string, number> | undefined;

/** The named enumerations in one file, as tag -> value names in index order (null for a gap). */
export function parseNamedEnums(source: string): Map<string, (string | null)[]>;

/** A mode name as an object key, quoted only where it has to be. */
export function propertyKey(name: string): string;

/** A pull request number from `#n`, a `/pull/n` URL or the bare number. */
export function pullRequestNumber(value: string): string;

/** The shipped field table, and the conflicts it found. */
export function renderFieldsModule(input: { repoUrl: string; versions: AnnotatedVersion[] }): {
    source: string;
    conflicts: FieldConflict[];
};

/**
 * One mode's fields; a field with two meanings is pushed onto `conflicts`. It reads no call
 * sites, so a variant here need not carry them; renderFieldsModule() renders them.
 */
export function renderModeFields<V extends Omit<FieldVariant, "sites">>(
    mode: string,
    fields: Record<number | string, V[]>,
    apiVersion: string,
    conflicts: ModeFieldConflict<V>[],
): string[];

/** The debug[n] a call site writes, or undefined for an index computed at run time. */
export function resolveFieldIndex(rawIndex: string | undefined, constants: Map<string, number>): number | undefined;
