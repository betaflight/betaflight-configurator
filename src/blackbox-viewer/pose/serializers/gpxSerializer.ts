/**
 * GPX serializer — thin adapter over the PoseTrack IR.
 *
 * GPX has no native per-point orientation; we surface euler angles via
 * <extensions> with a pose: namespace. The triad KML is the primary
 * attitude output — the GPX extensions are a convenience for GIS tools
 * that can consume per-point metadata.
 *
 * Euler conventions: pitch negative = nose UP; heading 0=North clockwise positive.
 */

import type { PoseTrack } from '../poseTrack.js';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface GpxOpts {
  /** GPX track name (default "Betaflight Track") */
  trackName?: string;
}

/**
 * Serialize a PoseTrack to GPX 1.1 string.
 */
export function poseTrackToGpx(poseTrack: PoseTrack, opts: GpxOpts = {}): string {
  const { trackName = 'Betaflight Track' } = opts;
  const { samples } = poseTrack;
  if (!samples || samples.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Betaflight Pose Estimator"><trk><name>Empty</name><trkseg></trkseg></trk></gpx>';
  }

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx version="1.1" creator="Betaflight Pose Estimator" xmlns="http://www.topografix.com/GPX/1/1" xmlns:pose="https://betaflight.com/pose/v1">',
  );
  lines.push(`  <trk>`);
  lines.push(`    <name>${esc(trackName)}</name>`);
  lines.push(`    <trkseg>`);

  for (const s of samples) {
    if (!s.lla) continue;
    if (s.tUs == null) continue;

    lines.push(`      <trkpt lat="${s.lla.lat}" lon="${s.lla.lon}">`);
    lines.push(`        <ele>${s.lla.alt}</ele>`);
    // <time> intentionally omitted: we have no absolute UTC anchor, so any value
    // here would be a 1970-epoch fiction that misleads GPX consumers. What the log
    // DOES carry, for whoever wires real timestamps up later:
    //   • s.tUs            — microseconds since FC boot; a relative offset only.
    //   • GPS_time / iTOW  — GPS time-of-WEEK (ms): yields time-of-day but NOT the
    //                        date, because the GPS week number isn't logged.
    //   • header "Log start datetime" — absolute UTC of log start, but populated
    //                        only when the FC's RTC was GPS-synced; it is empty
    //                        (0000-01-01T00:00:00Z) on the reference log.
    // To emit true UTC: startDatetime + s.tUs (when the header is set), or
    // iTOW + a known GPS week. That absolute date is also what you'd feed the WMM
    // model to match the magnetic field for the day of the flight.
    // Extensions: euler angles when available (roll/pitch/heading/tilt in degrees)
    if (s.euler) {
      lines.push(`        <extensions>`);
      lines.push(`          <pose:rollDeg>${s.euler.rollDeg.toFixed(2)}</pose:rollDeg>`);
      lines.push(`          <pose:pitchDeg>${s.euler.pitchDeg.toFixed(2)}</pose:pitchDeg>`);
      lines.push(`          <pose:headingDeg>${s.euler.headingDeg.toFixed(2)}</pose:headingDeg>`);
      lines.push(`          <pose:tiltDeg>${s.euler.tiltDeg.toFixed(2)}</pose:tiltDeg>`);
      lines.push(`        </extensions>`);
    }
    lines.push(`      </trkpt>`);
  }

  lines.push(`    </trkseg>`);
  lines.push(`  </trk>`);
  lines.push(`</gpx>`);

  return `${lines.join('\n')}\n`;
}
