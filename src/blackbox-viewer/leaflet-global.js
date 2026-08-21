// The Leaflet plugins loaded alongside this module are UMD bundles that patch the global
// `L` instead of importing Leaflet, so nothing links them to Leaflet's own initialisation.
// Import Leaflet here and publish the global before they run: referencing the imported
// value is what forces the bundler to emit Leaflet's initialiser call, which chunk layout
// alone does not guarantee.
import L from "leaflet";

globalThis.L ??= L;

export default L;
