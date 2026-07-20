/**
 * PoseTrack serializers — CSV, GPX, JSON, KML.
 *
 * One cohesive concern (PoseTrack IR -> text output formats), consolidated
 * from five separate files (csvSerializer.ts, gpxSerializer.ts,
 * jsonSerializer.ts, kmlSerializer.ts, xmlEscape.ts) into one.
 */

import { type PoseTrack, createPoseTrack } from './poseTrack.js';
import type { PoseSampleInternal, LLA } from './poseSample.js';
import { quatToRot } from './imuMechanization.js';

// ---------------------------------------------------------------------------
// XML escaping (private — used only by the GPX and KML serializers below)
// ---------------------------------------------------------------------------

/** Escape the five XML predefined entities for use inside element text and attributes. */
function esc(s: string): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// ---------------------------------------------------------------------------
// CSV serializer — thin adapter over the PoseTrack IR.
//
// Flat row per sample: tMs, lat, lon, altMsl, qw, qx, qy, qz,
// rollDeg, pitchDeg, headingDeg, tiltDeg, vn, ve, vd, sigmaPos, sigmaAtt.
//
// Euler conventions: pitch negative = nose UP, positive = nose DOWN;
// heading 0=North, clockwise positive; tilt 0=level, 180=inverted.
// ---------------------------------------------------------------------------

/** Options for poseTrackToCsv: field delimiter, whether to emit a header
 *  row, and decimal precision for numeric fields. */
export interface CsvOpts {
  delimiter?: string;
  header?: boolean;
  precision?: number;
}

/**
 * Serialize a PoseTrack to CSV string.
 */
export function poseTrackToCsv(poseTrack: PoseTrack, opts: CsvOpts = {}): string {
  const {
    delimiter = ',',
    header = true,
    precision = 6,
  } = opts;

  const { samples } = poseTrack;
  const lines: string[] = [];

  // Header
  if (header) {
    const cols: string[] = [];
    cols.push('tMs');
    cols.push('lat');
    cols.push('lon');
    cols.push('altMsl');
    cols.push('qw');
    cols.push('qx');
    cols.push('qy');
    cols.push('qz');
    cols.push('rollDeg');
    cols.push('pitchDeg');
    cols.push('headingDeg');
    cols.push('tiltDeg');
    cols.push('vn');
    cols.push('ve');
    cols.push('vd');
    cols.push('sigmaPos');
    cols.push('sigmaAtt');
    lines.push(cols.join(delimiter));
  }

  const t0Us = samples.length > 0 ? samples[0].tUs : 0;

  for (const s of samples) {
    const row: string[] = [];
    row.push(((s.tUs - t0Us) / 1000).toFixed(precision));
    row.push(s.lla ? s.lla.lat.toFixed(precision) : '');
    row.push(s.lla ? s.lla.lon.toFixed(precision) : '');
    row.push(s.lla ? s.lla.alt.toFixed(precision) : '');
    row.push(s.q[0].toFixed(precision));
    row.push(s.q[1].toFixed(precision));
    row.push(s.q[2].toFixed(precision));
    row.push(s.q[3].toFixed(precision));
    // Euler angles — pre-computed at sample build time.
    // Absent (empty string) for legacy samples before euler was added.
    row.push(s.euler ? s.euler.rollDeg.toFixed(2) : '');
    row.push(s.euler ? s.euler.pitchDeg.toFixed(2) : '');
    row.push(s.euler ? s.euler.headingDeg.toFixed(2) : '');
    row.push(s.euler ? s.euler.tiltDeg.toFixed(2) : '');
    row.push(s.v[0].toFixed(precision));
    row.push(s.v[1].toFixed(precision));
    row.push(s.v[2].toFixed(precision));

    // sigmaPos from covPos trace
    let sigmaPos = 0;
    if (s.covPos) {
      sigmaPos = Math.sqrt(Math.max(0, (s.covPos[0][0] + s.covPos[1][1] + s.covPos[2][2]) / 3));
    }
    row.push(sigmaPos.toFixed(precision));

    // sigmaAtt from covAtt trace
    let sigmaAtt = 0;
    if (s.covAtt) {
      sigmaAtt = Math.sqrt(Math.max(0, (s.covAtt[0][0] + s.covAtt[1][1] + s.covAtt[2][2]) / 3)) * (180 / Math.PI);
    }
    row.push(sigmaAtt.toFixed(precision));

    lines.push(row.join(delimiter));
  }

  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// GPX serializer — thin adapter over the PoseTrack IR.
//
// GPX has no native per-point orientation; we surface euler angles via
// <extensions> with a pose: namespace. The triad KML is the primary
// attitude output — the GPX extensions are a convenience for GIS tools
// that can consume per-point metadata.
//
// Euler conventions: pitch negative = nose UP; heading 0=North clockwise positive.
// ---------------------------------------------------------------------------

/** Options for poseTrackToGpx. */
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
  lines.push(`  <trk>`, `    <name>${esc(trackName)}</name>`, `    <trkseg>`);

  for (const s of samples) {
    if (!s.lla) continue;
    if (s.tUs == null) continue;

    lines.push(`      <trkpt lat="${s.lla.lat}" lon="${s.lla.lon}">`, `        <ele>${s.lla.alt}</ele>`);
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
      lines.push(`        <extensions>`, `          <pose:rollDeg>${s.euler.rollDeg.toFixed(2)}</pose:rollDeg>`, `          <pose:pitchDeg>${s.euler.pitchDeg.toFixed(2)}</pose:pitchDeg>`, `          <pose:headingDeg>${s.euler.headingDeg.toFixed(2)}</pose:headingDeg>`, `          <pose:tiltDeg>${s.euler.tiltDeg.toFixed(2)}</pose:tiltDeg>`, `        </extensions>`);
    }
    lines.push(`      </trkpt>`);
  }

  lines.push(`    </trkseg>`, `  </trk>`, `</gpx>`);

  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// JSON serializer for PoseTrack IR — lossless round-trip.
