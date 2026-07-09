/**
 * KML serializer — produces KML 2.2 with the true-attitude triad.
 *
 * Consumes a PoseTrack IR. Pure string-building; no DOM/Vue dependencies.
 *
 * Layers:
 *   - Fused path (LineString through all positions)
 *   - Raw GPS path (if provided, styled differently)
 *   - Body-axis triads (nose=Red ff0000ff, right=Green ff00ff00, up=Blue ffff0000)
 *
 * Color order: AABBGGRR (alpha, blue, green, red)
 */

import { quatToRot } from '../imuMechanization.js';
import type { PoseTrack } from '../poseTrack.js';
import type { LLA } from '../poseSample.js';

const M_PER_DEG_LAT = 111320;

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  lines.push('  <Document>');
  lines.push(`    <name>Betaflight Pose Track</name>`);
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
    lines.push('    <Folder><name>Fused Path</name><visibility>1</visibility>');
    lines.push('      <Placemark>');
    lines.push('        <name>Estimated Trajectory</name>');
    lines.push('        <styleUrl>#pathStyle</styleUrl>');
    lines.push('        <LineString>');
    lines.push('          <altitudeMode>absolute</altitudeMode>');
    lines.push('          <coordinates>');
    for (const s of samples) {
      if (s.lla) {
        lines.push(`            ${s.lla.lon},${s.lla.lat},${s.lla.alt}`);
      }
    }
    lines.push('          </coordinates>');
    lines.push('        </LineString>');
    lines.push('      </Placemark>');
    lines.push('    </Folder>');
  }

  // Raw GPS path (comparison)
  if (showRawGps && rawGps && rawGps.length > 0) {
    lines.push('    <Folder><name>Raw GPS</name><visibility>0</visibility>');
    lines.push('      <Placemark>');
    lines.push('        <name>Raw GPS Track</name>');
    lines.push('        <styleUrl>#gpsStyle</styleUrl>');
    lines.push('        <LineString>');
    lines.push('          <altitudeMode>absolute</altitudeMode>');
    lines.push('          <coordinates>');
    for (const fix of rawGps) {
      lines.push(`            ${fix.lon},${fix.lat},${fix.alt}`);
    }
    lines.push('          </coordinates>');
    lines.push('        </LineString>');
    lines.push('      </Placemark>');
    lines.push('    </Folder>');
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

        lines.push(`      <Placemark>`);
        lines.push(`        <name>${ep.name} @ f${i}</name>`);
        if (desc) {
          lines.push(`        <description>${desc}</description>`);
        }
        lines.push(`        <styleUrl>${ep.colorStyle}</styleUrl>`);
        lines.push(`        <LineString>`);
        lines.push(`          <altitudeMode>absolute</altitudeMode>`);
        lines.push(`          <coordinates>`);
        lines.push(`            ${s.lla.lon},${s.lla.lat},${s.lla.alt}`);
        lines.push(`            ${endLon},${endLat},${endAlt}`);
        lines.push(`          </coordinates>`);
        lines.push(`        </LineString>`);
        lines.push(`      </Placemark>`);
      }
    }

    lines.push('    </Folder>');
  }

  lines.push('  </Document>');
  lines.push('</kml>');

  return `${lines.join('\n')}\n`;
}
