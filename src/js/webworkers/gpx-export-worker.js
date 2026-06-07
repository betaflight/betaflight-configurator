onmessage = function (event) {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.topografix.com/GPX/gpx_style/0/2 http://www.topografix.com/GPX/gpx_style/0/2/gpx_style.xsd" xmlns:gpx_style="http://www.topografix.com/GPX/gpx_style/0/2" 
  version="1.1" 
  creator="https://github.com/betaflight/blackbox-log-viewer">
  <metadata>
    <author>
      <name>Betaflight Blackbox Explorer</name>
      <link href="https://github.com/betaflight/blackbox-log-viewer"></link>
    </author>
  </metadata>`;

    const footer = `</gpx>`;

    const timeIndex = event.data.fieldNames.indexOf("time");
    const latIndex = event.data.fieldNames.indexOf("GPS_coord[0]");
    const lngIndex = event.data.fieldNames.indexOf("GPS_coord[1]");
    const altitudeIndex = event.data.fieldNames.indexOf("GPS_altitude");

    let trkpts = "";
    for (const chunk of event.data.frames) {
        for (const frame of chunk) {
            if (!frame[latIndex] || !frame[lngIndex]) {
                continue;
            }
            const timeMillis = Math.floor(frame[timeIndex] / 1000);
            const lat = frame[latIndex] / 10000000;
            const lng = frame[lngIndex] / 10000000;
            const altitude = frame[altitudeIndex] / 10;

            let date = new Date(event.data.sysConfig["Log start datetime"]);
            date.setTime(date.getTime() + timeMillis);

            let trkpt = `<trkpt lat="${lat}" lon="${lng}">`;
            trkpt += `<ele>${altitude}</ele>`;
            trkpt += `<time>${date.toISOString()}</time>`;
            trkpt += `</trkpt>\n`;

            trkpts += trkpt;
        }
    }

    let trk = `  <trk>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>`;

    postMessage(header + "\n" + trk + "\n" + footer);
};
