/**
 * Minimal Vue Router instance for Nuxt UI standalone (Vite) usage.
 * ULink / UButton call vue-router's useRoute(); without app.use(router), Vue warns:
 * injection "Symbol(route location)" not found.
 */
import { h } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";

const emptyRouteComponent = { render: () => h("span") };

/** @type {import("vue-router").Router | undefined} */
let router;

/**
 * @returns {import("vue-router").Router}
 */
export function getNuxtUiRouter() {
    if (!router) {
        router = createRouter({
            history: createMemoryHistory(import.meta.env.BASE_URL ?? "/"),
            routes: [{ path: "/:pathMatch(.*)*", name: "nuxt-ui-stub", component: emptyRouteComponent }],
        });
    }
    return router;
}
