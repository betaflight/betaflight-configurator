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

export interface Mixer {
    name: string;
    /** The 3D craft model to draw. */
    model: string;
    /** The motor order diagram, under images/motor_order/. */
    image: string;
    defaultMotorOrder: number[];
    defaultYawOffset: number;
}

// Mixer definitions — shared between settings dialog and renderers
export const mixerList: Mixer[] = [
    {
        name: "Tricopter",
        model: "tricopter",
        image: "tri",
        defaultMotorOrder: [0, 1, 2],
        defaultYawOffset: -Math.PI / 2,
    },
    { name: "Quad +", model: "quad_x", image: "quad_p", defaultMotorOrder: [1, 3, 2, 0], defaultYawOffset: 0 },
    {
        name: "Quad X",
        model: "quad_x",
        image: "quad_x",
        defaultMotorOrder: [1, 3, 2, 0],
        defaultYawOffset: Math.PI / 4,
    },
    { name: "Bicopter", model: "custom", image: "bicopter", defaultMotorOrder: [0, 1], defaultYawOffset: 0 },
    { name: "Gimbal", model: "custom", image: "custom", defaultMotorOrder: [0, 1, 2], defaultYawOffset: 0 },
    { name: "Y6", model: "y6", image: "y6", defaultMotorOrder: [4, 1, 3, 5, 2, 0], defaultYawOffset: 0 },
    { name: "Hex +", model: "hex_plus", image: "hex_p", defaultMotorOrder: [4, 1, 3, 5, 2, 0], defaultYawOffset: 0 },
    { name: "Flying Wing", model: "custom", image: "flying_wing", defaultMotorOrder: [0], defaultYawOffset: 0 },
    { name: "Y4", model: "y4", image: "y4", defaultMotorOrder: [1, 3, 2, 0], defaultYawOffset: Math.PI / 4 },
    {
        name: "Hex X",
        model: "hex_x",
        image: "hex_x",
        defaultMotorOrder: [4, 1, 3, 5, 2, 0],
        defaultYawOffset: Math.PI / 6,
    },
    {
        name: "Octo X8",
        model: "custom",
        image: "octo_x8",
        defaultMotorOrder: [5, 1, 4, 0, 7, 3, 6, 2],
        defaultYawOffset: Math.PI / 8,
    },
    {
        name: "Octo Flat +",
        model: "custom",
        image: "octo_flat_p",
        defaultMotorOrder: [5, 1, 4, 0, 7, 3, 6, 2],
        defaultYawOffset: 0,
    },
    {
        name: "Octo Flat X",
        model: "custom",
        image: "octo_flat_x",
        defaultMotorOrder: [5, 1, 4, 0, 7, 3, 6, 2],
        defaultYawOffset: Math.PI / 8,
    },
    { name: "Airplane", model: "custom", image: "airplane", defaultMotorOrder: [0], defaultYawOffset: 0 },
    { name: "Heli 120", model: "custom", image: "custom", defaultMotorOrder: [0], defaultYawOffset: 0 },
    { name: "Heli 90", model: "custom", image: "custom", defaultMotorOrder: [0], defaultYawOffset: 0 },
    {
        name: "V-tail Quad",
        model: "quad_vtail",
        image: "vtail_quad",
        defaultMotorOrder: [1, 3, 2, 0],
        defaultYawOffset: Math.PI / 4,
    },
    { name: "Hex H", model: "custom", image: "custom", defaultMotorOrder: [4, 1, 3, 5, 2, 0], defaultYawOffset: 0 },
    { name: "PPM to SERVO", model: "custom", image: "custom", defaultMotorOrder: [0], defaultYawOffset: 0 },
    { name: "Dualcopter", model: "custom", image: "custom", defaultMotorOrder: [0, 1], defaultYawOffset: 0 },
    { name: "Singlecopter", model: "custom", image: "custom", defaultMotorOrder: [0], defaultYawOffset: 0 },
    {
        name: "A-tail Quad",
        model: "quad_atail",
        image: "atail_quad",
        defaultMotorOrder: [1, 3, 2, 0],
        defaultYawOffset: Math.PI / 4,
    },
    { name: "Custom", model: "custom", image: "custom", defaultMotorOrder: [0], defaultYawOffset: 0 },
    { name: "Custom Airplane", model: "custom", image: "custom", defaultMotorOrder: [0], defaultYawOffset: 0 },
    {
        name: "Custom Tricopter",
        model: "custom",
        image: "custom",
        defaultMotorOrder: [0, 1, 2],
        defaultYawOffset: -Math.PI / 2,
    },
];

