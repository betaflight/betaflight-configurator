## Betaflight Configurator — agent quick start

Objective: help an AI coding agent become productive quickly in this repo by highlighting architecture, developer workflows, conventions, and concrete examples.

- Repository shape: a Vue 3 PWA written for Vite; legacy/jQuery code coexists in the top-level `js/` folder. Capacitor is used to wrap the web app for Android.

- Key entry points and places to read first:
  - `index.html` — web app HTML shell.
  - `src/components/init.js` — bootstraps i18n and the Vue app; shows global model exposure (`window.vm`) and reactivity patterns.
  - `js/fc.js`, `js/msp.js`, `js/port_handler.js`, `js/data_storage.js` — core domain modules (flight-controller model, MSP protocol, port handling, persistent storage).
  - `src/js/vue_components.js` — central registry of Vue components used by the app.
  - `locales/` — translation JSONs used by i18next; changes are pushed via Crowdin.
  - `capacitor.config.generator.mjs` — programmatic Capacitor config generation for Android flows.

- Build / dev commands (from `package.json`) — use Yarn (project expects Yarn v1):
  - `yarn install`
  - `yarn dev` — run Vite dev server (HMR) for PWA development (serves on http://localhost:8000)
  - `yarn build` + `yarn preview` or `yarn review` — build and preview production bundle
  - `yarn test` — run unit tests (Vitest)
  - `yarn lint` / `yarn lint:fix` — ESLint checks (pre-commit hook runs lint)
  - Android: `yarn android:dev`, `yarn android:run`, `yarn android:open` — all rely on `capacitor.config.generator.mjs` then `npx cap ...`

- Project-specific conventions and patterns
  - Mix of modern Vue 3 + legacy jQuery modules: many files under `js/` are side-effectful and expect DOM or global state. Prefer small, focused changes and preserve existing mutation behavior.
  - Side-effectful imports: e.g. `src/components/init.js` imports `../js/localization.js` which attaches `i18n` to `window` and initializes i18next. Do not refactor to pure modules without ensuring callers still work.
  - Reactive wrappers: some modules are wrapped with Vue `reactive()` to expose arrays/objects that Vue components watch (see `src/components/init.js` for `betaflightModel`). When modifying data shapes, check UI updates rely on reactivity.
  - Global model exposure: `window.vm` is intentionally set for debug/interop with jQuery code. Use it when investigating state in the running app.
  - Translation flow: translations live in `locales/<lang>/messages.json` and are used by i18next; Crowdin configuration exists in `crowdin.yml`.

- Integration & external dependencies
  - Capacitor (`@capacitor/*`) for Android wrapping; `capacitor.config.generator.mjs` must be used before running `npx cap` commands.
  - i18next and `i18next-vue` for translations; bootstrapped in `src/components/init.js`.
  - Some native-like features and discovery use `multicast-dns` and other Node/browser libs — check `package.json` for network/device related dependencies.

- How to make a safe change and verify it
  1. Run `yarn dev` and open browser console. A successful Vue boot will log: `i18n initialized, starting Vue framework` (see `src/components/init.js`).
  2. Modify code in `js/` or `src/` and rely on Vite HMR for quick feedback.
  3. Run `yarn lint` and `yarn test` before creating a PR. Husky runs `yarn lint` on pre-commit.

- Pointers for common tasks (examples)
  - Find where connection/MSP messages are handled: search for `msp.js` and `FC` classes. The `CONNECTION` object and `MSP` are wired into the global Vue model in `src/components/init.js`.
  - Add a new translation key: add to `locales/en/messages.json` and run the app; i18next loads messages from these files.
  - Build Android artifact: `yarn android:run` — this runs `vite build`, executes `capacitor.config.generator.mjs`, then runs `npx cap run android`.

- Safety notes for agents
  - This project mixes legacy and modern code; large refactors are risky. Prefer minimal, behavior-preserving fixes.
  - Exposed globals and side effects are intentional. When removing a global, search for all side-effectful consumers.
  - Tests exist (Vitest) but coverage varies. If you change shared state shapes, add small tests under `test/` to cover critical behaviors.

If anything here is unclear or you'd like examples for a specific task (add component, wire a new MSP command, or prepare an Android release), tell me which area and I'll expand the instructions with targeted snippets.
