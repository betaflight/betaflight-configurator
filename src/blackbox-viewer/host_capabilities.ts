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

import type { Ref } from "vue";

/**
 * Capabilities the configurator provides down to the embedded blackbox viewer.
 *
 * BlackboxViewerTab.vue `provide()`s these; WelcomePage and AppToolbar `inject()` them. Each is
 * absent (null) when the viewer runs standalone rather than embedded, so every consumer has to
 * treat the whole object as optional.
 */

/** Pulling a log off the flight controller's dataflash — `provide("bbvDataflash", ...)`. */
export interface DataflashHost {
    available: Ref<boolean>;
    pulling: Ref<boolean>;
    progress: Ref<number>;
    /** Resolves with the downloaded log bytes. */
    pull: () => Promise<Uint8Array>;
}
