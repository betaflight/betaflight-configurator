# Betaflight debug field definitions

`debug-fields.json` describes every Betaflight debug mode and what each of its
`debug[0..7]` fields holds, for every MSP API version the configurator supports.
`debug-fields.schema.json` is its JSON Schema.

It is published so that a tool outside this repository — the blackbox log viewer,
a third-party log analyser, anything reading a log this app did not record — can
label and scale debug fields without parsing the firmware's C or scraping this
app's JavaScript.

Both files are **generated**; this README is not. Run `npm run generate:debug-modes`
to rebuild them from the firmware source, and `npm run check:debug-modes` to fail
a build when they have drifted from it.

## Generating from a firmware pull request

The annotations reach a release long after they reach a pull request, so the
useful question while one is open is what the tables would look like with it
merged. Point the generator at it by number:

```sh
npm run generate:debug-modes -- --repo /path/to/betaflight --pr 15596
```

The pull request head is fetched from the upstream project, so this works whether
or not the branch behind it is on a fork, and whether or not your checkout has a
remote naming it. The commit it resolves to is recorded as the provenance of the
newest API version, which means a later `npm run check:debug-modes` against the
same pull request reproduces the files exactly.

That last property is what makes these files reviewable: the commit each one
names is the newest that changed anything the generator reads, so regenerating
from it must reproduce them byte for byte.

## Working on the firmware

To see a debug mode or an annotation you are still writing — before it is
committed, let alone merged — point the generator at your firmware checkout and
let it read the working tree:

```sh
npm run generate:debug-modes:dev -- --repo /path/to/your/betaflight
```

That reads the newest API version from the files as they sit on disk, uncommitted
edits and untracked files included, so `npm run dev` shows your mode with your
labels. Older API versions still come from committed history, since only the
newest one can be the version you are changing.

The output describes firmware nobody else has, so every file it writes opens with
a `NOT FOR COMMIT` banner and the JSON marks that version `"worktree": true`.
When you are done, `npm run generate:debug-modes` puts the committed tables back. Everything in them is read from the
firmware: the `debug_mode_e` enum, `debugModeNames[]`, and the `//!<` annotations
the firmware carries on its `DEBUG_SET()` call sites (the grammar is documented
above the `DEBUG_SET` macro in the firmware's `src/main/build/debug.h`).

## Decoding a log

A blackbox log header gives you a firmware API version and a numeric `debug_mode`.

1. Pick the newest `versions` key that is **not newer** than the log's API version.
   A firmware reporting an API version released after your copy of this file still
   decodes through the closest known enum.
2. Index `versions[api].modes` with the log's `debug_mode`. **A mode's position in
   that array is its numeric value** — that is why the array is ordered and why an
   entry is never removed or reordered once published.
3. Read the mode's `fields`, keyed by the field index. An unannotated field is
   absent: the firmware writes it, but has not yet recorded what it means.

```jsonc
{
    "index": 102,
    "name": "PITOT",
    "writes": [0, 1, 2, 3], // which debug[n] this mode writes
    "dynamic": false, // true if it also writes a run-time computed index
    "fields": {
        "0": { "label": "Airspeed", "unit": "cm/s", "scale": 1 },
    },
}
```

## Rendering a value

`scale` is what one LSB is worth in `unit`, and `units[unit]` says how to display
it. So a field stored as hundredths of a volt:

```jsonc
{ "label": "Battery Voltage Unfiltered", "unit": "V", "scale": 0.01 }
```

is `stored * scale`, then the unit's own `factor` (default 1), printed with the
unit's `suffix`. A `unit` of `null` is a plain count, flag or enumeration and is
never scaled.

Five units are device-native — `gyroADC`, `accADC`, `accADC/s`, `rcCommand` and
`eRPM` — and carry a `ctx`. Only the flight controller's own configuration can
convert those, so a consumer needs the log's gyro/acc scaling to display them.

Two optional keys name the meaning of a non-numeric field:

- `values` — enumerator names, lowest value first.
- `flags` — bit-flag names, lowest bit first, `-` for an unused bit:
  `{ "label": "Frame Flags", "unit": null, "scale": 1, "flags": ["Channel 17", "Channel 18", "Signal Loss", "Failsafe"] }`

## The other top-level keys

- `aliases` / `renames` — firmware sometimes renames a mode while keeping its enum
  slot. A log from either side of the rename resolves through these.
- `conflicts` — indices two subsystems write with different meanings in one build.
  A log records only the number, never which code wrote it, so such a field cannot
  be labelled; both meanings and their call sites are kept here instead of picking
  one. Every entry is a firmware bug.