/** A craft drawn with a chosen mixer's motor order, instead of the log's own. */
export interface CustomMix {
    /** Motor index for each position of the mixer's diagram. */
    motorOrder: number[];
    yawOffset: number;
}

/** An overlay's place on the graph; every value is a CSS percentage. */
export interface OverlayPosition {
    left: string;
    top: string;
}

export interface SizedOverlay extends OverlayPosition {
    size: string;
}

export interface UserSettings {
    /** 1-based index into mixerList. */
    mixerConfiguration: number;
    customMix: CustomMix | null;
    stickMode: number;
    stickUnits: boolean;
    stickTrails: boolean;
    stickInvertYaw: boolean;
    legendUnits: boolean;
    /** 1 m/s, 2 kph, 3 mph. */
    speedUnits: number;
    /** 1 metres, 2 feet. */
    altitudeUnits: number;
    darkMode: number;
    gapless: boolean;
    /** "3D" by default; the toolbar toggle stores a boolean. Read for truthiness. */
    drawCraft: string | boolean;
    hasCraft: boolean;
    drawPidTable: boolean;
    drawSticks: boolean;
    drawTime: boolean;
    drawEvents: boolean;
    drawAnalyser: boolean;
    drawWatermark: boolean;
    drawLapTimer: boolean;
    drawGradient: boolean;
    drawVerticalBar: boolean;
    graphSmoothOverride: boolean;
    graphExpoOverride: boolean;
    graphGridOverride: boolean;
    analyserSampleRate: number;
    analyserHanning: boolean;
    eraseBackground: boolean;
    spectrumType: number;
    overdrawSpectrumType: number;
    psdHeatmapMin: number;
    psdHeatmapMax: number;
    /** Not in the defaults: unset until the user sets it in the dialog. */
    mapTrailAltitudeColored?: boolean;
    craft: SizedOverlay;
    sticks: SizedOverlay;
    analyser: SizedOverlay;
    analyser_legend: OverlayPosition & { width: string };
    map: SizedOverlay;
    flight3d: OverlayPosition & { width: string; height: string };
    /** `logo` is a data URL, or null for none. */
    watermark: SizedOverlay & { transparency: string; logo: string | null };
    laptimer: OverlayPosition & { transparency: string };
}

// Default user settings — used as baseline before user overrides
export const defaultUserSettings: UserSettings = {
    mixerConfiguration: 3,
    customMix: null,
    stickMode: 2,
    stickUnits: false,
    stickTrails: false,
    stickInvertYaw: false,
    legendUnits: true,
    speedUnits: 1,
    altitudeUnits: 1,
    darkMode: 2,
    gapless: false,
    drawCraft: "3D",
    hasCraft: true,
    drawPidTable: true,
    drawSticks: true,
    drawTime: true,
    drawEvents: true,
    drawAnalyser: true,
    drawWatermark: false,
    drawLapTimer: false,
    drawGradient: false,
    drawVerticalBar: true,
    graphSmoothOverride: true,
    graphExpoOverride: true,
    graphGridOverride: true,
    analyserSampleRate: 2000,
    analyserHanning: true,
    eraseBackground: true,
    spectrumType: 0,
    overdrawSpectrumType: 0,
    psdHeatmapMin: -40,
    psdHeatmapMax: 10,
    craft: { left: "15%", top: "48%", size: "40%" },
    sticks: { left: "75%", top: "20%", size: "30%" },
    analyser: { left: "2%", top: "60%", size: "35%" },
    analyser_legend: { left: "88%", top: "7%", width: "10%" },
    map: { left: "2%", top: "5%", size: "35%" },
    flight3d: { left: "2%", top: "5%", width: "35%", height: "45%" },
    watermark: { left: "3%", top: "90%", size: "100%", transparency: "100%", logo: null },
    laptimer: { left: "5%", top: "50%", transparency: "40%" },
};
