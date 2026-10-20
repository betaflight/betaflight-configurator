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

/**
 * Minimal Vue Router instance for Nuxt UI standalone (Vite) usage.
 * ULink / UButton call vue-router's useRoute(); without app.use(router), Vue warns:
 * injection "Symbol(route location)" not found.
 */
import { h } from "vue";
import { createRouter, createMemoryHistory, type Router } from "vue-router";

const emptyRouteComponent = { render: () => h("span") };

let router: Router | undefined;

export function getNuxtUiRouter(): Router {
    router ??= createRouter({
        history: createMemoryHistory(import.meta.env.BASE_URL ?? "/"),
        routes: [{ path: "/:pathMatch(.*)*", name: "nuxt-ui-stub", component: emptyRouteComponent }],
    });
    return router;
}