//
// poseTrackToJson / poseTrackFromJson are thin wrappers over JSON.stringify/parse.
// The restored track has the full state, covariance, provenance, and interpolating accessor.
// ---------------------------------------------------------------------------

/**
 * Serialize a PoseTrack to a JSON string (deterministic, byte-stable).
 */
export function poseTrackToJson(track: PoseTrack): string {
  // Strip the sampleAt function before serializing
  const serializable = {
    meta: track.meta,
    samples: track.samples.map((s) => ({
      tUs: s.tUs,
      p: s.p,
      v: s.v,
      q: s.q,
      lla: s.lla,
      covPos: s.covPos,
      covVel: s.covVel,
      covAtt: s.covAtt,
      euler: s.euler,
      diagnostics: s.diagnostics,
    })),
  };
  return JSON.stringify(serializable);
}

/**
 * Deserialize a JSON string back to a full PoseTrack with interpolating sampleAt.
 */
export function poseTrackFromJson(json: string): PoseTrack {
  const parsed = JSON.parse(json);

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.meta ||
    !parsed.meta.georefOrigin ||
    !Array.isArray(parsed.samples)
  ) {
    throw new Error('Invalid PoseTrack JSON payload.');
  }
  if (parsed.meta.schemaVersion !== undefined && parsed.meta.schemaVersion !== 1) {
    throw new Error(`Unsupported PoseTrack schemaVersion: ${parsed.meta.schemaVersion}`);
  }

  const isNumArray = (v: unknown, len: number): v is number[] =>
    Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x));

  const samples: PoseSampleInternal[] = (parsed.samples || []).map(
    (s: Record<string, unknown>, i: number) => {
      if (typeof s.tUs !== 'number' || !Number.isFinite(s.tUs)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i} has a non-finite tUs.`);
      }
      if (!isNumArray(s.p, 3)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i}'s p is not a 3-number array.`);
      }
      if (!isNumArray(s.v, 3)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i}'s v is not a 3-number array.`);
      }
      if (!isNumArray(s.q, 4)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i}'s q is not a 4-number array.`);
      }
      return {
        tUs: s.tUs,
        p: s.p as [number, number, number],
        v: s.v as [number, number, number],
        q: s.q as [number, number, number, number],
        lla: s.lla as PoseSampleInternal['lla'],
        covPos: s.covPos as number[][],
        covVel: s.covVel as number[][],
        covAtt: s.covAtt as number[][],
        euler: s.euler as PoseSampleInternal['euler'],
        diagnostics: s.diagnostics as PoseSampleInternal['diagnostics'],
      };
    },
  );

  return createPoseTrack({
    samples,
    georefOrigin: parsed.meta.georefOrigin,
    source: parsed.meta.source,
  });
}

