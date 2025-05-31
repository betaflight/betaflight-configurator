import { Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import FC from "./fc";
import { get as getConfig } from "./ConfigStorage";
import * as THREE from "three";

// generate mixer
export const mixerList = [
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

// 3D model
const Model = function (wrapper, canvas) {
    // Configure model detail level (1-10, where 1 is lowest detail and 10 is highest)
    this.detailTolerance = 10; // Default value, can be modifie

    this.wrapper = wrapper;
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas[0],
        alpha: true,
        antialias: true, // enable or disable antialiasing for performance
    });

    this.renderer.setSize(this.wrapper.width(), this.wrapper.height());

    // load the model including materials
    let model_file = mixerList[FC.MIXER_CONFIG.mixer - 1]?.model;

    // Temporary workaround for 'custom' model until akfreak's custom model is merged.
    if (model_file === "custom") {
        model_file = "fallback";
    }

    // Setup scene
    this.scene = new THREE.Scene();
    this.modelWrapper = new THREE.Object3D();

    // Stationary camera
    this.camera = new THREE.PerspectiveCamera(60, this.wrapper.width() / this.wrapper.height(), 1, 10000);
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

    this.loadGLTF(
        model_file,
        function (model) {
            this.model = model;
            this.scene.add(this.modelWrapper);
            this.modelWrapper.add(model);
            this.render();
        }.bind(this),
    );
};

Model.prototype.loadGLTF = function (model_file, callback) {
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
            console.log("Loading progress:", progress);
        },
        (error) => {
            console.error("Error loading model:", error);
            // Fallback to a default model or show error to user
            callback(null);
        },
    );
};

Model.prototype.createModel = function (geometry, materials) {
    const model = new THREE.Mesh(geometry, materials);
    model.scale.set(15, 15, 15);
    return model;
};

Model.prototype.rotateTo = function (x, y, z) {
    if (!this.model) {
        return;
    }

    this.model.rotation.x = x;
    this.modelWrapper.rotation.y = y;
    this.model.rotation.z = z;

    this.render();
};

Model.prototype.rotateBy = function (x, y, z) {
    if (!this.model) {
        return;
    }

    this.model.rotateX(x);
    this.model.rotateY(y);
    this.model.rotateZ(z);

    this.render();
};

Model.prototype.render = function () {
    if (!this.model) {
        return;
    }

    this.updateMatrices();
    this.performRender();
};

Model.prototype.updateMatrices = function () {
    this.model.updateMatrix();
    this.model.updateMatrixWorld();
    this.modelWrapper.updateMatrix();
    this.modelWrapper.updateMatrixWorld();
};

Model.prototype.performRender = function () {
    this.renderer.render(this.scene, this.camera);
};

// handle canvas resize
Model.prototype.resize = function () {
    this.renderer.setSize(this.wrapper.width(), this.wrapper.height());

    this.camera.aspect = this.wrapper.width() / this.wrapper.height();
    this.camera.updateProjectionMatrix();

    this.render();
};

Model.prototype.dispose = function () {
    if (this.renderer) {
        if (this.renderer.forceContextLoss) {
            this.renderer.forceContextLoss();
        }
        if (this.renderer.dispose) {
            this.renderer.dispose();
        }
        this.renderer = null;
    }
};

export default Model;
