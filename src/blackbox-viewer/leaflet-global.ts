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

// The Leaflet plugins loaded alongside this module are UMD bundles that patch the global
// `L` instead of importing Leaflet, so nothing links them to Leaflet's own initialisation.
// Import Leaflet here and publish the global before they run: referencing the imported
// value is what forces the bundler to emit Leaflet's initialiser call, which chunk layout
// alone does not guarantee.
import Leaflet from "leaflet";

// Bind unconditionally. graph_map reads the bare global rather than importing Leaflet,
// so leaving a pre-existing `globalThis.L` in place would silently hand the viewer, and the
// plugins patching it, some other page's Leaflet instead of the version pinned here.
// Leaflet's own UMD build assigns `window.L` the same way.
Object.assign(globalThis, { L: Leaflet });

export default Leaflet;
