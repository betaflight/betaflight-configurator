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

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { get as getConfig } from "./ConfigStorage";
import { CanvasRenderer } from "./utils/three/CanvasRenderer";
import { useFlightControllerStore } from "../stores/fc";

export interface Mixer {
    name: string;
    /** 0-based; the FC's 1-based mixer index is pos + 1. */
    pos: number;
    /** GLTF stem under resources/models/, or "custom". */
    model: string;
    image: string;
    motors: number;
    servos: boolean;
}

// generate mixer
export const mixerList: Mixer[] = [
    { name: "Tricopter", pos: 0, model: "tricopter", image: "tri", motors: 3, servos: true },
    { name: "Quad +", pos: 1, model: "quad_x", image: "quad_p", motors: 4, servos: false },
    { name: "Quad X", pos: 2, model: "quad_x", image: "quad_x", motors: 4, servos: false },
    { name: "Bicopter", pos: 3, model: "custom", image: "bicopter", motors: 2, servos: true },
    { name: "Gimbal", pos: 4, model: "custom", image: "custom", motors: 0, servos: true },
    { name: "Y6", pos: 5, model: "y6", image: "y6", motors: 6, servos: false },
    { name: "Hex +", pos: 6, model: "hex_plus", image: "hex_p", motors: 6, servos: false },
    { name: "Flying Wing", pos: 7, model: "custom", image: "flying_wing", motors: 1, servos: true },
    { name: "Y4", pos: 8, model: "y4", image: "y4", motors: 4, servos: false },
    { name: "Hex X", pos: 9, model: "hex_x", image: "hex_x", motors: 6, servos: false },
    { name: "Octo X8", pos: 10, model: "custom", image: "octo_x8", motors: 8, servos: false },
    { name: "Octo Flat +", pos: 11, model: "custom", image: "octo_flat_p", motors: 8, servos: false },
    { name: "Octo Flat X", pos: 12, model: "custom", image: "octo_flat_x", motors: 8, servos: false },
    { name: "Airplane", pos: 13, model: "airplane", image: "airplane", motors: 1, servos: true },
    { name: "Heli 120", pos: 14, model: "custom", image: "custom", motors: 1, servos: true },
    { name: "Heli 90", pos: 15, model: "custom", image: "custom", motors: 0, servos: true },
    { name: "V-tail Quad", pos: 16, model: "quad_vtail", image: "vtail_quad", motors: 4, servos: false },
    { name: "Hex H", pos: 17, model: "custom", image: "custom", motors: 6, servos: false },
    { name: "PPM to SERVO", pos: 18, model: "custom", image: "custom", motors: 0, servos: true },
    { name: "Dualcopter", pos: 19, model: "custom", image: "custom", motors: 2, servos: true },
    { name: "Singlecopter", pos: 20, model: "custom", image: "custom", motors: 1, servos: true },
    { name: "A-tail Quad", pos: 21, model: "quad_atail", image: "atail_quad", motors: 4, servos: false },
    { name: "Custom", pos: 22, model: "custom", image: "custom", motors: 0, servos: false },
    { name: "Custom Airplane", pos: 23, model: "custom", image: "custom", motors: 1, servos: true },
    { name: "Custom Tricopter", pos: 24, model: "custom", image: "custom", motors: 3, servos: true },
    { name: "Quad X 1234", pos: 25, model: "quad_x", image: "quad_x_1234", motors: 4, servos: false },
    { name: "Octo X8 +", pos: 26, model: "custom", image: "custom", motors: 8, servos: false },
    //{ name: "Car", pos: 27, model: "car", image: "car", motors: 1, servos: true }, //  reserved for upcoming feature work
];

