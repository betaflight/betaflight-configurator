const DEFAULT_ZOOM = 16,
      DEFAULT_LON = 0,
      DEFAULT_LAT = 0,
      ICON_IMAGE = '/images/icons/cf_icon_position.png',
      ICON_IMAGE_NOFIX = '/images/icons/cf_icon_position_nofix.png';

var iconGeometry,
    map,
    mapView,
    iconStyle,
    iconStyleNoFix,
    iconFeature;

window.onload = initializeMap;

function initializeMap() {

    var lonLat = ol.proj.fromLonLat([DEFAULT_LON, DEFAULT_LAT]);

    mapView = new ol.View({
                        center: lonLat,
                        zoom: DEFAULT_ZOOM
                      });

    map = new ol.Map({
        target: 'map-canvas',
        layers: [
          new ol.layer.Tile({
            source: new ol.source.OSM()
          })
        ],
        view: mapView,
        controls: []
      });

    var icon = new ol.style.Icon(({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE
    }));

    var iconNoFix = new ol.style.Icon(({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_NOFIX
    }));

    iconStyle = new ol.style.Style({
        image: icon 
    });

    iconStyleNoFix = new ol.style.Style({
        image: iconNoFix
    });

    iconGeometry = new ol.geom.Point(lonLat);
    iconFeature = new ol.Feature({
        geometry: iconGeometry
    });

    iconFeature.setStyle(iconStyle);

    var vectorSource = new ol.source.Vector({
        features: [iconFeature]
    });

    var currentPositionLayer = new ol.layer.Vector({
        source: vectorSource
    });

    map.addLayer(currentPositionLayer);

    window.addEventListener('message', processMapEvents); 
}

function processMapEvents(e) {

    try {
        switch(e.data.action) {

        case 'zoom_in':            
            mapView.setZoom(mapView.getZoom() + 1);
            break;

        case 'zoom_out':
            mapView.setZoom(mapView.getZoom() - 1);
            break;

        case 'center':
            iconFeature.setStyle(iconStyle);
            var center = ol.proj.fromLonLat([e.data.lon, e.data.lat]);
            mapView.setCenter(center);
            iconGeometry.setCoordinates(center);
            break;

        case 'nofix':
            iconFeature.setStyle(iconStyleNoFix);
            break;
        }

  } catch (e) {
      console.log('Map error ' + e);
  }
}
