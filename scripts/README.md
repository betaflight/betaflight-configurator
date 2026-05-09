# Maintenance scripts

## `sync-unified-targets.mjs`

Pulls firmware-default silkscreen mappings from
[`betaflight/unified-targets`](https://github.com/betaflight/unified-targets)
and writes them to `src/data/target-defaults.json`. Used by the Servos
tab's smart-dropdown tier-0 lookup so silkscreen-prefix labels (e.g.
`M3 (B00)`) work on any firmware build, regardless of the FC's current
resource state.

### Run

```sh
yarn build:targets
```

The script:

1. Clones (or fast-forwards) `betaflight/unified-targets` into
   `.cache/unified-targets/` (gitignored).
2. Walks `configs/default/*.config`, parses
   `board_name` / `manufacturer_id` / `resource MOTOR <n> <pad>` /
   `resource LED_STRIP 1 <pad>` lines.
3. Aggregates by `<MFGR>_<BOARDNAME>` key (matches `FC.CONFIG.boardName`
   on modern firmware).
4. On rev-variant collisions (multiple configs for the same board),
   the most-complete map wins — most motors, then most LEDs.
5. Writes `src/data/target-defaults.json`.

### When to regenerate

- Before each release, so end users get the freshest silkscreen
  mapping.
- After upstream `unified-targets` adds new boards or fixes silkscreen
  errata for an existing one.

### Reviewing the diff

The generated JSON is committed so end users don't need network access
at install time. When `yarn build:targets` produces changes, review
the JSON diff in the PR — it's the human-legible record of upstream
silkscreen changes. Pay attention to:

- Boards whose `motors[]` array length changed (silkscreen revision
  added/removed pads).
- Boards whose `motors[i].pad` changed (upstream errata fix).

### Adding a fork-specific target

If you maintain a fork with targets that aren't in upstream
`unified-targets`, the lookup helper falls through to PR 1's bare
`resource` CLI read — labels still work for that user, just via the
slower path. If demand emerges for first-class fork-target support,
the plan is to add a manual override file (see
`plans/target-defaults-canonical-padDefaults.md`).
