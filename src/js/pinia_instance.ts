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

import { createPinia, setActivePinia } from "pinia";

/**
 * The app's one Pinia. It is made active as soon as it exists, not only when Vue installs it:
 * init.ts runs `app.use(pinia)` after i18next has initialised, and code that reads a store outside
 * a component before then (an early device event, say) would otherwise find no active Pinia. The
 * FC shim used to cover that with its `getActivePinia() ?? pinia` fallback; this keeps the same
 * guarantee for every store now that the shim is gone. A test that installs its own Pinia with
 * setActivePinia() still overrides it.
 */
export const pinia = createPinia();
setActivePinia(pinia);
