import { View, Map, Feature } from "ol";
import { fromLonLat } from "ol/proj";
import { Tile, Vector as LayerVector } from "ol/layer";
import { OSM, XYZ, Vector as SourceVector } from "ol/source";
import { Icon, Style } from "ol/style";
import { Point } from "ol/geom";

const DEFAULT_ZOOM = 17;
const DEFAULT_LON = 0;
const DEFAULT_LAT = 0;
const ICON_IMAGE_GPS = "/images/icons/cf_icon_position.png";
const ICON_IMAGE_MAG = "/images/icons/cf_icon_position_mag.png";
const ICON_IMAGE_NOFIX = "/images/icons/cf_icon_position_nofix.png";

/**
 * Create and configure an OpenLayers map instance for the GPS tab.
 * UI bindings (layer selection, fullscreen, zoom buttons) are handled by the Vue component.
 */
export function initMap(options = {}) {
    const {
        target = "map",
        defaultZoom = DEFAULT_ZOOM,
        defaultLon = DEFAULT_LON,
        defaultLat = DEFAULT_LAT,
        defaultLayer = "satellite",
    } = options;

    const lonLat = fromLonLat([defaultLon, defaultLat]);

    const mapView = new View({
        center: lonLat,
        zoom: defaultZoom,
    });

    const devicePixelRatio = window.devicePixelRatio || 1;

    const layers = {
        street: new Tile({
            source: new OSM({
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "street",
        }),
        satellite: new Tile({
            source: new XYZ({
                url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "satellite",
        }),
        hybrid: new Tile({
            source: new XYZ({
                url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "hybrid",
        }),
    };

    const map = new Map({
        target,
        layers: [layers.street, layers.satellite, layers.hybrid],
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

    const destroy = () => {
        map.setTarget(null);
        vectorSource.clear();
    };

    return {
        map,
        mapView,
        layers,
        iconStyleMag,
        iconStyleGPS,
        iconStyleNoFix,
        iconFeature,
        iconGeometry,
        destroy,
    };
}