// ---------------------------------------------------------------------------
// KML serializer — produces KML 2.2 with the true-attitude triad.
//
// Consumes a PoseTrack IR. Pure string-building; no DOM/Vue dependencies.
//
// Layers:
//   - Fused path (LineString through all positions)
//   - Raw GPS path (if provided, styled differently)
//   - Body-axis triads (nose=Red ff0000ff, right=Green ff00ff00, up=Blue ffff0000)
//
// Color order: AABBGGRR (alpha, blue, green, red)
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 111320;

/** Rendering options for poseTrackToKml's triad + path layers. */
export interface KmlConfig {
  /** Triad line length in metres (default 1.0) */
  axisLengthMeters?: number;
  /** Line pixel width (default 2) */
  lineWidth?: number;
  /** Nose color AABBGGRR (default ff0000ff = red) */
  colorNose?: string;
  /** Right color AABBGGRR (default ff00ff00 = green) */
  colorRight?: string;
  /** Up color AABBGGRR (default ffff0000 = blue) */
  colorUp?: string;
  /** Fused path color (default ffffffff = white) */
  colorPath?: string;
  /** Raw GPS path color (default ff00aaff) */
  colorGps?: string;
  /** Triad every N samples (1=every sample, default 10) */
  everyN?: number;
  /** Show fused path layer (default true) */
  showPath?: boolean;
  /** Show body-axis triads layer (default true) */
  showTriads?: boolean;
  /** Show raw GPS comparison path (default false) */
  showRawGps?: boolean;
  /** Raw GPS fixes for comparison (optional) */
  rawGps?: LLA[];
}

/**
 * Build a KML document from a PoseTrack.
 */
