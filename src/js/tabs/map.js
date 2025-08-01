import { View, Map, Feature } from "ol";
import { fromLonLat } from "ol/proj";
import { Tile, Vector as LayerVector } from "ol/layer";
import { OSM, XYZ, Vector as SourceVector } from "ol/source";
import { Icon, Style } from "ol/style";
import { Point } from "ol/geom";

const DEFAULT_ZOOM = 17,
    DEFAULT_LON = 0,
    DEFAULT_LAT = 0,
    ICON_IMAGE_GPS = "/images/icons/cf_icon_position.png",
    ICON_IMAGE_MAG = "/images/icons/cf_icon_position_mag.png",
    ICON_IMAGE_NOFIX = "/images/icons/cf_icon_position_nofix.png";

export function initMap() {
    const lonLat = fromLonLat([DEFAULT_LON, DEFAULT_LAT]);

    const mapView = new View({
        center: lonLat,
        zoom: DEFAULT_ZOOM,
    });

    const osmLayer = new Tile({
        source: new OSM(),
    });

    const googleSatLayer = new Tile({
        source: new XYZ({
            url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        }),
    });

    const googleHybridLayer = new Tile({
        source: new XYZ({
            url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        }),
    });

    const map = new Map({
        target: "map",
        layers: [osmLayer, googleSatLayer, googleHybridLayer],
        view: mapView,
        controls: [],
    });

    const iconGPS = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_GPS,
    });

    const iconMag = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_MAG,
    });

    const iconNoFix = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_NOFIX,
    });

    const iconStyleGPS = new Style({
        image: iconGPS,
    });

    const iconStyleMag = new Style({
        image: iconMag,
    });

    const iconStyleNoFix = new Style({
        image: iconNoFix,
    });

    const iconGeometry = new Point(lonLat);

    const iconFeature = new Feature({
        geometry: iconGeometry,
    });

    iconFeature.setStyle(iconStyleGPS);

    const vectorSource = new SourceVector({
        features: [iconFeature],
    });

    const currentPositionLayer = new LayerVector({
        source: vectorSource,
    });

    map.addLayer(currentPositionLayer);

    // Start with Satellite layer active
    osmLayer.setVisible(false);
    googleHybridLayer.setVisible(false);
    $("#Satellite").addClass("active");

    // Map button selectors to their corresponding layers
    const layerConfig = {
        "#Hybrid": googleHybridLayer,
        "#Satellite": googleSatLayer,
        "#Street": osmLayer,
    };

    // Helper function to handle layer switching
    function switchMapLayer(buttonSelector) {
        const $button = $(buttonSelector);
        const isCurrentlyActive = $button.hasClass("active");
        const targetLayer = layerConfig[buttonSelector];

        // If already active, do nothing (prevent deactivation)
        if (isCurrentlyActive) {
            return;
        }

        // Remove active class from all buttons
        Object.keys(layerConfig).forEach((selector) => $(selector).removeClass("active"));

        // Activate this button and show its layer
        $button.addClass("active");
        // Hide all layers, then show the target layer
        Object.values(layerConfig).forEach((layer) => layer.setVisible(false));
        targetLayer.setVisible(true);
    }

    $("#Hybrid").on("click", function () {
        switchMapLayer("#Hybrid");
    });

    $("#Satellite").on("click", function () {
        switchMapLayer("#Satellite");
    });

    $("#Street").on("click", function () {
        switchMapLayer("#Street");
    });

    // Fullscreen functionality
    $("#fullscreen").on("click", function () {
        const mapContainer = document.getElementById("loadmap");

        if (!document.fullscreenElement) {
            // Enter fullscreen
            if (mapContainer.requestFullscreen) {
                mapContainer.requestFullscreen();
            } else if (mapContainer.webkitRequestFullscreen) {
                mapContainer.webkitRequestFullscreen();
            } else if (mapContainer.msRequestFullscreen) {
                mapContainer.msRequestFullscreen();
            }
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    });

    // Store handler reference for cleanup
    function handleFullscreenChange() {
        const isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement
        );
        const $fullscreenBtn = $("#fullscreen");

        if (isFullscreen) {
            $fullscreenBtn.addClass("active").attr("aria-label", "Exit fullscreen");
        } else {
            $fullscreenBtn.removeClass("active").attr("aria-label", "Toggle fullscreen");
        }
        // Use requestAnimationFrame to ensure DOM has updated before resizing
        requestAnimationFrame(() => map.updateSize());
    }

    // Add event listeners
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    // Cleanup function to remove event listeners
    function destroy() {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    }

    return {
        mapView,
        iconStyleMag,
        iconStyleGPS,
        iconStyleNoFix,
        iconFeature,
        iconGeometry,
        destroy,
    };
}