/**
 * GLTF stem for the attitude/preview mesh.
 *
 * Built-in mixers map 1:1. Custom Airplane / Custom Tricopter get their craft
 * meshes explicitly. Only the generic Custom entry (pos 22) may infer a mesh
 * from FC motor count — other `model: "custom"` layouts (Flying Wing, Hex H,
 * octo variants, …) keep the fallback block so a coincidental motor count does
 * not pick the wrong craft.
 *
 * @param mixerIndex - mixerConfig.mixer (1-based); defaults to the connected FC's
 * @param motorCount - motorConfig.motor_count; defaults to the connected FC's
 * @returns gltf basename under resources/models/
 */
export function resolveMixerModelFile(mixerIndex?: number | null, motorCount?: number | null): string {
    let index = mixerIndex;
    let motors = motorCount;
    if (index == null || motors == null) {
        const fcStore = useFlightControllerStore();
        index ??= fcStore.mixerConfig?.mixer;
        motors ??= fcStore.motorConfig?.motor_count ?? 0;
    }
    // An unset index (undefined - 1 is NaN) finds no entry, as does 0.
    const entry = mixerList[(index ?? 0) - 1];

    if (!entry) {
        return "fallback";
    }

    if (entry.model !== "custom") {
        return entry.model;
    }

    // Dedicated custom variants: prefer the craft type over a motor-count guess.
    if (entry.pos === 24) {
        return "tricopter";
    }
    if (entry.pos === 23) {
        return "airplane";
    }

    // Motor-count inference is only for generic Custom (e.g. deadcat mmix).
    if (entry.pos !== 22) {
        return "fallback";
    }

    switch (motors) {
        case 4:
            return "quad_x";
        case 3:
            return "tricopter";
        case 6:
            return "hex_x";
        case 1:
            return "airplane";
        default:
            return "fallback";
    }
}

function getContentBoxSize(element: HTMLElement): { width: number; height: number } {
    const style = globalThis.getComputedStyle(element);
    const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    const paddingY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    return {
        width: element.clientWidth - paddingX,
        height: element.clientHeight - paddingY,
    };
}

/** What Model needs from WebGLRenderer and the fallback CanvasRenderer alike. */
interface ModelRenderer {
    setSize(width: number, height: number): void;
    render(scene: THREE.Scene, camera: THREE.Camera): void;
    forceContextLoss?(): void;
    dispose?(): void;
}

/** The pre-r125 THREE.Geometry shape optimizeGeometryForCanvas() was written against. */
interface LegacyFace {
    a: number;
    b: number;
    c: number;
    clone(): LegacyFace;
}

interface LegacyGeometry {
    vertices: THREE.Vector3[];
    faces: LegacyFace[];
    mergeVertices(): void;
    computeBoundingSphere(): void;
    computeFaceNormals(): void;
}

// 3D model
class Model {
    // Configure model detail level (1-10, where 1 is lowest detail and 10 is highest)
    detailTolerance = 10; // Default value, can be modified

    readonly useWebGLRenderer: boolean;
    readonly wrapper: HTMLElement;
    readonly canvas: HTMLCanvasElement;
    renderer: ModelRenderer | null;
    readonly scene: THREE.Scene;
    readonly modelWrapper: THREE.Object3D;
    readonly camera: THREE.PerspectiveCamera;
    model?: THREE.Object3D | null;
    private _lastPct?: number;

