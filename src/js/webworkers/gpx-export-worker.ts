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

/*
 * Builds the GPX track of a log export, off the main thread (blackbox-viewer/gpx-exporter.ts).
 *
 * This file must not import or export anything: Vite serves it as a classic worker in
 * development, where the `export {}` TypeScript emits for a type-only import or export does
 * not parse. See csv-export-worker.ts.
 */

interface GpxExportRequest {
    /** Log header values; "Log start datetime" anchors the track's timestamps. */
    sysConfig: Record<string, unknown>;
    fieldNames: string[];
    /**
     * The log's chunks, each a list of frames, each a row of field values. The GPS slots are null
     * until the log's first GPS frame.
     */
    frames: (number | null)[][][];
}

/** The dedicated worker scope; the project's lib.dom describes a window instead. */
const gpxWorker = self as unknown as {
    onmessage: ((event: MessageEvent<GpxExportRequest>) => void) | null;
    postMessage(message: string): void;
};

gpxWorker.onmessage = function (event) {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.topografix.com/GPX/gpx_style/0/2 http://www.topografix.com/GPX/gpx_style/0/2/gpx_style.xsd" xmlns:gpx_style="http://www.topografix.com/GPX/gpx_style/0/2" 
  version="1.1" 
  creator="https://github.com/betaflight/betaflight-configurator">
  <metadata>
    <author>
      <name>Betaflight App</name>
      <link href="https://github.com/betaflight/betaflight-configurator"></link>
    </author>
  </metadata>`;

    const footer = `</gpx>`;

    const timeIndex = event.data.fieldNames.indexOf("time");
    const latIndex = event.data.fieldNames.indexOf("GPS_coord[0]");
    const lngIndex = event.data.fieldNames.indexOf("GPS_coord[1]");
    const altitudeIndex = event.data.fieldNames.indexOf("GPS_altitude");

    function trkpt(frame: (number | null)[]): string {
        const timeMillis = Math.floor(Number(frame[timeIndex]) / 1000);
        const lat = Number(frame[latIndex]) / 10000000;
        const lng = Number(frame[lngIndex]) / 10000000;
        // A null altitude counts as 0, as `/` made it.
        const altitude = Number(frame[altitudeIndex]) / 10;

        // A log without the header gives an Invalid Date, and toISOString() throws, as before.
        const date = new Date(event.data.sysConfig["Log start datetime"] as string);
        date.setTime(date.getTime() + timeMillis);

        return `<trkpt lat="${lat}" lon="${lng}"><ele>${altitude}</ele><time>${date.toISOString()}</time></trkpt>\n`;
    }

    let trkpts = "";
    // Every main frame carries the latest GPS values, so a 10 Hz fix repeats across about a hundred
    // frames of a 1 kHz log. Only the first frame of each new position is written, timed from when
    // it arrived; a fix that repeats the previous position adds nothing to the track. The last frame
    // with a position is written too, so the track lasts as long as the log.
    let lastWritten: (number | null)[] | null = null;
    let lastWithFix: (number | null)[] | null = null;
    for (const chunk of event.data.frames) {
        for (const frame of chunk) {
            if (!frame[latIndex] || !frame[lngIndex]) {
                continue;
            }
            lastWithFix = frame;
            if (
                lastWritten &&
                frame[latIndex] === lastWritten[latIndex] &&
                frame[lngIndex] === lastWritten[lngIndex] &&
                frame[altitudeIndex] === lastWritten[altitudeIndex]
            ) {
                continue;
            }
            lastWritten = frame;
            trkpts += trkpt(frame);
        }
    }
    if (lastWithFix && lastWithFix !== lastWritten) {
        trkpts += trkpt(lastWithFix);
    }

    const trk = `  <trk>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>`;

    gpxWorker.postMessage(`${header}\n${trk}\n${footer}`);
};
