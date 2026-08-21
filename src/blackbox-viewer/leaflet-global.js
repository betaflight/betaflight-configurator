// The Leaflet plugins loaded alongside this module are UMD bundles that patch the global
// `L` instead of importing Leaflet, so nothing links them to Leaflet's own initialisation.
// Import Leaflet here and publish the global before they run: referencing the imported
// value is what forces the bundler to emit Leaflet's initialiser call, which chunk layout
// alone does not guarantee.
import L from "leaflet";

// Bind unconditionally. graph_map.js reads the bare global rather than importing Leaflet,
// so leaving a pre-existing `globalThis.L` in place would silently hand the viewer, and the
// plugins patching it, some other page's Leaflet instead of the version pinned here.
// Leaflet's own UMD build assigns `window.L` the same way.
globalThis.L = L;

export default L;
