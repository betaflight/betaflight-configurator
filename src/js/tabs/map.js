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

    // Helper function to handle layer switching
    function switchMapLayer(buttonSelector, targetLayer) {
        const $button = $(buttonSelector);
        const isCurrentlyActive = $button.hasClass("active");

        // Remove active class from all buttons
        $("#Hybrid, #Satellite, #Street").removeClass("active");

        if (!isCurrentlyActive) {
            // Activate this button and show its layer
            $button.addClass("active");
            osmLayer.setVisible(targetLayer === "street");
            googleSatLayer.setVisible(targetLayer === "satellite");
            googleHybridLayer.setVisible(targetLayer === "hybrid");
        } else {
            // Deactivate - hide all layers, show default (satellite)
            osmLayer.setVisible(false);
            googleSatLayer.setVisible(true);
            googleHybridLayer.setVisible(false);
            $("#Satellite").addClass("active");
        }
    }

    $("#Hybrid").on("click", function () {
        switchMapLayer("#Hybrid", "hybrid");
    });

    $("#Satellite").on("click", function () {
        switchMapLayer("#Satellite", "satellite");
    });

    $("#Street").on("click", function () {
        switchMapLayer("#Street", "street");
    });

    return {
        mapView,
        iconStyleMag,
        iconStyleGPS,
        iconStyleNoFix,
        iconFeature,
        iconGeometry,
    };
}
