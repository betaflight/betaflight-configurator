import { createApp, effectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AppToolbar from "../../src/blackbox-viewer/components/AppToolbar.vue";
import WelcomePage from "../../src/blackbox-viewer/components/WelcomePage.vue";
import { useLogStore } from "../../src/blackbox-viewer/stores/log.js";

// Regression coverage for #5415: "Download from FC is unavailable if there is an active log
// loaded". AppToolbar.vue (visible whenever logStore.hasLog is true) previously had no download
// control at all — only WelcomePage.vue (visible when hasLog is false) did, so the option
// disappeared the moment a log was loaded. The FC pull itself (useDataflashPull) never depended
// on hasLog; this was a UI-only gap. These tests drive each component's setup() directly rather
// than fully rendering it, matching this repo's existing approach for components built on Nuxt
// UI widgets (see connect_options_dialog.test.js): rendering Nuxt UI would exercise their
// widgets' own provider wiring rather than this component's logic.

function fakeDataflash({ available = true, pulling = false } = {}) {
    return {
        available: { value: available },
        pulling: { value: pulling },
        progress: { value: 0 },
        pull: async () => new Uint8Array([1, 2, 3]),
    };
}

// Runs `component.setup()` with a real reactive/injection context: an app supplies
// `bbvDataflash` via provide(), and app.runWithContext() lets inject() see it without a full
// component mount (and therefore without needing to render Nuxt UI's own components).
function runSetup(component, dataflash) {
    const app = createApp({});
    app.provide("bbvDataflash", dataflash);
    const emitted = [];
    const scope = effectScope();
    const api = app.runWithContext(() =>
        scope.run(() =>
            component.setup({}, { emit: (event, ...args) => emitted.push([event, ...args]), expose: () => {} }),
        ),
    );
    return { api, emitted, stop: () => scope.stop() };
}

describe("Download from FC availability (#5415)", () => {
    let scope;

    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        scope?.stop();
        scope = null;
    });

    it("AppToolbar exposes an available download control while a log is loaded", () => {
        const logStore = useLogStore();
        logStore.hasLog = true; // an active log is already loaded in the viewer

        const { api, stop } = runSetup(AppToolbar, fakeDataflash({ available: true }));
        scope = { stop };

        expect(api.downloadAvailable.value).toBe(true);
    });

    it("AppToolbar's availability does not depend on logStore.hasLog", () => {
        const logStore = useLogStore();
        const dataflash = fakeDataflash({ available: true });

        logStore.hasLog = false;
        const withoutLog = runSetup(AppToolbar, dataflash);
        expect(withoutLog.api.downloadAvailable.value).toBe(true);
        withoutLog.stop();

        logStore.hasLog = true;
        const withLog = runSetup(AppToolbar, dataflash);
        scope = { stop: withLog.stop };
        expect(withLog.api.downloadAvailable.value).toBe(true);
    });

    it("AppToolbar still reports unavailable when the FC has no dataflash log, independent of hasLog", () => {
        const logStore = useLogStore();
        logStore.hasLog = true;

        const { api, stop } = runSetup(AppToolbar, fakeDataflash({ available: false }));
        scope = { stop };

        expect(api.downloadAvailable.value).toBe(false);
    });

    it("WelcomePage (no-log state) keeps working after the fix", () => {
        const logStore = useLogStore();
        logStore.hasLog = false;

        const { api, emitted, stop } = runSetup(WelcomePage, fakeDataflash({ available: true }));
        scope = { stop };

        expect(api.downloadAvailable.value).toBe(true);
        api.onDownload();
        expect(emitted).toEqual([["download-from-fc"]]);
    });
});
