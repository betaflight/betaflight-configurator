
const DEFAULT_ZOOM = 16,
      DEFAULT_LON = 0,
      DEFAULT_LAT = 0,
      ICON_IMAGE_GPS = '/images/icons/cf_icon_position.png',
      ICON_IMAGE_MAG = '/images/icons/cf_icon_position_mag.png',
      ICON_IMAGE_NOFIX = '/images/icons/cf_icon_position_nofix.png';

let iconGeometry,
    map,
    mapView,
    iconStyleGPS,
    iconStyleMag,
    iconStyleNoFix,
    iconFeature;

window.onload = initializeMap;

function initializeMap() {

    const lonLat = ol.proj.fromLonLat([DEFAULT_LON, DEFAULT_LAT]);

    mapView = new ol.View({
        center: lonLat,
        zoom: DEFAULT_ZOOM,
    });

    map = new ol.Map({
        target: 'map-canvas',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM(),
            }),
        ],
        view: mapView,
        controls: [],
    });

    const iconGPS = new ol.style.Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_GPS,
    });

    const iconMag = new ol.style.Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_MAG,
    });

    const iconNoFix = new ol.style.Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_NOFIX,
    });

    iconStyleGPS = new ol.style.Style({
        image: iconGPS,
    });

    iconStyleMag = new ol.style.Style({
        image: iconMag,
    });

    iconStyleNoFix = new ol.style.Style({
        image: iconNoFix,
    });

    iconGeometry = new ol.geom.Point(lonLat);

    iconFeature = new ol.Feature({
        geometry: iconGeometry,
    });

    iconFeature.setStyle(iconStyleGPS);

    const vectorSource = new ol.source.Vector({
        features: [iconFeature],
    });

    const currentPositionLayer = new ol.layer.Vector({
        source: vectorSource,
    });

    map.addLayer(currentPositionLayer);

    window.addEventListener('message', processMapEvents);
}

function processMapEvents(e) {
    try {
        switch (e.data.action) {
            case 'zoom_in':
                mapView.setZoom(mapView.getZoom() + 1);
                break;

            case 'zoom_out':
                mapView.setZoom(mapView.getZoom() - 1);
                break;

            case 'center':
            case 'centerMag':
                const iconStyle = e.data.action == 'centerMag' ? iconStyleMag : iconStyleGPS;
                iconFeature.setStyle(iconStyle);
                const center = ol.proj.fromLonLat([e.data.lon, e.data.lat]);
                mapView.setCenter(center);
                // TODO - add rotation for the icon
                // const heading = e.data.heading === undefined ? 0 : e.data.heading;
                // mapView.setRotation(heading);
                iconGeometry.setCoordinates(center);
                break;

            case 'nofix':
                iconFeature.setStyle(iconStyleNoFix);
                break;
        }
    } catch (err) {
        console.error('Map error', err);
    }
}
