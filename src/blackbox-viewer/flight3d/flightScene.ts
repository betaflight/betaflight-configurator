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

import {
    AmbientLight,
    Box3,
    BufferGeometry,
    Color,
    DirectionalLight,
    Float32BufferAttribute,
    GridHelper,
    Group,
    Line,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    Quaternion,
    Scene,
    SphereGeometry,
    Vector3,
    WebGLRenderer,
} from "three";
import type { Material, Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ALTITUDE_TRAIL_COLORS } from "../graph_map.js";
import { upperBound, type FlightTrack, type TrackPoint } from "./flightTrack";
import { buildGround, TILE_SOURCES, type Ground, type GroundSourceId } from "./tileGround";

const CURTAIN_EVERY_US = 2_000_000;
const DRONE_SCALE = 0.12; // drone width as a fraction of the camera distance
const PICK_RADIUS_PX = 10;
const droneBounds = new Box3();
// Shown instead of the quad for logs without the FC's attitude: a sphere has no nose to point the
// wrong way. Radius in drone units, where the quad model is about 1 wide.
const MARKER_RADIUS = 0.15;

// The quad model shown on the Setup tab. It is about 8 units wide with its nose on -Z; the
// scene's drone frame has the nose on +x, so the model is turned -90° about the vertical.
const DRONE_MODEL_URL = "./resources/models/quad_x.gltf";
const DRONE_MODEL_SCALE = 1 / 8;
const DRONE_MODEL_YAW = -Math.PI / 2;

const GRADIENT = ALTITUDE_TRAIL_COLORS.map(({ color }) => new Color(color.slice(0, 7)));

function altitudeColor(fraction: number, out: Color): Color {
    const x = Math.min(1, Math.max(0, fraction)) * (GRADIENT.length - 1);
    const i = Math.min(GRADIENT.length - 2, Math.floor(x));
    return out.copy(GRADIENT[i]).lerp(GRADIENT[i + 1], x - i);
}

/** Three.js view of one flight: path, altitude curtain, map ground and the drone. */
export class FlightScene {
    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(50, 1, 0.5, 20000);
    private readonly controls: OrbitControls;
    private readonly drone = new Group();
    private readonly marker = new Mesh(
        new SphereGeometry(MARKER_RADIUS, 16, 12),
        new MeshBasicMaterial({ color: GRADIENT[GRADIENT.length - 1] }),
    );
    private model: Object3D | null = null;
    private hasAttitude = false;
    private readonly trackObjects = new Group();
    private track: FlightTrack | null = null;
    private traveled: LineSegmentsGeometry | null = null;
    /** segmentsBefore[i]: drawn path segments that start before sample i. */
    private segmentsBefore = new Uint32Array(0);
    private ground: Ground | null = null;
    private belowMap = false;
    private groundSource: GroundSourceId = "map";
    private follow = false;
    private renderFrame: number | null = null;
    private active = true;
    private disposed = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.maxPolarAngle = Math.PI * 0.49; // keep the camera above the ground
        this.controls.addEventListener("change", () => this.requestRender());

        const sun = new DirectionalLight(0xffffff, 1.5);
        sun.position.set(1, 3, 2);
        this.scene.add(new AmbientLight(0xffffff, 1), sun);