    constructor(wrapper: HTMLElement, canvas: HTMLCanvasElement) {
        this.useWebGLRenderer = this.canUseWebGLRenderer();

        this.wrapper = wrapper;
        this.canvas = canvas;

        if (this.useWebGLRenderer) {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                alpha: true,
                antialias: true, // enable or disable antialiasing for performance
            });
        } else {
            console.log("Starting in low performance rendering mode");
            this.renderer = new CanvasRenderer({
                canvas: this.canvas,
                alpha: true,
            });
        }

        const { width, height } = getContentBoxSize(this.wrapper);
        this.renderer.setSize(width, height);

        const model_file = resolveMixerModelFile();

        // Setup scene
        this.scene = new THREE.Scene();
        this.modelWrapper = new THREE.Object3D();

        // Stationary camera
        this.camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000);
        // move camera away from the model
        this.camera.position.z = 125;

        // Setup lights
        const light = new THREE.AmbientLight(0x404040);
        const light2 = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 1.5);
        light2.position.set(0, 1, 0);

        // Add objects to scene
        this.scene.add(light);
        this.scene.add(light2);
        this.scene.add(this.camera);
        this.scene.add(this.modelWrapper);

        this.loadGLTF(model_file, (model) => {
            this.model = model;

            // Apply canvas renderer optimizations if needed
            if (!this.useWebGLRenderer) {
                this.applyCanvasRendererOptimizations();
            }

            // A failed load passes null; Object3D.add() logs and ignores it.
            this.modelWrapper.add(model as THREE.Object3D);
            this.scene.add(this.modelWrapper);

            this.render();
        });
    }

    loadGLTF(model_file: string, callback: (model: THREE.Object3D | null) => void): void {
        const loader = new GLTFLoader();
        loader.load(
            `./resources/models/${model_file}.gltf`,
            (gltf) => {
                const model = gltf.scene;
                model.scale.set(15, 15, 15);
                callback(model);
            },
            (progress) => {
                // Optional: Handle loading progress
                if (progress.total > 0) {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    if (pct !== this._lastPct) {
                        // throttle identical values
                        this._lastPct = pct;
                        console.log(`Loading progress: ${progress.loaded}/${progress.total} (${pct}%)`);
                    }
                } else {
                    console.log(`Loading progress: ${progress.loaded} bytes`);
                }
            },
            (error) => {
                console.error("Error loading model:", error);
                // Fallback to a default model or show error to user
                callback(null);
            },
        );
    }

    optimizeGeometry(geometry: LegacyGeometry): void {
        if (!this.useWebGLRenderer) {
            this.optimizeGeometryForCanvas(geometry);
        }
    }

    createModel(geometry: THREE.BufferGeometry, materials: THREE.Material | THREE.Material[]): THREE.Mesh {
        const model = new THREE.Mesh(geometry, materials);
        model.scale.set(15, 15, 15);
        return model;
    }

    optimizeGeometryForCanvas(geometry: LegacyGeometry): void {
        // Aggressive geometry optimizations for Canvas renderer
        geometry.mergeVertices();

        const tolerance = this.detailTolerance; // Use the configurable tolerance
        const vertexMap: Record<string, number> = {};
        const uniqueVertices: THREE.Vector3[] = [];
        const updatedFaces: LegacyFace[] = [];

        geometry.vertices.forEach((vertex) => {
            // Round coordinates with configurable tolerance
            const key = [
                Math.round(vertex.x * tolerance) / tolerance,
                Math.round(vertex.y * tolerance) / tolerance,
                Math.round(vertex.z * tolerance) / tolerance,
            ].join(",");

            if (vertexMap[key] === undefined) {
                vertexMap[key] = uniqueVertices.length;
                uniqueVertices.push(vertex);
            }
        });

        // Update faces to use new vertex indices
        geometry.faces.forEach((face) => {
            const v1 = geometry.vertices[face.a];
            const v2 = geometry.vertices[face.b];
            const v3 = geometry.vertices[face.c];

            const key1 = [
                Math.round(v1.x * tolerance) / tolerance,
                Math.round(v1.y * tolerance) / tolerance,
                Math.round(v1.z * tolerance) / tolerance,
            ].join(",");
            const key2 = [
                Math.round(v2.x * tolerance) / tolerance,
                Math.round(v2.y * tolerance) / tolerance,
                Math.round(v2.z * tolerance) / tolerance,
            ].join(",");
            const key3 = [
                Math.round(v3.x * tolerance) / tolerance,
                Math.round(v3.y * tolerance) / tolerance,
                Math.round(v3.z * tolerance) / tolerance,
            ].join(",");

            // Only keep faces that have three different vertices
            if (
                vertexMap[key1] !== vertexMap[key2] &&
                vertexMap[key2] !== vertexMap[key3] &&
                vertexMap[key1] !== vertexMap[key3]
            ) {
                const newFace = face.clone();
                newFace.a = vertexMap[key1];
                newFace.b = vertexMap[key2];
                newFace.c = vertexMap[key3];
                updatedFaces.push(newFace);
            }
        });

        // Update geometry with simplified data
        geometry.vertices = uniqueVertices;
        geometry.faces = updatedFaces;

        geometry.computeBoundingSphere();
        geometry.computeFaceNormals();
    }

    canUseWebGLRenderer(): boolean {
        // webgl capability detector
        // it would seem the webgl "enabling" through advanced settings will be ignored in the future
        // and webgl will be supported if gpu supports it by default (canary 40.0.2175.0), keep an eye on this one
        const detector_canvas = document.createElement("canvas");
        const isWebGLSupported =
            globalThis.WebGLRenderingContext &&
            (detector_canvas.getContext("webgl") || detector_canvas.getContext("experimental-webgl"));
        const { useLegacyRenderingModel } = getConfig("useLegacyRenderingModel");
        return Boolean(isWebGLSupported) && !useLegacyRenderingModel;
    }

    rotateTo(x: number, y: number, z: number): void {
        if (!this.model) {
            return;
        }

        this.model.rotation.x = x;
        this.modelWrapper.rotation.y = y;
        this.model.rotation.z = z;

        this.render();
    }

    rotateBy(x: number, y: number, z: number): void {
        if (!this.model) {
            return;
        }

        this.model.rotateX(x);
        this.model.rotateY(y);
        this.model.rotateZ(z);

        this.render();
    }

    render(): void {
        if (!this.model) {
            return;
        }

        if (!this.useWebGLRenderer) {
            this.applyCullingOptimizations();
        }

        this.updateMatrices();
        this.performRender();
    }

    applyCullingOptimizations(): void {
        const model = this.model as THREE.Object3D & { material?: THREE.Material };
        const modelForward = new THREE.Vector3(0, 0, 1);
        modelForward.applyQuaternion(model.quaternion);
        const dot = modelForward.dot(new THREE.Vector3(0, 0, 1));
        const cullBackFaces = dot > 0;

        if (model.material) {
            model.material.side = cullBackFaces ? THREE.FrontSide : THREE.DoubleSide;
        }
    }

    updateMatrices(): void {
        this.model!.updateMatrix();
        this.model!.updateMatrixWorld();
        this.modelWrapper.updateMatrix();
        this.modelWrapper.updateMatrixWorld();
    }

    performRender(): void {
        this.renderer!.render(this.scene, this.camera);
    }

    // handle canvas resize
    resize(): void {
        const { width, height } = getContentBoxSize(this.wrapper);
        this.renderer!.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.render();
    }

    dispose(): void {
        if (this.renderer) {
            if (this.renderer.forceContextLoss) {
                this.renderer.forceContextLoss();
            }
            if (this.renderer.dispose) {
                this.renderer.dispose();
            }
            this.renderer = null;
        }
    }

    applyCanvasRendererOptimizations(): void {
        // Camera optimizations
        this.camera.matrixAutoUpdate = false;
        this.camera.updateMatrix();
        this.camera.updateMatrixWorld();

        // Model and wrapper optimizations
        if (this.model) {
            this.model.matrixAutoUpdate = false;
            this.model.frustumCulled = false;
            this.model.renderOrder = 0;
        }

        this.modelWrapper.matrixAutoUpdate = false;
        this.modelWrapper.updateMatrix();
        this.modelWrapper.updateMatrixWorld();

        // Light optimizations
        this.scene.children.forEach((child) => {
            if ((child as THREE.Light).isLight) {
                child.matrixAutoUpdate = false;
                child.updateMatrix();
            }
        });
    }
}

export default Model;
