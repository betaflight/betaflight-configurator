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

import { useSettingsStore } from "./stores/settings";
import type { FlightLog, LogFrame } from "./flightlog";

const // Sets the distance between the center point and the center of the motor mount
    ARM_LENGTH = 1,
    NUM_PROP_LEVELS = 100,
    HUB_RADIUS = ARM_LENGTH * 0.3,
    CRAFT_DEPTH = ARM_LENGTH * 0.08,
    ARROW_DEPTH = CRAFT_DEPTH * 0.5;

/** One geometry per throttle level: empty at level 0, then a widening wedge up to the full disc. */
function buildPropGeometry(propRadius: number): THREE.BufferGeometry[] {
    const props: THREE.BufferGeometry[] = new Array(NUM_PROP_LEVELS),
        extrudeSettings = {
            depth: 0.1 * propRadius,
            steps: 1,
            bevelEnabled: false,
        };

    for (let i = 0; i < NUM_PROP_LEVELS; i++) {
        if (i === 0) {
            props[i] = new THREE.BufferGeometry();
        } else {
            const shape = new THREE.Shape(),
                isFullDisc = i === NUM_PROP_LEVELS - 1;

            // Two things make the full disc different from the wedges below it: it must not get
            // the centre point, or the contour doubles back on itself, and its sweep has to be
            // exactly a turn, because 2 * PI * i / i lands one ULP over and self-intersects.
            // Either one extrudes to an empty geometry, so the props render as nothing.
            if (!isFullDisc) {
                shape.moveTo(0, 0);
            }
            shape.absarc(0, 0, propRadius, 0, isFullDisc ? Math.PI * 2 : (Math.PI * 2 * i) / (NUM_PROP_LEVELS - 1));

            props[i] = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        }
    }

    return props;
}

// Build a direction arrow to go on top of the craft
function buildArrow(arrowMaterial: THREE.Material): THREE.Mesh {
    const ARROW_STALK_RADIUS = HUB_RADIUS * 0.15,
        ARROW_STALK_LENGTH = HUB_RADIUS * 0.8,
        ARROW_HEAD_RADIUS = HUB_RADIUS * 0.55,
        ARROW_HEAD_LENGTH = HUB_RADIUS * 0.55,
        ARROW_LENGTH = ARROW_STALK_LENGTH + ARROW_HEAD_LENGTH;

    const shape = new THREE.Shape(),
        offset = -ARROW_LENGTH / 2;

    shape.moveTo(-ARROW_STALK_RADIUS, 0 + offset);
    shape.lineTo(-ARROW_STALK_RADIUS, ARROW_STALK_LENGTH + offset);
    shape.lineTo(-ARROW_HEAD_RADIUS, ARROW_STALK_LENGTH + offset);
    shape.lineTo(0, ARROW_LENGTH + offset);
    shape.lineTo(ARROW_HEAD_RADIUS, ARROW_STALK_LENGTH + offset);
    shape.lineTo(ARROW_STALK_RADIUS, ARROW_STALK_LENGTH + offset);
    shape.lineTo(ARROW_STALK_RADIUS, 0 + offset);

    const extrudeSettings = {
            depth: ARROW_DEPTH,
            steps: 1,
            bevelEnabled: false,
        },
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings),
        arrowMesh = new THREE.Mesh(geometry, arrowMaterial);

    return arrowMesh;
}

