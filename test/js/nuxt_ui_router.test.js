import { describe, expect, it, vi } from "vitest";
import { createApp, h } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getNuxtUiRouter } from "../../src/js/nuxt_ui_router.js";

describe("nuxt ui stub router", () => {
    it("creates a router and resolves an arbitrary path through the catch-all", async () => {
        const router = getNuxtUiRouter();
        expect(router).toBeTruthy();
        const resolved = router.resolve("/anything/deep/here");
        expect(resolved.name).toBe("nuxt-ui-stub");
        expect(resolved.matched.length).toBe(1);
        expect(router.resolve("/").name).toBe("nuxt-ui-stub");
    });

    it("builds the catch-all without a router warning", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        getNuxtUiRouter().resolve("/whatever");
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it("installs on an app and satisfies useRoute()", async () => {
        const router = getNuxtUiRouter();
        const seen = {};
        const Probe = {
            setup() {
                // Mirrors what ULink / UButton do internally.
                seen.route = useRoute();
                seen.router = useRouter();
                return () => h("span", "ok");
            },
        };
        const el = document.createElement("div");
        const app = createApp(Probe);
        app.use(router);
        await router.isReady();
        app.mount(el);
        expect(el.textContent).toBe("ok");
        expect(seen.route.path).toBeTypeOf("string");
        expect(seen.router).toBeTruthy();
        app.unmount();
    });
});
