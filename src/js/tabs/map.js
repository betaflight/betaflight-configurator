import { View, Map, Feature } from "ol";
import { fromLonLat } from "ol/proj";
import { Group as LayerGroup, Tile, Vector as LayerVector } from "ol/layer";
import { OSM, XYZ, Vector as SourceVector } from "ol/source";
import { Icon, Style } from "ol/style";
import { Point } from "ol/geom";

const DEFAULT_ZOOM = 16,
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

    const map = new Map({
        target: "map",
        layers: [
            new Tile({
                source: new OSM(),
            }),
            new LayerGroup({
                layers: [
                    new Tile({
                        source: new XYZ({
                            attributions: [
                                'Powered by Esri',
                                'Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
                            ],
                            attributionsCollapsible: false,
                            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                            maxZoom: DEFAULT_ZOOM,
                        }),
                    }),
                    new Tile({
                        source: new XYZ({
                            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                            maxZoom: DEFAULT_ZOOM,
                        }),
                    }),
                    new Tile({
                        source: new XYZ({
                            url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
                            maxZoom: DEFAULT_ZOOM,
                        }),
                    }),
                    new Tile({
                        source: new XYZ({
                            url: 'https://mt1.google.com/vt/lyrs=t&x={x}&y={y}&z={z}',
                            maxZoom: DEFAULT_ZOOM,
                        }),
                    }),
                ],
            }),
        ],
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

    function bindInputs(layerid, layer) {
        const visibilityInput = $(`${layerid} input.visible`);
        visibilityInput.on('change', function () {
            layer.setVisible(this.checked);
        });
        visibilityInput.prop('checked', layer.getVisible());

        const opacityInput = $(`${layerid} input.opacity`);
        opacityInput.on('input', function () {
            layer.setOpacity(parseFloat(this.value));
        });
        opacityInput.val(String(layer.getOpacity()));
    }

    function setup(id, group) {
        group.getLayers().forEach(function (layer, i) {
            const layerid = id + i;
            bindInputs(layerid, layer);
            if (layer instanceof LayerGroup) {
                setup(layerid, layer);
            }
        });
    }

    setup('#layer', map.getLayerGroup());

    $('#layertree li > span').click(function () {
        $(this).siblings('fieldset').toggle();
    })
    .siblings('fieldset')
    .hide();


    return {
        mapView,
        iconStyleMag,
        iconStyleGPS,
        iconStyleNoFix,
        iconFeature,
        iconGeometry,
    };
}
