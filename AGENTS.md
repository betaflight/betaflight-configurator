# Agent Constraints

Non-obvious, enforceable rules for AI-assisted contributions. Read the code for everything else.

## Stack
- Vue 3 + Composition API + `<script setup>`, Pinia 3, Vite 7, Tauri 2 (desktop), Capacitor 8 (Android).
- UI: `@nuxt/ui` v4 components + Tailwind CSS v4 utilities.
- Not a Nuxt app — no SSR, no `useAsyncData`, no Nuxt auto-imports outside the UI library.

## Active workstreams — prefer closing these over starting new ones
- **#4800** Pinia as single source of truth — retire legacy `FC` / `GUI` / `CONFIGURATOR` singletons.
- **#4995** Nuxt UI v4 + Tailwind conversion for remaining legacy layouts.
- **Next phase** incremental TypeScript adoption — new files as `.ts` or `<script setup lang="ts">`; add JSDoc when touching legacy JS.

## State & layering
- New domain stores live under `src/stores/`. Stores own MSP, polling, and persistence inside actions; components read via getters/computed and write via actions.
- Do not add new fields to `src/js/fc.js`. Write to a Pinia store; hydrate from legacy via explicit `store.hydrateFromLegacy(…)`.
- No MSP calls from Vue components — wrap them in a store action or composable.
- New MSP codes go in `src/js/msp/MSPCodes.js` with matching encode/decode in `MSPHelper.js`, aligned with firmware `msp_protocol.h`.

## UI components & styling
- Reach for `@nuxt/ui` v4 first: `UButton`, `UInput`, `UInputNumber`, `USelect`, `USwitch`, `UModal`, …
- Use shared wrappers in `src/components/elements/`: `UiBox`, `SettingRow`, `SettingColumn`, `HelpIcon`, `WikiButton`.
- Layout with Tailwind utilities. Avoid new `<style scoped>` blocks; promote genuinely global rules to `src/css/theme.css` or `nuxt-ui.css`.
- Theme via CSS custom properties in `src/css/theme.css`. Respect light/dark (`.dark`) and color themes (`data-theme`). No hard-coded colors.

## Files off-limits
- `dist/`, `node_modules/`, generated output.
- `locales/*.json` except `locales/en/messages.json` (Crowdin syncs the rest).

## Conventions
- `.vue` filenames and component names: `PascalCase`. JS identifiers: `camelCase`. CLI commands: `snake_case`.
- 4-space indent. ESLint + Prettier (`npm run lint`, `npm run format`).
- Tests: Vitest (`npm run test`). Add tests for non-trivial behaviour changes.
- One concern per PR (one tab conversion, one store extraction, one TS file).
