---
description: "Vue 3 development standards for Betaflight Configurator: architecture guardrails, how each is enforced, and taste-call guidance."
applyTo: "**/*.vue, **/*.ts, **/*.js, **/*.scss, **/*.less"
---

# Vue 3 Development Instructions

Standards for AI-assisted contributions to Betaflight Configurator. Adapted from the [awesome-copilot Vue 3 instructions](https://github.com/github/awesome-copilot/blob/main/instructions/vuejs3.instructions.md), with project-specific guardrails.

## Project context
- **Stack**: Vue 3 + Composition API + `<script setup lang="ts">`, Pinia 4, Vite 8, Tauri 2 (desktop), Capacitor 8 (Android).
- **UI**: `@nuxt/ui` v4 components + Tailwind CSS v4. Not a Nuxt app — no SSR, no `useAsyncData`, no Nuxt auto-imports outside the UI library.
- **TypeScript**: `strict: true` everywhere, type-checked by `vue-tsc` (`npm run typecheck`, part of `npm run lint`). Every `.vue` file is checked. The remaining `.js` is still importable (`allowJs`) but not checked; the migration and what is left are tracked in #5542.
- **State**: Pinia stores own all state. The `FC`, `GUI` and `CONFIGURATOR` singletons are gone (#4800); flight-controller state lives in `useFlightControllerStore()` (`src/stores/fc.ts`).
- **Naming**: `PascalCase` for both component names and `.vue` file names.

## Architecture guardrails

Read these before writing code. A rule stays listed after tooling lands, so a new PR knows where code belongs before lint rejects it; the **Enforced by** column says what catches a violation.

Legend: ✅ tooled (CI fails) · 🔧 partially tooled · 🚧 guidance only, tooling planned · 📐 guidance (taste call, not lintable).
Formatting (indentation, semicolons, trailing commas, quotes) is owned by Prettier and ESLint and is not repeated here.

### Layering — #4800

| Rule | Status | Enforced by |
|---|---|---|
| Components never talk to the flight controller. MSP calls go in a store action or a composable; components read and write Pinia only | ✅ | `boundaries/dependencies` in `eslint.config.js`: only `src/stores/**`, `src/composables/**` and `src/js/**` may import `src/js/msp.ts` or `src/js/msp/**` (static and dynamic `import()`; `import type` is allowed) |
| `src/js/**` is the transport and protocol layer (serial, MSP framing, flashing). It does not import components | 📐 | Review call |
| FC state lives in `useFlightControllerStore()`. New fields go there, typed in `src/stores/fc.types.ts` — never a new module-level singleton | 🔧 | `vue-tsc` rejects untyped fields; a new singleton is a review call |
| Side effects (MSP, network, persistence, polling) live in store actions or composables, not in components | 🔧 | MSP: the boundary rule above. Network and persistence: review call |
| New MSP codes: `src/js/msp/MSPCodes.ts` + encode/decode in `MSPHelper.ts`, aligned with firmware `msp_protocol.h` | ✅ | `scripts/check-msp-codes.mjs` against every supported firmware branch; weekly and on pull requests touching the table (`.github/workflows/msp-codes.yml`) |

### TypeScript — #5542

| Rule | Status | Enforced by |
|---|---|---|
| New files are `.ts` or `<script setup lang="ts">` | 🔧 | ESLint rejects any `.js` in `src/composables/**`, `src/stores/**` and `src/js/msp/**` (except the dev-only `src/js/msp/debug/**`); other folders follow as they reach zero `.js` (#5542 phase 7) |
| `strict` typing; no `any` to silence the checker | 🔧 | `strict: true` + `vue-tsc`; `@typescript-eslint/no-explicit-any` |
| A file you touch for other reasons converts to TypeScript in the same PR; a touched test converts to `.test.ts` | 📐 | Review call |

### Nuxt UI v4 + Tailwind — #4995

| Rule | Status | Enforced by |
|---|---|---|
| Reach for `@nuxt/ui` v4 first: `UButton`, `UInput`, `UInputNumber`, `USelect`, `USwitch`, `UModal`, … | 📐 | Taste call |
| Use shared wrappers in `src/components/elements/`: `UiBox`, `SettingRow`, `SettingColumn`, `HelpIcon`, `WikiButton` | 📐 | Taste call |
| No new `<style scoped>` blocks; promote shared rules to `src/css/theme.css` or `nuxt-ui.css` | 🚧 | Lint rule (#5542 phase 7) |
| No hard-coded colors — theme via CSS custom properties | 🚧 | Lint rule as an error once existing violations are gone (#5542 phase 7) |
| Respect light/dark (`.dark`) and color themes (`data-theme`) | 📐 | Visual review |

### Always-on

| Rule | Status | Enforced by |
|---|---|---|
| `.vue` filenames and component names: `PascalCase` | 📐 | Review call (no violations today) |
| New source files start with the GPL header in `DEFAULT_LICENSE.md` (same text as the firmware) | 📐 | Review call |
| Don't edit `dist/`, `node_modules/`, generated output | 📐 | Review call (`.gitignore` covers `dist/` and `node_modules/`) |
| i18n source of truth is `locales/en/messages.json` (Crowdin syncs the rest) | 📐 | Review call |
| Tests for non-trivial behaviour (Vitest, `npm run test`) | 📐 | Coverage gate is a proxy; review call |
| Tests must catch bugs, not confirm the fix. A suite co-authored with the change is confirmation-biased — it passes while the code is still broken. Verify by driving the real behaviour (hardware/e2e), and write bug-hunting tests independently/adversarially, ideally blind to the implementation. | 📐 | Review call; separate adversarial pass |
| One concern per PR (one tab, one store, one TS file) | 📐 | PR template / reviewer call |
| Comments state non-obvious why (rationale) or what (functionality) concisely — no restating what well-named code shows, no personality/filler, skip it if removing wouldn't confuse a future reader. Before finishing, re-check new comments against this row | 📐 | Review call |

When tooling lands for a 🚧 or 🔧 rule, update its **Status** and **Enforced by** — don't delete the row.

---

# Development standards (📐 guidance — not tooled)

The sections below are taste-call patterns that can't be reasonably linted.

## Architecture
- Favour the Composition API (`setup` functions and composables) over the Options API.
- Organise components and composables by feature or domain for scalability.
- Separate presentational components (UI-focused) from container components (logic-focused).
- Extract reusable logic into composables under `src/composables/`.
- Structure Pinia stores by domain, with clearly defined state, getters, and actions.

## TypeScript integration
- New files: `.ts` or `<script setup lang="ts">` with `defineProps` / `defineEmits`.
- Type props with `defineProps<T>()` and defaults with `withDefaults`.
- Define interfaces or type aliases for complex prop and state shapes.
- Type event handlers and refs; type store getters and actions explicitly.

## Component design
- Single responsibility per component; keep them small.
- `<script setup>` syntax is the default.
- Validate props with TypeScript; runtime checks only when crossing untrusted boundaries.
- Favour slots and scoped slots for flexible composition.

## State management
- Pinia for shared state (`defineStore`); `ref` / `reactive` for component-local state.
- `computed` for derived state — avoid duplicating shape across stores.
- Side effects (MSP, persistence, polling) live inside store actions, not components.

## Composition API patterns
- `watch` / `watchEffect` with explicit dependencies; clean up in the returned stop handle or `onUnmounted`.
- `provide` / `inject` sparingly — prefer Pinia for cross-tree state.
- Plain `fetch` with reactive state for HTTP, or a project-internal composable. `useAsyncData` is Nuxt-only and not available.

## Styling
- Prefer Tailwind v4 utilities + `@nuxt/ui` v4 components over custom CSS.
- `<style scoped>` is acceptable in legacy SFCs; new components should avoid it (see #4995).
- Theme via CSS custom properties in `src/css/theme.css`. No hex literals in new code.
- Mobile-first responsive layouts. Respect `.dark` and `data-theme` switching.

## Performance
- Lazy-load heavy components with `defineAsyncComponent`; wrap with `<Suspense>` where appropriate.
- `v-once` and `v-memo` for static or rarely-changing subtrees.
- Avoid unnecessary watchers — prefer `computed`.
- Profile with Vue DevTools before micro-optimising.

## Data fetching
- Handle loading, error, and success states explicitly.
- Cancel stale requests on component unmount or param change.
- Cache where it pays off; revalidate in the background.

## Error handling
- Use `app.config.errorHandler` for uncaught errors.
- `errorCaptured` for component-local boundaries.
- Wrap risky logic in `try` / `catch` with user-friendly messages.

## Forms and validation
- Controlled `v-model` bindings; validate on blur or debounced input.
- Use a validation composable or library when forms grow non-trivial.
- Accessible labelling, error announcements, and focus management.

## Testing
- Vitest + Vue Test Utils. Test behaviour, not implementation.
- Mock global plugins (router, Pinia) as needed.
- Add tests next to non-trivial behaviour changes.

## Security
- Avoid `v-html`; sanitise any HTML input rigorously.
- Validate and escape data in templates.
- HTTPS for all network requests; never store sensitive tokens in `localStorage`.

## Accessibility
- Semantic HTML + ARIA attributes where semantics aren't sufficient.
- Manage focus for modals and dynamic content.
- Keyboard navigation for all interactive components.
- Meaningful `alt` text; color contrast meeting WCAG AA.

## Common patterns
- Renderless components and scoped slots for flexible UI.
- Compound components via `provide` / `inject`.
- Custom directives for cross-cutting concerns.
- `Teleport` for modals and overlays.