function buildCraft(numMotors: number, craftMaterial: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape(),
        ARM_WIDTH_RADIANS = 0.15,
        //How much wider is the motor mount than the arm
        MOTOR_MOUNT_WIDTH_RATIO = 2,
        //What portion of the arm length is motor mount
        MOTOR_MOUNT_LENGTH_RATIO = 0.1,
        //What portion of the arm length is the bevel at the beginning and end of the motor mount
        MOTOR_BEVEL_DEPTH_RATIO = 0.04,
        ARM_WIDTH = 2 * Math.sin(ARM_WIDTH_RADIANS) * HUB_RADIUS;

    for (let i = 0; i < numMotors; i++) {
        const armStart = (i / numMotors) * Math.PI * 2 - ARM_WIDTH_RADIANS,
            armEnd = armStart + ARM_WIDTH_RADIANS * 2;

        if (i === 0) {
            shape.moveTo(Math.cos(armStart) * HUB_RADIUS, Math.sin(armStart) * HUB_RADIUS);
        } else {
            shape.lineTo(Math.cos(armStart) * HUB_RADIUS, Math.sin(armStart) * HUB_RADIUS);
        }

        // Unit vector pointing through the center of the arm
        let armVectorX = Math.cos(armStart + ARM_WIDTH_RADIANS);
        let armVectorY = Math.sin(armStart + ARM_WIDTH_RADIANS);
        // Vector at right angles scaled for the arm width
        const crossArmX = -armVectorY * ARM_WIDTH * 0.5;
        const crossArmY = armVectorX * ARM_WIDTH * 0.5;
        const armPoints = [
            // Make the first part of the arms parallel by spacing the ends the same amount as the beginnings
            {
                length: 1 - MOTOR_MOUNT_LENGTH_RATIO - MOTOR_BEVEL_DEPTH_RATIO,
                width: 1,
            },
            {
                length: 1 - MOTOR_MOUNT_LENGTH_RATIO,
                width: MOTOR_MOUNT_WIDTH_RATIO,
            },
            {
                length: 1 + MOTOR_MOUNT_LENGTH_RATIO,
                width: MOTOR_MOUNT_WIDTH_RATIO,
            },
            // Bevel after end of motor mount
            {
                length: 1 + MOTOR_MOUNT_LENGTH_RATIO + MOTOR_BEVEL_DEPTH_RATIO,
                width: 1,
            },
        ];

        armVectorX *= ARM_LENGTH;
        armVectorY *= ARM_LENGTH;

        // Draw one half of the arm:
        for (const point of armPoints) {
            shape.lineTo(
                point.length * armVectorX - point.width * crossArmX,
                point.length * armVectorY - point.width * crossArmY,
            );
        }

        // And flip the points to draw the other half:
        for (let j = armPoints.length - 1; j >= 0; j--) {
            const point = armPoints[j];
            shape.lineTo(
                point.length * armVectorX + point.width * crossArmX,
                point.length * armVectorY + point.width * crossArmY,
            );
        }

        shape.lineTo(Math.cos(armEnd) * HUB_RADIUS, Math.sin(armEnd) * HUB_RADIUS);
    }

    const extrudeSettings = {
            depth: CRAFT_DEPTH,
            steps: 1,
            bevelEnabled: false,
        },
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings),
        craftMesh = new THREE.Mesh(geometry, craftMaterial);

    return craftMesh;
}

/** Motor numbering in counter-clockwise order starting from the 3 o'clock position, and the yaw that puts it the right way up. */
function defaultMotorLayout(numMotors: number): { motorOrder: number[]; yawOffset: number } {
    switch (numMotors) {
        case 3:
            return { motorOrder: [0, 1, 2], yawOffset: -Math.PI / 2 }; // Put motor 1 at the right
        case 4:
            // Numbering for quad-plus; the yaw changes it from "plus" orientation to "X"
            return { motorOrder: [1, 3, 2, 0], yawOffset: Math.PI / 4 };
        case 6:
            return { motorOrder: [4, 1, 3, 5, 2, 0], yawOffset: 0 };
        case 8:
            return { motorOrder: [5, 1, 4, 0, 7, 3, 6, 2], yawOffset: Math.PI / 8 }; // Put two motors at the front
        default:
            return { motorOrder: Array.from({ length: numMotors }, (_, i) => i), yawOffset: 0 };
    }
}

/** A WebGL model of the craft at the logged attitude, each prop filled in proportion to its motor output. */
export class Craft3D {
    private readonly numMotors: number;
    private readonly motorOrder: number[];
    private readonly propGeometry: THREE.BufferGeometry[];
    private readonly propMaterials: THREE.MeshLambertMaterial[];
    private readonly props: (THREE.Mesh | undefined)[];
    private readonly propShells: THREE.Mesh[];
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    private readonly renderer: THREE.WebGLRenderer;
    private readonly craftParent = new THREE.Object3D();
    private readonly sysInfo: ReturnType<FlightLog["getSysConfig"]>;