export function poseTrackToKml(poseTrack: PoseTrack, config: KmlConfig = {}): string {
  const {
    axisLengthMeters = 1.0,
    lineWidth = 2,
    colorNose = 'ff0000ff',
    colorRight = 'ff00ff00',
    colorUp = 'ffff0000',
    colorPath = 'ffffffff',
    colorGps = 'ff00aaff',
    everyN = 10,
    showPath = true,
    showTriads = true,
    showRawGps = false,
    rawGps = null,
  } = config;
  const triadStep = Number.isFinite(everyN) ? Math.max(1, Math.floor(everyN)) : 1;

  const { samples, meta } = poseTrack;
  if (!samples || samples.length === 0)
    return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Empty</name></Document></kml>';

  const refLat = meta.georefOrigin.lat;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2">', '  <Document>', `    <name>Betaflight Pose Track</name>`);
  lines.push(
    `    <description>${esc(JSON.stringify({ schemaVersion: meta.schemaVersion, frame: meta.frame }))}</description>`,
  );

  // Shared styles
  lines.push(
    `    <Style id="pathStyle"><LineStyle><color>${colorPath}</color><width>${lineWidth}</width></LineStyle></Style>`,
  );
  lines.push(
    `    <Style id="gpsStyle"><LineStyle><color>${colorGps}</color><width>${lineWidth}</width></LineStyle></Style>`,
  );
  lines.push(
    `    <Style id="noseStyle"><LineStyle><color>${colorNose}</color><width>${lineWidth}</width></LineStyle></Style>`,
  );
  lines.push(
    `    <Style id="rightStyle"><LineStyle><color>${colorRight}</color><width>${lineWidth}</width></LineStyle></Style>`,
  );
  lines.push(
    `    <Style id="upStyle"><LineStyle><color>${colorUp}</color><width>${lineWidth}</width></LineStyle></Style>`,
  );

  // Fused path
  if (showPath) {
    lines.push('    <Folder><name>Fused Path</name><visibility>1</visibility>', '      <Placemark>', '        <name>Estimated Trajectory</name>', '        <styleUrl>#pathStyle</styleUrl>', '        <LineString>', '          <altitudeMode>absolute</altitudeMode>', '          <coordinates>');
    for (const s of samples) {
      if (s.lla) {
        lines.push(`            ${s.lla.lon},${s.lla.lat},${s.lla.alt}`);
      }
    }
    lines.push('          </coordinates>', '        </LineString>', '      </Placemark>', '    </Folder>');
  }

  // Raw GPS path (comparison)
  if (showRawGps && rawGps?.length) {
    lines.push('    <Folder><name>Raw GPS</name><visibility>0</visibility>', '      <Placemark>', '        <name>Raw GPS Track</name>', '        <styleUrl>#gpsStyle</styleUrl>', '        <LineString>', '          <altitudeMode>absolute</altitudeMode>', '          <coordinates>');
    for (const fix of rawGps) {
      lines.push(`            ${fix.lon},${fix.lat},${fix.alt}`);
    }
    lines.push('          </coordinates>', '        </LineString>', '      </Placemark>', '    </Folder>');
  }

  // Body-axis triads
  if (showTriads) {
    lines.push('    <Folder><name>Body Axes</name><visibility>1</visibility>');

    for (let i = 0; i < samples.length; i += triadStep) {
      const s = samples[i];
      if (!s.lla) continue;

      const R = quatToRot(s.q);
      // Body axes in world NED (columns of R)
      // nose = +col0 (forward = +X body)
      // right = +col1 (right = +Y body)
      // up = -col2 (up = -Z body since Z is down in FRD)
      const noseNed = { n: R[0][0], e: R[1][0], d: R[2][0] };
      const rightNed = { n: R[0][1], e: R[1][1], d: R[2][1] };
      const upNed = { n: -R[0][2], e: -R[1][2], d: -R[2][2] };

      const endpoints = [
        { name: 'nose', colorStyle: '#noseStyle', dir: noseNed },
        { name: 'right', colorStyle: '#rightStyle', dir: rightNed },
        { name: 'up', colorStyle: '#upStyle', dir: upNed },
      ];

      for (const ep of endpoints) {
        const dN = axisLengthMeters * ep.dir.n;
        const dE = axisLengthMeters * ep.dir.e;
        const dD = axisLengthMeters * ep.dir.d;

        const cosLat = Math.cos((refLat * Math.PI) / 180);
        const dLat = dN / M_PER_DEG_LAT;
        const dLon = dE / (M_PER_DEG_LAT * Math.max(cosLat, 1e-6));
        const dAlt = -dD;

        const endLat = s.lla.lat + dLat;
        const endLon = s.lla.lon + dLon;
        const endAlt = s.lla.alt + dAlt;

        // Per-frame description: heading + pitch when euler is available.
        const descParts: string[] = [];
        if (s.euler) {
          descParts.push(`hdg=${s.euler.headingDeg.toFixed(0)}°`);
          descParts.push(`pitch=${s.euler.pitchDeg.toFixed(0)}°`);
          descParts.push(`tilt=${s.euler.tiltDeg.toFixed(0)}°`);
        }
        const desc = descParts.length > 0 ? esc(descParts.join(', ')) : '';

        lines.push(`      <Placemark>`, `        <name>${ep.name} @ f${i}</name>`);
        if (desc) {
          lines.push(`        <description>${desc}</description>`);
        }
        lines.push(`        <styleUrl>${ep.colorStyle}</styleUrl>`, `        <LineString>`, `          <altitudeMode>absolute</altitudeMode>`, `          <coordinates>`, `            ${s.lla.lon},${s.lla.lat},${s.lla.alt}`, `            ${endLon},${endLat},${endAlt}`, `          </coordinates>`, `        </LineString>`, `      </Placemark>`);
      }
    }

    lines.push('    </Folder>');
  }

  lines.push('  </Document>', '</kml>');

  return `${lines.join('\n')}\n`;
}
