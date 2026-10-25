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
 * Types for the vendored CanvasRenderer.js, which stays JavaScript (#5542): it is a copy of
 * three.js code that upstream removed, kept close to that source rather than rewritten.
 * TypeScript resolves this file in place of the .js, so the renderer stays typed once
 * `allowJs` is off. Projector.js is only imported by the renderer and needs no types.
 */

import type { Camera, Color, ColorRepresentation, Material, MaterialParameters, Scene } from "three";

export interface SpriteCanvasMaterialParameters extends MaterialParameters {
    color?: ColorRepresentation;
    rotation?: number;
    program?: (context: CanvasRenderingContext2D) => void;
}

/** A sprite material drawn by a callback on the 2D context. */
export class SpriteCanvasMaterial extends Material {
    constructor(parameters?: SpriteCanvasMaterialParameters);
    color: Color;
    rotation: number;
    program: (context: CanvasRenderingContext2D) => void;
    clone(): this;
}

export interface CanvasRendererParameters {
    canvas?: HTMLCanvasElement;
    alpha?: boolean;
}

/** Renders a scene with the 2D canvas API: the fallback when WebGL is unavailable. */
export class CanvasRenderer {
    constructor(parameters?: CanvasRendererParameters);

    domElement: HTMLCanvasElement;
    autoClear: boolean;
    sortObjects: boolean;
    sortElements: boolean;
    info: { render: { vertices: number; faces: number } };

    getContext(): CanvasRenderingContext2D;
    getContextAttributes(): CanvasRenderingContext2DSettings;
    getPixelRatio(): number;
    setPixelRatio(value?: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setViewport(x: number, y: number, width: number, height: number): void;
    setScissor(): void;
    setScissorTest(): void;
    setClearColor(color: ColorRepresentation, alpha?: number): void;
    /** @deprecated Use setClearColor(). */
    setClearColorHex(hex: number, alpha?: number): void;
    getClearColor(): Color;
    getClearAlpha(): number;
    getMaxAnisotropy(): number;
    clear(): void;
    clearColor(): void;
    clearDepth(): void;
    clearStencil(): void;
    render(scene: Scene, camera: Camera): void;
}