    constructor(
        flightLog: Pick<FlightLog, "getSysConfig">,
        private readonly canvas: HTMLCanvasElement,
        propColors: string[],
    ) {
        const { userSettings } = useSettingsStore();
        const customMix = userSettings.customMix ?? null;

        const numMotors = customMix === null ? propColors.length : customMix.motorOrder.length;
        this.numMotors = numMotors;

        const propRadius = numMotors === 8 ? 0.37 * ARM_LENGTH : 0.5 * ARM_LENGTH,
            craftMaterial = new THREE.MeshLambertMaterial({ color: 0xa0a0a0 }),
            arrowMaterial = new THREE.MeshLambertMaterial({ color: 0x404040 }),
            propShellMaterial = new THREE.MeshLambertMaterial({
                color: 0xffffff,
                opacity: 0.2,
                transparent: true,
            });

        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
        const light = new THREE.HemisphereLight(0xe4e4ff, 0x405040, 1.1);
        const craft = new THREE.Object3D();
        const craftMesh = buildCraft(numMotors, craftMaterial);
        const arrowMesh = buildArrow(arrowMaterial);
        this.propGeometry = buildPropGeometry(propRadius);
        this.props = new Array(numMotors);
        this.propShells = new Array(numMotors);
        this.sysInfo = flightLog.getSysConfig();

        // The craft object will hold the props and craft body
        // We'll rotate this to bring the front direction of the model to the correct position
        craft.add(craftMesh);

        // We put that in a container that we'll rotate based on the craft attitude
        this.craftParent.add(craft);

        // This allows us to add a craft directional arrow that'll point the same way as the craftMesh
        arrowMesh.position.z = CRAFT_DEPTH;

        this.craftParent.add(arrowMesh);

        this.scene.add(this.craftParent);

        light.position.set(1, 1, 1).normalize();
        this.scene.add(light);

        this.camera.position.y = 0;
        this.camera.position.z = 5;

        this.propMaterials = propColors.map((color) => new THREE.MeshLambertMaterial({ color }));

        for (let i = 0; i < numMotors; i++) {
            const propShell = new THREE.Mesh(this.propGeometry.at(-1), propShellMaterial);

            this.propShells[i] = propShell;

            propShell.translateX(Math.cos((i / numMotors) * Math.PI * 2) * ARM_LENGTH);
            propShell.translateY(Math.sin((i / numMotors) * Math.PI * 2) * ARM_LENGTH);
            propShell.translateZ(0.1);

            craft.add(propShell);
        }

        const { motorOrder, yawOffset } = customMix ?? defaultMotorLayout(numMotors);
        this.motorOrder = motorOrder;

        // Rotate the craft mesh and props to bring the board's direction arrow to the right direction
        craft.rotation.z = yawOffset;
    }

    render(frame: LogFrame, frameFieldIndexes: Record<string, number>): void {
        const { sysInfo, props, propShells, motorOrder } = this;
        // A header without motor outputs leaves null, which the arithmetic reads as 0.
        const motorMin = Number(sysInfo.motorOutput[0]);
        const motorMax = Number(sysInfo.motorOutput[1]);

        for (let i = 0; i < this.numMotors; i++) {
            const previous = props[i];
            if (previous) {
                propShells[i].remove(previous);
            }

            // A motor the log lacks reads as NaN, which leaves its prop level undefined, as it always did.
            const throttlePos = Math.min(
                    Math.max(Number(frame[frameFieldIndexes[`motor[${motorOrder[i]}]`]]) - motorMin, 0) /
                        (motorMax - motorMin),
                    1,
                ),
                propLevel = Math.round(throttlePos * (NUM_PROP_LEVELS - 1)),
                geometry = this.propGeometry[propLevel],
                prop = new THREE.Mesh(geometry, this.propMaterials[motorOrder[i]]);

            prop.scale.set(0.95, 0.95, 0.95);

            propShells[i].add(prop);

            props[i] = prop;
        }

        // Display the craft's attitude
        this.craftParent.rotation.x = -Number(frame[frameFieldIndexes["heading[1]"]]); // pitch
        this.craftParent.rotation.y = Number(frame[frameFieldIndexes["heading[0]"]]); // roll

        this.renderer.render(this.scene, this.camera);
    }

    resize(width: number, height: number): void {
        const canvas = this.canvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;

            this.renderer.setViewport(0, 0, width, height);

            this.camera.updateProjectionMatrix();
        }
    }
}