        this.drone.visible = false;
        this.drone.add(this.marker);
        this.scene.add(this.trackObjects, this.drone);
        new GLTFLoader().load(DRONE_MODEL_URL, (gltf) => {
            const model = gltf.scene;
            if (this.disposed) {
                model.traverse(disposeObject);
                return;
            }
            model.scale.setScalar(DRONE_MODEL_SCALE);
            model.rotation.y = DRONE_MODEL_YAW;
            this.model = model;
            this.drone.add(model);
            this.showDroneShape();
            this.requestRender();
        });
    }

    setTrack(track: FlightTrack | null): void {
        this.clearTrack();
        this.track = track;
        if (!track) {
            this.requestRender();
            return;
        }

        const { samples, gapAfter, groundU } = track;
        const span = Math.max(1, track.bounds.maxU - groundU);
        const positions: number[] = [];
        const colors: number[] = [];
        const color = new Color();
        this.segmentsBefore = new Uint32Array(samples.length + 1);
        let segments = 0;
        for (let i = 0; i < samples.length; i++) {
            this.segmentsBefore[i] = segments;
            if (i === samples.length - 1 || gapAfter[i]) {
                continue;
            }
            for (const s of [samples[i], samples[i + 1]]) {
                positions.push(s.n, s.u, s.e);
                altitudeColor((s.u - groundU) / span, color);
                colors.push(color.r, color.g, color.b);
            }
            segments++;
        }
        this.segmentsBefore[samples.length] = segments;

        const full = new LineSegmentsGeometry().setPositions(positions).setColors(colors);
        this.traveled = new LineSegmentsGeometry().setPositions(positions).setColors(colors);
        this.trackObjects.add(
            new LineSegments2(
                full,
                new LineMaterial({ linewidth: 2, vertexColors: true, transparent: true, opacity: 0.35 }),
            ),
            new LineSegments2(this.traveled, new LineMaterial({ linewidth: 4, vertexColors: true })),
        );

        const curtain: number[] = [];
        const curtainColors: number[] = [];
        let nextCurtainUs = -Infinity;
        for (const s of samples) {
            if (s.tUs < nextCurtainUs) {
                continue;
            }
            nextCurtainUs = s.tUs + CURTAIN_EVERY_US;
            altitudeColor((s.u - groundU) / span, color);
            curtain.push(s.n, s.u, s.e, s.n, groundU, s.e);
            curtainColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
        const curtainGeometry = new BufferGeometry();
        curtainGeometry.setAttribute("position", new Float32BufferAttribute(curtain, 3));
        curtainGeometry.setAttribute("color", new Float32BufferAttribute(curtainColors, 3));
        this.trackObjects.add(
            new LineSegments(
                curtainGeometry,
                new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.25 }),
            ),
        );

        const { minN, maxN, minE, maxE } = track.bounds;
        const extent = Math.max(maxN - minN, maxE - minE, 50);
        const grid = new GridHelper(extent * 1.6, 16);
        grid.material.transparent = true;
        grid.material.opacity = 0.2;
        grid.material.depthWrite = false;
        grid.position.set((minN + maxN) / 2, groundU - 0.05, (minE + maxE) / 2);
        this.trackObjects.add(grid);

        this.buildGround();
        this.frameTrack();
        this.setTime(samples[0].tUs, null);
    }

    setGroundSource(source: GroundSourceId): void {
        this.groundSource = source;
        this.buildGround();
        this.requestRender();
    }

    /**
     * Move the craft to `tUs` and highlight the path flown so far. With the FC's attitude the quad
     * is drawn; without one (null), a position marker. Returns the craft position, if known.
     */
    setTime(tUs: number, attitude: Quaternion | null): TrackPoint | null {
        const track = this.track;
        if (!this.active || !track || !this.traveled) {
            return null;
        }
        this.traveled.instanceCount = this.segmentsBefore[upperBound(track.samples, tUs)];

        const position = track.positionAt(tUs);
        this.drone.visible = !!position;
        if (position) {
            this.drone.position.set(position.n, position.u, position.e);
            if (attitude) {
                this.drone.quaternion.copy(attitude);
            }
            this.hasAttitude = !!attitude;
            this.showDroneShape();
            if (this.follow) {
                const delta = this.drone.position.clone().sub(this.controls.target);
                this.controls.target.add(delta);
                this.camera.position.add(delta);
                this.controls.update();
            }
        }
        this.requestRender();
        return position;
    }

    setFollow(enabled: boolean): void {
        this.follow = enabled;
    }

    /** Log time of the path sample drawn nearest to a click, within a few pixels. */
    pickTime(clientX: number, clientY: number): number | null {
        const track = this.track;
        if (!track) {
            return null;
        }
        const rect = this.canvas.getBoundingClientRect();
        const v = new Vector3();
        let best: number | null = null;
        let bestDistance = PICK_RADIUS_PX;
        this.camera.updateMatrixWorld();
        for (const s of track.samples) {
            v.set(s.n, s.u, s.e).project(this.camera);
            if (v.z > 1) {
                continue; // behind the camera
            }
            const x = rect.left + ((v.x + 1) / 2) * rect.width;
            const y = rect.top + ((1 - v.y) / 2) * rect.height;
            const d = Math.hypot(x - clientX, y - clientY);
            if (d < bestDistance) {
                bestDistance = d;
                best = s.tUs;
            }
        }
        return best;
    }

    resize(width: number, height: number): void {
        if (this.disposed || !this.active || width <= 0 || height <= 0) {
            return;
        }
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.requestRender();
    }

    dispose(): void {
        this.disposed = true;
        this.cancelRender();
        this.clearTrack();
        this.controls.dispose();
        this.drone.traverse(disposeObject);
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }

    setActive(active: boolean): void {
        this.active = active;
        if (active) {
            this.requestRender();
        } else {
            this.cancelRender();
        }
    }

    /** The quad once loaded and oriented by the FC's attitude; the marker otherwise. */
    private showDroneShape(): void {
        const quad = this.hasAttitude && this.model !== null;
        this.marker.visible = !quad;
        if (this.model) {
            this.model.visible = quad;
        }
    }

    private disposeGround(): void {
        this.ground?.dispose();
        this.ground?.group.removeFromParent();
        this.ground = null;
    }

    private buildGround(): void {
        this.disposeGround();
        const track = this.track;
        if (!track || this.groundSource === "none") {
            return;
        }
        this.ground = buildGround({
            box: track.box,
            source: TILE_SOURCES[this.groundSource],
            groundU: track.groundU,
            toLocal: (lat, lon) => track.toLocal(lat, lon, track.origin.altM),
            onTileLoaded: () => this.requestRender(),
        });
        this.ground.setTranslucent(this.belowMap);
        this.scene.add(this.ground.group);
    }

    /** See-through map while any part of the drone, as drawn (on-screen size, tilt), is below it. */
    private updateBelowMap(): void {
        const groundU = this.track?.groundU;
        if (groundU === undefined || !this.drone.visible) {
            this.setBelowMap(false);
            return;
        }
        this.drone.updateWorldMatrix(false, true);
        this.setBelowMap(droneBounds.setFromObject(this.model?.visible ? this.model : this.marker).min.y < groundU);
    }

    private setBelowMap(below: boolean): void {
        if (below !== this.belowMap) {
            this.belowMap = below;
            this.ground?.setTranslucent(below);
        }
    }

    private frameTrack(): void {
        const { minN, maxN, minE, maxE, minU, maxU } = this.track!.bounds;
        const low = Math.min(minU, this.track!.groundU);
        const high = Math.max(maxU, this.track!.groundU);
        const center = new Vector3((minN + maxN) / 2, (high + low) / 2, (minE + maxE) / 2);
        const distance = Math.max(maxN - minN, maxE - minE, high - low, 50) * 1.5;
        this.controls.target.copy(center);
        this.camera.position.copy(center).add(new Vector3(-0.8 * distance, 0.6 * distance, -0.3 * distance));
        this.camera.far = Math.max(20000, distance * 20);
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    private clearTrack(): void {
        this.trackObjects.traverse(disposeObject);
        this.trackObjects.clear();
        this.disposeGround();
        this.traveled = null;
        this.track = null;
        this.belowMap = false;
        this.drone.visible = false;
    }

    private cancelRender(): void {
        if (this.renderFrame !== null) {
            cancelAnimationFrame(this.renderFrame);
            this.renderFrame = null;
        }
    }

    /** Draw once on the next frame. Nothing is drawn while the view, time and tiles are unchanged. */
    private requestRender(): void {
        if (this.renderFrame !== null || this.disposed || !this.active) {
            return;
        }
        this.renderFrame = requestAnimationFrame(() => {
            this.renderFrame = null;
            if (this.disposed) {
                return;
            }
            // Keep the drone a constant size on screen at any zoom.
            this.drone.scale.setScalar(this.camera.position.distanceTo(this.drone.position) * DRONE_SCALE);
            this.updateBelowMap();
            this.renderer.render(this.scene, this.camera);
        });
    }
}

function disposeObject(object: Object3D): void {
    // Line covers LineSegments and GridHelper; Mesh covers LineSegments2 and the drone model.
    if (object instanceof Mesh || object instanceof Line) {
        object.geometry.dispose();
        const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            material.dispose();
        }
    }
}
